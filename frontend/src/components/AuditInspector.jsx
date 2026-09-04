import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, History, FileCheck, Layers, UserCheck, 
  Clock, ArrowRight, CheckCircle2, ChevronRight, Hash
} from 'lucide-react';

export default function AuditInspector({ parcels, selectedGoldenId }) {
  const [activeParcelId, setActiveParcelId] = useState(selectedGoldenId || (parcels[0]?.golden_parcel_id || ''));
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedGoldenId) {
      setActiveParcelId(selectedGoldenId);
    }
  }, [selectedGoldenId]);

  useEffect(() => {
    if (!activeParcelId) return;

    const fetchAudit = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/audit/${activeParcelId}`);
        if (res.ok) {
          const data = await res.json();
          setAuditData(data);
        }
      } catch (e) {
        console.error("Failed to load audit:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAudit();
  }, [activeParcelId]);

  const currentParcel = parcels.find(p => p.golden_parcel_id === activeParcelId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Parcel Selector */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Statutory Provenance Audit Engine
            </span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">
            Golden Parcel Lineage & Transformation Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Every harmonized parcel retains full immutable lineage linking source imagery, coordinate transformations, and surveyor decisions.
          </p>
        </div>

        {/* Parcel Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-semibold whitespace-nowrap">Select Parcel:</label>
          <select
            value={activeParcelId}
            onChange={(e) => setActiveParcelId(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-700 text-xs text-white rounded-lg focus:outline-none focus:border-emerald-500 font-mono shadow-inner"
          >
            {parcels.map(p => (
              <option key={p.golden_parcel_id} value={p.golden_parcel_id}>
                Khasra {p.khasra_number} - {p.owner_name.slice(0, 24)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Parcel Overview Cards */}
      {currentParcel && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Khasra Number</span>
            <p className="text-lg font-bold text-white mt-0.5 font-mono">{currentParcel.khasra_number}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Registered Title Owner</span>
            <p className="text-sm font-bold text-white mt-0.5 truncate">{currentParcel.owner_name}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Area (Measured / Legal)</span>
            <p className="text-sm font-bold text-white mt-0.5 font-mono">
              {currentParcel.measured_area_sqm} m² / {currentParcel.legal_area_sqm} m²
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Current Harmonization Status</span>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">
              {currentParcel.status.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      )}

      {/* Two Column Layout: Source Document Provenance + Transformation Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Source Inputs Lineage (5 cols) */}
        <div className="md:col-span-5 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Layers className="w-4 h-4 text-sky-400" />
            Source Document Provenance
          </h3>

          {auditData?.source_lineage ? (
            <div className="space-y-3 text-xs">
              {auditData.source_lineage.map((src, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-400">{src.source_type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {src.original_crs}
                    </span>
                  </div>
                  <p className="text-slate-300">Doc ID: <strong className="text-white font-mono">{src.source_document_id}</strong></p>
                  <p className="text-slate-400">Target CRS: <span className="text-slate-200">{src.reprojection_applied}</span></p>
                  {src.cleaned_topology && (
                    <span className="inline-block text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full mt-1">
                      Topology Auto-Cleaned
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Loading source lineage...</p>
          )}
        </div>

        {/* Audit Trail Timeline (7 cols) */}
        <div className="md:col-span-7 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <History className="w-4 h-4 text-emerald-400" />
            Transformation & Adjudication Log
          </h3>

          {auditData?.transformation_history ? (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {auditData.transformation_history.map((log, index) => (
                <div key={index} className="relative text-xs">
                  <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950 shadow-md"></div>
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-300">{log.description || log.notes || 'Pipeline execution event logged.'}</p>
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>Authorized By: <strong className="text-slate-200">{log.performed_by}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Loading audit log...</p>
          )}
        </div>
      </div>
    </div>
  );
}
