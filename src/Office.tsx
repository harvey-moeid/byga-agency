import {
  Suspense,
  useEffect,
  useRef,
  useState,
  Component,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Html,
  RoundedBox,
} from "@react-three/drei";
import * as THREE from "three";
import OfficeActors, { type Presence } from "./OfficeActors";
import { workLabels } from "./officeMotion";
import { Pause, Play, PersonStanding, Route, Gauge } from "lucide-react";
import type { OrbitControls as OrbitType } from "three-stdlib";
import { rooms as baseRooms, type Room } from "./domain";
import type { StudioAgent } from "./studio";
const positions: Record<Room, [number, number, number]> = {
  research: [-4.2, 0, -2.6],
  content: [0, 0, -2.6],
  schedule: [4.2, 0, -2.6],
  publish: [-3, 0, 2.6],
  analytics: [2.3, 0, 2.6],
};
function Box({
  p,
  s,
  color,
  rotation = 0,
}: {
  p: [number, number, number];
  s: [number, number, number];
  color: string;
  rotation?: number;
}) {
  return (
    <mesh position={p} rotation-y={rotation} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}
function Plant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position-y={0.28} castShadow>
        <cylinderGeometry args={[0.24, 0.17, 0.5, 20]} />
        <meshStandardMaterial color="#b88665" />
      </mesh>
      <mesh position-y={0.8} castShadow>
        <cylinderGeometry args={[0.035, 0.04, 0.9, 8]} />
        <meshStandardMaterial color="#70604b" />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[
            Math.sin(i * 2.4) * 0.25,
            1 + i * 0.075,
            Math.cos(i * 2.4) * 0.25,
          ]}
          rotation={[0.25, i * 2.4, 0.5]}
          castShadow
        >
          <sphereGeometry args={[0.24, 12, 8]} />
          <meshStandardMaterial color={i % 2 ? "#4d7051" : "#688e63"} />
        </mesh>
      ))}
    </group>
  );
}
function Desk({
  position,
  color = "#b7c8b3",
  angle = 0,
  seating = true,
}: {
  position: [number, number, number];
  color?: string;
  angle?: number;
  seating?: boolean;
}) {
  return (
    <group position={position} rotation-y={angle}>
      <RoundedBox
        args={[1.65, 0.13, 0.83]}
        radius={0.04}
        position-y={0.95}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#d6b489" />
      </RoundedBox>
      {[-0.65, 0.65].map((x) => (
        <Box key={x} p={[x, 0.45, 0]} s={[0.09, 0.9, 0.64]} color="#65665d" />
      ))}
      <Box p={[0, 1.31, -0.2]} s={[0.65, 0.43, 0.045]} color="#4c5350" />
      <Box p={[0, 1.31, -0.173]} s={[0.59, 0.36, 0.006]} color={color} />
      <Box p={[0, 1.05, -0.2]} s={[0.09, 0.2, 0.09]} color="#4c5350" />
      <Box p={[0, 1.04, 0.33]} s={[0.47, 0.03, 0.18]} color="#e4e4db" />
      <mesh position={[0.56, 1.07, 0.15]}>
        <cylinderGeometry args={[0.065, 0.06, 0.12, 14]} />
        <meshStandardMaterial color="#f5ede0" />
      </mesh>
      {seating && (
        <>
          {" "}
          <Box p={[0, 0.52, 0.9]} s={[0.55, 0.14, 0.5]} color="#8d9385" />
          <Box p={[0, 0.82, 1.15]} s={[0.56, 0.58, 0.13]} color="#8d9385" />
          <Box p={[0, 0.26, 0.9]} s={[0.07, 0.5, 0.07]} color="#555a55" />
        </>
      )}
    </group>
  );
}
function Board({
  position,
  schedule = false,
}: {
  position: [number, number, number];
  schedule?: boolean;
}) {
  return (
    <group position={position}>
      <Box p={[0, 1.6, 0]} s={[1.85, 1.3, 0.1]} color="#c9b18b" />
      <Box p={[0, 1.6, 0.06]} s={[1.73, 1.18, 0.015]} color="#f4f1e6" />
      {Array.from({ length: 9 }, (_, i) => (
        <Box
          key={i}
          p={[-0.55 + (i % 3) * 0.55, 1.94 - Math.floor(i / 3) * 0.34, 0.08]}
          s={[0.42, schedule ? 0.23 : 0.15, 0.015]}
          color={["#d6c3df", "#c0d4bf", "#e8cfac"][i % 3]}
        />
      ))}
      {[-0.65, 0.65].map((x) => (
        <Box key={x} p={[x, 0.65, 0]} s={[0.055, 1.3, 0.055]} color="#65665d" />
      ))}
    </group>
  );
}
function Lounge({
  position,
  color = "#a9b093",
}: {
  position: [number, number, number];
  color?: string;
}) {
  return (
    <group position={position}>
      <RoundedBox
        args={[1.8, 0.3, 0.78]}
        radius={0.12}
        position-y={0.45}
        castShadow
      >
        <meshStandardMaterial color={color} roughness={0.95} />
      </RoundedBox>
      <RoundedBox
        args={[1.8, 0.65, 0.2]}
        radius={0.1}
        position={[0, 0.82, 0.32]}
        castShadow
      >
        <meshStandardMaterial color={color} roughness={0.95} />
      </RoundedBox>
      {[-0.82, 0.82].map((x) => (
        <RoundedBox
          key={x}
          args={[0.2, 0.45, 0.8]}
          radius={0.07}
          position={[x, 0.65, 0]}
          castShadow
        >
          <meshStandardMaterial color={color} roughness={0.95} />
        </RoundedBox>
      ))}
      {[-0.6, 0.6].map((x) => (
        <Box key={x} p={[x, 0.19, 0]} s={[0.08, 0.35, 0.55]} color="#9b704d" />
      ))}
      <RoundedBox
        args={[0.38, 0.35, 0.18]}
        radius={0.05}
        position={[-0.5, 0.77, 0.13]}
        rotation-z={0.15}
      >
        <meshStandardMaterial color="#e9d5ac" />
      </RoundedBox>
    </group>
  );
}
function CoffeeTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position-y={0.5} castShadow receiveShadow>
        <cylinderGeometry args={[0.52, 0.52, 0.09, 32]} />
        <meshStandardMaterial color="#be9063" roughness={0.7} />
      </mesh>
      <mesh position-y={0.25} castShadow>
        <cylinderGeometry args={[0.09, 0.14, 0.5, 12]} />
        <meshStandardMaterial color="#77604b" />
      </mesh>
      <Box
        p={[-0.1, 0.57, 0]}
        s={[0.3, 0.035, 0.22]}
        color="#dce0c6"
        rotation={0.2}
      />
      <mesh position={[0.2, 0.61, 0.1]}>
        <cylinderGeometry args={[0.065, 0.05, 0.12, 16]} />
        <meshStandardMaterial color="#efe1c9" />
      </mesh>
    </group>
  );
}
function Bookshelf({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box p={[0, 1, 0]} s={[1.4, 2, 0.35]} color="#b38c61" />
      {[0.25, 0.8, 1.35, 1.9].map((y) => (
        <group key={y}>
          <Box p={[0, y, 0.2]} s={[1.35, 0.07, 0.5]} color="#d6b585" />
          {Array.from({ length: 5 }, (_, i) => (
            <Box
              key={i}
              p={[-0.5 + i * 0.17, y + 0.2, 0.22]}
              s={[0.1, 0.33 + (i % 2) * 0.08, 0.2]}
              color={["#b4bc9a", "#d0a984", "#c0b0bb", "#e7d8b5", "#8faaa0"][i]}
              rotation={i === 4 ? 0.1 : 0}
            />
          ))}
        </group>
      ))}
      <Plant position={[0.3, 1.93, 0]} scale={0.35} />
    </group>
  );
}
function Pendant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position-y={0.3}>
        <cylinderGeometry args={[0.015, 0.015, 0.6, 8]} />
        <meshStandardMaterial color="#7c7160" />
      </mesh>
      <mesh>
        <coneGeometry args={[0.4, 0.3, 28, 1, true]} />
        <meshStandardMaterial
          color="#c2a076"
          side={THREE.DoubleSide}
          roughness={0.75}
        />
      </mesh>
      <mesh position-y={-0.11} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.24, 24]} />
        <meshStandardMaterial
          color="#fff3cb"
          emissive="#f4dca3"
          emissiveIntensity={0.45}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
