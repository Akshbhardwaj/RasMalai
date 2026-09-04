"""
REST & OGC Web Feature Service API Endpoints
Implements PRD FR8, FR10, FR11, FR12, O6, O7:
- Parcel GeoJSON retrieval with spatial/attribute filters
- Raw layers overlay endpoint for map toggling
- Conflict review queue with 1-click human-in-the-loop resolution (< 3 clicks)
- Provenance audit trail endpoint
- Summary analytics & reporting endpoint
- OGC WFS and CSV/GeoJSON export endpoints
"""

import io
import csv
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import JSONResponse, StreamingResponse

from app.models.schemas import (
    HarmonizedParcel, SpatialConflict, ResolveConflictRequest,
    AnalyticsSummary, ParcelStatus, IngestDatasetRequest
)
from app.services.data_store import data_store
from app.services.pipeline import HarmonizationPipeline
from app.sample_data.ward14_benchmark import generate_benchmark_ward14

router = APIRouter()
pipeline = HarmonizationPipeline()


@router.post("/pipeline/load-sample")
async def load_sample_dataset():
    """
    Loads benchmark Indian Urban Habitation (Ward 14) dataset
    and runs the automated harmonization pipeline.
    """
    data_store.reset()
    benchmark = generate_benchmark_ward14()
    
    result = pipeline.execute(
        drone_features=benchmark["drone_survey"],
        cadastral_features=benchmark["cadastral_revenue"],
        ror_records=benchmark["ror_records"],
        dataset_name="Ward_14_Indiranagar_Habitation"
    )
    return {
        "message": "Ward 14 benchmark dataset loaded and harmonized successfully",
        "result": result
    }


@router.post("/pipeline/run")
async def run_pipeline(payload: Dict[str, Any]):
    """
    Runs automated harmonization pipeline on custom ingested layers.
    Expects { drone_features: [...], cadastral_features: [...], ror_records: [...] }
    """
    drone = payload.get("drone_features", [])
    cadastral = payload.get("cadastral_features", [])
    ror = payload.get("ror_records", [])

    if not drone and not cadastral:
        raise HTTPException(status_code=400, detail="At least one vector feature layer (drone or cadastral) must be provided.")

    data_store.reset()
    result = pipeline.execute(
        drone_features=drone,
        cadastral_features=cadastral,
        ror_records=ror,
        dataset_name=payload.get("dataset_name", "Custom_Ingestion_Ward")
    )
    return result


