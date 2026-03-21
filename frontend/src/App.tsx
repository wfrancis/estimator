import { useState, useCallback } from 'react';
import type { Step, SolveResponse, SceneData } from './types';
import { analyzePhoto, solveWidths, getSceneData, exportConfig } from './api';
import Header from './components/Header';
import StepIndicator from './components/StepIndicator';
import PhotoUpload from './components/PhotoUpload';
import Cabinet3D from './components/Cabinet3D';
import AIChatPanel from './components/AIChatPanel';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [solveData, setSolveData] = useState<SolveResponse | null>(null);
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [totalRun, setTotalRun] = useState<number>(0);

  const reset = useCallback(() => {
    setStep('upload');
    setSessionId(null);
    setSolveData(null);
    setSceneData(null);
    setTotalRun(0);
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

          {/* 3D Viewer */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">
            <Cabinet3D
              sceneData={sceneData}
              onExport={handleExport}
            />
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

          {/* Actions */}
          <div className="flex gap-3 justify-center mb-8">
            <button
              onClick={handleExport}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700"
            >
              Export Config
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
