import { ContactShadows, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { BoltiToliSpeaker, type SpeakerState, SoundWaves } from "./BoltiToliSpeaker";
import { PALETTE, woodTexture } from "./materials";

/**
 * Reusable 3D counting objects on a wooden tray.
 * Exactly the quantities in the question; groups merge on reveal for addition,
 * removed objects lift away for subtraction. Renders on demand (no idle loop).
 */

type ObjectKind = "apple" | "mango" | "ball" | "stick" | "laddoo" | "leaf";

function ObjectMesh({ kind }: { kind: ObjectKind }) {
  switch (kind) {
    case "apple":
      return (
        <group>
          <mesh castShadow scale={[1, 0.92, 1]}><sphereGeometry args={[0.2, 32, 24]} /><meshPhysicalMaterial color="#d23a2a" roughness={0.35} clearcoat={1} clearcoatRoughness={0.15} /></mesh>
          <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.25]}><cylinderGeometry args={[0.015, 0.015, 0.1, 6]} /><meshStandardMaterial color="#5a3b1f" /></mesh>
          <mesh position={[0.06, 0.23, 0]} rotation={[0, 0, -0.6]} scale={[1, 0.4, 0.6]}><sphereGeometry args={[0.05, 10, 8]} /><meshStandardMaterial color="#4f8a3c" /></mesh>
        </group>
      );
    case "mango":
      return <mesh castShadow scale={[1.15, 0.85, 0.85]} rotation={[0, 0, 0.4]}><sphereGeometry args={[0.2, 24, 18]} /><meshStandardMaterial color="#f0a72e" roughness={0.5} /></mesh>;
    case "laddoo":
      return <mesh castShadow><icosahedronGeometry args={[0.19, 2]} /><meshStandardMaterial color="#e8a23a" roughness={0.95} flatShading /></mesh>;
    case "leaf":
      return <mesh castShadow scale={[1.3, 0.12, 0.7]}><sphereGeometry args={[0.2, 16, 10]} /><meshStandardMaterial color="#5a9a46" roughness={0.7} /></mesh>;
    case "stick":
      return <mesh castShadow rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.03, 0.03, 0.5, 8]} /><meshStandardMaterial color="#e2bb86" roughness={0.8} /></mesh>;
    default:
      return <mesh castShadow><sphereGeometry args={[0.19, 32, 24]} /><meshPhysicalMaterial color={PALETTE.teal} roughness={0.3} clearcoat={1} clearcoatRoughness={0.2} /></mesh>;
  }
}

interface Item { key: string; apart: THREE.Vector3; merged: THREE.Vector3; removed: boolean }

function layout(groups: number[], op: "+" | "-" | null, remove: number): Item[] {
  const cols = 5;
  const sp = 0.5;
  const total = groups.reduce((a, b) => a + b, 0);
  const groupW = Math.min(cols, Math.max(...groups)) * sp;
  const gap = 0.9;
  const fullW = groups.length * groupW + (groups.length - 1) * gap;
  const items: Item[] = [];
  let idx = 0;
  groups.forEach((n, gi) => {
    for (let i = 0; i < n; i++) {
      const ax = -fullW / 2 + gi * (groupW + gap) + (i % cols) * sp + sp / 2;
      const az = Math.floor(i / cols) * sp - 0.25;
      const mergedCols = Math.min(cols, total);
      const mx = -(Math.min(cols, total) * sp) / 2 + (idx % mergedCols) * sp + sp / 2;
      const mz = Math.floor(idx / mergedCols) * sp - 0.25;
      items.push({ key: `${gi}-${i}`, apart: new THREE.Vector3(ax, 0.2, az), merged: new THREE.Vector3(mx, 0.2, mz),
        removed: op === "-" && i >= n - remove });
      idx += 1;
    }
  });
  return items;
}

