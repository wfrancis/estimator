import { useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneData, SceneCabinet, SceneWallCabinet, SceneFiller } from '../types';

// --- Color helpers ---
const CABINET_WHITE = '#f5f0eb';
const CABINET_EDGE = '#d4cfc8';
const APPLIANCE_STEEL = '#8a8a8a';
const COUNTERTOP_COLOR = '#c8beb4';

function sourceAccent(source: string): string {
  switch (source) {
    case 'measured': return '#16a34a';
    case 'solved': return '#2563eb';
    case 'appliance': return '#d97706';
    default: return '#f97316';
  }
}

// --- Door panel geometry on front face ---
function DoorPanels({ width, height, depth, doors, drawers }: {
  width: number; height: number; depth: number; doors: number; drawers: number;
}) {
  const panels: JSX.Element[] = [];
  const inset = 0.3;
  const gap = 0.5;
  const drawerH = 6;
  const doorStartY = drawers > 0 ? -height / 2 + drawerH * drawers + gap : -height / 2 + inset;
  const doorEndY = height / 2 - inset;
  const doorH = doorEndY - doorStartY;
  const frontZ = depth / 2 + 0.05;

  // Door panels
  if (doors > 0 && doorH > 0) {
    const doorW = (width - inset * 2 - gap * (doors - 1)) / doors;
    for (let i = 0; i < doors; i++) {
      const x = -width / 2 + inset + doorW / 2 + i * (doorW + gap);
      const y = doorStartY + doorH / 2;
      panels.push(
        <mesh key={`door-${i}`} position={[x, y, frontZ]}>
          <planeGeometry args={[doorW - 0.3, doorH - 0.3]} />
          <meshStandardMaterial color="#e8e3dc" side={THREE.DoubleSide} />
        </mesh>
      );
      // Shaker inner rectangle
      panels.push(
        <mesh key={`shaker-${i}`} position={[x, y, frontZ + 0.05]}>
          <planeGeometry args={[doorW - 2.5, doorH - 2.5]} />
          <meshStandardMaterial color="#ede8e2" side={THREE.DoubleSide} />
        </mesh>
      );
      // Handle (bar pull)
      panels.push(
        <mesh key={`handle-${i}`} position={[x + doorW / 2 - 1.5, y, frontZ + 0.2]}>
          <boxGeometry args={[0.3, 4, 0.3]} />
          <meshStandardMaterial color="#999" metalness={0.8} roughness={0.3} />
        </mesh>
      );
    }
  }

  // Drawer panels
  for (let d = 0; d < drawers; d++) {
    const dw = width - inset * 2;
    const dh = drawerH - gap;
    const y = -height / 2 + inset + drawerH * d + dh / 2;
    panels.push(
      <mesh key={`drawer-${d}`} position={[0, y, frontZ]}>
        <planeGeometry args={[dw - 0.3, dh - 0.3]} />
        <meshStandardMaterial color="#e8e3dc" side={THREE.DoubleSide} />
      </mesh>
    );
    // Drawer handle
    panels.push(
      <mesh key={`dhandle-${d}`} position={[0, y, frontZ + 0.2]}>
        <boxGeometry args={[4, 0.3, 0.3]} />
        <meshStandardMaterial color="#999" metalness={0.8} roughness={0.3} />
      </mesh>
    );
  }

  return <>{panels}</>;
}

// --- Individual 3D Components ---

function isFridge(cab: SceneCabinet): boolean {
  const t = (cab.appliance_type || '').toLowerCase();
  return cab.is_appliance === true && (t.includes('fridge') || t.includes('refrigerator') || cab.height > 50);
}

function isRange(cab: SceneCabinet): boolean {
  const t = (cab.appliance_type || '').toLowerCase();
  return cab.is_appliance === true && (t.includes('range') || t.includes('stove') || t.includes('cooktop'));
}

