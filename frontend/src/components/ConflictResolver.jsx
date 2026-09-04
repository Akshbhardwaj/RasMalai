import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  AlertTriangle, CheckCircle, ShieldAlert, Sparkles, UserCheck, 
  Layers, ArrowRight, Check, X, Sliders, RefreshCw, Eye
} from 'lucide-react';

export default function ConflictResolver({ conflicts, onResolveConflict, onInspectOnMap }) {
  const [selectedConflict, setSelectedConflict] = useState(conflicts[0] || null);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const filteredConflicts = conflicts.filter(c => {
    if (filterSeverity === 'ALL') return true;
    return c.severity === filterSeverity;
  });

  const handleResolve = async (action) => {
    if (!selectedConflict) return;
    setIsResolving(true);
    try {
      await onResolveConflict(selectedConflict.conflict_id, action, reviewerNotes);
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.8 }
      });
      setReviewerNotes('');
      // Advance to next unresolved conflict
      const remaining = conflicts.filter(c => c.conflict_id !== selectedConflict.conflict_id && !c.is_resolved);
      if (remaining.length > 0) {
        setSelectedConflict(remaining[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-145px)]">
      {/* Left Column: Conflict Queue (4 cols) */}
      <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Conflict Review Queue
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Human-in-the-Loop Adjudication (&lt; 3 Clicks)
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {conflicts.filter(c => !c.is_resolved).length} Pending
          </span>
        </div>

        {/* Severity Filter Tabs */}
        <div className="flex border-b border-slate-800 p-2 gap-1 bg-slate-950/40">
          {['ALL', 'HIGH', 'MEDIUM'].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`flex-1 py-1 text-xs font-semibold rounded transition ${
                filterSeverity === sev
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Conflict List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
          {filteredConflicts.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-medium text-slate-300">All Conflicts Resolved!</p>
              <p className="text-xs text-slate-500 mt-1">
                The parcel fabric is fully harmonized and compliant.
              </p>
            </div>
          ) : (
            filteredConflicts.map((c) => {
              const isSelected = selectedConflict?.conflict_id === c.conflict_id;
              return (
                <div
                  key={c.conflict_id}
                  onClick={() => setSelectedConflict(c)}
                  className={`p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-800/90 border border-emerald-500/40 shadow-lg'
                      : 'hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Khasra {c.khasra_number}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        c.severity === 'HIGH' ? 'bg-red-950 text-red-300 border border-red-800' :
                        c.severity === 'MEDIUM' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}>
                        {c.conflict_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {c.is_resolved && (
                      <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Resolved
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 mt-2 line-clamp-2 leading-relaxed">
                    {c.plain_language_explanation}
                  </p>

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                    <span>IoU: <strong className="text-slate-200">{(c.iou_score * 100).toFixed(0)}%</strong></span>
                    <span>&bull;</span>
                    <span>Discrepancy: <strong className={c.area_discrepancy_pct > 5 ? 'text-amber-400' : 'text-slate-200'}>{c.area_discrepancy_pct}%</strong></span>
                    {c.overlap_area_sqm > 0 && (
                      <>
                        <span>&bull;</span>
                        <span className="text-red-400 font-semibold">{c.overlap_area_sqm} m² overlap</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Deep-Dive Resolution Workbench (8 cols) */}
      <div className="lg:col-span-8 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {selectedConflict ? (
          <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
            {/* Top Summary Banner */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-tight">
                    Conflict Review: Khasra {selectedConflict.khasra_number}
                  </h1>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedConflict.conflict_id}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Discrepancy between historical revenue records and modern orthorectified drone survey
                </p>
              </div>

              <button
                onClick={() => onInspectOnMap(selectedConflict.khasra_number)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
              >
                <Eye className="w-3.5 h-3.5" /> Inspect on GIS Map
              </button>
            </div>

            {/* Plain Language Explanation Callout */}
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-600/40 text-sm text-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-300">Revenue Official Assessment</h4>
                <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                  {selectedConflict.plain_language_explanation}
                </p>
              </div>
            </div>

            {/* Multi-Source Comparison Table (Drone vs Cadastral vs RoR) */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Multi-Source Evidence Comparison
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Source 1: Drone Ortho Ground Reality */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-sky-500/30 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sky-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-sky-400"></span> Drone Ortho Survey
                    </span>
                    <span className="text-[10px] text-slate-400">UAV 5cm</span>
                  </div>
                  <div className="space-y-1.5 text-slate-300">
                    <p>Ground Area: <strong className="text-white font-mono">{selectedConflict.drone_props?.measured_area_sqm || '~1486'} m²</strong></p>
                    <p>Physical Feature: <span className="text-slate-200">Compound Wall / Fence</span></p>
                    <p>Sensor: <span className="text-slate-400">Zenmuse P1 (Orthorectified)</span></p>
                    <p>Date: <span className="text-slate-400">March 2026</span></p>
                  </div>
                </div>

                {/* Source 2: Cadastral Revenue Map */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-amber-500/30 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span> Cadastral Revenue Map
                    </span>
                    <span className="text-[10px] text-slate-400">Digitized Vector</span>
                  </div>
                  <div className="space-y-1.5 text-slate-300">
                    <p>Registered Owner: <strong className="text-white">{selectedConflict.cadastral_props?.owner_name || 'N/A'}</strong></p>
                    <p>Revenue Sheet: <span className="text-slate-400">Indiranagar Ward Sheet 1974</span></p>
                    <p>Boundary Drift: <span className="text-amber-300 font-mono">{selectedConflict.hausdorff_dist_m} m</span></p>
                    <p>Spatial IoU: <span className="text-white font-mono">{(selectedConflict.iou_score * 100).toFixed(1)}%</span></p>
                  </div>
                </div>

                {/* Source 3: Tabular Record of Rights (RoR) */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-emerald-500/30 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span> RoR Tabular Registry
                    </span>
                    <span className="text-[10px] text-slate-400">Revenue DB</span>
                  </div>
                  <div className="space-y-1.5 text-slate-300">
                    <p>Legal Record Owner: <strong className="text-white">{selectedConflict.ror_props?.owner_name || 'N/A'}</strong></p>
                    <p>Legal Title Area: <strong className="text-white font-mono">{selectedConflict.ror_props?.legal_area_sqm || 'N/A'} m²</strong></p>
                    <p>Tax Assessment ID: <span className="text-sky-300 font-mono">{selectedConflict.ror_props?.tax_property_id || 'N/A'}</span></p>
                    <p>Mutation Status: <span className="text-emerald-300 font-medium">Certified Clear</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-4 gap-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-center">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Boundary IoU</span>
                <p className="text-lg font-bold font-mono text-white mt-0.5">{(selectedConflict.iou_score * 100).toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Area Discrepancy</span>
                <p className={`text-lg font-bold font-mono mt-0.5 ${selectedConflict.area_discrepancy_pct > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {selectedConflict.area_discrepancy_pct}%
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Perimeter Drift</span>
                <p className="text-lg font-bold font-mono text-sky-400 mt-0.5">{selectedConflict.hausdorff_dist_m} m</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Attribute Match</span>
                <p className="text-lg font-bold font-mono text-purple-400 mt-0.5">{(selectedConflict.attribute_similarity * 100).toFixed(0)}%</p>
              </div>
            </div>

            {/* Reviewer Note Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tehsildar / Reviewer Audit Notes:
              </label>
              <input
                type="text"
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="e.g., Verified compound wall aligns with actual possession; approved ground truth."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 text-xs text-white rounded-lg focus:outline-none focus:border-emerald-500 shadow-inner"
              />
            </div>

            {/* Action Bar (< 3 Clicks Resolution) */}
            <div className="pt-4 border-t border-slate-800">
              <span className="text-xs font-bold text-slate-300 block mb-3">
                Select Resolution Action (&lt; 3 Clicks):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  disabled={isResolving}
                  onClick={() => handleResolve('PREFER_DRONE')}
                  className="p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex flex-col items-center gap-1 text-center group"
                >
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Prefer Drone
                  </span>
                  <span className="text-[10px] font-normal text-sky-200">Enforce Field Reality</span>
                </button>

                <button
                  disabled={isResolving}
                  onClick={() => handleResolve('PREFER_CADASTRAL')}
                  className="p-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex flex-col items-center gap-1 text-center group"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4" /> Prefer Cadastral
                  </span>
                  <span className="text-[10px] font-normal text-amber-200">Enforce Legal Bounds</span>
                </button>

                <button
                  disabled={isResolving}
                  onClick={() => handleResolve('ACCEPT_GOLDEN')}
                  className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex flex-col items-center gap-1 text-center group"
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Approve Golden
                  </span>
                  <span className="text-[10px] font-normal text-emerald-200">Accept Proposed</span>
                </button>

                <button
                  disabled={isResolving}
                  onClick={() => handleResolve('REJECT_PARCEL')}
                  className="p-3 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition shadow-lg flex flex-col items-center gap-1 text-center group"
                >
                  <span className="flex items-center gap-1.5">
                    <X className="w-4 h-4" /> Flag Dispute
                  </span>
                  <span className="text-[10px] font-normal text-rose-200">Requires Ground Crew</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <ShieldAlert className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Select a conflict case from the queue to start review</p>
          </div>
        )}
      </div>
    </div>
  );
}
