"""
Harmonization Confidence Scoring & Conflict Classification Engine
Implements PRD FR7, O5 & Section 9:
- Multi-factor confidence score Sc in [0.0, 1.0]
- Auto-merge vs Flagged-for-Review vs Conflict classification
- Plain-language non-GIS-expert explanations
"""

from typing import Any, Dict, Tuple
from app.models.schemas import ParcelStatus, ConflictType, ConflictSeverity


class ConfidenceScoringEngine:
    def __init__(
        self,
        auto_merge_threshold: float = 0.85,
        review_threshold: float = 0.50,
        area_discrepancy_limit_pct: float = 5.0,
        sliver_overlap_limit_sqm: float = 0.5
    ):
        self.auto_merge_threshold = auto_merge_threshold
        self.review_threshold = review_threshold
        self.area_discrepancy_limit_pct = area_discrepancy_limit_pct
        self.sliver_overlap_limit_sqm = sliver_overlap_limit_sqm

    def compute_confidence(
        self,
        iou: float,
        hausdorff_dist_m: float,
        attribute_score: float,
        source_weight: float = 0.95
    ) -> float:
        """
        Computes composite confidence score S_c in [0.0, 1.0]
        Weights:
        - 40% Spatial overlap (IoU)
        - 20% Boundary closeness (Hausdorff distance, penalized above 15m)
        - 30% Attribute match (Khasra & Owner name)
        - 10% Source data reliability weight
        """
        hausdorff_factor = max(0.0, 1.0 - min(hausdorff_dist_m / 15.0, 1.0))
        
        score = (
            0.40 * iou +
            0.20 * hausdorff_factor +
            0.30 * attribute_score +
            0.10 * source_weight
        )
        return round(float(min(1.0, max(0.0, score))), 3)

    def classify_match(
        self,
        confidence: float,
        area_discrepancy_pct: float,
        sliver_drift_sqm: float,
        hausdorff_dist_m: float,
        attribute_score: float,
        khasra: str
    ) -> Tuple[ParcelStatus, ConflictType, ConflictSeverity, str]:
        """
        Classifies candidate match and provides plain-language explanation for revenue officials.
        """
        # Case 1: Extreme perimeter sliver drift between sources (> 60 sq.m)
        if sliver_drift_sqm > 80.0:
            return (
                ParcelStatus.CONFLICT,
                ConflictType.OVERLAP,
                ConflictSeverity.HIGH,
                f"Severe perimeter displacement of {sliver_drift_sqm:.1f} m² detected between cadastral revenue boundary and physical drone perimeter. Ground survey required."
            )
        elif sliver_drift_sqm > 35.0:
            return (
                ParcelStatus.FLAGGED_FOR_REVIEW,
                ConflictType.BOUNDARY_DRIFT,
                ConflictSeverity.MEDIUM,
                f"Perimeter drift sliver of {sliver_drift_sqm:.1f} m² detected between source boundaries. Requires boundary snapping confirmation."
            )

        # Case 2: Area Discrepancy > 5% (PRD Module 4 requirement)
        if area_discrepancy_pct > self.area_discrepancy_limit_pct:
            severity = ConflictSeverity.HIGH if area_discrepancy_pct > 15.0 else ConflictSeverity.MEDIUM
            return (
                ParcelStatus.FLAGGED_FOR_REVIEW,
                ConflictType.AREA_DISCREPANCY,
                severity,
                f"Area mismatch alert: Measured physical ground area differs from legal registered RoR area by {area_discrepancy_pct:.1f}% (exceeds statutory 5.0% threshold)."
            )

        # Case 3: Low attribute similarity (< 0.70)
        if attribute_score < 0.70:
            return (
                ParcelStatus.FLAGGED_FOR_REVIEW,
                ConflictType.ATTRIBUTE_MISMATCH,
                ConflictSeverity.MEDIUM,
                f"Cadastral ownership record attributes do not conclusively match RoR registry (Match score: {int(attribute_score * 100)}%). Reviewer confirmation needed."
            )

        # Case 4: High boundary drift (> 3.5 meters)
        if hausdorff_dist_m > 3.5:
            return (
                ParcelStatus.FLAGGED_FOR_REVIEW,
                ConflictType.BOUNDARY_DRIFT,
                ConflictSeverity.MEDIUM,
                f"Historical cadastral boundary shifted by {hausdorff_dist_m:.1f} meters relative to modern drone-detected compound wall."
            )

        # Case 5: Confidence threshold evaluation
        if confidence >= self.auto_merge_threshold:
            return (
                ParcelStatus.AUTO_RECONCILED,
                ConflictType.BOUNDARY_DRIFT,
                ConflictSeverity.LOW,
                f"High-confidence match (Score: {confidence:.2f}). Boundary geometry and tabular RoR ownership verified within statutory tolerances."
            )
        elif confidence >= self.review_threshold:
            return (
                ParcelStatus.FLAGGED_FOR_REVIEW,
                ConflictType.BOUNDARY_DRIFT,
                ConflictSeverity.MEDIUM,
                f"Moderate confidence match (Score: {confidence:.2f}). Surveyor review advised before final title certification."
            )
        else:
            return (
                ParcelStatus.CONFLICT,
                ConflictType.BOUNDARY_DRIFT,
                ConflictSeverity.HIGH,
                f"Low confidence harmonization (Score: {confidence:.2f}). Substantial discrepancy between legacy revenue records and ground reality."
            )
