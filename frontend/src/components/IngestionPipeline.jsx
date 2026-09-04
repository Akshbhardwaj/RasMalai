import React, { useState } from 'react';
import { 
  UploadCloud, FileText, CheckCircle2, Play, Database, 
  MapPin, Cpu, ArrowRight, ShieldCheck, RefreshCw, FileUp
} from 'lucide-react';

export default function IngestionPipeline({ onLoadSample, isExecuting }) {
  const [pipelineStep, setPipelineStep] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('WARD_14');

  const steps = [
    { title: "Format Parsing & CRS Auto-Detection", desc: "Identifies EPSG:32643 / UTM 43N from headers & bounding heuristics" },
    { title: "Reprojection & Topology Cleaning", desc: "Normalizes to target EPSG:4326; runs shapely make_valid() & snaps duplicate vertices" },
    { title: "Spatial Conflation & STRtree Join", desc: "Computes IoU, Hausdorff boundary distance, and collision slivers in metric space" },
    { title: "RapidFuzz Entity Resolution", desc: "Matches Khasra notations and owner names against tabular RoR registry" },
    { title: "Confidence Scoring & Golden Record Store", desc: "Generates composite Sc score and routes parcels to auto-merge or review queue" }
  ];

  const handleRunPreset = async () => {
    setPipelineStep(1);
    const interval = setInterval(() => {
      setPipelineStep(prev => {
        if (prev < steps.length) return prev + 1;
        clearInterval(interval);
        return prev;
      });
    }, 450);

    await onLoadSample();
    setUploadSuccess(true);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Automated Ingestion Engine
              </span>
              <span className="text-xs text-slate-400 font-mono">DILRMP / NAKSHA Compliant</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1.5">
              Geospatial Data Ingestion & Harmonization Pipeline
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Accepts heterogeneous vector cadastral maps, high-resolution UAV drone orthomosaics, 
              and tabular Record of Rights (RoR) databases to generate the single Golden Urban Spatial Record.
            </p>
          </div>

          <button
            disabled={isExecuting}
            onClick={handleRunPreset}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition hover:scale-[1.02] active:scale-[0.98] shrink-0"
          >
            {isExecuting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
            Run Ward 14 Benchmark
          </button>
        </div>
      </div>

      {/* Grid: Upload Dropzone & Supported Formats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Dropzone Card (2 cols) */}
        <div className="md:col-span-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <UploadCloud className="w-4 h-4 text-sky-400" />
              Upload Source Files (Batch Ingestion)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Drop Shapefiles (.zip), GeoJSON, KML, or tabular RoR (.csv) files here.
            </p>

            <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-8 text-center transition bg-slate-950/40 cursor-pointer">
              <FileUp className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-200">
                Drag & drop geospatial files, or <span className="text-emerald-400 hover:underline">browse files</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Supports GeoJSON, SHP, KML, CSV (RoR), and GeoTIFF headers
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-800">
            <span>Target Projection: <strong className="text-white font-mono">EPSG:4326 (WGS84)</strong></span>
            <span>Metric Compute: <strong className="text-white font-mono">EPSG:32643 (UTM 43N)</strong></span>
          </div>
        </div>

        {/* Formats Info (1 col) */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-purple-400" />
              Supported Formats (PRD O1)
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 font-medium">ESRI Shapefile (.shp / .zip)</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 font-medium">GeoJSON FeatureCollection</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 font-medium">Keyhole Markup (.kml)</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 font-medium">Tabular RoR Registry (.csv)</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-300 font-medium">GeoTIFF Orthomosaic Bounds</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Pipeline Execution Monitor */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-emerald-400" />
          Harmonization Execution Pipeline
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {steps.map((step, idx) => {
            const isCompleted = pipelineStep > idx;
            const isCurrent = pipelineStep === idx + 1;
            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-900/20 animate-pulse'
                    : isCompleted
                    ? 'bg-slate-950/80 border-emerald-800/60'
                    : 'bg-slate-950/40 border-slate-800/80 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-400">STAGE 0{idx + 1}</span>
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : isCurrent ? (
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-700" />
                  )}
                </div>
                <h4 className="text-xs font-semibold text-slate-200">{step.title}</h4>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
