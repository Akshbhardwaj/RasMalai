import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Layers, Search, Eye, EyeOff, ShieldCheck, AlertTriangle, 
  CheckCircle2, Compass, Maximize2, ExternalLink, Sparkles
} from 'lucide-react';

export default function MapViewer({ parcelsData, rawLayersData, onSelectParcelForAudit, onSelectConflict }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({
    drone: null,
    cadastral: null,
    golden: null,
    conflicts: null
  });

  const [activeLayers, setActiveLayers] = useState({
    drone: true,
    cadastral: true,
    golden: true,
    conflicts: true
  });
  const [baseMapType, setBaseMapType] = useState('satellite');
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Initialize map instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Ward 14 Indiranagar centroid
    const map = L.map(mapContainerRef.current, {
      center: [12.9723, 77.6420],
      zoom: 17,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Base Map tile layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (map._baseLayer) {
      map.removeLayer(map._baseLayer);
    }

    let url, attribution;
    if (baseMapType === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
    } else {
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; <a href="https://carto.com/">CARTO</a>';
    }

    const baseLayer = L.tileLayer(url, {
      maxZoom: 20,
      attribution
    }).addTo(map);

    map._baseLayer = baseLayer;
  }, [baseMapType]);

  // Update Vector Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 1. Clear previous layers
    Object.values(layersRef.current).forEach(layer => {
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    // 2. Drone Ortho Survey Layer (Blue dashed boundary)
    if (rawLayersData?.drone_survey && activeLayers.drone) {
      layersRef.current.drone = L.geoJSON(rawLayersData.drone_survey, {
        style: {
          color: '#38bdf8',
          weight: 2,
          dashArray: '6, 6',
          fillOpacity: 0.05,
          fillColor: '#0284c7'
        },
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(`<b>Drone Survey: Khasra ${feature.properties.khasra_number}</b><br/>5cm Ground Sampling Res`, {
            className: 'bg-slate-900 text-sky-300 border border-sky-600 px-2 py-1 rounded text-xs shadow-lg'
          });
        }
      }).addTo(map);
    }

    // 3. Cadastral Revenue Map Layer (Amber solid)
    if (rawLayersData?.cadastral_revenue && activeLayers.cadastral) {
      layersRef.current.cadastral = L.geoJSON(rawLayersData.cadastral_revenue, {
        style: {
          color: '#f59e0b',
          weight: 2,
          fillOpacity: 0.12,
          fillColor: '#d97706'
        },
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(`<b>Cadastral Sheet: Khasra ${feature.properties.khasra_number}</b><br/>${feature.properties.owner_name}`, {
            className: 'bg-slate-900 text-amber-300 border border-amber-600 px-2 py-1 rounded text-xs shadow-lg'
          });
        }
      }).addTo(map);
    }

    // 4. Conflict Overlap Slivers (Red alert hatched)
    if (rawLayersData?.conflict_slivers && activeLayers.conflicts) {
      layersRef.current.conflicts = L.geoJSON(rawLayersData.conflict_slivers, {
        style: {
          color: '#ef4444',
          weight: 2,
          fillOpacity: 0.65,
          fillColor: '#dc2626'
        },
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(`<b>Topological Collision / Sliver</b><br/>Overlap: ${feature.properties.overlap_area_sqm} m²`, {
            className: 'bg-slate-900 text-rose-300 border border-rose-600 px-2 py-1 rounded text-xs shadow-lg'
          });
        }
      }).addTo(map);
    }

    // 5. Harmonized Golden Record Layer (Emerald green)
    if (parcelsData?.features && activeLayers.golden) {
      // Filter parcels based on status and search query
      const filteredFeatures = parcelsData.features.filter(f => {
        if (statusFilter !== 'ALL' && f.properties.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchK = f.properties.khasra_number?.toLowerCase().includes(q);
          const matchO = f.properties.owner_name?.toLowerCase().includes(q);
          const matchT = f.properties.tax_property_id?.toLowerCase().includes(q);
          return matchK || matchO || matchT;
        }
        return true;
      });

      layersRef.current.golden = L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures }, {
        style: (feature) => {
          const status = feature.properties.status;
          let fillColor = '#10b981';
          let borderColor = '#059669';
          let fillOpacity = 0.35;

          if (status === 'FLAGGED_FOR_REVIEW') {
            fillColor = '#f59e0b';
            borderColor = '#d97706';
            fillOpacity = 0.45;
          } else if (status === 'CONFLICT') {
            fillColor = '#ef4444';
            borderColor = '#b91c1c';
            fillOpacity = 0.55;
          } else if (status === 'APPROVED') {
            fillColor = '#06b6d4';
            borderColor = '#0891b2';
            fillOpacity = 0.4;
          }

          return {
            color: borderColor,
            weight: 2.5,
            fillColor: fillColor,
            fillOpacity: fillOpacity
          };
        },
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({ weight: 4, color: '#ffffff' });
            },
            mouseout: (e) => {
              layersRef.current.golden.resetStyle(e.target);
            },
            click: () => {
              setSelectedParcel(feature.properties);
              map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 19 });
            }
          });
        }
      }).addTo(map);

      // Auto-fit bounds if first load
      if (!selectedParcel && filteredFeatures.length > 0 && layersRef.current.golden) {
        try {
          map.fitBounds(layersRef.current.golden.getBounds(), { padding: [20, 20] });
        } catch (e) {}
      }
    }
  }, [parcelsData, rawLayersData, activeLayers, statusFilter, searchQuery]);

  const toggleLayer = (key) => {
    setActiveLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="relative w-full h-[calc(100vh-145px)] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top Left: Search & Filter Floating Toolbar */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Khasra (e.g. 101, 105/A) or Owner..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-xs text-white rounded-lg focus:outline-none focus:border-emerald-500 shadow-xl"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 border border-slate-700 rounded-lg shadow-xl">
          {['ALL', 'AUTO_RECONCILED', 'FLAGGED_FOR_REVIEW', 'CONFLICT'].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-all ${
                statusFilter === filter
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {filter === 'ALL' ? 'All' : filter.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Top Right: Layer Switcher & Basemap Toggle */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl w-64">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" /> Map Layers
            </span>
            <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded text-[10px]">
              <button
                onClick={() => setBaseMapType('satellite')}
                className={`px-1.5 py-0.5 rounded ${baseMapType === 'satellite' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
              >
                Sat
              </button>
              <button
                onClick={() => setBaseMapType('dark')}
                className={`px-1.5 py-0.5 rounded ${baseMapType === 'dark' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
              >
                Dark
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              onClick={() => toggleLayer('golden')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 text-xs transition"
            >
              <span className="flex items-center gap-2 text-emerald-300">
                <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-300"></span>
                Golden Record Fabric
              </span>
              {activeLayers.golden ? <Eye className="w-3.5 h-3.5 text-slate-300" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
            </button>

            <button
              onClick={() => toggleLayer('drone')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 text-xs transition"
            >
              <span className="flex items-center gap-2 text-sky-300">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-sky-400"></span>
                Drone Ortho Survey
              </span>
              {activeLayers.drone ? <Eye className="w-3.5 h-3.5 text-slate-300" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
            </button>

            <button
              onClick={() => toggleLayer('cadastral')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 text-xs transition"
            >
              <span className="flex items-center gap-2 text-amber-300">
                <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-400"></span>
                Cadastral Revenue Map
              </span>
              {activeLayers.cadastral ? <Eye className="w-3.5 h-3.5 text-slate-300" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
            </button>

            <button
              onClick={() => toggleLayer('conflicts')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-slate-800/80 text-xs transition"
            >
              <span className="flex items-center gap-2 text-rose-300">
                <span className="w-3 h-3 rounded bg-red-600/80 border border-red-400 animate-pulse"></span>
                Conflict Overlap Slivers
              </span>
              {activeLayers.conflicts ? <Eye className="w-3.5 h-3.5 text-slate-300" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Floating Inspector: Displayed when a parcel is clicked */}
      {selectedParcel && (
        <div className="absolute bottom-6 left-6 z-[1000] w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                  Khasra {selectedParcel.khasra_number}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  selectedParcel.status === 'AUTO_RECONCILED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                  selectedParcel.status === 'APPROVED' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                  'bg-amber-950 text-amber-300 border border-amber-800'
                }`}>
                  {selectedParcel.status.replace(/_/g, ' ')}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white mt-1.5">{selectedParcel.owner_name}</h3>
              <p className="text-[11px] text-slate-400">{selectedParcel.tax_property_id}</p>
            </div>
            <button
              onClick={() => setSelectedParcel(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              &times;
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 my-3 text-xs">
            <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block">Measured Ground Area</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">{selectedParcel.measured_area_sqm} m²</span>
            </div>
            <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block">Legal Registered Area</span>
              <span className="text-slate-200 font-mono font-bold text-sm">{selectedParcel.legal_area_sqm} m²</span>
            </div>
            <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block">Harmonization Confidence</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">
                {(selectedParcel.harmonization_confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block">Area Discrepancy</span>
              <span className={`font-mono font-bold text-sm ${selectedParcel.area_discrepancy_pct > 5 ? 'text-amber-400' : 'text-slate-300'}`}>
                {selectedParcel.area_discrepancy_pct}%
              </span>
            </div>
          </div>

          {selectedParcel.flagged_reason && (
            <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-200 mb-3 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{selectedParcel.flagged_reason}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              onClick={() => onSelectParcelForAudit(selectedParcel.golden_parcel_id)}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> View Lineage & Provenance
            </button>
            {selectedParcel.status !== 'AUTO_RECONCILED' && selectedParcel.status !== 'APPROVED' && (
              <button
                onClick={() => onSelectConflict(selectedParcel.khasra_number)}
                className="px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded font-medium transition shadow"
              >
                Resolve Conflict
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
