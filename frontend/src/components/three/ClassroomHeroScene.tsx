import { ContactShadows, RoundedBox, Sparkles } from "@react-three/drei";
import { Canvas, type ThreeElements, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { usePageVisible, useReducedMotion } from "@/hooks/useReducedMotion";
import { BoltiToliSpeaker, SoundWaves } from "./BoltiToliSpeaker";
import { Kid } from "./Kid";
import { blockFaceTexture, chalkboardTexture, glowTexture, PALETTE, woodTexture } from "./materials";

/**
 * Signature hero: BoltiToli on a classroom desk, asking a toli of children "3 + 2 = ?".
 * The board behind repeats the question with chalk apples; number blocks hop while BoltiToli speaks.
 */

/** A wooden number block; while `hop` is on it jumps, `delay` seconds after its neighbour. */
function NumberBlock({ label, hop, delay = 0, ...p }: { label: string; hop: boolean; delay?: number } & ThreeElements["group"]) {
  const face = useMemo(() => blockFaceTexture(label), [label]);
  const wood = useMemo(() => woodTexture("#d39c63"), []);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = hop ? Math.max(0, Math.sin((clock.getElapsedTime() - delay) * 4)) : 0;
    ref.current.position.y = k * 0.18;
    ref.current.rotation.z = k * 0.06;
  });
  return (
    <group {...p}>
      <group ref={ref}>
        <RoundedBox args={[0.5, 0.5, 0.5]} radius={0.06} smoothness={3} castShadow position={[0, 0.25, 0]}>
          <meshStandardMaterial map={wood} roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0.25, 0.252]}>
          <planeGeometry args={[0.44, 0.44]} />
          <meshStandardMaterial map={face} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function Chalkboard(p: ThreeElements["group"]) {
  const tex = useMemo(() => chalkboardTexture("3 + 2 = ?", "आओ सीखें", [3, 2]), []);
  const wood = useMemo(() => woodTexture("#a46f41"), []);
  return (
    <group {...p}>
      <mesh castShadow>
        <boxGeometry args={[4.1, 2.6, 0.1]} />
        <meshStandardMaterial map={wood} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.055]}>
        <planeGeometry args={[3.86, 2.36]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.28} roughness={0.95} />
      </mesh>
      {/* chalk ledge */}
      <mesh position={[0, -1.34, 0.12]}>
        <boxGeometry args={[4.1, 0.08, 0.22]} />
        <meshStandardMaterial map={wood} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Potted plant: a terracotta pot with a fan of leaves. */
