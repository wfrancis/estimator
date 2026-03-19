import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneData, SceneCabinet, SceneWallCabinet } from '../types';

// Scale: 1 inch = 0.05 three.js units (so 24" = 1.2 units)
const SCALE = 0.05;
const toScene = (inches: number) => inches * SCALE;

// Colors by source
const SOURCE_COLORS: Record<string, string> = {
  estimated: '#f97316',   // orange
  solved: '#3b82f6',      // blue
  verified: '#22c55e',    // green
  appliance: '#6b7280',   // gray
  gap: '#d1d5db',         // light gray
  measured: '#22c55e',    // green
};

function getColor(source: string, isAppliance?: boolean): string {
  if (isAppliance) return '#9ca3af';
  return SOURCE_COLORS[source] || SOURCE_COLORS.estimated;
}

// ===== INDIVIDUAL 3D COMPONENTS =====

function Cabinet({
  x, width, depth, height, y,
  doors, drawers, source, label, isAppliance, applianceType,
  onClick, isSelected,
}: {
  x: number; width: number; depth: number; height: number; y: number;
  doors: number; drawers: number; source: string; label: string;
  isAppliance?: boolean; applianceType?: string | null;
  onClick?: () => void; isSelected?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const color = getColor(source, isAppliance);
  const sx = toScene(x + width / 2);
  const sy = toScene(y + height / 2);
  const sz = toScene(depth / 2);

  const w = toScene(width);
  const h = toScene(height);
  const d = toScene(depth);

  // Determine appliance rendering
  const isFridge = applianceType?.includes('refrigerator');
  const isDW = applianceType === 'dishwasher';
  const isRange = applianceType?.includes('range');

  return (
    <group ref={ref} position={[sx, sy, sz]} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      {/* Main cabinet body */}
      <RoundedBox args={[w, h, d]} radius={0.01} smoothness={2}>
        <meshStandardMaterial
          color={isFridge ? '#b0b8c4' : isDW ? '#8a8a8a' : isRange ? '#4a4a4a' : '#f5f0eb'}
          transparent={source === 'estimated'}
          opacity={source === 'estimated' ? 0.7 : 1}
          metalness={isFridge || isDW ? 0.4 : 0.05}
          roughness={isFridge || isDW ? 0.3 : 0.8}
        />
      </RoundedBox>

      {/* Selection highlight */}
      {isSelected && (
        <mesh>
          <boxGeometry args={[w + 0.02, h + 0.02, d + 0.02]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.3} />
        </mesh>
      )}

      {/* Door panels (only for regular cabinets) */}
      {!isAppliance && doors > 0 && Array.from({ length: Math.min(doors, 3) }).map((_, i) => {
        const doorW = (w - 0.04) / Math.min(doors, 3);
        const doorX = -w / 2 + 0.02 + doorW / 2 + i * doorW;
        const doorH = drawers > 0 ? h * 0.65 : h - 0.04;
        const doorY = drawers > 0 ? -h / 2 + 0.02 + doorH / 2 : 0;
        return (
          <group key={`door-${i}`}>
            {/* Door panel */}
            <mesh position={[doorX, doorY, d / 2 + 0.002]}>
              <planeGeometry args={[doorW - 0.01, doorH - 0.01]} />
              <meshStandardMaterial color="#ede9e3" />
            </mesh>
            {/* Door knob */}
            <mesh position={[doorX + doorW * 0.3, doorY, d / 2 + 0.01]}>
              <sphereGeometry args={[0.01, 8, 8]} />
              <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        );
      })}

      {/* Drawer fronts */}
      {!isAppliance && drawers > 0 && Array.from({ length: Math.min(drawers, 3) }).map((_, i) => {
        const drawerH = (h * 0.3) / Math.min(drawers, 3);
        const drawerY = h / 2 - 0.02 - drawerH / 2 - i * drawerH;
        return (
          <group key={`drawer-${i}`}>
            <mesh position={[0, drawerY, d / 2 + 0.002]}>
              <planeGeometry args={[w - 0.04, drawerH - 0.008]} />
              <meshStandardMaterial color="#ede9e3" />
            </mesh>
            {/* Drawer handle */}
            <mesh position={[0, drawerY, d / 2 + 0.01]}>
              <boxGeometry args={[w * 0.15, 0.005, 0.005]} />
              <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        );
      })}

      {/* Fridge handle */}
      {isFridge && (
        <mesh position={[-w * 0.35, 0, d / 2 + 0.015]}>
          <boxGeometry args={[0.01, h * 0.5, 0.02]} />
          <meshStandardMaterial color="#ccc" metalness={0.8} roughness={0.2} />
        </mesh>
      )}

      {/* Appliance label */}
      {isAppliance && (
        <Html center position={[0, 0, d / 2 + 0.05]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 6px',
            borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap', fontWeight: 600,
          }}>
            {applianceType?.replace(/_/g, ' ').replace(/\d+$/, '').toUpperCase() || 'APPLIANCE'}
          </div>
        </Html>
      )}

      {/* Width dimension label below */}
      <Html center position={[0, -h / 2 - 0.06, d / 2]} style={{ pointerEvents: 'none' }}>
        <div style={{
          color: color, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
          textShadow: '0 0 3px white, 0 0 3px white',
        }}>
          {width}"
        </div>
      </Html>
    </group>
  );
}

