"""
Pydantic Schemas and Domain Models for BhoomiHarmonize
Compliant with Smart India Hackathon & DILRMP/NAKSHA PRDs
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone


class ParcelStatus(str, Enum):
    AUTO_RECONCILED = "AUTO_RECONCILED"
    FLAGGED_FOR_REVIEW = "FLAGGED_FOR_REVIEW"
    CONFLICT = "CONFLICT"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ConflictType(str, Enum):
    OVERLAP = "OVERLAP"
    AREA_DISCREPANCY = "AREA_DISCREPANCY"
    ATTRIBUTE_MISMATCH = "ATTRIBUTE_MISMATCH"
    BOUNDARY_DRIFT = "BOUNDARY_DRIFT"


class ConflictSeverity(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ResolutionAction(str, Enum):
    ACCEPT_GOLDEN = "ACCEPT_GOLDEN"
    PREFER_DRONE = "PREFER_DRONE"
    PREFER_CADASTRAL = "PREFER_CADASTRAL"
    AVERAGE_BOUNDARIES = "AVERAGE_BOUNDARIES"
    REJECT_PARCEL = "REJECT_PARCEL"
    MANUAL_EDIT = "MANUAL_EDIT"


class GeoJSONGeometry(BaseModel):
    type: str = "Polygon"
    coordinates: List[Any]


class SourceRecordLineage(BaseModel):
    source_type: str  # 'DRONE_ORTHO', 'CADASTRAL_MAP', 'ROR_TABULAR', 'FIELD_SURVEY'
    source_document_id: str
    original_crs: str
    reprojection_applied: str
    cleaned_topology: bool = False
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    details: Dict[str, Any] = Field(default_factory=dict)


class HarmonizedParcel(BaseModel):
    golden_parcel_id: str
    raw_parcel_id: Optional[int] = None
    khasra_number: str
    owner_name: str
    tax_property_id: str
    legal_area_sqm: float
    measured_area_sqm: float
    area_discrepancy_pct: float
    harmonization_confidence: float
    status: ParcelStatus = ParcelStatus.AUTO_RECONCILED
    geometry: GeoJSONGeometry
    source_lineage: List[SourceRecordLineage] = Field(default_factory=list)
    boundary_iou: Optional[float] = 1.0
    hausdorff_distance_m: Optional[float] = 0.0
    attribute_match_score: Optional[float] = 1.0
    flagged_reason: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SpatialConflict(BaseModel):
    conflict_id: str
    golden_parcel_id: str
    candidate_parcel_id: Optional[str] = None
    khasra_number: str
    conflict_type: ConflictType
    severity: ConflictSeverity
    plain_language_explanation: str
    overlap_area_sqm: float = 0.0
    area_discrepancy_pct: float = 0.0
    iou_score: float = 0.0
    hausdorff_dist_m: float = 0.0
    attribute_similarity: float = 0.0
    conflict_geom: Optional[GeoJSONGeometry] = None  # Overlap sliver / collision polygon
    drone_geom: Optional[GeoJSONGeometry] = None
    cadastral_geom: Optional[GeoJSONGeometry] = None
    drone_props: Dict[str, Any] = Field(default_factory=dict)
    cadastral_props: Dict[str, Any] = Field(default_factory=dict)
    ror_props: Dict[str, Any] = Field(default_factory=dict)
    is_resolved: bool = False
    resolution_action: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ResolveConflictRequest(BaseModel):
    action: ResolutionAction
    reviewer_id: str = "Tehsildar_Office_01"
    notes: Optional[str] = None
    custom_geometry: Optional[GeoJSONGeometry] = None


class IngestDatasetRequest(BaseModel):
    dataset_name: str = "Ward_14_Urban_Habitation"
    target_crs: str = "EPSG:4326"
    auto_repair_topology: bool = True
    iou_threshold: float = 0.70
    confidence_threshold: float = 0.85
    area_discrepancy_threshold_pct: float = 5.0


class AnalyticsSummary(BaseModel):
    total_parcels: int = 0
    auto_reconciled: int = 0
    flagged_for_review: int = 0
    conflicts_count: int = 0
    resolved_count: int = 0
    automation_index_pct: float = 0.0
    average_confidence: float = 0.0
    area_discrepancy_alerts: int = 0
    overlap_collision_alerts: int = 0
    total_legal_area_sqm: float = 0.0
    total_measured_area_sqm: float = 0.0
    net_area_drift_pct: float = 0.0
