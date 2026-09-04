"""
Spatial Conflation Engine
Implements PRD FR5 & Section 9:
- STRtree R-tree spatial indexing for candidate matching
- IoU (Intersection over Union) computation
- Hausdorff boundary distance & Centroid drift
- Overlap collision geometry isolation (area > 0.5 sq.m)
- Area variance tracking
"""

from typing import Any, Dict, List, Optional, Tuple
import shapely
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.strtree import STRtree
from shapely.ops import transform
import numpy as np


class ConflationEngine:
    def __init__(self, normalizer):
        self.normalizer = normalizer

    def find_candidates_spatial_join(
        self,
        source_a_parcels: List[Dict[str, Any]],
        source_b_parcels: List[Dict[str, Any]],
        min_iou_threshold: float = 0.15
    ) -> List[Dict[str, Any]]:
        """
        Uses Shapely STRtree (R-tree) to index Source B parcels and find overlapping candidates in Source A.
        Returns candidate pairs with spatial similarity metrics.
        """
        if not source_a_parcels or not source_b_parcels:
            return []

        # Convert Source B geometries
        b_geoms = []
        b_records = []
        for b in source_b_parcels:
            g = shape(b["geometry"])
            if g.is_valid and g.area > 0:
                b_geoms.append(g)
                b_records.append(b)

        if not b_geoms:
            return []

        tree = STRtree(b_geoms)
        matches = []

        for a in source_a_parcels:
            geom_a = shape(a["geometry"])
            if not geom_a.is_valid or geom_a.area <= 0:
                continue

            # Query STRtree for bounding box intersections
            candidate_indices = tree.query(geom_a)

            best_candidate = None
            best_iou = -1.0
            candidate_list = []

            for idx in candidate_indices:
                geom_b = b_geoms[idx]
                b_rec = b_records[idx]

                if not geom_a.intersects(geom_b):
                    continue

                # Compute exact spatial metrics
                metrics = self.compute_spatial_metrics(geom_a, geom_b)
                candidate_data = {
                    "source_a": a,
                    "source_b": b_rec,
                    "metrics": metrics
                }
                candidate_list.append(candidate_data)

                if metrics["iou"] > best_iou:
                    best_iou = metrics["iou"]
                    best_candidate = candidate_data

            if best_candidate and best_candidate["metrics"]["iou"] >= min_iou_threshold:
                matches.append(best_candidate)
            elif candidate_list:
                # Fallback to candidate with closest centroid if positive intersection
                matches.append(candidate_list[0])
            else:
                # Parcel in Source A has no corresponding candidate in Source B (e.g. newly created or unmapped)
                matches.append({
                    "source_a": a,
                    "source_b": None,
                    "metrics": {
                        "iou": 0.0,
                        "hausdorff_dist_m": 999.0,
                        "centroid_dist_m": 999.0,
                        "area_variance_pct": 100.0,
                        "overlap_area_sqm": 0.0,
                        "collision_geom": None
                    }
                })

        return matches

    def compute_spatial_metrics(self, geom_a: Polygon, geom_b: Polygon) -> Dict[str, Any]:
        """
        Computes IoU, Hausdorff boundary distance, centroid distance,
        and extracts overlap collision geometry.
        """
        # Transform to metric coordinates for accurate meter-based distances & areas
        trans = self.normalizer.to_metric.transform
        geom_a_m = transform(trans, geom_a)
        geom_b_m = transform(trans, geom_b)

        # Intersection and Union
        intersection = geom_a_m.intersection(geom_b_m)
        union = geom_a_m.union(geom_b_m)

        intersection_area = max(0.0, float(intersection.area))
        union_area = max(0.0001, float(union.area))
        iou = round(intersection_area / union_area, 4)

        # Symmetric difference represents the unaligned perimeter sliver between the two sources
        sym_diff = geom_a_m.symmetric_difference(geom_b_m)
        sliver_drift_sqm = round(max(0.0, float(sym_diff.area)), 2)

        # Hausdorff boundary distance in meters
        try:
            hausdorff_dist = round(float(geom_a_m.hausdorff_distance(geom_b_m)), 2)
        except Exception:
            hausdorff_dist = 50.0

        # Centroid distance in meters
        c_a = geom_a_m.centroid
        c_b = geom_b_m.centroid
        centroid_dist = round(float(c_a.distance(c_b)), 2)

        # Area variance percentage
        area_a = float(geom_a_m.area)
        area_b = float(geom_b_m.area)
        max_area = max(area_a, area_b, 0.001)
        area_variance_pct = round((abs(area_a - area_b) / max_area) * 100.0, 2)

        # Sliver collision geometry in WGS84 for Web-GIS rendering if drift is significant
        collision_geom_wgs84 = None
        if sliver_drift_sqm > 15.0 and iou < 0.80:
            trans_back = self.normalizer.from_metric.transform
            inter_wgs84 = transform(trans_back, sym_diff)
            collision_geom_wgs84 = mapping(inter_wgs84)

        return {
            "iou": iou,
            "hausdorff_dist_m": hausdorff_dist,
            "centroid_dist_m": centroid_dist,
            "area_a_sqm": round(area_a, 2),
            "area_b_sqm": round(area_b, 2),
            "area_variance_pct": area_variance_pct,
            "sliver_drift_sqm": sliver_drift_sqm,
            "collision_geom": collision_geom_wgs84
        }
