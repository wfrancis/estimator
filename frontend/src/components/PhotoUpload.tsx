import { useState, useRef } from 'react';

interface PhotoUploadProps {
  onUpload: (file: File, refs?: Record<string, number>) => void;
  loading: boolean;
}

export default function PhotoUpload({ onUpload, loading }: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showRefs, setShowRefs] = useState(false);
  const [fridgeWidth, setFridgeWidth] = useState('');
  const [rangeWidth, setRangeWidth] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!selectedFile) return;
    const refs: Record<string, number> = {};
    if (fridgeWidth) refs.refrigerator_width = parseFloat(fridgeWidth);
    if (rangeWidth) refs.range_width = parseFloat(rangeWidth);
    onUpload(selectedFile, Object.keys(refs).length > 0 ? refs : undefined);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Take a Kitchen Photo</h2>
      <p className="text-gray-600 text-sm mb-6">
        Stand straight-on facing the cabinet wall. Include all cabinets from wall to wall.
      </p>

      {!preview ? (
        <div className="space-y-3">
          {/* Camera button (primary on mobile) */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="w-full bg-blue-600 text-white rounded-xl py-4 px-6 font-medium text-lg flex items-center justify-center gap-3 hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Take Photo
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {/* File picker */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 px-6 text-gray-600 font-medium flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Choose from Gallery
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Photo preview */}
          <div className="relative rounded-xl overflow-hidden border border-gray-200">
            <img src={preview} alt="Kitchen" className="w-full" />
            <button
              onClick={() => {
                setPreview(null);
                setSelectedFile(null);
              }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80"
            >
              &times;
            </button>
          </div>

          {/* Optional known references */}
          <button
            onClick={() => setShowRefs(!showRefs)}
            className="text-sm text-blue-600 font-medium"
          >
            {showRefs ? 'Hide' : 'Know your appliance widths?'} (optional)
          </button>

          {showRefs && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fridge width (in)</label>
                <input
                  type="number"
                  value={fridgeWidth}
                  onChange={(e) => setFridgeWidth(e.target.value)}
                  placeholder="e.g. 36"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Range width (in)</label>
                <input
                  type="number"
                  value={rangeWidth}
                  onChange={(e) => setRangeWidth(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-xl py-4 px-6 font-medium text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75" />
                </svg>
                Analyzing...
              </span>
            ) : (
              'Analyze Photo'
            )}
          </button>
        </div>
      )}

      {/* Tips */}
      <div className="mt-6 bg-blue-50 rounded-xl p-4">
        <h3 className="font-medium text-blue-900 text-sm mb-2">Tips for best results</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>Stand 6-10 feet back, centered on the wall</li>
          <li>Hold phone level (not tilted up or down)</li>
          <li>Include the full wall from corner to corner</li>
          <li>Good lighting helps — avoid heavy shadows</li>
        </ul>
      </div>
    </div>
  );
}
