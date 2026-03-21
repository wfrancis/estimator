import { useState, useCallback } from 'react';
import type { Step, SolveResponse, SceneData } from './types';
import { analyzePhoto, solveWidths, getSceneData, exportConfig, exportDxf, getWireframeUrl } from './api';
import Header from './components/Header';
import StepIndicator from './components/StepIndicator';
import PhotoUpload from './components/PhotoUpload';
import AIChatPanel from './components/AIChatPanel';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [solveData, setSolveData] = useState<SolveResponse | null>(null);
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [totalRun, setTotalRun] = useState<number>(0);
  const [wireframeUrl, setWireframeUrl] = useState<string | null>(null);
  const [measurementUrl, setMeasurementUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'wireframe' | 'measurements'>('wireframe');
  const [verifiedWidths, setVerifiedWidths] = useState<Record<string, string>>({});
  const [verifyLoading, setVerifyLoading] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setSessionId(null);
    setSolveData(null);
    setSceneData(null);
    setTotalRun(0);
    setWireframeUrl(null);
    setMeasurementUrl(null);
    setViewMode('wireframe');
    setError(null);
    setLoading(false);
  }, []);

  // Upload photo → analyze → solve → get scene → go to 3D
  const handleUpload = useCallback(async (file: File, refs?: Record<string, number>) => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Analyze photo (pass total_run so AI can calibrate estimates)
      const run = refs?.total_run || totalRun;
      const data = await analyzePhoto(file, refs, run || undefined);
      setSessionId(data.session_id);
      // Set image URLs if available
      if (data.has_wireframe) {
        setWireframeUrl(getWireframeUrl(data.session_id));
      }
      if (data.has_measurements) {
        setMeasurementUrl(`/cabinet/${data.session_id}/measurement-diagram`);
      }

      // Step 2: Solve with the total run
      if (!run || run <= 0) {
        // If no total run yet, still go to 3D with estimates
        // We'll use the AI's estimated total as a starting point
        const estTotal = data.analysis.cabinet_sections
          .filter(s => s.cabinet_type === 'base' || s.cabinet_type === 'appliance_opening')
          .reduce((sum, s) => sum + (s.estimated_width || 24), 0);

        const solveResult = await solveWidths(data.session_id, estTotal);
        setSolveData(solveResult);
        setTotalRun(estTotal);
      } else {
        const solveResult = await solveWidths(data.session_id, run);
        setSolveData(solveResult);
        setTotalRun(run);
      }

      // Step 3: Get 3D scene data
      const scene = await getSceneData(data.session_id);
      setSceneData(scene);

      setStep('viewer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [totalRun]);

  const handleSceneUpdate = useCallback((updatedScene: SceneData) => {
    setSceneData(updatedScene);
  }, []);

  const handleExport = useCallback(async () => {
    if (!sessionId) return;
    try {
      const config = await exportConfig(sessionId);
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cabinet-layout-${sessionId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [sessionId]);

  const [dxfLoading, setDxfLoading] = useState(false);

  const handleDxfExport = useCallback(async () => {
    if (!sessionId) return;
    setDxfLoading(true);
    try {
      const blob = await exportDxf(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cabinet-dxf-${sessionId.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DXF export failed');
    } finally {
      setDxfLoading(false);
    }
  }, [sessionId]);

  // Re-solve with a new total run (called from 3D viewer)
  const handleReSolve = useCallback(async (newTotalRun: number) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const solveResult = await solveWidths(sessionId, newTotalRun);
      setSolveData(solveResult);
      setTotalRun(newTotalRun);
      const scene = await getSceneData(sessionId);
      setSceneData(scene);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-solve failed');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const handleVerifiedReSolve = useCallback(async () => {
    if (!sessionId || totalRun <= 0) return;
    // Build additional_measurements from verified widths
    const additional: Record<string, number> = {};
    for (const [sectionId, val] of Object.entries(verifiedWidths)) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        additional[sectionId] = parsed;
      }
    }
    if (Object.keys(additional).length === 0) {
      setError('Enter at least one verified measurement before re-solving');
      return;
    }
    setVerifyLoading(true);
    setError(null);
    try {
      const solveResult = await solveWidths(sessionId, totalRun, additional);
      setSolveData(solveResult);
      const scene = await getSceneData(sessionId);
      setSceneData(scene);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-solve with verified measurements failed');
    } finally {
      setVerifyLoading(false);
    }
  }, [sessionId, totalRun, verifiedWidths]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onReset={reset} />
      <StepIndicator currentStep={step} />

      {error && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div>
              <p className="text-sm text-red-800">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {step === 'upload' && (
        <div>
          {/* Total run input above the photo upload */}
          <div className="max-w-lg mx-auto px-4 pt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Total Wall Run (wall-to-wall measurement)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={totalRun || ''}
                  onChange={e => setTotalRun(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 108"
                  className="w-28 px-3 py-2 border border-blue-300 rounded-lg text-center text-sm font-medium"
                />
                <span className="text-sm text-blue-700">inches</span>
                <span className="text-xs text-blue-500 ml-2">(optional — AI will estimate if not provided)</span>
              </div>
            </div>
          </div>
          <PhotoUpload onUpload={handleUpload} loading={loading} />
        </div>
      )}

      {step === 'viewer' && sceneData && sessionId && (
        <div className="max-w-6xl mx-auto px-4 py-4">
          {/* Total run adjuster */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Total Run:</label>
              <input
                type="number"
                value={totalRun || ''}
                onChange={e => setTotalRun(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm"
              />
              <span className="text-sm text-gray-500">inches</span>
              <button
                onClick={() => handleReSolve(totalRun)}
                disabled={loading || totalRun <= 0}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Solving...' : 'Re-Solve'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {solveData && (
                <span className={`text-xs px-2 py-1 rounded-full ${
                  solveData.solved.confidence >= 0.9 ? 'bg-green-100 text-green-700' :
                  solveData.solved.confidence >= 0.7 ? 'bg-blue-100 text-blue-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {Math.round(solveData.solved.confidence * 100)}% confidence
                </span>
              )}
            </div>
          </div>

          {/* Side-by-side: AI Reference + Deterministic Wireframe */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Left: AI-generated reference image */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">🖼️ AI Reference (Gemini)</h3>
              </div>
              <div className="p-3">
                {wireframeUrl ? (
                  <img
                    src={wireframeUrl}
                    alt="AI-generated reference"
                    className="w-full rounded-lg border border-gray-100"
                  />
                ) : (
                  <div className="p-8 text-center text-gray-400 text-sm">Generating...</div>
                )}
              </div>
            </div>

            {/* Right: Deterministic wireframe from JSON */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📐 Wireframe (from data)</h3>
              </div>
              <div className="p-3">
                {sessionId ? (
                  <img
                    src={`/cabinet/${sessionId}/wireframe-svg`}
                    alt="Deterministic 2.5D wireframe"
                    className="w-full"
                  />
                ) : (
                  <div className="p-8 text-center text-gray-400 text-sm">Solving...</div>
                )}
              </div>
            </div>
          </div>

          {/* Solved results table */}
          {solveData && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Solved Cabinet Widths</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Section</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Width</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Source</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solveData.solved.cabinet_widths.map(cab => (
                      <tr key={cab.section_id} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-mono text-xs">{cab.section_id}</td>
                        <td className="py-2 px-3 font-semibold">{cab.width}"</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            cab.source === 'measured' ? 'bg-green-100 text-green-700' :
                            cab.source === 'appliance' ? 'bg-amber-100 text-amber-700' :
                            cab.source === 'solved' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {cab.source}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-600">{Math.round(cab.confidence * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {solveData.solved.fillers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">Fillers</h4>
                  {solveData.solved.fillers.map((f, i) => (
                    <p key={i} className="text-xs text-gray-600">{f.position}: {f.width.toFixed(2)}"</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Measurement Verification Panel */}
          {solveData && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Edit Measurements</h3>
              <p className="text-xs text-gray-500 mb-3">
                Enter verified tape/laser measurements to override AI estimates. Re-solve to update all widths.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Section</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">AI Width</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Verified Width</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solveData.solved.cabinet_widths.map(cab => {
                      const verified = verifiedWidths[cab.section_id];
                      const hasVerified = verified !== undefined && verified !== '' && !isNaN(parseFloat(verified)) && parseFloat(verified) > 0;
                      return (
                        <tr key={cab.section_id} className="border-b border-gray-100">
                          <td className="py-2 px-3 font-mono text-xs">{cab.section_id}</td>
                          <td className="py-2 px-3">
                            <span className="text-blue-600 font-semibold">{cab.width}"</span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                placeholder="—"
                                value={verifiedWidths[cab.section_id] ?? ''}
                                onChange={e => setVerifiedWidths(prev => ({
                                  ...prev,
                                  [cab.section_id]: e.target.value,
                                }))}
                                className={`w-20 px-2 py-1 border rounded-lg text-center text-sm font-medium ${
                                  hasVerified
                                    ? 'border-green-400 bg-green-50 text-green-800'
                                    : 'border-gray-300 bg-white text-gray-700'
                                }`}
                              />
                              <span className="text-xs text-gray-400">"</span>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            {hasVerified ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Verified
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Unverified</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {Object.values(verifiedWidths).filter(v => v && !isNaN(parseFloat(v)) && parseFloat(v) > 0).length} of{' '}
                  {solveData.solved.cabinet_widths.length} verified
                </p>
                <button
                  onClick={handleVerifiedReSolve}
                  disabled={verifyLoading || Object.values(verifiedWidths).filter(v => v && !isNaN(parseFloat(v)) && parseFloat(v) > 0).length === 0}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {verifyLoading ? 'Re-Solving...' : 'Re-Solve with Verified'}
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-center mb-8">
            <button
              onClick={handleExport}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700"
            >
              Export JSON
            </button>
            <button
              onClick={handleDxfExport}
              disabled={dxfLoading}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {dxfLoading ? 'Generating DXF...' : 'Download DXF'}
            </button>
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
            >
              New Measurement
            </button>
          </div>

          {/* AI Chat Panel */}
          <AIChatPanel
            sessionId={sessionId}
            sceneData={sceneData}
            onSceneUpdate={handleSceneUpdate}
          />
        </div>
      )}
    </div>
  );
}