function Softbox({
  position,
  angle = 0,
}: {
  position: [number, number, number];
  angle?: number;
}) {
  return (
    <group position={position} rotation-y={angle}>
      <Box p={[0, 0.9, 0]} s={[0.035, 1.8, 0.035]} color="#5d6157" />
      {[-0.7, 0.7].map((a) => (
        <mesh key={a} position-y={0.12} rotation-z={a}>
          <cylinderGeometry args={[0.025, 0.025, 0.6, 8]} />
          <meshStandardMaterial color="#676c60" />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 0]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.4, 0.3, 0.14, 8]} />
        <meshStandardMaterial color="#4b514a" />
      </mesh>
      <mesh position={[0, 1.9, 0.081]}>
        <circleGeometry args={[0.36, 8]} />
        <meshStandardMaterial
          color="#fff7e6"
          emissive="#f8e6bf"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}
function ProductionSet({ color }: { color: string }) {
  return (
    <group position={[0.8, 0, 0.8]}>
      <RoundedBox
        args={[1.5, 2.2, 0.08]}
        radius={0.13}
        position={[0, 1.1, 0.8]}
      >
        <meshStandardMaterial color="#d8bca0" />
      </RoundedBox>
      <mesh position={[0, 0.03, 0.3]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshStandardMaterial color="#d8bca0" />
      </mesh>
      <mesh position={[0, 0.55, 0.25]} castShadow>
        <cylinderGeometry args={[0.27, 0.32, 1.1, 24]} />
        <meshStandardMaterial color="#f0dfc3" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.17, 0.25]}>
        <cylinderGeometry args={[0.09, 0.07, 0.16, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Softbox position={[-1, 0, -0.1]} angle={-0.4} />
      <Softbox position={[1, 0, 0.1]} angle={0.45} />
    </group>
  );
}
function Camera({
  selected,
  focus,
  reset,
  traveller,
}: {
  selected: Room | null;
  focus: boolean;
  reset: number;
  traveller: RefObject<THREE.Group>;
}) {
  const controls = useRef<OrbitType>(null);
  const { camera, size } = useThree();
  const moving = useRef(false);
  const manual = useRef(false);
  const goal = useRef(new THREE.Vector3());
  const eye = useRef(new THREE.Vector3());
  useEffect(() => {
    const p = selected && focus ? positions[selected] : [0, 0, 0];
    goal.current.set(p[0], selected && focus ? 0.7 : 0, p[2]);
    const scale = size.width / size.height < 1.2 ? 1.5 : 1;
    eye.current.set(
      p[0] + (selected && focus ? 3.8 : 12 * scale),
      selected && focus ? 4.5 : 13 * scale,
      p[2] + (selected && focus ? 5.2 : 14 * scale),
    );
    moving.current = true;
  }, [selected, focus, reset, size.width, size.height]);
  useEffect(() => {
    manual.current = false;
    moving.current = true;
  }, [focus, reset]);
  useFrame((_, dt) => {
    if (manual.current) return;
    if (focus && !selected && traveller.current) {
      const p = traveller.current.position;
      goal.current.set(p.x, 0.65, p.z);
      eye.current.set(p.x + 3.8, 4.6, p.z + 5.2);
      moving.current = true;
    }
    if (moving.current && controls.current) {
      camera.position.lerp(eye.current, 1 - Math.exp(-dt * 4));
      controls.current.target.lerp(goal.current, 1 - Math.exp(-dt * 4));
      controls.current.update();
      if (camera.position.distanceTo(eye.current) < 0.025)
        moving.current = false;
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={5}
      maxDistance={42}
      maxPolarAngle={Math.PI / 2.15}
      onStart={() => {
        moving.current = false;
        manual.current = true;
      }}
      enablePan
    />
  );
}
function Scene({
  selected,
  onSelect,
  onAgent,
  focus,
  reset,
  portal,
  activeRoom = "content",
  avatarUrl,
  metrics = [],
  playing,
  tour,
  onPresence,
  lightweight,
  agents,
  workingAgent,
}: {
  selected: Room | null;
  onSelect: (r: Room) => void;
  onAgent: (r: Room) => void;
  focus: boolean;
  reset: number;
  portal?: RefObject<HTMLElement>;
  activeRoom?: Room;
  avatarUrl?: string;
  metrics?: number[];
  playing: boolean;
  tour: boolean;
  onPresence: (presence: Presence) => void;
  lightweight: boolean;
  agents: StudioAgent[];
  workingAgent?: Room;
}) {
  const rooms = baseRooms.map((r) => ({
    ...r,
    color: agents.find((a) => a.id === r.id)!.color,
  }));
  const traveller = useRef<THREE.Group>(null!);
  return (
    <>
      <color attach="background" args={["#eee4d3"]} />
      <fog attach="fog" args={["#eee4d3", 30, 65]} />
      <ambientLight intensity={1.35} color="#fff1d9" />
      <directionalLight
        position={[-8, 14, 7]}
        intensity={2.7}
        color="#fff0d0"
        castShadow={!lightweight}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={["#fff4df", "#b6ac8f", 1.2]} />
      <group position-y={-0.05}>
        <RoundedBox
          args={[14, 0.35, 10.7]}
          radius={0.15}
          position-y={-0.3}
          receiveShadow
        >
          <meshStandardMaterial color="#a8835e" />
        </RoundedBox>
        <Box p={[0, -0.08, 0]} s={[13.8, 0.12, 10.5]} color="#d1ad7d" />
        {Array.from({ length: 28 }, (_, i) => (
          <Box
            key={i}
            p={[-6.7 + i * 0.5, 0.002, 0]}
            s={[0.012, 0.01, 10.4]}
            color="#ad875e"
          />
        ))}
        <Box p={[0, 1.3, -5.1]} s={[13.9, 2.6, 0.18]} color="#f0e5d1" />
        <Box p={[-6.9, 1.3, 0]} s={[0.18, 2.6, 10.3]} color="#e8d7bb" />
        {[-4.8, -1.6, 1.6, 4.8].map((x) => (
          <group key={x}>
            <Box p={[x, 1.6, -4.98]} s={[2.2, 1.7, 0.06]} color="#d1d9c2" />
            <Box p={[x, 1.6, -4.93]} s={[0.055, 1.7, 0.06]} color="#faf6e9" />
            <Box p={[x, 1.6, -4.93]} s={[2.2, 0.055, 0.06]} color="#faf6e9" />
            <Box p={[x, 0.74, -4.88]} s={[2.4, 0.08, 0.26]} color="#c3aa83" />
          </group>
        ))}
        <Box p={[-2.15, 0.42, -2.75]} s={[0.12, 0.85, 4.6]} color="#ded7c9" />
        <Box p={[2.15, 0.42, -2.75]} s={[0.12, 0.85, 4.6]} color="#ded7c9" />
        <Box p={[0, 0.011, 0]} s={[13.55, 0.018, 0.8]} color="#e5dfce" />
        {/* Openings align with the actual navigation route. */}
        {[
          [-6.85, -4.75],
          [-3.65, -0.55],
          [0.55, 3.65],
          [4.75, 6.85],
        ].map(([a, b]) => (
          <Box
            key={a}
            p={[(a + b) / 2, 0.38, -0.45]}
            s={[b - a, 0.76, 0.1]}
            color="#dcc7a7"
          />
        ))}
        {[
          [-6.85, -3.55],
          [-2.45, 1.75],
          [2.85, 6.85],
        ].map(([a, b]) => (
          <Box
            key={a}
            p={[(a + b) / 2, 0.38, 0.45]}
            s={[b - a, 0.76, 0.1]}
            color="#dcc7a7"
          />
        ))}
        {[-4.2, 0, 4.2].map((x) => (
          <mesh key={x} position={[x, 0.024, -0.45]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.1, 0.18]} />
            <meshStandardMaterial color="#acba9d" />
          </mesh>
        ))}
        {[-3, 2.3].map((x) => (
          <mesh key={x} position={[x, 0.024, 0.45]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.1, 0.18]} />
            <meshStandardMaterial color="#acba9d" />
          </mesh>
        ))}
        <Box p={[-0.65, 0.25, 3.1]} s={[0.22, 0.5, 3.7]} color="#bb9467" />
        {[1.7, 2.5, 3.3, 4.1, 4.7].map((z) => (
          <Plant key={z} position={[-0.65, 0.38, z]} scale={0.35} />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <Box
            key={i}
            p={[-6.76 + i * 0.16, 1.35, -4.97]}
            s={[0.06, 2.6, 0.1]}
            color={i % 2 ? "#b28c63" : "#bc956a"}
          />
        ))}
        <Bookshelf position={[-6.4, 0, 1.9]} />
        <Pendant position={[-4.2, 2.8, -2.6]} />
        <Pendant position={[0, 2.9, -2.6]} />
        <Pendant position={[3.1, 2.8, 2.9]} />
        {rooms.map((r) => (
          <group key={r.id} position={positions[r.id]}>
            <mesh
              position={[0, 0.024, 0]}
              rotation-x={-Math.PI / 2}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(r.id);
              }}
              onPointerOver={() => {
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "auto";
              }}
              receiveShadow
            >
              <planeGeometry
                args={[
                  r.id === "analytics" || r.id === "publish" ? 5 : 3.7,
                  4.4,
                ]}
              />
              <meshStandardMaterial
                color={
                  selected === r.id
                    ? r.color
                    : r.id === "content"
                      ? "#d3c7cf"
                      : r.id === "research"
                        ? "#d4ccb4"
                        : r.id === "schedule"
                          ? "#bfcec2"
                          : r.id === "publish"
                            ? "#d9c4b1"
                            : "#c4cdd0"
                }
                roughness={1}
              />
            </mesh>
            <Html
              portal={portal}
              position={[0, 0.06, 1.85]}
              center
              occlude={false}
              zIndexRange={[10, 0]}
            >
              <button
                className={`room-label ${selected === r.id ? "chosen" : ""}`}
                onClick={() => onSelect(r.id)}
              >
                <span style={{ background: r.color }} />
                {r.name.replace("Ruang ", "")}
                <small>↗</small>
              </button>
            </Html>
            {r.id === "research" ? (
              <>
                <Desk
                  position={[-0.35, 0, -0.55]}
                  color="#a5b697"
                  seating={false}
                />
                <Board position={[0, 0, -1.65]} />
                <Plant position={[-1.45, 0, -1.6]} />
                <Lounge position={[-0.35, 0, 1.02]} color="#b6b89b" />
                <CoffeeTable position={[-1.15, 0, 0.85]} />
              </>
            ) : r.id === "content" ? (
              <>
                <Desk position={[0, 0, -0.6]} color="#c7b8d7" />
                <Plant position={[1.4, 0, -1.65]} scale={0.9} />
                <Plant position={[-1.5, 0, 1.2]} scale={0.6} />
                <mesh position={[1.3, 1.2, 0.5]}>
                  <torusGeometry args={[0.25, 0.025, 8, 32]} />
                  <meshStandardMaterial color="#a48359" />
                </mesh>
                <Box
                  p={[1.3, 0.59, 0.5]}
                  s={[0.035, 0.75, 0.035]}
                  color="#a48359"
                />
                <Box
                  p={[-1.35, 0.65, -1.4]}
                  s={[0.55, 1.3, 0.5]}
                  color="#b59c7a"
                />
                {[0.25, 0.7, 1.15].map((y) => (
                  <Box
                    key={y}
                    p={[-1.35, y, -1.1]}
                    s={[0.46, 0.08, 0.12]}
                    color="#e3d8be"
                  />
                ))}
              </>
            ) : r.id === "schedule" ? (
              <>
                <Board position={[0, 0, -1.4]} schedule />
                <Desk position={[0, 0, 0.1]} color={r.color} seating={false} />
                {[-0.7, 0, 0.7].map((x, i) => (
                  <group key={x} position={[x, 0.7, -1.31]}>
                    <Box p={[0, 1, 0]} s={[0.56, 0.7, 0.05]} color="#c5a57d" />
                    <Box
                      p={[0, 1, 0.035]}
                      s={[0.47, 0.61, 0.02]}
                      color={["#cfb7ad", "#a8bdac", "#c9c9a5"][i]}
                    />
                  </group>
                ))}
                <Plant position={[1.5, 0, -1.5]} />
              </>
            ) : r.id === "publish" ? (
              <>
                <Desk position={[-0.6, 0, -0.35]} color="#d5b195" />
                <ProductionSet color={r.color} />
                <Plant position={[-2.1, 0, -1.7]} />
              </>
            ) : (
              <>
                <Desk
                  position={[-0.9, 0, -0.55]}
                  color="#b0c9d3"
                  seating={false}
                />
                <Lounge position={[1.1, 0, 1.1]} color="#b6b9a5" />
                <CoffeeTable position={[1.1, 0, 0.1]} />
                <Box p={[0, 1.7, -1.5]} s={[2.35, 1.1, 0.08]} color="#4c5852" />
                {(metrics.length
                  ? metrics.map((v) =>
                      Math.max(0.08, v / Math.max(1, ...metrics)),
                    )
                  : [0.08, 0.08, 0.08, 0.08]
                ).map((h, i) => (
                  <Box
                    key={i}
                    p={[-0.85 + i * 0.34, 1.28 + h * 0.35, -1.44]}
                    s={[0.19, h * 0.65, 0.02]}
                    color={i % 2 ? "#b2cfba" : "#d5c8a0"}
                  />
                ))}
                <Plant position={[2.2, 0, -1.65]} scale={0.8} />
              </>
            )}
          </group>
        ))}
        <Plant position={[-6.2, 0, -4.25]} scale={1.1} />
        <Plant position={[6.2, 0, -4.25]} scale={1.1} />
      </group>
      <OfficeActors
        selected={selected}
        agents={agents}
        workingAgent={workingAgent}
        activeRoom={activeRoom}
        avatarUrl={avatarUrl}
        playing={playing}
        tour={tour}
        portal={portal}
        traveller={traveller}
        onAgent={onAgent}
        onPresence={onPresence}
      />
      {!lightweight && (
        <ContactShadows
          position={[0, -0.49, 0]}
          opacity={0.28}
          scale={24}
          blur={2.8}
          frames={1}
          far={5}
        />
      )}
      <Camera
        selected={selected}
        focus={focus}
        reset={reset}
        traveller={traveller}
      />
    </>
  );
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
type OfficeProps = Omit<
  Parameters<typeof Scene>[0],
  "playing" | "tour" | "onPresence" | "lightweight"
> & { demo?: boolean; visible?: boolean };
export default function Office(props: OfficeProps) {
  const rooms = baseRooms.map((r) => {
    const agent = props.agents.find((a) => a.id === r.id)!;
    return { ...r, agent: agent.name, color: agent.color };
  });
  const [lightweight, setLightweight] = useState(() => window.innerWidth < 700);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [tour, setTour] = useState(false);
  const [presence, setPresence] = useState<Presence>({
    state: "Type",
    room: "content",
    destination: "content",
    model: "loading",
  });
  const current = rooms.find((r) => r.id === presence.destination)!;
  const portal = useRef<HTMLDivElement>(null!);
  const [webgl] = useState(() => {
    try {
      const canvas = document.createElement("canvas");
      return !!canvas.getContext("webgl2");
    } catch {
      return false;
    }
  });
  const fallback = (
    <div className="office-fallback">
      <p>Denah kantor · mode ringan</p>
      <div>
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => props.onAgent(r.id)}
            style={{ background: r.color }}
          >
            <strong>{r.agent}</strong>
            <span>{r.name}</span>
          </button>
        ))}
      </div>
      <small>Kontrol pipeline tetap tersedia tanpa WebGL.</small>
    </div>
  );
  return (
    <Boundary fallback={fallback}>
      {webgl ? (
        <div
          ref={portal}
          data-office-quality={lightweight ? "light" : "full"}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <Canvas
            shadows={!lightweight}
            frameloop={props.visible === false ? "never" : "always"}
            dpr={
              lightweight
                ? 0.75
                : [
                    1,
                    Math.min(
                      window.devicePixelRatio,
                      window.innerWidth < 700 ? 1.25 : 1.7,
                    ),
                  ]
            }
            camera={{ position: [12, 13, 14], fov: 38 }}
            gl={{ antialias: true, powerPreference: "low-power" }}
            onCreated={({ gl }) => {
              const context = gl.getContext();
              const debug = context.getExtension("WEBGL_debug_renderer_info");
              const renderer = debug
                ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
                : "";
              if (/swiftshader|llvmpipe|software/i.test(renderer))
                setLightweight(true);
            }}
          >
            <Suspense fallback={null}>
              <Scene
                {...props}
                portal={portal}
                playing={playing && props.visible !== false}
                tour={tour && playing}
                onPresence={setPresence}
                lightweight={lightweight}
              />
            </Suspense>
          </Canvas>
          <div
            className="avatar-presence"
            data-testid="avatar-presence"
            data-room={presence.room}
            data-destination={presence.destination}
            data-animation={presence.state}
          >
            <span className="presence-icon">
              <PersonStanding size={19} />
            </span>
            <div>
              <strong>
                {props.agents.find((a) => a.id === "content")!.name}{" "}
                <span>{!playing ? "Dijeda" : workLabels[presence.state]}</span>
              </strong>
              <small>
                {presence.model === "loading"
                  ? "Menyiapkan avatar…"
                  : presence.model === "fallback"
                    ? "Model tidak tersedia · mode ringan"
                    : presence.state === "Walk"
                      ? `Menuju ${current.name}`
                      : current.name}
                {props.demo ? " · simulasi" : ""}
              </small>
            </div>
          </div>
          <div className="avatar-playback">
            <button
              aria-label={
                lightweight ? "Gunakan kualitas 3D penuh" : "Gunakan 3D ringan"
              }
              aria-pressed={lightweight}
              className={lightweight ? "on" : ""}
              onClick={() => setLightweight((value) => !value)}
            >
              <Gauge size={14} />
              <span>3D ringan</span>
            </button>
            <button
              aria-label={playing ? "Jeda animasi" : "Aktifkan animasi"}
              aria-pressed={!playing}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              className={tour ? "on" : ""}
              aria-label={tour ? "Jeda tur kantor" : "Putar tur kantor"}
              aria-pressed={tour}
              onClick={() => {
                setTour((v) => !v);
                if (!playing) setPlaying(true);
              }}
            >
              <Route size={14} />
              <span>Tur kantor</span>
            </button>
          </div>
        </div>
      ) : (
        fallback
      )}
    </Boundary>
  );
}
