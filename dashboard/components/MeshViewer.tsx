"use client";

import { Suspense, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { Pin } from "@/lib/types";

function Mesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // give the mesh a clean clinical material regardless of baked colors
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#d9b6a3"),
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
        flatShading: false,
      });
    }
  });
  return <primitive object={scene} />;
}

function PinMarker({
  pin,
  selected,
  onSelect,
}: {
  pin: Pin;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const color = pin.flag ? "#ff5b6e" : "#38e1b0";

  useFrame(({ clock }) => {
    if (ref.current && pin.flag) {
      const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.18;
      ref.current.scale.setScalar((selected ? 1.6 : 1) * s);
    }
  });

  return (
    <group position={pin.position}>
      <mesh
        ref={ref}
        scale={selected ? 1.6 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(pin.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected || hover ? 1.2 : 0.5}
          toneMapped={false}
        />
      </mesh>
      {(hover || selected) && (
        <Html distanceFactor={6} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-ink/90 px-2 py-1 text-[10px] text-white border border-line">
            {pin.id} · TDS {pin.tds ?? "—"}
            {pin.flag ? " · ⚑" : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function MeshViewer({
  meshUrl,
  pins,
  selectedId,
  onSelect,
}: {
  meshUrl: string;
  pins: Pin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 42 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#0a0e14"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <directionalLight position={[-3, -2, -4]} intensity={0.4} />
      <Suspense
        fallback={
          <Html center>
            <div className="text-muted text-xs">loading mesh…</div>
          </Html>
        }
      >
        <group rotation={[Math.PI, 0, 0]}>
          <Mesh url={meshUrl} />
          {pins.map((p) => (
            <PinMarker
              key={p.id}
              pin={p}
              selected={p.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </group>
        <Environment preset="studio" />
      </Suspense>
      <OrbitControls enablePan makeDefault minDistance={1.2} maxDistance={8} />
    </Canvas>
  );
}

useGLTF.preload("/mesh.glb");
