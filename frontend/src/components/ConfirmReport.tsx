import type { ConfirmResponse } from '../types';

interface ConfirmReportProps {
  data: ConfirmResponse;
  svgContent: string | null;
  onNewMeasurement: () => void;
}

export default function ConfirmReport({ data, svgContent, onNewMeasurement }: ConfirmReportProps) {
  const { report } = data;

  const handlePrint = () => window.print();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Production Report</h2>
          <p className="text-sm text-gray-600">
            {report.ready_for_production
              ? 'Ready for production'
              : 'Review warnings before production'}
          </p>
        </div>
      </div>

      {/* SVG Elevation */}
      {svgContent ? (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 p-2 print:border-none">
          <div dangerouslySetInnerHTML={{ __html: svgContent }} />
        </div>
      ) : null}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div className="text-2xl font-bold text-gray-900 font-mono">{report.total_run}"</div>
          <div className="text-xs text-gray-500">Total Run</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{report.cabinets.length}</div>
          <div className="text-xs text-gray-500">Cabinets</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{report.fillers.length}</div>
          <div className="text-xs text-gray-500">Fillers</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{Math.round(report.confidence * 100)}%</div>
          <div className="text-xs text-gray-500">Confidence</div>
        </div>
      </div>

      {/* Cabinet Widths Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-900 text-sm">Cabinet Widths</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium text-right">Width</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium text-right">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.cabinets.map((cab) => (
              <tr key={cab.section_id}>
                <td className="px-4 py-2 font-medium text-gray-900">{cab.section_id}</td>
                <td className="px-4 py-2 text-right font-mono font-bold">{cab.width}"</td>
                <td className="px-4 py-2 capitalize text-gray-600">{cab.source}</td>
                <td className="px-4 py-2 text-right">{Math.round(cab.confidence * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fillers */}
      {report.fillers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900 text-sm">Filler Strips</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Position</th>
                <th className="px-4 py-2 font-medium text-right">Width</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.fillers.map((f, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-gray-700 capitalize">{f.position.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-right font-mono">{f.width.toFixed(2)}"</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <h3 className="font-semibold text-yellow-900 text-sm mb-2">Warnings</h3>
          <ul className="space-y-1">
            {report.warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-800">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 print:hidden">
        <button
          onClick={handlePrint}
          className="flex-1 border border-gray-300 rounded-xl py-3 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Print Report
        </button>
        <button
          onClick={onNewMeasurement}
          className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-medium hover:bg-blue-700 transition-colors"
        >
          New Measurement
        </button>
      </div>
    </div>
  );
}
