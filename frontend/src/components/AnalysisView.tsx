import type { AnalyzeResponse } from '../types';

interface AnalysisViewProps {
  data: AnalyzeResponse;
  svgContent: string | null;
  onNext: () => void;
}

export default function AnalysisView({ data, svgContent, onNext }: AnalysisViewProps) {
  const { analysis, checklist } = data;
  const sections = analysis.cabinet_sections;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Analysis Complete</h2>
        <p className="text-gray-600 text-sm">{analysis.layout_description}</p>
      </div>

      {/* SVG Elevation (estimated state) */}
      {svgContent && (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 p-2">
          <div dangerouslySetInnerHTML={{ __html: svgContent }} />
        </div>
      )}

      {/* Detected Cabinets */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-900 text-sm">
            Detected {sections.length} Cabinet Sections
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          {sections.map((sec) => (
            <div key={sec.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-900 text-sm">{sec.id}</span>
                <span className="ml-2 text-xs text-gray-500 capitalize">
                  {sec.cabinet_type.replace('_', ' ')}
                </span>
                {sec.is_appliance && sec.appliance_type && (
                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                    {sec.appliance_type.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div className="text-right">
                {sec.estimated_width && (
                  <span className="text-sm text-orange-600 font-medium">
                    ~{sec.estimated_width}"
                  </span>
                )}
                <div className="text-xs text-gray-400">
                  {Math.round(sec.confidence * 100)}% conf
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What to Measure */}
      <div className="bg-blue-50 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 text-sm mb-2">What You Need to Measure</h3>
        {checklist.measurement_checklist.overall_dimensions.length > 0 && (
          <div className="mb-2">
            {checklist.measurement_checklist.overall_dimensions.map((d, i) => (
              <div key={i} className="text-sm text-blue-800 font-medium">{d}</div>
            ))}
          </div>
        )}
        <p className="text-xs text-blue-700">
          Typically just the total wall run (wall-to-wall distance). The AI solves the rest.
        </p>
      </div>

      {/* Photo Quality Notes */}
      {analysis.photo_quality_notes.length > 0 && (
        <div className="bg-yellow-50 rounded-xl p-4">
          <h3 className="font-semibold text-yellow-900 text-sm mb-1">Notes</h3>
          {analysis.photo_quality_notes.map((note, i) => (
            <p key={i} className="text-xs text-yellow-800">{note}</p>
          ))}
        </div>
      )}

      <button
        onClick={onNext}
        className="w-full bg-blue-600 text-white rounded-xl py-4 font-medium text-lg hover:bg-blue-700 transition-colors"
      >
        Enter Measurements
      </button>
    </div>
  );
}
