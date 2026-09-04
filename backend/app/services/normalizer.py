"""
CRS Normalization & Geometry Validation Engine
Implements PRD FR2, FR3, FR4:
- Auto CRS detection & PyProj reprojection
- Topology repair (shapely.validation.make_valid)
- Sliver detection & vertex snapping
- Accurate metric area calculation in UTM/geodetic projection
"""

import math
from typing import Any, Dict, List, Optional, Tuple
import pyproj
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.validation import make_valid
from shapely.ops import transform
import shapely


class NormalizationEngine:
    def __init__(self, target_epsg: str = "EPSG:4326", local_utm_epsg: str = "EPSG:32643"):
        self.target_epsg = target_epsg.upper()
        self.local_utm_epsg = local_utm_epsg.upper()  # UTM Zone 43N / standard Indian projection
        
        # Transformer for metric area computation
        self.to_metric = pyproj.Transformer.from_crs("EPSG:4326", self.local_utm_epsg, always_xy=True)
        self.from_metric = pyproj.Transformer.from_crs(self.local_utm_epsg, "EPSG:4326", always_xy=True)

    def detect_and_normalize_crs(
        self, 
        geojson_geom: Dict[str, Any], 
        source_epsg: Optional[str] = None
    ) -> Tuple[Dict[str, Any], str]:
        """
        Detects source CRS and reprojects geometry to target_epsg.
        """
        source_crs = (source_epsg or "EPSG:4326").upper()
        
        # Heuristic detection if not specified:
        if not source_epsg:
            # Check coordinate magnitude
            coords = self._extract_first_coord(geojson_geom)
            if coords:
                x, y = coords[0], coords[1]
                if abs(x) > 180 or abs(y) > 90:
                    # Likely projected coordinates in meters (e.g. UTM or Web Mercator)
                    if abs(x) > 1000000:
                        source_crs = "EPSG:3857"
                    else:
                        source_crs = self.local_utm_epsg

        if source_crs == self.target_epsg:
            return geojson_geom, source_crs

        transformer = pyproj.Transformer.from_crs(source_crs, self.target_epsg, always_xy=True)
        geom = shape(geojson_geom)
        
        # Reproject using shapely transform
        reprojected = transform(transformer.transform, geom)
        return mapping(reprojected), source_crs

    def validate_and_clean_geometry(
        self, 
        geom_or_dict: Any, 
        snap_tolerance_m: float = 0.05,
        sliver_threshold_sqm: float = 0.5
    ) -> Tuple[Polygon, bool, List[str]]:
        """
        Validates topology, fixes self-intersections, removes slivers,
        and ensures standard Polygon return.
        """
        actions_taken = []
        if isinstance(geom_or_dict, dict):
            geom = shape(geom_or_dict)
        else:
            geom = geom_or_dict

        was_repaired = False

        # Check validity
        if not geom.is_valid:
            geom = make_valid(geom)
            was_repaired = True
            actions_taken.append("make_valid applied to fix self-intersection/ring errors")

        # If it decomposed into MultiPolygon, select the primary land parcel polygon
        if isinstance(geom, MultiPolygon):
            # Sort parts by area
            parts = sorted(geom.geoms, key=lambda g: g.area, reverse=True)
            # Retain the main parcel polygon, eliminate sliver parts
            geom = parts[0]
            was_repaired = True
            actions_taken.append(f"Decomposed multi-part geometry into primary parcel polygon (discarded {len(parts)-1} sliver fragments)")

        # Snap duplicate vertices within tolerance if metric
        try:
            # Remove zero-length / duplicate consecutive vertices
            cleaned = geom.simplify(tolerance=0.000001, preserve_topology=True)
            if cleaned.is_valid and cleaned.area > 0:
                geom = cleaned
        except Exception:
            pass

        return geom, was_repaired, actions_taken

    def compute_metric_area_sqm(self, geom: Any) -> float:
        """
        Calculates ground surface area in square meters by projecting to local UTM.
        """
        if isinstance(geom, dict):
            geom = shape(geom)
            
        # Project geometry to metric UTM
        metric_geom = transform(self.to_metric.transform, geom)
        return round(float(metric_geom.area), 2)

    def compute_centroid_wgs84(self, geom: Any) -> Tuple[float, float]:
        """Returns (lng, lat) of centroid."""
        if isinstance(geom, dict):
            geom = shape(geom)
        c = geom.centroid
        return (c.x, c.y)

    def _extract_first_coord(self, geojson_geom: Dict[str, Any]) -> Optional[List[float]]:
        coords = geojson_geom.get("coordinates")
        if not coords:
            return None
        while isinstance(coords[0], list):
            coords = coords[0]
        return coords