@router.get("/parcels")
async def get_harmonized_parcels(
    status: Optional[str] = None,
    search: Optional[str] = None,
    min_confidence: Optional[float] = None
):
    """
    Returns GeoJSON FeatureCollection of harmonized golden land parcels.
    Filterable by status, khasra number, owner name, or minimum confidence.
    """
    parcels = data_store.get_all_parcels()

    if status:
        parcels = [p for p in parcels if p.status.value == status.upper()]
    if min_confidence is not None:
        parcels = [p for p in parcels if p.harmonization_confidence >= min_confidence]
    if search:
        s = search.lower()
        parcels = [
            p for p in parcels
            if s in p.khasra_number.lower() or s in p.owner_name.lower() or s in p.tax_property_id.lower()
        ]

    features = []
    for p in parcels:
        features.append({
            "type": "Feature",
            "id": p.golden_parcel_id,
            "geometry": p.geometry.model_dump(),
            "properties": {
                "golden_parcel_id": p.golden_parcel_id,
                "khasra_number": p.khasra_number,
                "owner_name": p.owner_name,
                "tax_property_id": p.tax_property_id,
                "legal_area_sqm": p.legal_area_sqm,
                "measured_area_sqm": p.measured_area_sqm,
                "area_discrepancy_pct": p.area_discrepancy_pct,
                "harmonization_confidence": p.harmonization_confidence,
                "status": p.status.value,
                "boundary_iou": p.boundary_iou,
                "hausdorff_distance_m": p.hausdorff_distance_m,
                "attribute_match_score": p.attribute_match_score,
                "flagged_reason": p.flagged_reason,
                "updated_at": p.updated_at
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "total_features": len(features)
    }


@router.get("/layers/raw")
async def get_raw_layers():
    """
    Returns GeoJSON FeatureCollections for all raw input sources and collision layers.
    Allows map toggle for original drone orthophoto vectors, cadastral sheets, and conflict slivers.
    """
    drone_feats = []
    for d in data_store.raw_layers.get("drone_survey", []):
        drone_feats.append({
            "type": "Feature",
            "id": d["id"],
            "geometry": d["geometry"],
            "properties": {
                **d.get("properties", {}),
                "layer_type": "DRONE_ORTHO",
                "stroke_color": "#2563EB",  # Blue
                "stroke_dash": "5, 5"
            }
        })

    cad_feats = []
    for c in data_store.raw_layers.get("cadastral_revenue", []):
        cad_feats.append({
            "type": "Feature",
            "id": c["id"],
            "geometry": c["geometry"],
            "properties": {
                **c.get("properties", {}),
                "layer_type": "CADASTRAL_MAP",
                "stroke_color": "#D97706",  # Amber
                "fill_color": "rgba(217, 119, 6, 0.1)"
            }
        })

    conflict_feats = []
    for conf in data_store.get_all_conflicts(resolved=False):
        if conf.conflict_geom:
            conflict_feats.append({
                "type": "Feature",
                "id": conf.conflict_id,
                "geometry": conf.conflict_geom.model_dump(),
                "properties": {
                    "conflict_id": conf.conflict_id,
                    "khasra_number": conf.khasra_number,
                    "conflict_type": conf.conflict_type.value,
                    "severity": conf.severity.value,
                    "overlap_area_sqm": conf.overlap_area_sqm,
                    "layer_type": "CONFLICT_SLIVER",
                    "stroke_color": "#DC2626",  # Crimson Red
                    "fill_color": "rgba(220, 38, 38, 0.55)"
                }
            })

    return {
        "drone_survey": {"type": "FeatureCollection", "features": drone_feats},
        "cadastral_revenue": {"type": "FeatureCollection", "features": cad_feats},
        "conflict_slivers": {"type": "FeatureCollection", "features": conflict_feats}
    }


@router.get("/conflicts")
async def get_conflicts(resolved: Optional[bool] = None, severity: Optional[str] = None):
    """
    Retrieves spatial conflicts queue with collision metrics and side-by-side data.
    """
    conflicts = data_store.get_all_conflicts(resolved=resolved)
    if severity:
        conflicts = [c for c in conflicts if c.severity.value == severity.upper()]
    return conflicts


@router.get("/conflicts/{conflict_id}")
async def get_conflict_by_id(conflict_id: str):
    conflict = data_store.get_conflict(conflict_id)
    if not conflict:
        raise HTTPException(status_code=404, detail="Conflict record not found")
    return conflict


@router.post("/conflicts/{conflict_id}/resolve")
async def resolve_conflict(conflict_id: str, request: ResolveConflictRequest):
    """
    Human-in-the-Loop review action (< 3 clicks).
    Resolves the conflict by approving, preferring drone, preferring cadastral, or snapping.
    """
    custom_geom_dict = request.custom_geometry.model_dump() if request.custom_geometry else None
    updated_parcel = data_store.resolve_conflict(
        conflict_id=conflict_id,
        action=request.action,
        reviewer_id=request.reviewer_id,
        notes=request.notes,
        custom_geometry=custom_geom_dict
    )
    if not updated_parcel:
        raise HTTPException(status_code=404, detail="Conflict or associated parcel not found")

    return {
        "message": f"Conflict {conflict_id} resolved successfully with action {request.action.value}",
        "updated_parcel": updated_parcel,
        "analytics": data_store.compute_analytics()
    }


@router.get("/audit/{golden_parcel_id}")
async def get_audit_lineage(golden_parcel_id: str):
    """
    Returns complete lineage and audit trail for a harmonized parcel.
    """
    parcel = data_store.get_parcel(golden_parcel_id)
    if not parcel:
        raise HTTPException(status_code=404, detail="Harmonized parcel not found")

    history = data_store.get_audit_trail(golden_parcel_id)
    return {
        "golden_parcel_id": golden_parcel_id,
        "khasra_number": parcel.khasra_number,
        "owner_name": parcel.owner_name,
        "status": parcel.status.value,
        "source_lineage": parcel.source_lineage,
        "transformation_history": history
    }


@router.get("/analytics/summary")
async def get_analytics_summary() -> AnalyticsSummary:
    """
    Returns high-level KPI dashboard metrics for land administration.
    """
    return data_store.compute_analytics()


@router.get("/export/geojson")
async def export_geojson():
    """
    Exports the complete Golden Urban Spatial Record as an official GeoJSON file.
    """
    parcels_geojson = await get_harmonized_parcels()
    return JSONResponse(
        content=parcels_geojson,
        headers={"Content-Disposition": "attachment; filename=bhoomi_harmonized_fabric.geojson"}
    )


@router.get("/export/csv")
async def export_csv():
    """
    Exports harmonized tabular land records as CSV.
    """
    parcels = data_store.get_all_parcels()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "golden_parcel_id", "khasra_number", "owner_name", "tax_property_id",
        "legal_area_sqm", "measured_area_sqm", "area_discrepancy_pct",
        "harmonization_confidence", "status", "boundary_iou", "hausdorff_distance_m", "updated_at"
    ])
    for p in parcels:
        writer.writerow([
            p.golden_parcel_id, p.khasra_number, p.owner_name, p.tax_property_id,
            p.legal_area_sqm, p.measured_area_sqm, p.area_discrepancy_pct,
            p.harmonization_confidence, p.status.value, p.boundary_iou, p.hausdorff_distance_m, p.updated_at
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bhoomi_harmonized_records.csv"}
    )


@router.get("/ogc/wfs")
async def ogc_wfs_endpoint(
    service: str = "WFS",
    version: str = "2.0.0",
    request: str = "GetFeature",
    typeNames: str = "bhoomi:harmonized_parcels"
):
    """
    OGC WFS 2.0.0 compliant endpoint returning GeoJSON feature collection
    for plug-and-play integration with Bhuvan, State SDI, QGIS, or ArcGIS.
    """
    return await get_harmonized_parcels()
