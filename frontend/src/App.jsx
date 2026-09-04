import React, { useState, useEffect } from 'react';
import { 
  Map, ShieldAlert, UploadCloud, History, BarChart3, 
  Layers, CheckCircle2, User, Landmark, Globe, RefreshCw, AlertCircle
} from 'lucide-react';

import MapViewer from './components/MapViewer';
import ConflictResolver from './components/ConflictResolver';
import IngestionPipeline from './components/IngestionPipeline';
import AuditInspector from './components/AuditInspector';
import AnalyticsView from './components/AnalyticsView';

export default function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [activeRole, setActiveRole] = useState('TEHSILDAR'); // 'TEHSILDAR', 'GIS_OFFICER', 'FIELD_SURVEYOR'
  
  // App Data States
  const [parcelsData, setParcelsData] = useState(null);
  const [rawLayersData, setRawLayersData] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [analytics, setAnalytics] = useState({
    total_parcels: 0,
    auto_reconciled: 0,
    flagged_for_review: 0,
    conflicts_count: 0,
    resolved_count: 0,
    automation_index_pct: 0,
    average_confidence: 0,
    area_discrepancy_alerts: 0,
    overlap_collision_alerts: 0
  });

  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecutingPipeline, setIsExecutingPipeline] = useState(false);

  // Fetch all data from backend API
  const refreshAllData = async () => {
    try {
      const [parcelsRes, layersRes, conflictsRes, analyticsRes] = await Promise.all([
        fetch('/api/parcels'),
        fetch('/api/layers/raw'),
        fetch('/api/conflicts'),
        fetch('/api/analytics/summary')
      ]);

      if (parcelsRes.ok) setParcelsData(await parcelsRes.json());
      if (layersRes.ok) setRawLayersData(await layersRes.json());
      if (conflictsRes.ok) setConflicts(await conflictsRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch (err) {
      console.error("API error during refresh:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Handle human-in-the-loop conflict resolution
  const handleResolveConflict = async (conflictId, action, notes) => {
    try {
      const res = await fetch(`/api/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reviewer_id: activeRole === 'TEHSILDAR' ? 'Tehsildar_Indiranagar_01' : 'GIS_Reviewer_ULB',
          notes
        })
      });

      if (res.ok) {
        await refreshAllData();
      }
    } catch (e) {
      console.error("Error resolving conflict:", e);
    }
  };

  // Handle Load Preset Benchmark
  const handleLoadSample = async () => {
    setIsExecutingPipeline(true);
    try {
      const res = await fetch('/api/pipeline/load-sample', { method: 'POST' });
      if (res.ok) {
        await refreshAllData();
      }
    } catch (e) {
      console.error("Error running benchmark:", e);
    } finally {
      setIsExecutingPipeline(false);
    }
  };

  // Cross-component navigations
  const handleInspectOnMap = (khasra) => {
    setActiveTab('map');
  };

  const handleSelectParcelForAudit = (goldenId) => {
    setSelectedAuditId(goldenId);
    setActiveTab('audit');
  };

  const handleSelectConflict = (khasra) => {
    setActiveTab('conflicts');
  };

  const pendingConflictsCount = conflicts.filter(c => !c.is_resolved).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Tricolor Government Header Stripe */}
      <div className="h-1 w-full flex">
        <div className="h-full flex-1 bg-[#FF9933]"></div>
        <div className="h-full flex-1 bg-white"></div>
        <div className="h-full flex-1 bg-[#138808]"></div>
      </div>

      {/* Main App Navbar */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-3 sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center shadow-lg shadow-emerald-950">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                  Bhoomi<span className="text-emerald-400">Harmonize</span>
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SIH 2026
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  NAKSHA &bull; DILRMP
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Automated Multi-Source Spatial Conflation &amp; Conflict Resolution Engine
              </p>
            </div>
          </div>

          {/* Right Header Status & Role Switcher */}
          <div className="flex items-center gap-3">
            {/* Active Ward Badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-400 font-medium">Ward:</span>
              <span className="font-bold text-white">Ward 14 (Indiranagar Habitation)</span>
            </div>

            {/* Role Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <User className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
              <select
                value={activeRole}
                onChange={(e) => setActiveRole(e.target.value)}
                className="bg-transparent text-xs text-white font-semibold outline-none pr-1 py-0.5 cursor-pointer"
              >
                <option value="TEHSILDAR" className="bg-slate-900 text-white">Tehsildar / DLRO</option>
                <option value="GIS_OFFICER" className="bg-slate-900 text-white">ULB GIS Officer</option>
                <option value="FIELD_SURVEYOR" className="bg-slate-900 text-white">Field Survey Lead</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab Navigation Menu */}
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/80 overflow-x-auto">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'map'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Map className="w-4 h-4" />
            Web-GIS Spatial Fabric
          </button>

          <button
            onClick={() => setActiveTab('conflicts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all relative ${
              activeTab === 'conflicts'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Conflict Resolution
            {pendingConflictsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-red-500 text-white">
                {pendingConflictsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ingestion')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'ingestion'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            Ingestion Pipeline
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4" />
            Provenance &amp; Audit
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'analytics'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analytics &amp; OGC
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'map' && (
          <MapViewer
            parcelsData={parcelsData}
            rawLayersData={rawLayersData}
            onSelectParcelForAudit={handleSelectParcelForAudit}
            onSelectConflict={handleSelectConflict}
          />
        )}

        {activeTab === 'conflicts' && (
          <ConflictResolver
            conflicts={conflicts}
            onResolveConflict={handleResolveConflict}
            onInspectOnMap={handleInspectOnMap}
          />
        )}

        {activeTab === 'ingestion' && (
          <IngestionPipeline
            onLoadSample={handleLoadSample}
            isExecuting={isExecutingPipeline}
          />
        )}

        {activeTab === 'audit' && (
          <AuditInspector
            parcels={parcelsData?.features?.map(f => f.properties) || []}
            selectedGoldenId={selectedAuditId}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            analytics={analytics}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800/80 px-6 py-2.5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Smart India Hackathon &bull; DILRMP &amp; NAKSHA Urban Geospatial Harmonization Platform</span>
          <span className="font-mono text-[11px] text-slate-400">Target CRS: EPSG:4326 | Metric UTM: EPSG:32643</span>
        </div>
      </footer>
    </div>
  );
}
