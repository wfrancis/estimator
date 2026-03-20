import { useState, useRef, useCallback } from 'react';
import type { EditorBox } from '../types';

interface Props {
  photoUrl: string;
  initialBoxes: EditorBox[];
  onSolve: (boxes: EditorBox[], totalRun: number) => void;
  loading: boolean;
}

type DragMode = 'move' | 'resize-e' | 'resize-w' | 'resize-n' | 'resize-s' | 'resize-ne' | 'resize-nw' | 'resize-se' | 'resize-sw' | null;

const BOX_COLORS: Record<string, string> = {
  base: 'rgba(59, 130, 246, 0.35)',
  wall: 'rgba(16, 185, 129, 0.35)',
  appliance_opening: 'rgba(245, 158, 11, 0.35)',
  wall_gap: 'rgba(156, 163, 175, 0.25)',
};

const BOX_BORDERS: Record<string, string> = {
  base: '#3b82f6',
  wall: '#10b981',
  appliance_opening: '#f59e0b',
  wall_gap: '#9ca3af',
};

const HANDLE_SIZE = 10;

let nextId = 100;
function genId(type: string) {
  nextId++;
  const prefix = type === 'base' ? 'B' : type === 'wall' ? 'W' : type === 'appliance_opening' ? 'A' : 'G';
  return `${prefix}${nextId}`;
}