function WallCabinet({
  x, width, depth, height, yBottom,
  doors, isGap, gapType, source, label,
  onClick, isSelected,
}: {
  x: number; width: number; depth: number; height: number; yBottom: number;
  doors: number; isGap: boolean; gapType: string | null; source: string; label: string;
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
    // Render gap as wireframe or hood shape
    return (
      <group position={[sx, sy, sz]}>
        {gapType === 'hood' && (
          <>
            {/* Range hood trapezoid shape */}
            <mesh position={[0, -h * 0.2, 0]}>
              <boxGeometry args={[w * 0.8, h * 0.3, d * 0.7]} />
              <meshStandardMaterial color="#a0a0a0" metalness={0.5} roughness={0.3} />
            </mesh>
            <mesh position={[0, h * 0.15, 0]}>
              <boxGeometry args={[w * 0.5, h * 0.15, d * 0.5]} />
              <meshStandardMaterial color="#909090" metalness={0.5} roughness={0.3} />
            </mesh>
          </>
        )}
        <Html center position={[0, 0, d / 2 + 0.05]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(0,0,0,0.4)', color: '#fff', padding: '2px 6px',
            borderRadius: 4, fontSize: 10, fontWeight: 600,
          }}>
            {gapType === 'hood' ? 'HOOD' : 'OPEN'}
          </div>
        </Html>
      </group>
    );
  }

  return (
    <group position={[sx, sy, sz]} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      <RoundedBox args={[w, h, d]} radius={0.008} smoothness={2}>
        <meshStandardMaterial
          color="#f5f0eb"
          transparent={source === 'estimated'}
          opacity={source === 'estimated' ? 0.7 : 1}
          roughness={0.8}
        />
      </RoundedBox>

      {isSelected && (
        <mesh>
          <boxGeometry args={[w + 0.02, h + 0.02, d + 0.02]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.3} />
        </mesh>
      )}

      {/* Door panels */}
      {doors > 0 && Array.from({ length: Math.min(Math.max(doors, 1), 3) }).map((_, i) => {
        const doorW = (w - 0.03) / Math.min(Math.max(doors, 1), 3);
        const doorX = -w / 2 + 0.015 + doorW / 2 + i * doorW;
        return (
          <group key={`wdoor-${i}`}>
            <mesh position={[doorX, 0, d / 2 + 0.002]}>
              <planeGeometry args={[doorW - 0.008, h - 0.03]} />
              <meshStandardMaterial color="#ede9e3" />
            </mesh>
            <mesh position={[doorX + doorW * 0.3, 0, d / 2 + 0.008]}>
              <sphereGeometry args={[0.008, 8, 8]} />
              <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        );
      })}

      <Html center position={[0, -h / 2 - 0.04, d / 2]} style={{ pointerEvents: 'none' }}>
        <div style={{
          color, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
          textShadow: '0 0 3px white, 0 0 3px white',
        }}>
          {width}"
        </div>
      </Html>
    </group>
  );
}

function Countertop({ width, depth, height, y }: { width: number; depth: number; height: number; y: number }) {
  const w = toScene(width);
  const h = toScene(height);
  const d = toScene(depth);
  return (
    <mesh position={[w / 2, toScene(y) + h / 2, d / 2]}>
      <boxGeometry args={[w + 0.02, h, d]} />
      <meshStandardMaterial color="#d4c5b0" roughness={0.4} metalness={0.05} />
    </mesh>
  );
}