function FridgeAppliance({ cab, selected, onClick }: {
  cab: SceneCabinet; selected: boolean; onClick: () => void;
}) {
  const cx = cab.x + cab.width / 2;
  const cz = cab.depth / 2;
  const bottomH = cab.height * 0.6;  // Bottom fridge section
  const topH = cab.height * 0.35;    // Top freezer section
  const gap = cab.height * 0.01;
  const handleW = 0.4;
  const handleH = 8;

  return (
    <group>
      {/* Bottom section (fridge) */}
      <mesh position={[cx, bottomH / 2, cz]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[cab.width, bottomH, cab.depth]} />
        <meshStandardMaterial color={selected ? '#fecaca' : '#b8b8b8'} metalness={0.7} roughness={0.25} />
      </mesh>
      <lineSegments position={[cx, bottomH / 2, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(cab.width, bottomH, cab.depth)]} />
        <lineBasicMaterial color="#888" />
      </lineSegments>

      {/* Top section (freezer) */}
      <mesh position={[cx, bottomH + gap + topH / 2, cz]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[cab.width, topH, cab.depth]} />
        <meshStandardMaterial color={selected ? '#fecaca' : '#a8a8a8'} metalness={0.7} roughness={0.25} />
      </mesh>
      <lineSegments position={[cx, bottomH + gap + topH / 2, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(cab.width, topH, cab.depth)]} />
        <lineBasicMaterial color="#888" />
      </lineSegments>

      {/* Fridge handle */}
      <mesh position={[cx + cab.width / 2 - 3, bottomH / 2, cz + cab.depth / 2 + 0.5]}>
        <boxGeometry args={[handleW, handleH, 0.8]} />
        <meshStandardMaterial color="#999" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Freezer handle */}
      <mesh position={[cx + cab.width / 2 - 3, bottomH + gap + topH / 2, cz + cab.depth / 2 + 0.5]}>
        <boxGeometry args={[handleW, handleH * 0.6, 0.8]} />
        <meshStandardMaterial color="#999" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Source indicator */}
      <mesh position={[cx, cab.height + 0.2, cz]}>
        <boxGeometry args={[cab.width, 0.4, 2]} />
        <meshStandardMaterial color={sourceAccent(cab.source)} />
      </mesh>

      {/* Label */}
      <Html position={[cx, -3, cab.depth + 3]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(255,255,255,0.95)', padding: '2px 6px', borderRadius: 4,
          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          border: `2px solid ${sourceAccent(cab.source)}`, color: '#333',
        }}>
          {cab.id}: {cab.width}"
        </div>
      </Html>
    </group>
  );
}

function RangeAppliance({ cab, selected, onClick }: {
  cab: SceneCabinet; selected: boolean; onClick: () => void;
}) {
  const toeKick = 4.5;
  const bodyH = cab.height - toeKick;
  const cx = cab.x + cab.width / 2;
  const cy = toeKick + bodyH / 2;
  const cz = cab.depth / 2;

  return (
    <group>
      {/* Toe kick */}
      <mesh position={[cx, toeKick / 2, cz]}>
        <boxGeometry args={[cab.width - 0.5, toeKick, cab.depth - 3]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>

      {/* Range body */}
      <mesh position={[cx, cy, cz]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[cab.width, bodyH, cab.depth]} />
        <meshStandardMaterial color={selected ? '#fecaca' : '#555'} metalness={0.5} roughness={0.3} />
      </mesh>
      <lineSegments position={[cx, cy, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(cab.width, bodyH, cab.depth)]} />
        <lineBasicMaterial color="#666" />
      </lineSegments>

      {/* Oven door front */}
      <mesh position={[cx, cy - bodyH * 0.1, cz + cab.depth / 2 + 0.05]}>
        <planeGeometry args={[cab.width - 2, bodyH * 0.6]} />
        <meshStandardMaterial color="#444" metalness={0.6} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* Oven handle */}
      <mesh position={[cx, cy + bodyH * 0.15, cz + cab.depth / 2 + 0.3]}>
        <boxGeometry args={[cab.width * 0.6, 0.4, 0.5]} />
        <meshStandardMaterial color="#999" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Cooktop burners (4 circles approximated as flat cylinders) */}
      {[[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]].map(([bx, bz], i) => (
        <mesh key={`burner-${i}`} position={[cx + bx * (cab.width * 0.4), cab.height + 0.3, cz + bz * (cab.depth * 0.3)]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 0.2, 16]} />
          <meshStandardMaterial color="#333" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}

      {/* Source indicator */}
      <mesh position={[cx, cab.height + 0.5, cz]}>
        <boxGeometry args={[cab.width, 0.4, 2]} />
        <meshStandardMaterial color={sourceAccent(cab.source)} />
      </mesh>

      {/* Label */}
      <Html position={[cx, 1, cab.depth + 3]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(255,255,255,0.95)', padding: '2px 6px', borderRadius: 4,
          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          border: `2px solid ${sourceAccent(cab.source)}`, color: '#333',
        }}>
          {cab.id}: {cab.width}"
        </div>
      </Html>
    </group>
  );
}