export default function CabinetEditor({ photoUrl, initialBoxes, onSolve, loading }: Props) {
  const [boxes, setBoxes] = useState<EditorBox[]>(initialBoxes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [totalRun, setTotalRun] = useState<string>('');
  const [useFeetInches, setUseFeetInches] = useState(false);
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; box: EditorBox } | null>(null);
  const [editingBox, setEditingBox] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<EditorBox[][]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Save undo state
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-20), boxes.map(b => ({ ...b }))]);
  }, [boxes]);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setBoxes(last);
      return prev.slice(0, -1);
    });
  }, []);

  // Get image-relative coordinates from pointer event
  const getRelCoords = useCallback((e: React.PointerEvent | PointerEvent) => {
    const img = imgRef.current;
    if (!img) return { rx: 0, ry: 0 };
    const rect = img.getBoundingClientRect();
    return {
      rx: (e.clientX - rect.left) / rect.width,
      ry: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  // Determine cursor/drag mode based on position within box
  const getDragMode = useCallback((rx: number, ry: number, box: EditorBox): DragMode => {
    const img = imgRef.current;
    if (!img) return 'move';
    const rect = img.getBoundingClientRect();
    const hPx = HANDLE_SIZE / rect.width;
    const vPx = HANDLE_SIZE / rect.height;

    const nearLeft = rx - box.x < hPx;
    const nearRight = (box.x + box.w) - rx < hPx;
    const nearTop = ry - box.y < vPx;
    const nearBottom = (box.y + box.h) - ry < vPx;

    if (nearTop && nearLeft) return 'resize-nw';
    if (nearTop && nearRight) return 'resize-ne';
    if (nearBottom && nearLeft) return 'resize-sw';
    if (nearBottom && nearRight) return 'resize-se';
    if (nearLeft) return 'resize-w';
    if (nearRight) return 'resize-e';
    if (nearTop) return 'resize-n';
    if (nearBottom) return 'resize-s';
    return 'move';
  }, []);

  // Pointer down on a box
  const onBoxPointerDown = useCallback((e: React.PointerEvent, box: EditorBox) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { rx, ry } = getRelCoords(e);
    const mode = getDragMode(rx, ry, box);
    setDragMode(mode);
    setDragStart({ x: rx, y: ry, box: { ...box } });
    setSelectedId(box.id);
  }, [getRelCoords, getDragMode]);

  // Pointer move (global, during drag)
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragMode || !dragStart) return;
    e.preventDefault();
    const { rx, ry } = getRelCoords(e);
    const dx = rx - dragStart.x;
    const dy = ry - dragStart.y;
    const orig = dragStart.box;

    setBoxes(prev => prev.map(b => {
      if (b.id !== orig.id) return b;
      let { x, y, w, h } = orig;

      if (dragMode === 'move') {
        x = Math.max(0, Math.min(1 - w, x + dx));
        y = Math.max(0, Math.min(1 - h, y + dy));
      } else {
        if (dragMode.includes('e')) { w = Math.max(0.02, w + dx); }
        if (dragMode.includes('w')) { x = x + dx; w = Math.max(0.02, w - dx); }
        if (dragMode.includes('s')) { h = Math.max(0.02, h + dy); }
        if (dragMode.includes('n')) { y = y + dy; h = Math.max(0.02, h - dy); }
        x = Math.max(0, x);
        y = Math.max(0, y);
        if (x + w > 1) w = 1 - x;
        if (y + h > 1) h = 1 - y;
      }
      return { ...b, x, y, w, h };
    }));
  }, [dragMode, dragStart, getRelCoords]);

  const onPointerUp = useCallback(() => {
    if (dragMode && dragStart) pushUndo();
    setDragMode(null);
    setDragStart(null);
  }, [dragMode, dragStart, pushUndo]);

  // Click on empty area = deselect
  const onBgClick = useCallback(() => {
    setSelectedId(null);
    setEditingBox(null);
  }, []);

  // Add new box
  const addBox = useCallback((type: EditorBox['type']) => {
    pushUndo();
    const isBase = type === 'base' || type === 'appliance_opening';
    const newBox: EditorBox = {
      id: genId(type),
      type,
      x: 0.3,
      y: isBase ? 0.55 : 0.15,
      w: 0.12,
      h: isBase ? 0.35 : 0.25,
      isAppliance: type === 'appliance_opening',
      doors: type === 'wall_gap' ? 0 : 1,
      drawers: 0,
    };
    setBoxes(prev => [...prev, newBox]);
    setSelectedId(newBox.id);
    setEditingBox(newBox.id);
  }, [pushUndo]);

  // Delete selected
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushUndo();
    setBoxes(prev => prev.filter(b => b.id !== selectedId));
    setSelectedId(null);
    setEditingBox(null);
  }, [selectedId, pushUndo]);

  // Update box property
  const updateBox = useCallback((id: string, updates: Partial<EditorBox>) => {
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  // Handle solve
  const handleSolve = useCallback(() => {
    let run: number;
    if (useFeetInches) {
      run = (parseFloat(feet) || 0) * 12 + (parseFloat(inches) || 0);
    } else {
      run = parseFloat(totalRun) || 0;
    }
    if (run <= 0) return;
    onSolve(boxes, run);
  }, [boxes, totalRun, useFeetInches, feet, inches, onSolve]);

  const totalRunValue = useFeetInches
    ? (parseFloat(feet) || 0) * 12 + (parseFloat(inches) || 0)
    : parseFloat(totalRun) || 0;

  const selectedBox = boxes.find(b => b.id === selectedId);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Total Run Input */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Total Wall Run</label>
            <button
              onClick={() => setUseFeetInches(!useFeetInches)}
              className="text-xs text-blue-600 underline"
            >
              {useFeetInches ? 'Use inches' : 'Use feet + inches'}
            </button>
          </div>
          {useFeetInches ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={feet}
                onChange={e => setFeet(e.target.value)}
                placeholder="0"
                className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm"
              />
              <span className="text-sm text-gray-500">ft</span>
              <input
                type="number"
                value={inches}
                onChange={e => setInches(e.target.value)}
                placeholder="0"
                className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm"
              />
              <span className="text-sm text-gray-500">in</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={totalRun}
                onChange={e => setTotalRun(e.target.value)}
                placeholder="e.g. 122"
                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm"
              />
              <span className="text-sm text-gray-500">inches</span>
            </div>
          )}
        </div>
      </div>

      {/* Photo + Boxes Canvas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">
        <div
          ref={containerRef}
          className="relative select-none"
          style={{ touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onBgClick}
        >
          <img
            ref={imgRef}
            src={photoUrl}
            alt="Cabinet layout"
            className="w-full block"
            draggable={false}
          />

          {/* Overlay boxes */}
          {boxes.map(box => {
            const isSelected = box.id === selectedId;
            return (
              <div
                key={box.id}
                onPointerDown={e => onBoxPointerDown(e, box)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingBox(box.id);
                  setSelectedId(box.id);
                }}
                style={{
                  position: 'absolute',
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                  backgroundColor: BOX_COLORS[box.type] || BOX_COLORS.base,
                  border: `2px solid ${isSelected ? '#ef4444' : (BOX_BORDERS[box.type] || BOX_BORDERS.base)}`,
                  cursor: dragMode ? 'grabbing' : 'grab',
                  zIndex: isSelected ? 20 : 10,
                  boxSizing: 'border-box',
                }}
              >
                {/* Label */}
                <div
                  className="absolute -top-5 left-0 text-xs font-bold px-1 rounded"
                  style={{
                    backgroundColor: BOX_BORDERS[box.type] || BOX_BORDERS.base,
                    color: 'white',
                    fontSize: '10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {box.id} {box.widthInches ? `${box.widthInches}"` : ''}
                </div>

                {/* Resize handles (visible when selected) */}
                {isSelected && (
                  <>
                    {['nw', 'ne', 'sw', 'se'].map(corner => (
                      <div
                        key={corner}
                        style={{
                          position: 'absolute',
                          width: HANDLE_SIZE,
                          height: HANDLE_SIZE,
                          backgroundColor: '#ef4444',
                          border: '1px solid white',
                          borderRadius: 2,
                          ...(corner.includes('n') ? { top: -HANDLE_SIZE / 2 } : { bottom: -HANDLE_SIZE / 2 }),
                          ...(corner.includes('w') ? { left: -HANDLE_SIZE / 2 } : { right: -HANDLE_SIZE / 2 }),
                          cursor: `${corner}-resize`,
                          zIndex: 30,
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline Edit Panel (when box double-clicked) */}
      {editingBox && selectedBox && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Edit: {selectedBox.id}</h3>
            <button onClick={() => setEditingBox(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Width (in)</label>
              <input
                type="number"
                value={selectedBox.widthInches ?? ''}
                onChange={e => updateBox(selectedBox.id, { widthInches: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="auto"
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Height (in)</label>
              <input
                type="number"
                value={selectedBox.heightInches ?? ''}
                onChange={e => updateBox(selectedBox.id, { heightInches: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="auto"
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={selectedBox.type}
                onChange={e => updateBox(selectedBox.id, { type: e.target.value as EditorBox['type'] })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="base">Base</option>
                <option value="wall">Wall/Upper</option>
                <option value="appliance_opening">Appliance</option>
                <option value="wall_gap">Gap/Opening</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Doors</label>
              <input
                type="number"
                min={0}
                max={4}
                value={selectedBox.doors}
                onChange={e => updateBox(selectedBox.id, { doors: parseInt(e.target.value) || 0 })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={deleteSelected}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200 hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => addBox('base')}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100"
          >
            + Base Cabinet
          </button>
          <button
            onClick={() => addBox('wall')}
            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200 hover:bg-emerald-100"
          >
            + Upper Cabinet
          </button>
          <button
            onClick={() => addBox('appliance_opening')}
            className="px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg border border-amber-200 hover:bg-amber-100"
          >
            + Appliance
          </button>
          <div className="flex-1" />
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="px-3 py-1.5 bg-gray-50 text-gray-600 text-xs rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40"
          >
            Undo
          </button>
          {selectedId && (
            <button
              onClick={deleteSelected}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200 hover:bg-red-100"
            >
              Delete Selected
            </button>
          )}
        </div>
      </div>

      {/* Hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
        <strong>Tip:</strong> Drag boxes to position them over cabinets in the photo. Resize from edges/corners.
        Double-click a box to edit measurements. Add the total wall run (wall-to-wall) and hit Solve.
      </div>

      {/* Solve Button */}
      <button
        onClick={handleSolve}
        disabled={loading || totalRunValue <= 0 || boxes.length === 0}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Solving...
          </span>
        ) : (
          `Solve & View 3D (${boxes.length} cabinets, ${totalRunValue}" run)`
        )}
      </button>
    </div>
  );
}
