"""
Benchmark Urban Ward Dataset (Ward 14 - Urban Habitation)
Simulates realistic multi-source land record data under DILRMP / NAKSHA:
1. Drone Ortho Physical Boundaries (Modern UAV survey)
2. Cadastral Revenue Map (Digitized historical vector sheets with realistic drift)
3. Tabular RoR Ownership Database (Revenue department registry with owner names & legal area)
"""

import uuid
from typing import Any, Dict, List, Tuple


def generate_benchmark_ward14() -> Dict[str, Any]:
    # Base origin: Urban Ward Habitation (Lat: 12.9716, Lng: 77.6412)
    # 4x4 Grid of realistic urban parcels with variations
    base_lat = 12.9716
    base_lng = 77.6412
    step_lat = 0.00035  # ~38 meters
    step_lng = 0.00040  # ~43 meters

    raw_cadastral = []
    raw_drone = []
    ror_records = []

    # Parcel specifications: (row, col, khasra, owner_cadastral, owner_ror, tax_id, legal_area, drift_dx, drift_dy, intentional_discrepancy)
    parcels_spec = [
        # Clean auto-merge parcels
        (0, 0, "101", "Shri Rajesh Kumar Sharma", "Rajesh Kumar Sharma", "TAX-W14-0101", 1486.7, 0.000002, 0.000002, 1.0),
        (0, 1, "102/1", "Smt. Sunita Devi", "Sunita Devi", "TAX-W14-0102A", 1486.7, -0.000002, 0.000002, 1.0),
        (0, 2, "102/2", "Mohammad Arif Khan", "Mohd Arif Khan", "TAX-W14-0102B", 1486.7, 0.000002, -0.000002, 1.0),
        (0, 3, "103", "Anand Swaminathan", "Anand Swaminathan", "TAX-W14-0103", 1486.7, 0.000002, 0.000002, 1.0),
        
        # Boundary drift & overlap conflict parcels
        (1, 0, "104", "Vikramaditya Rao", "Vikramaditya Rao", "TAX-W14-0104", 1486.7, 0.000035, 0.000030, 1.0), # Drifted boundary
        (1, 1, "105/A", "Smt. Meenakshi Sundaram", "Meenakshi Sundaram", "TAX-W14-0105A", 1486.7, -0.000030, 0.000025, 1.0), # Overlaps adjacent
        (1, 2, "105/B", "Dr. Harish Chandra Patel", "Harish C. Patel", "TAX-W14-0105B", 1486.7, 0.000005, -0.000004, 1.0),
        (1, 3, "106", "Pooja Deshmukh", "Pooja Deshmukh", "TAX-W14-0106", 1486.7, 0.000004, 0.000004, 1.0),

        # Area discrepancy (>5%) parcels (PRD Module 4)
        (2, 0, "107", "Gurpreet Singh Gill", "Gurpreet Singh Gill", "TAX-W14-0107", 1850.0, 0.000002, 0.000002, 0.82), # >20% area deficit!
        (2, 1, "108/1", "Kavita R. Nair", "Kavita Nair", "TAX-W14-0108A", 1250.0, 0.000002, -0.000002, 1.18), # >18% area encroachment!
        (2, 2, "108/2", "Syed Mansoor Ahmed", "S. M. Ahmed", "TAX-W14-0108B", 1486.7, 0.000003, 0.000003, 1.0),
        (2, 3, "109", "Deepak Joshi", "Deepak Joshi", "TAX-W14-0109", 1486.7, 0.000003, -0.000003, 1.0),

        # Attribute fuzzy matching test parcels
        (3, 0, "110", "Late K. Ramachandra Rao Legal Heirs", "K Ramachandra Rao", "TAX-W14-0110", 1486.7, 0.000003, 0.000003, 1.0),
        (3, 1, "111/1", "Smt. Fatima Begum", "Fatima Begum", "TAX-W14-0111A", 1486.7, -0.000004, 0.000003, 1.0),
        (3, 2, "111/2", "Prashant Bhattacharya", "P. Bhattacharya", "TAX-W14-0111B", 1486.7, 0.000002, -0.000002, 1.0),
        (3, 3, "112", "DILRMP Municipal Community Center", "Urban Local Body Ward 14", "TAX-W14-MUNI-01", 1486.7, 0.000002, 0.000002, 1.0),
    ]

    for r, c, khasra, own_cad, own_ror, tax_id, legal_area, d_lng, d_lat, area_factor in parcels_spec:
        # Base polygon corners
        min_lng = base_lng + c * step_lng
        max_lng = min_lng + step_lng * 0.94
        min_lat = base_lat + r * step_lat
        max_lat = min_lat + step_lat * 0.94

        # Drone polygon (represents modern physical reality / compound walls)
        drone_coords = [
            [round(min_lng, 7), round(min_lat, 7)],
            [round(max_lng, 7), round(min_lat, 7)],
            [round(max_lng, 7), round(max_lat, 7)],
            [round(min_lng, 7), round(max_lat, 7)],
            [round(min_lng, 7), round(min_lat, 7)],
        ]
        drone_feature = {
            "id": f"DRONE-{khasra}",
            "type": "Feature",
            "properties": {
                "source": "UAV_DRONE_ORTHOMOSAIC",
                "khasra_number": khasra,
                "feature_type": "compound_wall_perimeter",
                "capture_date": "2026-03-15",
                "resolution_cm": 5.0,
                "sensor": "Zenmuse_P1_45MP"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [drone_coords]
            }
        }
        raw_drone.append(drone_feature)

        # Cadastral polygon (represents historical digitized revenue sheet)
        # Shifted by d_lng, d_lat and scaled by area_factor
        c_min_lng = min_lng + d_lng
        c_max_lng = (min_lng + (step_lng * 0.94 * area_factor)) + d_lng
        c_min_lat = min_lat + d_lat
        c_max_lat = (min_lat + (step_lat * 0.94 * area_factor)) + d_lat

        cad_coords = [
            [round(c_min_lng, 7), round(c_min_lat, 7)],
            [round(c_max_lng, 7), round(c_min_lat, 7)],
            [round(c_max_lng, 7), round(c_max_lat, 7)],
            [round(c_min_lng, 7), round(c_max_lat, 7)],
            [round(c_min_lng, 7), round(c_min_lat, 7)],
        ]
        cad_feature = {
            "id": f"CAD-{khasra}",
            "type": "Feature",
            "properties": {
                "source": "REVENUE_CADASTRAL_SHEET",
                "khasra_number": khasra,
                "owner_name": own_cad,
                "village": "Indiranagar Urban",
                "tehsil": "East Zone",
                "sheet_year": "1974_REVISED_2012"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [cad_coords]
            }
        }
        raw_cadastral.append(cad_feature)

        # RoR tabular entry
        ror_records.append({
            "khasra_number": khasra,
            "owner_name": own_ror,
            "tax_property_id": tax_id,
            "legal_area_sqm": legal_area,
            "mutation_status": "CERTIFIED_CLEAR",
            "last_mutation_year": 2024,
            "land_use": "Residential Urban Habitation",
            "revenue_demand_inr": round(legal_area * 14.5, 2)
        })

    return {
        "drone_survey": raw_drone,
        "cadastral_revenue": raw_cadastral,
        "ror_records": ror_records
    }