function BaseCabinet({ cab, selected, onClick }: {
  cab: SceneCabinet; selected: boolean; onClick: () => void;
}) {
  // Delegate to specialized appliance renderers
  if (isFridge(cab)) return <FridgeAppliance cab={cab} selected={selected} onClick={onClick} />;
  if (isRange(cab)) return <RangeAppliance cab={cab} selected={selected} onClick={onClick} />;

  const color = cab.is_appliance ? APPLIANCE_STEEL : CABINET_WHITE;
  const toeKick = 4.5;
  const bodyH = cab.height - toeKick;

  const cx = cab.x + cab.width / 2;
  const cy = toeKick + bodyH / 2;
  const cz = cab.depth / 2;

  return (
    <group>
      {/* Toe kick */}
      <mesh position={[cx, toeKick / 2, cz]}>
        <boxGeometry args={[cab.width - 0.5, toeKick, cab.depth - 3]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>

      {/* Cabinet body */}
      <mesh
        position={[cx, cy, cz]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <boxGeometry args={[cab.width, bodyH, cab.depth]} />
        <meshStandardMaterial
          color={selected ? '#fecaca' : color}
          roughness={0.6}
        />
      </mesh>

      {/* Edges */}
      <lineSegments position={[cx, cy, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(cab.width, bodyH, cab.depth)]} />
        <lineBasicMaterial color={selected ? '#ef4444' : CABINET_EDGE} />
      </lineSegments>

      {/* Door/drawer panels */}
      {!cab.is_appliance && (
        <group position={[cx, cy, cz]}>
          <DoorPanels
            width={cab.width}
            height={bodyH}
            depth={cab.depth}
            doors={cab.doors}
            drawers={cab.drawers}
          />
        </group>
      )}

      {/* Generic appliance front face */}
      {cab.is_appliance && (
        <mesh position={[cx, cy, cz + cab.depth / 2 + 0.05]}>
          <planeGeometry args={[cab.width - 1, bodyH - 1]} />
          <meshStandardMaterial color="#707070" metalness={0.6} roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Source indicator strip at top */}
      <mesh position={[cx, cab.height + 0.2, cz]}>
        <boxGeometry args={[cab.width, 0.4, 2]} />
        <meshStandardMaterial color={sourceAccent(cab.source)} />
      </mesh>

      {/* Width label below */}
      <Html position={[cx, 1, cab.depth + 3]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(255,255,255,0.95)',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          border: `2px solid ${sourceAccent(cab.source)}`,
          color: '#333',
        }}>
          {cab.id}: {cab.width}"
        </div>
      </Html>
    </group>
  );
}

function WallCabinet({ cab }: { cab: SceneWallCabinet }) {
  if (cab.is_gap) return null;

  const cx = cab.x + cab.width / 2;
  const cy = cab.y_bottom + cab.height / 2;
  const cz = cab.depth / 2;

  return (
    <group>
      <mesh position={[cx, cy, cz]}>
        <boxGeometry args={[cab.width, cab.height, cab.depth]} />
        <meshStandardMaterial color={CABINET_WHITE} roughness={0.6} />
      </mesh>
      <lineSegments position={[cx, cy, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(cab.width, cab.height, cab.depth)]} />
        <lineBasicMaterial color={CABINET_EDGE} />
      </lineSegments>

      {/* Door panels */}
      <group position={[cx, cy, cz]}>
        <DoorPanels
          width={cab.width}
          height={cab.height}
          depth={cab.depth}
          doors={cab.doors}
          drawers={0}
        />
      </group>

      {/* Source strip */}
      <mesh position={[cx, cab.y_bottom - 0.3, cz]}>
        <boxGeometry args={[cab.width, 0.4, 2]} />
        <meshStandardMaterial color={sourceAccent(cab.source)} />
      </mesh>

      {/* Label */}
      <Html position={[cx, cab.y_bottom + cab.height + 2, cz]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(255,255,255,0.9)',
          padding: '1px 5px',
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          color: '#555',
        }}>
          {cab.id}: {cab.width}"
        </div>
      </Html>
    </group>
  );
}

function Countertop({ width, depth, y }: { width: number; depth: number; y: number }) {
  const overhang = 1.5;
  const thickness = 1.5;
  return (
    <mesh position={[width / 2, y + thickness / 2, (depth + overhang) / 2]}>
      <boxGeometry args={[width + overhang, thickness, depth + overhang]} />
      <meshStandardMaterial color={COUNTERTOP_COLOR} roughness={0.3} metalness={0.05} />
    </mesh>
  );
}

function FillerStrip({ filler }: { filler: SceneFiller }) {
  return (
    <mesh position={[filler.x + filler.width / 2, 20, 12]}>
      <boxGeometry args={[filler.width, 30, 0.75]} />
      <meshStandardMaterial color="#fbbf24" transparent opacity={0.6} />
    </mesh>
  );
}

function Room({ width }: { width: number }) {
  const wallH = 96;
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, 15]} receiveShadow>
        <planeGeometry args={[width + 30, 50]} />
        <meshStandardMaterial color="#c4b5a3" roughness={0.8} />
      </mesh>
      {/* Back wall */}
      <mesh position={[width / 2, wallH / 2, -0.5]}>
        <planeGeometry args={[width + 30, wallH]} />
        <meshStandardMaterial color="#d9d0c5" side={THREE.DoubleSide} />
      </mesh>
      {/* Left wall (subtle) */}
      <mesh position={[-0.5, wallH / 2, 15]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[50, wallH]} />
        <meshStandardMaterial color="#ddd5cb" side={THREE.DoubleSide} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// --- Main ---