function Tray({ items, kind, phase, op, animate }: { items: Item[]; kind: ObjectKind; phase: "question" | "reveal"; op: "+" | "-" | null; animate: boolean }) {
  const refs = useRef<THREE.Group[]>([]);
  const wood = useMemo(() => woodTexture("#b98551"), []);
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => invalidate(), [phase, invalidate]);
  useFrame(({ invalidate }) => {
    let moving = false;
    items.forEach((it, i) => {
      const g = refs.current[i];
      if (!g) return;
      const target = phase === "reveal" && op === "+" ? it.merged
        : phase === "reveal" && it.removed ? new THREE.Vector3(it.apart.x + 0.6, 0.9, it.apart.z - 0.6) : it.apart;
      if (!animate) g.position.copy(target);
      else {
        g.position.lerp(target, 0.12);
        if (g.position.distanceTo(target) > 0.002) moving = true;
      }
      const s = phase === "reveal" && it.removed ? 0.6 : 1;
      g.scale.setScalar(animate ? THREE.MathUtils.lerp(g.scale.x, s, 0.12) : s);
    });
    if (moving) invalidate();
  });
  return (
    <>
      <RoundedBox args={[6.2, 0.12, 2.4]} radius={0.05} position={[0, -0.06, 0.2]} receiveShadow>
        <meshStandardMaterial map={wood} roughness={0.8} />
      </RoundedBox>
      {items.map((it, i) => (
        <group key={it.key} ref={(g) => { if (g) refs.current[i] = g; }} position={it.apart.toArray()}>
          <ObjectMesh kind={kind} />
        </group>
      ))}
    </>
  );
}

/**
 * Wide canvases (the live-session stage) get a lower, closer, desk-level camera so the objects look
 * big and solid; narrow ones keep the overhead view that fits every object on a phone.
 */
function Framing() {
  const { camera, size, invalidate } = useThree();
  const wide = size.width / size.height >= 2;
  useEffect(() => {
    if (wide) camera.position.set(1, 1.7, 3);
    else camera.position.set(0, 3.4, 3.6);
    if (wide) camera.lookAt(1, 0.2, -0.3);
    else camera.lookAt(0, 0, 0.1);
    invalidate();
  }, [camera, wide, invalidate]);
  return null;
}

/**
 * Redraw every frame only while the animated speaker is actually on screen (wide canvas);
 * otherwise render on demand. On phones the speaker is hidden, and a constant loop made the
 * session screen drop to ~21 fps on a throttled low-end profile.
 */
function LoopControl({ live }: { live: boolean }) {
  const { size, setFrameloop } = useThree();
  const always = live && size.width / size.height >= 2;
  useEffect(() => setFrameloop(always ? "always" : "demand"), [always, setFrameloop]);
  return null;
}

/** BoltiToli beside the tray, only when the canvas is wide enough not to crowd the objects. */
function SpeakerSpot({ state, animate }: { state: SpeakerState; animate: boolean }) {
  const { width, height } = useThree((s) => s.size);
  if (width / height < 2) return null;
  return (
    <group position={[3.3, 0.48, -0.2]} rotation={[0, -0.55, 0]} scale={0.78}>
      <BoltiToliSpeaker state={state} animate={animate} />
      <SoundWaves active={state === "speaking"} animate={animate} flip position={[-0.95, 0.1, 0.1]} />
    </group>
  );
}

export default function CountingScene3D({ object, groups, op, remove = 0, phase, speaker }: {
  object: string; groups: number[]; op: "+" | "-" | null; remove?: number; phase: "question" | "reveal"; speaker?: SpeakerState;
}) {
  const reduce = useReducedMotion();
  const items = useMemo(() => layout(groups, op, remove), [groups, op, remove]);
  // the speaker animates continuously; without it the tray only renders when something moves
  const live = !!speaker && !reduce;
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 3.4, 3.6], fov: 38 }}
      gl={{ antialias: true, powerPreference: "low-power", alpha: true }} aria-hidden>
      <LoopControl live={live} />
      <Framing />
      <hemisphereLight args={["#fff6e8", "#8a5a33", 1]} />
      <directionalLight position={[2, 5, 3]} intensity={1.5} />
      <directionalLight position={[-3, 2, 2]} intensity={0.4} color="#bcd8ff" />
      <Tray items={items} kind={object as ObjectKind} phase={phase} op={op} animate={!reduce} />
      {speaker && <SpeakerSpot state={speaker} animate={live} />}
      <ContactShadows position={[0, 0.001, 0.2]} scale={7} blur={2} far={1.5} opacity={0.35} frames={1} />
    </Canvas>
  );
}
