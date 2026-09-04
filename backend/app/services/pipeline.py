"""
Harmonization Pipeline Orchestration Engine
Implements PRD Section 10 (Data Flow Summary) and FR1-FR9:
Ingestion -> CRS Normalization -> Topology Cleaning -> Spatial Conflation
-> Entity Resolution -> Confidence Scoring -> Conflict Generation -> Golden Records
"""

import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime
from shapely.geometry import shape, mapping

from app.models.schemas import (
    HarmonizedParcel, SpatialConflict, ParcelStatus,
    ConflictType, ConflictSeverity, SourceRecordLineage,
    GeoJSONGeometry
)
from app.services.normalizer import NormalizationEngine
from app.services.conflation import ConflationEngine
from app.services.entity_resolution import EntityResolutionEngine
from app.services.scoring import ConfidenceScoringEngine
from app.services.data_store import data_store


class HarmonizationPipeline:
    def __init__(
        self,
        target_epsg: str = "EPSG:4326",
        auto_merge_threshold: float = 0.85,
        area_discrepancy_threshold_pct: float = 5.0
    ):
        self.normalizer = NormalizationEngine(target_epsg=target_epsg)
        self.conflation = ConflationEngine(normalizer=self.normalizer)
        self.entity_resolver = EntityResolutionEngine()
        self.scorer = ConfidenceScoringEngine(
            auto_merge_threshold=auto_merge_threshold,
            area_discrepancy_limit_pct=area_discrepancy_threshold_pct
        )

    def execute(
        self,
        drone_features: List[Dict[str, Any]],
        cadastral_features: List[Dict[str, Any]],
        ror_records: List[Dict[str, Any]],
        dataset_name: str = "Ward_14_Urban_Habitation"
    ) -> Dict[str, Any]:
        """
        Executes the end-to-end automated harmonization pipeline.
        """
        # Step 1: Pre-process & Normalize Geometries
        cleaned_drone = []
        for feat in drone_features:
            norm_geom, src_crs = self.normalizer.detect_and_normalize_crs(feat["geometry"])
            cleaned_geom, repaired, actions = self.normalizer.validate_and_clean_geometry(norm_geom)
            cleaned_drone.append({
                "id": feat.get("id", str(uuid.uuid4())),
                "properties": feat.get("properties", {}),
                "geometry": mapping(cleaned_geom),
                "original_crs": src_crs,
                "repaired": repaired,
                "actions": actions
            })

        cleaned_cadastral = []
        for feat in cadastral_features:
            norm_geom, src_crs = self.normalizer.detect_and_normalize_crs(feat["geometry"])
            cleaned_geom, repaired, actions = self.normalizer.validate_and_clean_geometry(norm_geom)
            cleaned_cadastral.append({
                "id": feat.get("id", str(uuid.uuid4())),
                "properties": feat.get("properties", {}),
                "geometry": mapping(cleaned_geom),
                "original_crs": src_crs,
                "repaired": repaired,
                "actions": actions
            })

        # Save raw layers in data store
        data_store.raw_layers["drone_survey"] = cleaned_drone
        data_store.raw_layers["cadastral_revenue"] = cleaned_cadastral
        data_store.raw_records = ror_records

        # Step 2: Spatial Conflation & Candidate Matching (STRtree join)
        matches = self.conflation.find_candidates_spatial_join(
            source_a_parcels=cleaned_drone,
            source_b_parcels=cleaned_cadastral,
            min_iou_threshold=0.10
        )

        golden_records = []
        conflicts = []

        # Step 3: Process each candidate pair
        for idx, match in enumerate(matches):
            drone_p = match["source_a"]
            cad_p = match.get("source_b")
            metrics = match["metrics"]

            drone_geom_dict = drone_p["geometry"]
            cad_geom_dict = cad_p["geometry"] if cad_p else None

            # Calculate measured area from drone ground truth
            measured_area = self.normalizer.compute_metric_area_sqm(drone_geom_dict)

            # Step 4: Attribute Entity Resolution with Tabular RoR
            cad_props = cad_p["properties"] if cad_p else drone_p["properties"]
            matched_ror, attr_score, attr_breakdown = self.entity_resolver.match_spatial_to_ror(
                cadastral_props=cad_props,
                ror_records=ror_records
            )

            khasra = (
                cad_props.get("khasra_number") or
                drone_p["properties"].get("khasra_number") or
                f"K-{idx+101}"
            )
            owner_name = (
                (matched_ror.get("owner_name") if matched_ror else None) or
                cad_props.get("owner_name") or
                "Unregistered Urban Plot"
            )
            tax_id = (
                (matched_ror.get("tax_property_id") if matched_ror else None) or
                f"TAX-W14-{khasra}"
            )
            legal_area = (
                float(matched_ror.get("legal_area_sqm")) if matched_ror and matched_ror.get("legal_area_sqm")
                else measured_area
            )

            # Step 5: Area Discrepancy %
            area_drift_pct = round((abs(measured_area - legal_area) / max(0.001, legal_area)) * 100.0, 2)

            # Step 6: Confidence Scoring
            confidence = self.scorer.compute_confidence(
                iou=metrics["iou"],
                hausdorff_dist_m=metrics["hausdorff_dist_m"],
                attribute_score=attr_score,
                source_weight=0.95
            )

            # Step 7: Classification & Decision
            sliver_drift = metrics.get("sliver_drift_sqm", 0.0)
            status, conf_type, severity, explanation = self.scorer.classify_match(
                confidence=confidence,
                area_discrepancy_pct=area_drift_pct,
                sliver_drift_sqm=sliver_drift,
                hausdorff_dist_m=metrics["hausdorff_dist_m"],
                attribute_score=attr_score,
                khasra=khasra
            )

            golden_id = str(uuid.uuid4())

            # Lineage provenance entries
            lineage = [
                SourceRecordLineage(
                    source_type="DRONE_ORTHO",
                    source_document_id=drone_p["id"],
                    original_crs=drone_p.get("original_crs", "EPSG:4326"),
                    reprojection_applied="EPSG:4326",
                    cleaned_topology=drone_p.get("repaired", False),
                    details={"resolution_cm": 5.0, "actions": drone_p.get("actions", [])}
                )
            ]
            if cad_p:
                lineage.append(
                    SourceRecordLineage(
                        source_type="CADASTRAL_MAP",
                        source_document_id=cad_p["id"],
                        original_crs=cad_p.get("original_crs", "EPSG:4326"),
                        reprojection_applied="EPSG:4326",
                        cleaned_topology=cad_p.get("repaired", False),
                        details={"sheet_year": cad_p["properties"].get("sheet_year", "1974_REVISED")}
                    )
                )
            if matched_ror:
                lineage.append(
                    SourceRecordLineage(
                        source_type="ROR_TABULAR",
                        source_document_id=tax_id,
                        original_crs="NON_SPATIAL",
                        reprojection_applied="N/A",
                        details={"mutation_status": matched_ror.get("mutation_status", "CERTIFIED")}
                    )
                )

            # High precision drone geometry serves as default golden boundary
            golden_geom = GeoJSONGeometry(
                type=drone_geom_dict["type"],
                coordinates=drone_geom_dict["coordinates"]
            )

            golden_parcel = HarmonizedParcel(
                golden_parcel_id=golden_id,
                raw_parcel_id=idx + 1,
                khasra_number=khasra,
                owner_name=owner_name,
                tax_property_id=tax_id,
                legal_area_sqm=legal_area,
                measured_area_sqm=measured_area,
                area_discrepancy_pct=area_drift_pct,
                harmonization_confidence=confidence,
                status=status,
                geometry=golden_geom,
                source_lineage=lineage,
                boundary_iou=metrics["iou"],
                hausdorff_distance_m=metrics["hausdorff_dist_m"],
                attribute_match_score=attr_score,
                flagged_reason=explanation if status != ParcelStatus.AUTO_RECONCILED else None
            )
            data_store.add_golden_parcel(golden_parcel)
            golden_records.append(golden_parcel)

            # If flagged or conflict, add to human-in-the-loop review queue
            if status in [ParcelStatus.FLAGGED_FOR_REVIEW, ParcelStatus.CONFLICT]:
                collision_geom_model = None
                if metrics.get("collision_geom"):
                    collision_geom_model = GeoJSONGeometry(
                        type=metrics["collision_geom"]["type"],
                        coordinates=metrics["collision_geom"]["coordinates"]
                    )

                conflict = SpatialConflict(
                    conflict_id=f"CONF-{khasra}-{idx+1}",
                    golden_parcel_id=golden_id,
                    khasra_number=khasra,
                    conflict_type=conf_type,
                    severity=severity,
                    plain_language_explanation=explanation,
                    overlap_area_sqm=sliver_drift,
                    area_discrepancy_pct=area_drift_pct,
                    iou_score=metrics["iou"],
                    hausdorff_dist_m=metrics["hausdorff_dist_m"],
                    attribute_similarity=attr_score,
                    conflict_geom=collision_geom_model,
                    drone_geom=golden_geom,
                    cadastral_geom=GeoJSONGeometry(
                        type=cad_geom_dict["type"],
                        coordinates=cad_geom_dict["coordinates"]
                    ) if cad_geom_dict else None,
                    drone_props=drone_p["properties"],
                    cadastral_props=cad_p["properties"] if cad_p else {},
                    ror_props=matched_ror or {},
                    is_resolved=False
                )
                data_store.add_conflict(conflict)
                conflicts.append(conflict)

        analytics = data_store.compute_analytics()
        return {
            "status": "SUCCESS",
            "total_processed": len(matches),
            "golden_records_count": len(golden_records),
            "conflicts_flagged": len(conflicts),
            "analytics": analytics
        }
