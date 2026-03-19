import type { Step } from '../types';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Photo' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'measure', label: 'Measure' },
  { key: 'solved', label: 'Solved' },
  { key: 'report', label: 'Report' },
];

interface StepIndicatorProps {
  currentStep: Step;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 py-3 px-4 bg-white border-b border-gray-100">
      {STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && (
              <div
                className={`w-4 sm:w-8 h-0.5 ${
                  isDone ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              />
            )}
            <div className="flex items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isDone
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isDone ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs hidden sm:inline ${
                  isActive ? 'font-semibold text-blue-600' : isDone ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
