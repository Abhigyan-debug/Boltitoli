import { RoundedBox } from "@react-three/drei";
import { type ThreeElements, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { glowTexture, grilleTexture, labelTexture, PALETTE } from "./materials";

export type SpeakerState = "idle" | "speaking" | "listening";

/** Eye shape: a sphere squashed into a tall, shallow oval. */
const EYE: [number, number, number] = [0.8, 1.15, 0.4];

/**
 * BoltiToli's physical form: a glossy navy speaker with a glass face and two glowing eyes.
 * Eyes blink while idle, pulse while speaking, and open wide (white) while the microphone is really open.
 */
export function BoltiToliSpeaker({ state = "idle", animate = true, ...props }: { state?: SpeakerState; animate?: boolean } & ThreeElements["group"]) {
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Mesh[]>([]);
  const eyeMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const strip = useRef<THREE.MeshStandardMaterial>(null);
  const grille = useMemo(() => grilleTexture(), []);
  const glow = useMemo(() => glowTexture(), []);
  const label = useMemo(() => labelTexture("BoltiToli"), []);
  const color = state === "listening" ? "#ffffff" : PALETTE.glow;

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    const pulse = state === "speaking" ? 1.6 + Math.sin(t * 9) * 0.6 : state === "listening" ? 1.8 : 1.2;
    eyeMats.current.forEach((m) => (m.emissiveIntensity = pulse));
    if (halo.current) halo.current.opacity = 0.35 + (pulse - 1) * 0.35;
    if (strip.current) strip.current.emissiveIntensity = 1 + Math.sin(t * 2.2) * 0.4;
    // blink for 0.14 s every 3.6 s (not while listening: the eyes stay open to show the mic is on)
    const blink = state !== "listening" && t % 3.6 < 0.14 ? 0.12 : 1;
    const tall = state === "listening" ? 1.25 : 1;
    eyes.current.forEach((e) => e.scale.set(EYE[0], EYE[1] * blink * tall, EYE[2]));
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.8) * 0.03;
      body.current.rotation.z = Math.sin(t * 0.9) * 0.025;
      if (state === "speaking") body.current.scale.setScalar(1 + Math.sin(t * 18) * 0.006);
    }
  });

  return (
    <group {...props}>
      <group ref={body}>
        <RoundedBox args={[1.5, 1.05, 0.95]} radius={0.32} smoothness={6} castShadow>
          <meshStandardMaterial color="#1b2a52" roughness={0.32} metalness={0.15} />
        </RoundedBox>
        {/* glass face */}
        <RoundedBox args={[1.14, 0.6, 0.04]} radius={0.02} smoothness={3} position={[0, 0.08, 0.47]}>
          <meshStandardMaterial color="#070c1c" roughness={0.12} metalness={0.4} />
        </RoundedBox>
        {/* soft light behind the eyes */}
        <mesh position={[0, 0.1, 0.495]}>
          <planeGeometry args={[1.1, 0.6]} />
          <meshBasicMaterial ref={halo} map={glow} color={color} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        {[-0.22, 0.22].map((x, i) => (
          <mesh key={x} position={[x, 0.1, 0.5]} scale={EYE} ref={(m) => { if (m) eyes.current[i] = m; }}>
            <sphereGeometry args={[0.1, 24, 16]} />
            <meshStandardMaterial
              ref={(m) => { if (m) eyeMats.current[i] = m; }}
              color={color}
              emissive={color}
              emissiveIntensity={1.2}
              toneMapped={false}
            />
          </mesh>
        ))}
        {/* wordmark */}
        <mesh position={[0, -0.33, 0.478]}>
          <planeGeometry args={[0.5, 0.125]} />
          <meshBasicMaterial map={label} transparent depthWrite={false} />
        </mesh>
        {/* side grilles */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.752, 0, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
            <planeGeometry args={[0.6, 0.55]} />
            <meshStandardMaterial map={grille} roughness={1} />
          </mesh>
        ))}
        {/* glowing light strip around the base */}
        <RoundedBox args={[1.42, 0.05, 0.88]} radius={0.02} smoothness={2} position={[0, -0.44, 0]}>
          <meshStandardMaterial ref={strip} color={PALETTE.glow} emissive={PALETTE.glow} emissiveIntensity={1} toneMapped={false} />
        </RoundedBox>
        {/* top control ring */}
        <mesh position={[0, 0.526, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.13, 0.17, 32]} />
          <meshStandardMaterial color={PALETTE.glow} emissive={PALETTE.glow} emissiveIntensity={0.6} />
        </mesh>
      </group>
      {/* light pooled on the desk under the speaker */}
      <mesh position={[0, -0.52, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 2]} />
        <meshBasicMaterial map={glow} color={PALETTE.glow} transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Sound arcs that travel outward only while BoltiToli speaks. `flip` mirrors them for the left side. */
export function SoundWaves({ active, animate = true, flip = false, ...props }: { active: boolean; animate?: boolean; flip?: boolean } & ThreeElements["group"]) {
  const arcs = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    arcs.current.forEach((m, i) => {
      if (!m) return;
      const phase = animate ? (t * 0.55 + i / 3) % 1 : 0.25 + i * 0.25;
      const mat = m.material as THREE.MeshBasicMaterial;
      m.scale.setScalar(0.6 + phase * 1.1);
      mat.opacity = active ? Math.sin(phase * Math.PI) * 0.85 : 0;
    });
  });
  return (
    <group {...props} scale={[flip ? -1 : 1, 1, 1]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { if (m) arcs.current[i] = m; }} rotation={[0, 0, -0.65]}>
          <torusGeometry args={[0.6, 0.03, 8, 48, 1.3]} />
          <meshBasicMaterial color={PALETTE.glow} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
