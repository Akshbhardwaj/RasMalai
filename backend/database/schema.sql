-- ============================================================================
-- PostGIS Database Schema Architecture for BhoomiHarmonize
-- Conforms to SIH PRD Section 6 & Section 7 (PostGIS Database Schema)
-- ============================================================================

-- Enable PostGIS Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Raw Ingested Cadastral Parcels
CREATE TABLE IF NOT EXISTS raw_cadastral_parcels (
    parcel_id SERIAL PRIMARY KEY,
    source_document VARCHAR(100) NOT NULL,
    plot_number VARCHAR(50),
    owner_name_raw VARCHAR(255),
    ingestion_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Polygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_raw_cadastral_geom ON raw_cadastral_parcels USING GIST (geom);

-- 2. Deep Learning Detected Physical Boundaries (Drone/Satellite)
CREATE TABLE IF NOT EXISTS ai_detected_boundaries (
    feature_id SERIAL PRIMARY KEY,
    detection_type VARCHAR(50), -- e.g., 'fence', 'wall', 'building_footprint'
    confidence_score NUMERIC(4,3),
    geom GEOMETRY(Geometry, 4326)
);
CREATE INDEX IF NOT EXISTS idx_ai_boundaries_geom ON ai_detected_boundaries USING GIST (geom);

-- 3. Harmonized "Golden Record" Parcels
CREATE TABLE IF NOT EXISTS harmonized_land_records (
    golden_parcel_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_parcel_id INT REFERENCES raw_cadastral_parcels(parcel_id) ON DELETE SET NULL,
    tax_property_id VARCHAR(100) UNIQUE,
    khasra_number VARCHAR(50),
    owner_name VARCHAR(255),
    legal_area_sqm NUMERIC(10,2),
    measured_area_sqm NUMERIC(10,2),
    area_discrepancy_pct NUMERIC(5,2),
    harmonization_confidence NUMERIC(4,3),
    status VARCHAR(30) DEFAULT 'AUTO_RECONCILED', -- 'AUTO_RECONCILED', 'FLAGGED_FOR_REVIEW', 'APPROVED', 'REJECTED'
    geom GEOMETRY(Polygon, 4326),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_harmonized_geom ON harmonized_land_records USING GIST (geom);

-- 4. Spatial Overlap / Topology Conflict Table
CREATE TABLE IF NOT EXISTS spatial_conflicts (
    conflict_id SERIAL PRIMARY KEY,
    parcel_id_a UUID REFERENCES harmonized_land_records(golden_parcel_id) ON DELETE CASCADE,
    parcel_id_b UUID REFERENCES harmonized_land_records(golden_parcel_id) ON DELETE CASCADE,
    conflict_type VARCHAR(50), -- 'OVERLAP', 'GAP_SLIVER', 'BOUNDARY_DISCREPANCY', 'AREA_DISCREPANCY'
    overlap_area_sqm NUMERIC(10,2),
    conflict_geom GEOMETRY(Geometry, 4326),
    is_resolved BOOLEAN DEFAULT FALSE,
    resolution_action VARCHAR(50),
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conflict_geom ON spatial_conflicts USING GIST (conflict_geom);

-- 5. Full Audit Provenance Lineage Table
CREATE TABLE IF NOT EXISTS parcel_audit_trail (
    audit_id SERIAL PRIMARY KEY,
    golden_parcel_id UUID REFERENCES harmonized_land_records(golden_parcel_id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    performed_by VARCHAR(100) NOT NULL,
    transformation_matrix JSONB,
    notes TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Section 7: Automated Spatial Harmonization Query Procedure
-- Identifies Boundary Overlaps & Stores Collision Geometries
-- ============================================================================
CREATE OR REPLACE FUNCTION detect_spatial_overlaps(overlap_threshold_sqm NUMERIC DEFAULT 0.5)
RETURNS INT AS $$
DECLARE
    inserted_count INT;
BEGIN
    INSERT INTO spatial_conflicts (parcel_id_a, parcel_id_b, conflict_type, overlap_area_sqm, conflict_geom)
    SELECT 
        a.golden_parcel_id AS parcel_id_a,
        b.golden_parcel_id AS parcel_id_b,
        'OVERLAP' AS conflict_type,
        ST_Area(ST_Intersection(a.geom, b.geom)::geography) AS overlap_area_sqm,
        ST_Intersection(a.geom, b.geom) AS conflict_geom
    FROM 
        harmonized_land_records a
    JOIN 
        harmonized_land_records b 
    ON 
        a.golden_parcel_id < b.golden_parcel_id 
        AND ST_Intersects(a.geom, b.geom)
    WHERE 
        NOT ST_Touches(a.geom, b.geom) -- Exclude valid shared boundary edges
        AND ST_Area(ST_Intersection(a.geom, b.geom)::geography) > overlap_threshold_sqm;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;
