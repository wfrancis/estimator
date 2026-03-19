import { Canvas } from '@react-three/fiber';

export default function ThreeTest() {
  return (
    <div style={{ width: '100%', height: '300px', background: '#eee' }}>
      <Canvas>
        <ambientLight />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="orange" />
        </mesh>
      </Canvas>
    </div>
  );
}
