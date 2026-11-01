import { type ThreeElements, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export type Hair = "short" | "pigtails" | "bun";

/**
 * A seated child, chibi-proportioned (big head), built from primitives so nothing is downloaded.
 * Breathes, blinks, and turns to look toward `lookX` (a world-space x such as the speaker's).
 * `phase` offsets the animation so a group of children never moves in sync.
 */
export function Kid({
  skin = "#c98f5c",
  shirt = "#ffffff",
  hair = "short",
  phase = 0,
  animate = true,
  ...props
}: { skin?: string; shirt?: string; hair?: Hair; phase?: number; animate?: boolean } & ThreeElements["group"]) {
  const upper = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Mesh[]>([]);
  const hairColor = "#1d130d";

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime() + phase;
    if (upper.current) upper.current.position.y = Math.sin(t * 1.6) * 0.018;
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.5) * 0.18;
      head.current.rotation.z = Math.sin(t * 0.7) * 0.05;
    }
    const blink = (t * 1.1) % 4.3 < 0.13 ? 0.1 : 1;
    eyes.current.forEach((e) => e.scale.set(1, blink, 0.6));
  });

  return (
    <group {...props}>
      <group ref={upper}>
        {/* torso + collar */}
        <mesh position={[0, 0.3, 0]} castShadow>
          <capsuleGeometry args={[0.3, 0.32, 8, 20]} />
          <meshStandardMaterial color={shirt} roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.66, 0.06]} rotation={[0.35, 0, 0]}>
          <torusGeometry args={[0.13, 0.035, 8, 20]} />
          <meshStandardMaterial color={shirt} roughness={0.7} />
        </mesh>
        {/* arms resting forward on the desk */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.3, 0.48, 0.05]} rotation={[-1.15, 0, s * 0.35]}>
            <mesh position={[0, -0.22, 0]} castShadow>
              <capsuleGeometry args={[0.09, 0.32, 6, 12]} />
              <meshStandardMaterial color={shirt} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.47, 0]}>
              <sphereGeometry args={[0.085, 16, 12]} />
              <meshStandardMaterial color={skin} roughness={0.6} />
            </mesh>
          </group>
        ))}
        {/* neck */}
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.09, 0.1, 0.14, 12]} />
          <meshStandardMaterial color={skin} roughness={0.6} />
        </mesh>

        <group ref={head} position={[0, 1.12, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.42, 32, 24]} />
            <meshStandardMaterial color={skin} roughness={0.55} />
          </mesh>
          {/* ears */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.41, -0.02, 0]} scale={[0.5, 1, 0.8]}>
              <sphereGeometry args={[0.09, 12, 10]} />
              <meshStandardMaterial color={skin} roughness={0.6} />
            </mesh>
          ))}
          {/* hair: a cap over the top and back, plus a fringe */}
          <mesh position={[0, 0.04, -0.03]} rotation={[-0.35, 0, 0]}>
            <sphereGeometry args={[0.445, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hairColor} roughness={0.65} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.06, 0.27, 0.27]} rotation={[0.5, 0, -0.3]} scale={[1.2, 0.45, 0.7]}>
            <sphereGeometry args={[0.22, 20, 12]} />
            <meshStandardMaterial color={hairColor} roughness={0.65} />
          </mesh>
          {hair === "pigtails" &&
            [-1, 1].map((s) => (
              <group key={s} position={[s * 0.43, -0.05, -0.12]}>
                <mesh position={[s * 0.06, -0.12, 0]}>
                  <sphereGeometry args={[0.13, 16, 12]} />
                  <meshStandardMaterial color={hairColor} roughness={0.65} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <torusGeometry args={[0.06, 0.025, 8, 16]} />
                  <meshStandardMaterial color="#e2483b" roughness={0.5} />
                </mesh>
              </group>
            ))}
          {hair === "bun" && (
            <mesh position={[0, 0.42, -0.12]}>
              <sphereGeometry args={[0.15, 16, 12]} />
              <meshStandardMaterial color={hairColor} roughness={0.65} />
            </mesh>
          )}
          {/* eyes with a catch-light */}
          {[-0.14, 0.14].map((x, i) => (
            <group key={x} position={[x, 0.0, 0.385]}>
              <mesh ref={(m) => { if (m) eyes.current[i] = m; }} scale={[1, 1, 0.6]}>
                <sphereGeometry args={[0.065, 16, 12]} />
                <meshStandardMaterial color="#1a1210" roughness={0.2} />
              </mesh>
              <mesh position={[0.022, 0.025, 0.04]}>
                <sphereGeometry args={[0.018, 8, 6]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
          {/* cheeks */}
          {[-0.24, 0.24].map((x) => (
            <mesh key={x} position={[x, -0.1, 0.36]} rotation={[0, x * 1.6, 0]}>
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color="#f08a7a" transparent opacity={0.55} depthWrite={false} />
            </mesh>
          ))}
          {/* smile */}
          <mesh position={[0, -0.13, 0.395]} rotation={[0.15, 0, Math.PI + 0.5]}>
            <torusGeometry args={[0.08, 0.016, 6, 16, 2.1]} />
            <meshStandardMaterial color="#7a2b22" roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
