import { useState } from 'react';
import type { AnalyzeResponse } from '../types';

interface MeasureInputProps {
  data: AnalyzeResponse;
  svgContent: string | null;
  onSolve: (totalRun: number, additional?: Record<string, number>) => void;
  loading: boolean;
}

export default function MeasureInput({ data, svgContent, onSolve, loading }: MeasureInputProps) {
  const [totalRun, setTotalRun] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [useFeetInches, setUseFeetInches] = useState(false);

  const getTotalInches = (): number => {
    if (useFeetInches) {
      return (parseFloat(feet) || 0) * 12 + (parseFloat(inches) || 0);
    }
    return parseFloat(totalRun) || 0;
  };

  const handleSubmit = () => {
    const total = getTotalInches();
    if (total <= 0) return;
    onSolve(total);
  };

  // Find sections that need disambiguation
  const ambiguousSections = data.analysis.cabinet_sections.filter(
    (s) => s.measurement_priority === 'required' && !s.is_appliance
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Enter Total Wall Run</h2>
        <p className="text-gray-600 text-sm">
          Measure the total distance from wall to wall (or end to end of the cabinet run).
        </p>
      </div>

      {/* SVG reference */}
      {svgContent && (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 p-2">
          <div dangerouslySetInnerHTML={{ __html: svgContent }} className="opacity-80" />
        </div>
      )}

      {/* Input mode toggle */}
      <div className="flex gap-2 text-sm">
        <button
          onClick={() => setUseFeetInches(false)}
          className={`px-3 py-1.5 rounded-lg font-medium ${
            !useFeetInches ? 'bg-blue-100 text-blue-700' : 'text-gray-500'
          }`}
        >
          Inches
        </button>
        <button
          onClick={() => setUseFeetInches(true)}
          className={`px-3 py-1.5 rounded-lg font-medium ${
            useFeetInches ? 'bg-blue-100 text-blue-700' : 'text-gray-500'
          }`}
        >
          Feet + Inches
        </button>
      </div>

      {/* Measurement input */}
      {useFeetInches ? (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Feet</label>
            <input
              type="number"
              inputMode="decimal"
              value={feet}
              onChange={(e) => setFeet(e.target.value)}
              placeholder="10"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-2xl font-mono text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              autoFocus
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Inches</label>
            <input
              type="number"
              inputMode="decimal"
              value={inches}
              onChange={(e) => setInches(e.target.value)}
              placeholder="2"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-2xl font-mono text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm text-gray-600 mb-1">Total wall run (inches)</label>
          <input
            type="number"
            inputMode="decimal"
            value={totalRun}
            onChange={(e) => setTotalRun(e.target.value)}
            placeholder="122"
            className="w-full border border-gray-300 rounded-xl px-4 py-4 text-3xl font-mono text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
            autoFocus
          />
        </div>
      )}

      {/* Display total in inches */}
      {useFeetInches && getTotalInches() > 0 && (
        <p className="text-center text-gray-500 text-sm">
          = <span className="font-mono font-medium">{getTotalInches()}"</span> total
        </p>
      )}

      {/* Disambiguation notice */}
      {ambiguousSections.length > 0 && (
        <div className="bg-yellow-50 rounded-xl p-4">
          <p className="text-sm text-yellow-800">
            The AI may ask you to measure one more cabinet if it can't determine the exact sizes.
          </p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || getTotalInches() <= 0}
        className="w-full bg-blue-600 text-white rounded-xl py-4 font-medium text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75" />
            </svg>
            Solving...
          </span>
        ) : (
          'Solve Cabinet Widths'
        )}
      </button>
    </div>
  );
}
