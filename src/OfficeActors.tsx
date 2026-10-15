import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import OfficeAvatar, { type ModelStatus } from "./OfficeAvatar";
import { rooms, type Room } from "./domain";
import type { StudioAgent } from "./studio";
import {
  approachAngle,
  advanceWalk,
  jobAnimations,
  planRoute,
  stations,
  tourRooms,
  visitingStations,
  workLabels,
  type WorkAnimation,
  type Point,
} from "./officeMotion";
export interface Presence {
  state: WorkAnimation;
  room: Room;
  destination: Room;
  model: ModelStatus;
}
const assets: Record<Room, string> = {
  research: "aria",
  content: "nova",
  schedule: "kai",
  publish: "leo",
  analytics: "iris",
};
function Halo({ color, active }: { color: string; active: boolean }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.018}>
      <ringGeometry args={[0.24, active ? 0.32 : 0.275, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={active ? 0.6 : 0.25}
        depthWrite={false}
      />
    </mesh>
  );
}
function Beacon({
  name,
  state,
  status,
  onClick,
  portal,
  active,
  busy = false,
}: {
  name: string;
  state: WorkAnimation;
  status: ModelStatus;
  onClick: () => void;
  portal?: RefObject<HTMLElement>;
  active: boolean;
  busy?: boolean;
}) {
  return (
    <Html portal={portal} position={[0, 1.92, 0]} center zIndexRange={[14, 0]}>
      <button
        className={`agent-beacon ${active ? "active" : ""}`}
        aria-label={`Avatar ${name} · ${workLabels[state]}`}
        data-avatar={name}
        data-model={status}
        data-animation={state}
        onClick={onClick}
      >
        <i className={state === "Walk" ? "walking" : ""} />
        <span>{name}</span>
        <small>
          {busy
            ? "Menyusun hasil…"
            : status === "loading"
              ? "Memuat…"
              : workLabels[state]}
        </small>
      </button>
    </Html>
  );
}
function Resident({
  room,
  playing,
  selected,
  onAgent,
  portal,
  agent,
  busy,
}: {
  room: Room;
  agent: StudioAgent;
  busy?: boolean;
  playing: boolean;
  selected: Room | null;
  onAgent: (room: Room) => void;
  portal?: RefObject<HTMLElement>;
}) {
  const [status, setStatus] = useState<ModelStatus>("loading");
  const p = stations[room];
  const profile = rooms.find((r) => r.id === room)!;
  const work = jobAnimations[room];
  const yaw = work === "Type" ? Math.PI : room === "analytics" ? 0.5 : 0.18;
  return (
    <group
      name={`agent-${profile.agent.toLowerCase()}`}
      position={[p[0], -0.035, p[1]]}
    >
      <group
        rotation-y={yaw}
        onClick={(e) => {
          e.stopPropagation();
          onAgent(room);
        }}
      >
        <OfficeAvatar
          url={`/avatars/${assets[room]}.glb`}
          state={work}
          playing={playing}
          phase={tourRooms.indexOf(room) * 0.43}
          onStatus={setStatus}
        />
      </group>
      <Halo color={agent.color} active={selected === room} />
      <Beacon
        name={agent.name}
        busy={busy}
        state={work}
        status={status}
        active={selected === room}
        portal={portal}
        onClick={() => onAgent(room)}
      />
    </group>
  );
}
export default function OfficeActors({
  selected,
  activeRoom,
  avatarUrl,
  playing,
  tour,
  onAgent,
  portal,
  traveller,
  onPresence,
  agents,
  workingAgent,
}: {
  selected: Room | null;
  agents: StudioAgent[];
  workingAgent?: Room;
  activeRoom: Room;
  avatarUrl?: string;
  playing: boolean;
  tour: boolean;
  onAgent: (room: Room) => void;
  portal?: RefObject<HTMLElement>;
  traveller: RefObject<THREE.Group>;
  onPresence: (presence: Presence) => void;
}) {
  const [destination, setDestination] = useState<Room>(selected || activeRoom);
  const [arrived, setArrived] = useState<Room>("content");
  const [moving, setMoving] = useState(false);
  const [model, setModel] = useState<ModelStatus>("loading");
  const [route, setRoute] = useState<THREE.Vector3[]>([]);
  const waypoints = useRef<Point[]>([]);
  const speed = useRef(0);
  const resting = useRef(0);
  const reached = useRef<Room>("content");
  const state: WorkAnimation = moving
    ? "Walk"
    : destination === "content"
      ? "Type"
      : destination === "analytics"
        ? "Present"
        : "Read";
  const onStatus = useCallback((status: ModelStatus) => setModel(status), []);
  useEffect(() => {
    setDestination(selected || activeRoom);
    resting.current = 0;
  }, [selected, activeRoom]);
  useEffect(() => {
    const p = traveller.current.position;
    const points = planRoute([p.x, p.z], destination);
    const path = points.map(([x, z]) => new THREE.Vector3(x, -0.035, z));
    waypoints.current = points;
    setRoute([p.clone(), ...path]);
    setMoving(path.length > 0);
    speed.current = 0;
    resting.current = 0;
    if (!path.length) {
      reached.current = destination;
      setArrived(destination);
    }
  }, [destination, traveller]);
  useEffect(() => {
    onPresence({ state, room: arrived, destination, model });
  }, [state, arrived, destination, model, onPresence]);
  useFrame((_, rawDelta) => {
    if (!playing || model === "loading") return;
    const dt = Math.min(rawDelta, 1);
    const actor = traveller.current;
    const target = waypoints.current[0];
    if (target) {
      const step = advanceWalk(
        [actor.position.x, actor.position.z],
        waypoints.current,
        speed.current,
        dt,
      );
      actor.position.x = step.position[0];
      actor.position.z = step.position[1];
      speed.current = step.speed;
      if (step.heading !== undefined) {
        actor.rotation.y = approachAngle(actor.rotation.y, step.heading, dt);
      }
      if (!waypoints.current.length) {
        reached.current = destination;
        setArrived(destination);
        setMoving(false);
        resting.current = 0;
        speed.current = 0;
      }
    } else {
      actor.rotation.y = approachAngle(
        actor.rotation.y,
        destination === "content"
          ? Math.PI
          : destination === "analytics"
            ? -0.3
            : 0.1,
        dt,
      );
      if (tour && !selected) {
        resting.current += dt;
        if (resting.current > 12) {
          resting.current = 0;
          setDestination(
            tourRooms[
              (tourRooms.indexOf(reached.current) + 1) % tourRooms.length
            ],
          );
        }
      }
    }
  });
  const p = visitingStations.content;
  return (
    <>
      {rooms
        .filter((r) => r.id !== "content")
        .map((r) => (
          <Resident
            key={r.id}
            room={r.id}
            agent={agents.find((a) => a.id === r.id)!}
            busy={workingAgent === r.id}
            playing={playing}
            selected={selected}
            onAgent={onAgent}
            portal={portal}
          />
        ))}
      {moving && route.length > 1 && (
        <Line
          points={route.map(
            (v) => [v.x, 0.025, v.z] as [number, number, number],
          )}
          color="#739887"
          dashed
          dashSize={0.1}
          gapSize={0.13}
          lineWidth={1.3}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      )}
      <group name="agent-nova" ref={traveller} position={[p[0], -0.035, p[1]]}>
        <group
          onClick={(e) => {
            e.stopPropagation();
            onAgent("content");
          }}
        >
          <OfficeAvatar
            url={avatarUrl || "/avatars/nova.glb"}
            state={state}
            playing={playing}
            onStatus={onStatus}
          />
        </group>
        <Halo color={agents.find((a) => a.id === "content")!.color} active />
        <Beacon
          name={agents.find((a) => a.id === "content")!.name}
          busy={workingAgent === "content"}
          state={state}
          status={model}
          active
          portal={portal}
          onClick={() => onAgent("content")}
        />
      </group>
    </>
  );
}
