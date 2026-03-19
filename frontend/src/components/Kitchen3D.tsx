import { useState, ErrorInfo, Component, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import type { SceneData } from '../types';

const SCALE = 0.05;
const toScene = (inches: number) => inches * SCALE;

const SOURCE_COLORS: Record<string, string> = {
  estimated: '#f97316',
  solved: '#3b82f6',
  verified: '#22c55e',
  appliance: '#6b7280',
  gap: '#d1d5db',
  measured: '#22c55e',
};

function getColor(source: string): string {
  return SOURCE_COLORS[source] || SOURCE_COLORS.estimated;
}

// Error boundary to prevent 3D crashes from killing the app
class ThreeErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('3D Error:', error, info); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function Cabinet({ x, width, depth, height, y, source, isAppliance, applianceType, onClick, isSelected }: {
  x: number; width: number; depth: number; height: number; y: number;
  source: string; isAppliance?: boolean; applianceType?: string | null;
  onClick?: () => void; isSelected?: boolean;
}) {
  const color = getColor(source);
  const sx = toScene(x + width / 2);
  const sy = toScene(y + height / 2);
  const sz = toScene(depth / 2);
  const w = toScene(width);
  const h = toScene(height);
  const d = toScene(depth);

  const isFridge = applianceType?.includes('refrigerator');
  const isDW = applianceType === 'dishwasher';

  const bodyColor = isFridge ? '#b0b8c4' : isDW ? '#8a8a8a' : '#f5f0eb';
  const metalness = isFridge || isDW ? 0.4 : 0.05;

  return (
    <group position={[sx, sy, sz]} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={bodyColor}
          transparent={source === 'estimated'}
          opacity={source === 'estimated' ? 0.7 : 1}
          metalness={metalness}
          roughness={isFridge || isDW ? 0.3 : 0.8}
        />
      </mesh>

      {isSelected && (
        <mesh>
          <boxGeometry args={[w + 0.02, h + 0.02, d + 0.02]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.3} />
        </mesh>
      )}

      {/* Door panel inset on front face */}
      {!isAppliance && (
        <mesh position={[0, 0, d / 2 + 0.002]}>
          <planeGeometry args={[w * 0.85, h * 0.85]} />
          <meshStandardMaterial color="#ede9e3" />
        </mesh>
      )}

      {/* Knob */}
      {!isAppliance && (
        <mesh position={[w * 0.3, 0, d / 2 + 0.01]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
        </mesh>
      )}

      {/* Fridge handle */}
      {isFridge && (
        <mesh position={[-w * 0.35, 0, d / 2 + 0.015]}>
          <boxGeometry args={[0.01, h * 0.5, 0.02]} />
          <meshStandardMaterial color="#ccc" metalness={0.8} roughness={0.2} />
        </mesh>
      )}

      {/* Width label */}
      <Html center position={[0, -h / 2 - 0.06, d / 2]} style={{ pointerEvents: 'none' }}>
        <div style={{
          color, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
          textShadow: '0 0 3px white, 0 0 3px white',
        }}>
          {width}"
        </div>
      </Html>

      {/* Appliance label */}
      {isAppliance && applianceType && (
        <Html center position={[0, 0, d / 2 + 0.05]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 6px',
            borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap', fontWeight: 600,
          }}>
            {applianceType.replace(/_/g, ' ').replace(/\d+$/, '').toUpperCase()}
          </div>
        </Html>
      )}
    </group>
  );
}

function WallCab({ x, width, depth, height, yBottom, isGap, gapType, source, onClick, isSelected }: {
  x: number; width: number; depth: number; height: number; yBottom: number;
  isGap: boolean; gapType: string | null; source: string;
  onClick?: () => void; isSelected?: boolean;
}) {
  const color = getColor(source);
  const sx = toScene(x + width / 2);
  const sy = toScene(yBottom + height / 2);
  const sz = toScene(depth / 2);
  const w = toScene(width);
  const h = toScene(height);
  const d = toScene(depth);

  if (isGap) {
    return (
      <group position={[sx, sy, sz]}>
        {gapType === 'hood' && (
          <mesh position={[0, -h * 0.15, 0]}>
            <boxGeometry args={[w * 0.7, h * 0.4, d * 0.6]} />
            <meshStandardMaterial color="#909090" metalness={0.5} roughness={0.3} />
          </mesh>
        )}
        <Html center position={[0, 0, d / 2 + 0.05]} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
            {gapType === 'hood' ? 'HOOD' : 'OPEN'}
          </div>
        </Html>
      </group>
    );
  }

  return (
    <group position={[sx, sy, sz]} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color="#f5f0eb"
          transparent={source === 'estimated'}
          opacity={source === 'estimated' ? 0.7 : 1}
          roughness={0.8}
        />
      </mesh>
      {isSelected && (
        <mesh>
          <boxGeometry args={[w + 0.02, h + 0.02, d + 0.02]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.3} />
        </mesh>
      )}
      {/* Door panel */}
      <mesh position={[0, 0, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.85, h * 0.85]} />
        <meshStandardMaterial color="#ede9e3" />
      </mesh>
      <mesh position={[w * 0.25, 0, d / 2 + 0.008]}>
        <sphereGeometry args={[0.01, 8, 8]} />
        <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
      </mesh>
      <Html center position={[0, -h / 2 - 0.04, d / 2]} style={{ pointerEvents: 'none' }}>
        <div style={{ color, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', textShadow: '0 0 3px white, 0 0 3px white' }}>
          {width}"
        </div>
      </Html>
    </group>
  );
}

function KitchenScene({ data, selectedId, onSelect }: {
  data: SceneData; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const totalWidth = data.total_run || data.base_cabinets.reduce((s, c) => s + c.width, 0);
  const wallW = toScene(totalWidth);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <directionalLight position={[-3, 4, 8]} intensity={0.3} />

      {/* Floor */}
      <mesh position={[wallW / 2, -0.005, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[wallW + 0.5, 2]} />
        <meshStandardMaterial color="#c4b898" roughness={0.9} />
      </mesh>

      {/* Back wall */}
      <mesh position={[wallW / 2, toScene(48), -0.01]}>
        <planeGeometry args={[wallW + 0.5, toScene(96)]} />
        <meshStandardMaterial color="#e8e0d4" roughness={0.95} />
      </mesh>

      {/* Backsplash */}
      <mesh position={[wallW / 2, toScene(36 + 9), toScene(1)]}>
        <planeGeometry args={[wallW + 0.01, toScene(18)]} />
        <meshStandardMaterial color="#d6cfc2" roughness={0.6} />
      </mesh>

      {/* Countertop */}
      <mesh position={[toScene(data.countertop.width / 2), toScene(34.5 + 0.75), toScene(12.75)]}>
        <boxGeometry args={[toScene(data.countertop.width) + 0.02, toScene(1.5), toScene(25.5)]} />
        <meshStandardMaterial color="#d4c5b0" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* Base cabinets */}
      {data.base_cabinets.map((c) => (
        <Cabinet key={c.id} x={c.x} width={c.width} depth={c.depth} height={c.height} y={0}
          source={c.source} isAppliance={c.is_appliance} applianceType={c.appliance_type}
          onClick={() => onSelect(c.id === selectedId ? null : c.id)}
          isSelected={c.id === selectedId}
        />
      ))}

      {/* Wall cabinets */}
      {data.wall_cabinets.map((wc) => (
        <WallCab key={wc.id} x={wc.x} width={wc.width} depth={wc.depth} height={wc.height}
          yBottom={wc.y_bottom} isGap={wc.is_gap} gapType={wc.gap_type} source={wc.source}
          onClick={() => !wc.is_gap && onSelect(wc.id === selectedId ? null : wc.id)}
          isSelected={wc.id === selectedId}
        />
      ))}

      {/* Total run label */}
      {data.total_run && (
        <Html center position={[wallW / 2, -0.08, toScene(14)]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: '#1e40af', color: '#fff', padding: '4px 12px',
            borderRadius: 6, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {data.total_run}" TOTAL RUN
          </div>
        </Html>
      )}

      <OrbitControls
        target={[wallW / 2, toScene(40), toScene(12)]}
        maxPolarAngle={Math.PI * 0.6}
        minDistance={1}
        maxDistance={12}
      />
    </>
  );
}

interface Kitchen3DProps {
  data: SceneData;
  onCabinetClick?: (sectionId: string) => void;
  height?: string;
}

export default function Kitchen3D({ data, onCabinetClick, height = '500px' }: Kitchen3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    if (id && onCabinetClick) onCabinetClick(id);
  };

  const totalWidth = data.total_run || data.base_cabinets.reduce((s, c) => s + c.width, 0);
  const camDist = toScene(totalWidth) * 1.5 + 2;

  return (
    <ThreeErrorBoundary fallback={<div className="p-4 bg-red-50 rounded-xl text-red-700 text-sm">3D viewer failed to load. Using SVG fallback.</div>}>
      <div style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', background: '#f8f6f2', position: 'relative' }}>
        <Canvas
          camera={{
            position: [toScene(totalWidth / 2), toScene(50), camDist],
            fov: 45,
            near: 0.1,
            far: 100,
          }}
        >
          <KitchenScene data={data} selectedId={selectedId} onSelect={handleSelect} />
        </Canvas>
        <div style={{
          position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 12,
          background: 'rgba(255,255,255,0.9)', padding: '6px 12px', borderRadius: 8,
          fontSize: 11, fontWeight: 500,
        }}>
          <span><span style={{ color: '#f97316' }}>●</span> Estimated</span>
          <span><span style={{ color: '#3b82f6' }}>●</span> Solved</span>
          <span><span style={{ color: '#22c55e' }}>●</span> Verified</span>
        </div>
      </div>
    </ThreeErrorBoundary>
  );
}
