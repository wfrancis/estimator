import { useState, lazy, Suspense } from 'react';
import type { SolveResponse, SceneData } from '../types';
import ElevationSVG from './ElevationSVG';
const Kitchen3D = lazy(() => import('./Kitchen3D'));
const ThreeTest = lazy(() => import('./ThreeTest'));

interface SolvedViewProps {
  data: SolveResponse;
  sceneData?: SceneData | null;
  onTapMeasure: (sectionId: string, value: number) => void;
  onConfirm: () => void;
  loading: boolean;
}

export default function SolvedView({ data, sceneData, onTapMeasure, onConfirm, loading }: SolvedViewProps) {
  const [tapModal, setTapModal] = useState<string | null>(null);
  const [tapValue, setTapValue] = useState('');

  const { solved, svg, needs_more_input, disambiguation_reason } = data;

  const handleTapCabinet = (sectionId: string) => {
    setTapModal(sectionId);
    setTapValue('');
  };

  const handleTapSubmit = () => {
    if (!tapModal || !tapValue) return;
    onTapMeasure(tapModal, parseFloat(tapValue));
    setTapModal(null);
    setTapValue('');
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.85) return 'text-green-600';
    if (c >= 0.7) return 'text-blue-600';
    return 'text-orange-600';
  };

  const sourceLabel = (s: string) => {
    switch (s) {
      case 'measured': return 'Measured';
      case 'appliance': return 'Appliance';
      case 'solved': return 'AI Solved';
      case 'ambiguous': return 'Needs Verify';
      default: return s;
    }
  };

  const sourceBadgeColor = (s: string) => {
    switch (s) {
      case 'measured': return 'bg-green-100 text-green-800';
      case 'appliance': return 'bg-purple-100 text-purple-800';
      case 'solved': return 'bg-blue-100 text-blue-800';
      case 'ambiguous': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Widths Solved</h2>
        <p className="text-gray-600 text-sm">
          Overall confidence: {Math.round(solved.confidence * 100)}%
          {solved.total_matches && ' — all widths add up correctly'}
        </p>
      </div>

      {/* Disambiguation prompt */}
      {needs_more_input && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-sm font-medium text-orange-900">{needs_more_input}</p>
          {disambiguation_reason && (
            <p className="text-xs text-orange-700 mt-1">{disambiguation_reason}</p>
          )}
          <p className="text-xs text-orange-700 mt-2">
            Tap the cabinet on the drawing below to enter its width.
          </p>
        </div>
      )}

      {/* Elevation drawing — SVG with improved wall cabinet alignment */}
      <ElevationSVG svg={svg} onTapCabinet={handleTapCabinet} />
      <p className="text-xs text-gray-400 text-center">Tap any cabinet to enter a measured width</p>

      {/* 3D viewer (loads only if WebGL available) */}
      {sceneData && typeof document !== 'undefined' && (() => {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (!gl) return null;
        } catch { return null; }
        return (
          <Suspense fallback={<div className="h-[400px] flex items-center justify-center bg-gray-100 rounded-xl text-sm text-gray-500">Loading 3D viewer...</div>}>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">3D Preview</h3>
              <Kitchen3D data={sceneData} onCabinetClick={handleTapCabinet} height="400px" />
            </div>
          </Suspense>
        );
      })()}

      {/* Solved Widths Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-900 text-sm">Cabinet Widths</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {solved.cabinet_widths.map((cab) => (
            <div key={cab.section_id} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 text-sm">{cab.section_id}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${sourceBadgeColor(cab.source)}`}>
                  {sourceLabel(cab.source)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg font-mono font-bold text-gray-900">{cab.width}"</span>
                <div className={`text-xs ${confidenceColor(cab.confidence)}`}>
                  {Math.round(cab.confidence * 100)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fillers */}
      {solved.fillers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900 text-sm">Filler Strips</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {solved.fillers.map((f, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">
                  {f.position.replace(/_/g, ' ')}
                </span>
                <span className="font-mono font-medium text-gray-900">{f.width.toFixed(2)}"</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={loading}
        className="w-full bg-green-600 text-white rounded-xl py-4 font-medium text-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Confirming...' : 'Confirm \u2014 Looks Right'}
      </button>

      {/* Tap-to-measure modal */}
      {tapModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-gray-900">Measure {tapModal}</h3>
            <p className="text-sm text-gray-600">Enter the tape-measured width in inches:</p>
            <input
              type="number"
              inputMode="decimal"
              value={tapValue}
              onChange={(e) => setTapValue(e.target.value)}
              placeholder="e.g. 30"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-2xl font-mono text-center focus:border-blue-500 outline-none"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setTapModal(null)}
                className="flex-1 border border-gray-300 rounded-xl py-3 font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleTapSubmit}
                disabled={!tapValue}
                className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-medium disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
