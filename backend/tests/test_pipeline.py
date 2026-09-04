"""
Unit & Integration Tests for BhoomiHarmonize Geospatial Engine
"""

import unittest
from shapely.geometry import Polygon, mapping

from app.services.normalizer import NormalizationEngine
from app.services.conflation import ConflationEngine
from app.services.entity_resolution import EntityResolutionEngine
from app.services.scoring import ConfidenceScoringEngine
from app.sample_data.ward14_benchmark import generate_benchmark_ward14
from app.services.pipeline import HarmonizationPipeline
from app.services.data_store import data_store
from app.models.schemas import ResolutionAction, ParcelStatus


class TestHarmonizationPipeline(unittest.TestCase):
    def setUp(self):
        self.normalizer = NormalizationEngine()
        self.conflation = ConflationEngine(normalizer=self.normalizer)
        self.entity_resolver = EntityResolutionEngine()
        self.scorer = ConfidenceScoringEngine()
        self.pipeline = HarmonizationPipeline()
        data_store.reset()

    def test_geometry_validation_and_repair(self):
        # Create a self-intersecting 'bowtie' polygon
        bowtie_coords = [(0, 0), (0, 2), (2, 0), (2, 2), (0, 0)]
        bowtie_poly = Polygon(bowtie_coords)
        self.assertFalse(bowtie_poly.is_valid)

        cleaned_poly, repaired, actions = self.normalizer.validate_and_clean_geometry(bowtie_poly)
        self.assertTrue(cleaned_poly.is_valid)
        self.assertTrue(repaired)
        self.assertGreater(len(actions), 0)

    def test_metric_area_computation(self):
        # A 100m x 100m polygon in Bangalore (approx 0.0009 deg)
        coords = [
            (77.6412, 12.9716),
            (77.6421, 12.9716),
            (77.6421, 12.9725),
            (77.6412, 12.9725),
            (77.6412, 12.9716)
        ]
        poly = Polygon(coords)
        area_sqm = self.normalizer.compute_metric_area_sqm(poly)
        # Should be roughly ~9,000 to ~11,000 sqm
        self.assertGreater(area_sqm, 8000)
        self.assertLess(area_sqm, 12000)

    def test_khasra_and_name_fuzzy_matching(self):
        # Test Khasra normalization
        self.assertEqual(self.entity_resolver.normalize_khasra("Khasra No. 102 / 1 - A"), "102/1-A")
        self.assertEqual(self.entity_resolver.normalize_khasra("Plot No 45/B"), "45/B")

        # Test name fuzzy matching
        cad_props = {"khasra_number": "101", "owner_name": "Shri Rajesh Kumar Sharma"}
        ror_records = [
            {"khasra_number": "101", "owner_name": "Rajesh K. Sharma", "tax_property_id": "TAX-101", "legal_area_sqm": 1600.0},
            {"khasra_number": "102", "owner_name": "Vikram Rao", "tax_property_id": "TAX-102", "legal_area_sqm": 1500.0}
        ]
        matched, score, breakdown = self.entity_resolver.match_spatial_to_ror(cad_props, ror_records)
        self.assertIsNotNone(matched)
        self.assertEqual(matched["tax_property_id"], "TAX-101")
        self.assertGreater(score, 0.80)

    def test_confidence_scoring_and_classification(self):
        # High confidence match
        score = self.scorer.compute_confidence(iou=0.95, hausdorff_dist_m=0.3, attribute_score=1.0)
        self.assertGreaterEqual(score, 0.85)

        status, conf_type, severity, _ = self.scorer.classify_match(
            confidence=score,
            area_discrepancy_pct=1.2,
            sliver_drift_sqm=0.0,
            hausdorff_dist_m=0.3,
            attribute_score=1.0,
            khasra="101"
        )
        self.assertEqual(status, ParcelStatus.AUTO_RECONCILED)

        # Flagged match due to area discrepancy > 5%
        status_area, conf_type_area, _, _ = self.scorer.classify_match(
            confidence=0.90,
            area_discrepancy_pct=12.5,
            sliver_drift_sqm=0.0,
            hausdorff_dist_m=0.5,
            attribute_score=1.0,
            khasra="107"
        )
        self.assertEqual(status_area, ParcelStatus.FLAGGED_FOR_REVIEW)
        self.assertEqual(conf_type_area.value, "AREA_DISCREPANCY")

    def test_end_to_end_benchmark_execution_and_resolution(self):
        # Load benchmark dataset
        benchmark = generate_benchmark_ward14()
        result = self.pipeline.execute(
            drone_features=benchmark["drone_survey"],
            cadastral_features=benchmark["cadastral_revenue"],
            ror_records=benchmark["ror_records"],
            dataset_name="Test_Ward_14"
        )
        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(result["golden_records_count"], 16)
        self.assertGreater(result["conflicts_flagged"], 0)

        # Verify analytics
        analytics = data_store.compute_analytics()
        self.assertEqual(analytics.total_parcels, 16)
        self.assertGreater(analytics.auto_reconciled, 0)
        self.assertGreater(analytics.flagged_for_review, 0)

        # Test human-in-the-loop conflict resolution (< 3 clicks)
        conflicts = data_store.get_all_conflicts(resolved=False)
        self.assertGreater(len(conflicts), 0)
        first_conflict = conflicts[0]

        resolved_parcel = data_store.resolve_conflict(
            conflict_id=first_conflict.conflict_id,
            action=ResolutionAction.PREFER_DRONE,
            reviewer_id="Tehsildar_Indiranagar",
            notes="Approved drone compound wall after field survey confirmation."
        )
        self.assertIsNotNone(resolved_parcel)
        self.assertEqual(resolved_parcel.status, ParcelStatus.APPROVED)

        # Verify audit trail
        trail = data_store.get_audit_trail(resolved_parcel.golden_parcel_id)
        self.assertGreaterEqual(len(trail), 2)
        self.assertEqual(trail[-1]["action"], ResolutionAction.PREFER_DRONE.value)


if __name__ == "__main__":
    unittest.main()