function Plant({ scale = 1, ...p }: { scale?: number } & ThreeElements["group"]) {
  const leaves = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2, tilt: 0.5 + (i % 3) * 0.18, h: 0.75 + (i % 4) * 0.12 })),
    [],
  );
  return (
    <group {...p} scale={scale}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.27, 0.6, 24]} />
        <meshStandardMaterial color="#c8693f" roughness={0.8} />
      </mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={[Math.cos(l.a) * 0.12, 0.6 + l.h * 0.45, Math.sin(l.a) * 0.12]} rotation={[Math.sin(l.a) * l.tilt, 0, -Math.cos(l.a) * l.tilt]} scale={[0.16, l.h, 0.06]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color={i % 2 ? "#3f8f4a" : "#57a85a"} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Books(p: ThreeElements["group"]) {
  return (
    <group {...p}>
      {[["#e2483b", 0], ["#3b8fe0", 0.13], ["#f2b631", 0.26]].map(([c, y], i) => (
        <RoundedBox key={i} args={[0.9 - i * 0.06, 0.12, 0.62]} radius={0.02} smoothness={2} position={[i * 0.03, (y as number) + 0.06, 0]} rotation={[0, i * 0.12, 0]} castShadow>
          <meshStandardMaterial color={c as string} roughness={0.7} />
        </RoundedBox>
      ))}
    </group>
  );
}

function PencilCup(p: ThreeElements["group"]) {
  return (
    <group {...p}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.15, 0.44, 20]} />
        <meshStandardMaterial color={PALETTE.teal} roughness={0.5} />
      </mesh>
      {["#f2b631", "#e2483b", "#3b8fe0"].map((c, i) => (
        <mesh key={c} position={[(i - 1) * 0.07, 0.55, (i % 2) * 0.05]} rotation={[0, 0, (i - 1) * 0.18]}>
          <cylinderGeometry args={[0.025, 0.025, 0.5, 6]} />
          <meshStandardMaterial color={c} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** `shiftX` slides the camera left so the scene sits to the right (room for text over the left side). */
function Rig({ animate, shiftX }: { animate: boolean; shiftX: number }) {
  const { camera, pointer, size } = useThree();
  // Pull back on tall (portrait) canvases so the whole desk stays in frame.
  const portrait = size.width / size.height < 0.8;
  const base = useMemo(() => new THREE.Vector3(-shiftX, 3.4, portrait ? 11.5 : 9.4), [portrait, shiftX]);
  const target = useMemo(() => new THREE.Vector3(-shiftX, 0.95, -0.6), [shiftX]);
  const next = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!animate) return;
    // Controlled, subtle parallax; never more than ~0.35 units.
    next.set(base.x + pointer.x * 0.35, base.y + pointer.y * 0.15, base.z);
    camera.position.lerp(next, 0.04);
    camera.lookAt(target);
  });
  useEffect(() => {
    camera.position.copy(base);
    camera.lookAt(target);
  }, [camera, base, target]);
  return null;
}

function Scene({ animate, shiftX }: { animate: boolean; shiftX: number }) {
  const desk = useMemo(() => woodTexture("#c99561"), []);
  const glow = useMemo(() => glowTexture(), []);
  const [speaking, setSpeaking] = useState(true);
  // BoltiToli speaks in phrases with pauses, like a real question-and-answer rhythm.
  useFrame(({ clock }) => {
    if (!animate) return;
    const on = clock.getElapsedTime() % 6 < 3.6;
    if (on !== speaking) setSpeaking(on);
  });
  const talk = animate && speaking;

  return (
    <>
      <hemisphereLight args={["#fff6e8", "#8a5a33", 1]} />
      <directionalLight position={[-4, 6, 5]} intensity={1.7} color="#fff1dc" castShadow={false} />
      <directionalLight position={[5, 3, -2]} intensity={0.5} color="#bcd8ff" />
      <pointLight position={[0.2, 1.1, 1]} intensity={1.4} distance={3.5} color={PALETTE.glow} />

      {/* classroom wall with warm window light */}
      <mesh position={[0, 2.5, -3.6]}>
        <planeGeometry args={[22, 10]} />
        <meshStandardMaterial color="#f1e3cb" roughness={1} />
      </mesh>
      <mesh position={[-5.2, 3.4, -3.55]}>
        <planeGeometry args={[6, 5]} />
        <meshBasicMaterial map={glow} color="#fff4d6" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <Chalkboard position={[0.6, 2.3, -3.45]} scale={0.92} />
      <Plant position={[-4.4, 0, -2.4]} scale={1.25} />
      <Plant position={[4.9, 0, -2.2]} scale={1.1} />

      {/* the desk: runs toward the camera so it fills the bottom of the frame */}
      <mesh position={[0, -0.12, 0.6]} receiveShadow castShadow>
        <boxGeometry args={[11, 0.24, 8]} />
        <meshStandardMaterial map={desk} roughness={0.55} />
      </mesh>

      <group position={[0.15, 0.66, -0.35]} rotation={[0, -0.12, 0]} scale={1.2}>
        <BoltiToliSpeaker state={talk ? "speaking" : "idle"} animate={animate} />
        <SoundWaves active={animate ? speaking : true} animate={animate} position={[0.95, 0.1, 0.1]} />
        <SoundWaves active={animate ? speaking : true} animate={animate} flip position={[-0.95, 0.1, 0.1]} />
      </group>
      {animate && <Sparkles count={26} scale={[3.4, 1.8, 1.6]} position={[0.15, 1.2, -0.3]} size={3.2} speed={0.35} color={PALETTE.glow} opacity={0.8} />}

      {[["3", -0.35], ["+", 0.22], ["2", 0.79], ["=", 1.36]].map(([l, x], i) => (
        <NumberBlock key={l} label={l as string} hop={talk} delay={i * 0.25} position={[x as number, 0, 1.55]} rotation={[0, -0.12 + i * 0.03, 0]} scale={0.9} />
      ))}
      <Books position={[-2.6, 0, 0.9]} rotation={[0, 0.4, 0]} />
      <PencilCup position={[2.9, 0, -0.9]} />

      {/* the toli: children around the desk, all turned toward BoltiToli */}
      <Kid hair="pigtails" shirt="#f4f1ea" skin="#c98f5c" phase={0} animate={animate} position={[-2.25, -0.35, -0.9]} rotation={[0, 0.55, 0]} />
      <Kid hair="short" shirt="#8fc5ea" skin="#b97d4f" phase={1.7} animate={animate} position={[2.35, -0.35, -1.1]} rotation={[0, -0.5, 0]} />
      <Kid hair="bun" shirt="#f4f1ea" skin="#d39b6a" phase={3.1} animate={animate} position={[3.3, -0.55, 1.0]} rotation={[0, -1.1, 0]} />

      <ContactShadows position={[0, 0.001, 0]} scale={9} blur={2.4} far={2.5} opacity={0.42} frames={1} resolution={512} color="#4a2c16" />
      <Rig animate={animate} shiftX={shiftX} />
    </>
  );
}

export default function ClassroomHeroScene({ onReady, shiftX = 0 }: { onReady?: () => void; shiftX?: number }) {
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!wrap.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);
  const animate = !reduce && visible && inView;

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={animate ? "always" : "demand"}
        camera={{ fov: 34, near: 0.1, far: 60, position: [0, 2.5, 7.4] }}
        gl={{ antialias: true, powerPreference: "low-power", alpha: true }}
        onCreated={() => onReady?.()}
        aria-hidden
      >
        <Scene animate={animate} shiftX={shiftX} />
      </Canvas>
    </div>
  );
}