function Floor({ width }: { width: number }) {
  const w = toScene(width) + 0.5;
  return (
    <mesh position={[w / 2 - 0.25, -0.005, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, 2]} />
      <meshStandardMaterial color="#c4b898" roughness={0.9} />
    </mesh>
  );
}

function BackWall({ width }: { width: number }) {
  const w = toScene(width) + 0.5;
  const h = toScene(96); // 8 feet tall
  return (
    <mesh position={[w / 2 - 0.25, h / 2, -0.01]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#e8e0d4" roughness={0.95} />
    </mesh>
  );
}

function Backsplash({ width, yBottom, height }: { width: number; yBottom: number; height: number }) {
  const w = toScene(width);
  const h = toScene(height);
  return (
    <mesh position={[w / 2, toScene(yBottom) + h / 2, toScene(1)]}>
      <planeGeometry args={[w + 0.01, h]} />
      <meshStandardMaterial color="#d6cfc2" roughness={0.6} />
    </mesh>
  );
}

function TotalRunLabel({ width }: { width: number }) {
  const w = toScene(width);
  return (
    <Html center position={[w / 2, -0.08, toScene(14)]} style={{ pointerEvents: 'none' }}>
      <div style={{
        background: '#1e40af', color: '#fff', padding: '4px 12px',
        borderRadius: 6, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {width}" TOTAL RUN
      </div>
    </Html>
  );
}

// ===== MAIN 3D SCENE =====

function KitchenScene({
  data, selectedId, onSelect,
}: {
  data: SceneData; selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const totalWidth = data.total_run || data.base_cabinets.reduce((s, c) => s + c.width, 0);
  const counterY = 34.5;
  const counterH = 1.5;
  const backsplashH = 18;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-3, 4, 8]} intensity={0.3} />

      {/* Environment */}
      <Floor width={totalWidth} />
      <BackWall width={totalWidth} />
      <Backsplash width={totalWidth} yBottom={counterY + counterH} height={backsplashH} />

      {/* Countertop */}
      <Countertop
        width={data.countertop.width}
        depth={data.countertop.depth}
        height={data.countertop.height}
        y={data.countertop.y}
      />

      {/* Base cabinets */}
      {data.base_cabinets.map((cab) => (
        <Cabinet
          key={cab.id}
          x={cab.x} width={cab.width} depth={cab.depth} height={cab.height} y={0}
          doors={cab.doors} drawers={cab.drawers}
          source={cab.source} label={cab.id}
          isAppliance={cab.is_appliance} applianceType={cab.appliance_type}
          onClick={() => onSelect(cab.id === selectedId ? null : cab.id)}
          isSelected={cab.id === selectedId}
        />
      ))}

      {/* Wall cabinets */}
      {data.wall_cabinets.map((wc) => (
        <WallCabinet
          key={wc.id}
          x={wc.x} width={wc.width} depth={wc.depth} height={wc.height}
          yBottom={wc.y_bottom}
          doors={wc.doors} isGap={wc.is_gap} gapType={wc.gap_type}
          source={wc.source} label={wc.id}
          onClick={() => !wc.is_gap && onSelect(wc.id === selectedId ? null : wc.id)}
          isSelected={wc.id === selectedId}
        />
      ))}

      {/* Fillers */}
      {data.fillers.map((f, i) => (
        <mesh
          key={`filler-${i}`}
          position={[toScene(f.x + f.width / 2), toScene(17.25), toScene(12)]}
        >
          <boxGeometry args={[toScene(f.width), toScene(34.5), toScene(24)]} />
          <meshStandardMaterial color="#c9b896" transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Total run label */}
      {data.total_run && <TotalRunLabel width={data.total_run} />}

      {/* Camera controls */}
      <OrbitControls
        target={[toScene(totalWidth / 2), toScene(40), toScene(12)]}
        maxPolarAngle={Math.PI * 0.6}
        minDistance={1}
        maxDistance={12}
      />
    </>
  );
}

// ===== EXPORTED COMPONENT =====

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

  // Calculate camera position based on total run
  const totalWidth = data.total_run || data.base_cabinets.reduce((s, c) => s + c.width, 0);
  const camDist = toScene(totalWidth) * 1.5 + 2;

  return (
    <div style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', background: '#f8f6f2' }}>
      <Canvas
        camera={{
          position: [toScene(totalWidth / 2), toScene(50), camDist],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        shadows
      >
        <KitchenScene data={data} selectedId={selectedId} onSelect={handleSelect} />
      </Canvas>

      {/* Legend */}
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
  );
}
