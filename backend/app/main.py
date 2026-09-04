"""
BhoomiHarmonize FastAPI Application
Automated Integration and Intelligent Harmonization of Multi-Source Geospatial Data
for Urban Land Record Management (Smart India Hackathon / DILRMP / NAKSHA)
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router as api_router, load_sample_dataset


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed the benchmark dataset on startup so the UI is immediately populated
    try:
        await load_sample_dataset()
        print(">>> [BhoomiHarmonize] Pre-seeded Ward 14 Benchmark Urban Parcel Fabric.")
    except Exception as e:
        print(f">>> [BhoomiHarmonize] Error pre-seeding dataset: {e}")
    yield


app = FastAPI(
    title="BhoomiHarmonize API",
    description="Automated Integration and Intelligent Harmonization of Multi-Source Geospatial Data for Urban Land Records",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend development and local access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app.include_router(api_router, prefix="/api")

# Mount frontend production build if available
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
else:
    @app.get("/")
    async def root():
        return {
            "system": "BhoomiHarmonize - SIH Urban Land Geospatial Harmonization Platform",
            "status": "OPERATIONAL",
            "version": "1.0.0",
            "docs_url": "/docs",
            "supported_formats": ["GeoJSON", "Shapefile", "KML", "CSV RoR", "GeoTIFF"],
            "compliance": ["OGC WFS 2.0.0", "DILRMP", "NAKSHA", "SVAMITVA"]
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