interface Props {
  sceneData: SceneData;
  onCabinetClick?: (cabinetId: string) => void;
  onEditLayout?: () => void;
  onExport?: () => void;
}

export default function Cabinet3D({ sceneData, onCabinetClick, onExport }: Props) {
  const [selectedCab, setSelectedCab] = useState<string | null>(null);

  const totalWidth = sceneData.total_run || sceneData.countertop.width || 120;

  const handleCabClick = useCallback((id: string) => {
    setSelectedCab(prev => prev === id ? null : id);
    onCabinetClick?.(id);
  }, [onCabinetClick]);

  const selectedInfo = sceneData.base_cabinets.find(c => c.id === selectedCab)
    || sceneData.wall_cabinets.find(c => c.id === selectedCab);

  return (
    <div className="relative w-full" style={{ height: '650px' }}>
      <Canvas shadows>
        <PerspectiveCamera
          makeDefault
          position={[totalWidth / 2, 50, totalWidth * 1.6]}
          fov={40}
          near={0.1}
          far={2000}
        />
        <OrbitControls
          target={[totalWidth / 2, 30, 10]}
          maxPolarAngle={Math.PI / 2}
          minDistance={30}
          maxDistance={500}
          enableDamping
        />

        {/* Lighting */}
        <ambientLight intensity={0.7} />
        <directionalLight position={[totalWidth * 0.8, 80, 50]} intensity={0.9} castShadow />
        <directionalLight position={[-10, 50, 30]} intensity={0.3} />
        <directionalLight position={[totalWidth / 2, 10, 60]} intensity={0.2} />

        {/* Room */}
        <Room width={totalWidth} />

        {/* Countertop */}
        {sceneData.countertop && (
          <Countertop
            width={sceneData.countertop.width}
            depth={sceneData.countertop.depth}
            y={sceneData.countertop.y}
          />
        )}

        {/* Base cabinets */}
        {sceneData.base_cabinets.map(cab => (
          <BaseCabinet
            key={cab.id}
            cab={cab}
            selected={cab.id === selectedCab}
            onClick={() => handleCabClick(cab.id)}
          />
        ))}

        {/* Wall cabinets */}
        {sceneData.wall_cabinets.map(cab => (
          <WallCabinet key={cab.id} cab={cab} />
        ))}

        {/* Fillers */}
        {sceneData.fillers.map((f, i) => (
          <FillerStrip key={i} filler={f} />
        ))}

        {/* Total run label */}
        <Html position={[totalWidth / 2, -4, 30]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            background: '#2563eb',
            color: 'white',
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            Total Run: {totalWidth}"
          </div>
        </Html>
      </Canvas>

      {/* Toolbar overlay */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 bg-white/95 rounded-xl shadow-lg border border-gray-200 px-3 py-2">
        {onExport && (
          <button
            onClick={onExport}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          >
            Export JSON
          </button>
        )}
      </div>

      {/* Selected cabinet detail */}
      {selectedCab && selectedInfo && (
        <div className="absolute top-3 right-3 bg-white/95 rounded-xl shadow-lg border border-gray-200 p-3 min-w-[160px]">
          <div className="text-xs font-bold text-gray-800 mb-1">{selectedCab}</div>
          <div className="text-xs text-gray-600 space-y-0.5">
            <p>Width: <span className="font-bold">{(selectedInfo as SceneCabinet).width}"</span></p>
            <p>Source: <span className="font-medium" style={{ color: sourceAccent((selectedInfo as SceneCabinet).source) }}>
              {(selectedInfo as SceneCabinet).source}
            </span></p>
            <p>Confidence: {Math.round((selectedInfo as SceneCabinet).confidence * 100)}%</p>
          </div>
          <button
            onClick={() => setSelectedCab(null)}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 left-3 bg-white/90 rounded-lg shadow border border-gray-200 px-3 py-2">
        <div className="text-xs font-semibold text-gray-700 mb-1">Source</div>
        <div className="flex flex-col gap-1">
          {[
            { color: '#16a34a', label: 'Measured' },
            { color: '#2563eb', label: 'AI Solved' },
            { color: '#d97706', label: 'Appliance' },
            { color: '#f97316', label: 'Estimated' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-sm" style={{ background: item.color }} />
              <span className="text-xs text-gray-600">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
