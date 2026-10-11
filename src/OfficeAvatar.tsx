import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { avatarClip, type WorkAnimation } from "./officeMotion";
export type ModelStatus = "loading" | "ready" | "fallback";
type Props = {
  url: string;
  state: WorkAnimation;
  playing: boolean;
  phase?: number;
  onStatus?: (status: ModelStatus) => void;
};
class ModelBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Humanoid({ url, state, playing, phase = 0, onStatus }: Props) {
  const gltf = useGLTF(url);
  const root = useRef<THREE.Group>(null!);
  const previous = useRef<THREE.AnimationAction | null>(null);
  const tablet = useRef<THREE.Group>(null!);
  const vectors = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      goal: new THREE.Vector3(),
      delta: new THREE.Quaternion(),
      parent: new THREE.Quaternion(),
      wrist: new THREE.Quaternion(),
    }),
    [],
  );
  const { model, scale, offset } = useMemo(() => {
    const model = clone(gltf.scene);
    let standingHeight = url.startsWith("/avatars/") ? 1.74 : 0;
    model.traverse((object) => {
      if (object.userData.standingHeight)
        standingHeight = object.userData.standingHeight;
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const scale = 1.74 / Math.max(standingHeight || box.max.y - box.min.y, 0.1);
    return { model, scale, offset: standingHeight ? 0 : -box.min.y * scale };
  }, [gltf.scene]);
  const clips = useMemo(
    () =>
      gltf.animations.map((clip) => {
        const copy = clip.clone();
        // Uploaded walk cycles can contain root motion. The corridor controller owns horizontal motion.
        copy.tracks = copy.tracks.map((track) => {
          if (
            /(?:Bip01|hips|pelvis|root|armature)\.position$/i.test(track.name)
          ) {
            const neutral = track.clone();
            for (let i = 0; i < neutral.values.length; i += 3) {
              neutral.values[i] = neutral.values[0];
              neutral.values[i + 2] = neutral.values[2];
            }
            return neutral;
          }
          return track;
        });
        return copy;
      }),
    [gltf.animations],
  );
  const limbs = useMemo(() => {
    const find = (name: string) =>
      model.getObjectByName("Bip01_" + name) as THREE.Bone | undefined;
    return ["L", "R"].map((side) => ({
      side,
      upper: find(side + "_UpperArm"),
      fore: find(side + "_Forearm"),
      hand: find(side + "_Hand"),
    }));
  }, [model]);
  const { actions, mixer } = useAnimations(clips, root);
  useEffect(() => {
    onStatus?.("ready");
  }, [url, onStatus]);
  useEffect(() => {
    const name = avatarClip(Object.keys(actions), state);
    const action = name ? actions[name] : null;
    const old = previous.current;
    if (action && action !== old) {
      action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
      action.time = phase % Math.max(action.getClip().duration, 0.01);
      action.play();
      if (old) action.crossFadeFrom(old, 0.32, false);
      else action.fadeIn(0.3);
    } else if (!action && old) old.fadeOut(0.25);
    previous.current = action || null;
  }, [actions, state, phase]);
  useEffect(() => {
    mixer.timeScale = playing ? 1 : 0;
  }, [mixer, playing]);
  useFrame(({ clock }) => {
    if (state === "Type" && url.startsWith("/avatars/")) {
      model.updateWorldMatrix(true, true);
      for (const limb of limbs) {
        if (!limb.upper || !limb.fore || !limb.hand) continue;
        const tap = playing
          ? Math.sin(clock.elapsedTime * 9 + (limb.side === "L" ? 0 : 2)) *
            0.006
          : 0;
        vectors.goal
          .set(limb.side === "L" ? 0.095 : -0.095, 1.025 + tap, 0.45)
          .applyMatrix4(root.current.matrixWorld);
        limb.hand.getWorldQuaternion(vectors.wrist);
        for (let iteration = 0; iteration < 3; iteration++)
          for (const joint of [limb.fore, limb.upper]) {
            joint.getWorldPosition(vectors.a);
            limb.hand.getWorldPosition(vectors.b);
            vectors.b.sub(vectors.a).normalize();
            vectors.c.copy(vectors.goal).sub(vectors.a).normalize();
            vectors.delta.setFromUnitVectors(vectors.b, vectors.c);
            joint.parent!.getWorldQuaternion(vectors.parent);
            vectors.delta
              .premultiply(vectors.parent.clone().invert())
              .multiply(vectors.parent);
            joint.quaternion.premultiply(vectors.delta);
            joint.updateWorldMatrix(false, true);
          }
        limb.hand.parent!.getWorldQuaternion(vectors.parent);
        limb.hand.quaternion.copy(
          vectors.parent.invert().multiply(vectors.wrist),
        );
      }
    }
    if (state === "Read" && tablet.current && limbs[0]?.hand) {
      limbs[0].hand.getWorldPosition(vectors.a);
      root.current.worldToLocal(vectors.a);
      tablet.current.position.set(
        vectors.a.x - 0.13,
        vectors.a.y + 0.03,
        vectors.a.z + 0.05,
      );
    }
    for (const action of Object.values(actions))
      if (
        action &&
        action !== previous.current &&
        action.getEffectiveWeight() < 0.001
      )
        action.stop();
  });
  return (
    <group ref={root} dispose={null}>
      <primitive object={model} scale={scale} position-y={offset} />
      {state === "Read" && limbs[0]?.hand && (
        <group ref={tablet} rotation-x={-0.75}>
          <mesh>
            <boxGeometry args={[0.29, 0.21, 0.016]} />
            <meshStandardMaterial color="#4d5952" roughness={0.45} />
          </mesh>
          <mesh position-z={0.01}>
            <planeGeometry args={[0.265, 0.185]} />
            <meshStandardMaterial
              color="#dde9d7"
              emissive="#bfd0b5"
              emissiveIntensity={0.18}
            />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[-0.02, 0.045 - i * 0.038, 0.012]}>
              <planeGeometry args={[0.18 - i * 0.025, 0.012]} />
              <meshBasicMaterial color="#91a387" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
// A local silhouette keeps the office usable while a GLB loads or an uploaded model fails.
function Silhouette() {
  return (
    <group>
      <mesh position-y={1.55}>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color="#d2ae95" />
      </mesh>
      <mesh position-y={1.2}>
        <capsuleGeometry args={[0.14, 0.38, 4, 12]} />
        <meshStandardMaterial color="#a9bba1" />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.085, 0.62, 0]}>
            <capsuleGeometry args={[0.055, 0.65, 4, 10]} />
            <meshStandardMaterial color="#606c60" />
          </mesh>
          <mesh position={[side * 0.21, 1.04, 0]}>
            <capsuleGeometry args={[0.045, 0.46, 4, 10]} />
            <meshStandardMaterial color="#a9bba1" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
export default function OfficeAvatar(props: Props) {
  return (
    <ModelBoundary
      key={props.url}
      fallback={<Silhouette />}
      onFailure={() => props.onStatus?.("fallback")}
    >
      <Suspense fallback={<Silhouette />}>
        <Humanoid {...props} />
      </Suspense>
    </ModelBoundary>
  );
}
