import { useState, useCallback } from 'react';
import type { Step, AnalyzeResponse, SolveResponse, ConfirmResponse, SceneData } from './types';
import { analyzePhoto, solveWidths, getElevationSvg, getSceneData, tapMeasure, confirmMeasurements } from './api';
import Header from './components/Header';
import StepIndicator from './components/StepIndicator';
import PhotoUpload from './components/PhotoUpload';
import AnalysisView from './components/AnalysisView';
import MeasureInput from './components/MeasureInput';
import SolvedView from './components/SolvedView';
import ConfirmReport from './components/ConfirmReport';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data from each step
  const [analyzeData, setAnalyzeData] = useState<AnalyzeResponse | null>(null);
  const [analysisSvg, setAnalysisSvg] = useState<string | null>(null);
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [solveData, setSolveData] = useState<SolveResponse | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmResponse | null>(null);
  const [confirmSvg, setConfirmSvg] = useState<string | null>(null);

  const sessionId = analyzeData?.session_id;

  const reset = useCallback(() => {
    setStep('upload');
    setAnalyzeData(null);
    setAnalysisSvg(null);
    setSceneData(null);
    setSolveData(null);
    setConfirmData(null);
    setConfirmSvg(null);
    setError(null);
    setLoading(false);
  }, []);

  // Step 1: Upload and analyze photo
  const handleUpload = useCallback(async (file: File, refs?: Record<string, number>) => {
    setLoading(true);
    setError(null);
    try {
      const data = await analyzePhoto(file, refs);
      setAnalyzeData(data);

      // Fetch initial elevation SVG
      try {
        const svg = await getElevationSvg(data.session_id);
        setAnalysisSvg(svg);
      } catch {
        // SVG may not be available before solving — that's OK
      }

      setStep('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Step 3: Solve with total run
  const handleSolve = useCallback(async (totalRun: number, additional?: Record<string, number>) => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await solveWidths(sessionId, totalRun, additional);
      setSolveData(data);

      // Fetch 3D scene data
      try {
        const scene = await getSceneData(sessionId);
        setSceneData(scene);
      } catch {
        // 3D not available — fallback to SVG
      }

      setStep('solved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Solve failed');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Tap-to-measure on solved view
  const handleTapMeasure = useCallback(async (sectionId: string, value: number) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const result = await tapMeasure(sessionId, sectionId, 'width', value);
      setSolveData((prev) =>
        prev ? { ...prev, svg: result.svg, needs_more_input: result.needs_more_input } : prev
      );
      // Refresh scene data
      try {
        const scene = await getSceneData(sessionId);
        setSceneData(scene);
      } catch { /* ignore */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tap-measure failed');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Confirm measurements
  const handleConfirm = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await confirmMeasurements(sessionId);
      setConfirmData(data);

      // Fetch final SVG + scene
      try {
        const svg = await getElevationSvg(sessionId);
        setConfirmSvg(svg);
      } catch {
        if (solveData) setConfirmSvg(solveData.svg);
      }
      try {
        const scene = await getSceneData(sessionId);
        setSceneData(scene);
      } catch { /* ignore */ }

      setStep('report');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed');
    } finally {
      setLoading(false);
    }
  }, [sessionId, solveData]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onReset={reset} />
      <StepIndicator currentStep={step} />

      {/* Error banner */}
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
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-600 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step content */}
      {step === 'upload' && (
        <PhotoUpload onUpload={handleUpload} loading={loading} />
      )}

      {step === 'analysis' && analyzeData && (
        <AnalysisView
          data={analyzeData}
          svgContent={analysisSvg}
          onNext={() => setStep('measure')}
        />
      )}

      {step === 'measure' && analyzeData && (
        <MeasureInput
          data={analyzeData}
          svgContent={analysisSvg}
          onSolve={handleSolve}
          loading={loading}
        />
      )}

      {step === 'solved' && solveData && (
        <SolvedView
          data={solveData}
          sceneData={sceneData}
          onTapMeasure={handleTapMeasure}
          onConfirm={handleConfirm}
          loading={loading}
        />
      )}

      {step === 'report' && confirmData && (
        <ConfirmReport
          data={confirmData}
          svgContent={confirmSvg}
          sceneData={sceneData}
          onNewMeasurement={reset}
        />
      )}
    </div>
  );
}
