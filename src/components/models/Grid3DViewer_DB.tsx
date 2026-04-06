import { Center, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";

type FileFormat = 'stl' | '3mf' | 'obj';

function getFormat(url: string): FileFormat {
  const ext = url.toLowerCase().split('.').pop();
  if (ext === 'stl') return 'stl';
  if (ext === 'obj') return 'obj';
  return '3mf';
}

function getLoader(format: FileFormat) {
  if (format === 'stl') return STLLoader;
  if (format === 'obj') return OBJLoader;
  return ThreeMFLoader;
}

// [FIX] R3F JSX Intrinsic Elements workaround for React 18+ types
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      group: any;
      ambientLight: any;
      hemisphereLight: any;
      directionalLight: any;
      boxGeometry: any;
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      primitive: any;
    }
  }
}

// [NEW] Error Boundary for 3D Content
class ThreeErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error("ThreeErrorBoundary caught 3D load error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <mesh>
          <boxGeometry args={[20, 20, 20]} />
          <meshBasicMaterial wireframe color="red" />
        </mesh>
      );
    }
    return this.props.children;
  }
}

// --- Helper: Model Geometry Fixes ---
function ModelGeometryFix({ url, color }: { url: string; color: string }) {
  const format = getFormat(url);
  const isStl = format === 'stl';

  const data = useLoader(getLoader(format) as any, url);

  // Create material ONCE — shared across all meshes in this viewer instance.
  // Previously: new MeshStandardMaterial() per mesh per render — never disposed → memory leak.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.4,
    metalness: 0.0,
    side: THREE.DoubleSide,
  }), []);

  // Keep material color in sync without re-creating it
  useEffect(() => {
    material.color.set(color);
  }, [material, color]);

  // Dispose material on unmount
  useEffect(() => () => { material.dispose(); }, [material]);

  const object = useMemo(() => {
    if (!data) return null;
    if (isStl) return data;
    // 3MF and OBJ loaders return a Group — clone so each viewer instance is independent
    const source = data as any;
    return typeof source.clone === 'function' ? source.clone() : data;
  }, [data, isStl]);

  // Dispose cloned Group (3MF/OBJ) on unmount.
  // Previously: cloned groups were never freed → every hover that loaded a 3MF leaked the scene graph.
  useEffect(() => {
    if (!object || isStl) return;
    return () => {
      const group = object as THREE.Group;
      group.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              (child.material as THREE.Material[]).forEach(m => m.dispose());
            } else {
              (child.material as THREE.Material).dispose();
            }
          }
        }
      });
    };
  }, [object, isStl]);

  // Traversal & VISIBILITY FIXES
  useLayoutEffect(() => {
    if (!object) return;

    const handleGeometryFix = (geometry: THREE.BufferGeometry) => {
      if (geometry.attributes.position) {
        // 3MFs often lack normals, causing them to appear black/dark under light.
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        if (!geometry.boundingBox) geometry.computeBoundingBox();
      }
    };

    if (!isStl) {
      const group = object as THREE.Group;
      group.traverse((child: any) => {
        if (child.isMesh) {
          handleGeometryFix(child.geometry);
          child.frustumCulled = false;
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = material; // reuse shared material — no new allocation per mesh
        }
      });
    }
  }, [object, isStl, material]);

  if (!object) return null;

  if (isStl) {
    const geom = object as THREE.BufferGeometry;
    if (geom.attributes.position && !geom.boundingSphere) {
      geom.computeBoundingSphere();
      if (!geom.attributes.normal) geom.computeVertexNormals();
    }
    return (
      <mesh
        geometry={geom}
        material={material}
        castShadow
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      />
    );
  }

  return <primitive object={object} rotation={[-Math.PI / 2, 0, 0]} />;
}

// --- Helper: Custom Camera Fitter (Preserved) ---
function CameraFitter({ url }: { url: string }) {
  const { camera, scene, controls: controlsAny } = useThree();
  const fitted = useRef(false);

  useEffect(() => {
    fitted.current = false;
  }, [url]);

  useEffect(() => {
    if (fitted.current) return;

    const controls = controlsAny as OrbitControlsImpl;
    if (!controls || !controls.target) return;

    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);

    const fov = 20;
    const fovRad = (fov * Math.PI) / 180;
    let cameraDist = Math.abs(maxDim / 2 / Math.tan(fovRad / 2));
    cameraDist *= 1.5;

    const direction = new THREE.Vector3(-66, 79, 83).normalize();
    const newPos = direction.multiplyScalar(cameraDist).add(center);

    camera.position.copy(newPos);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    const initialDistance = camera.position.distanceTo(controls.target);
    controls.minDistance = initialDistance * 0.5;
    controls.maxDistance = initialDistance * 3.0;
    controls.update();

    fitted.current = true;
  }, [camera, scene, url, controlsAny]);

  return null;
}

// --- Main Viewer ---
export function Grid3DViewer_DB({ url, color = "#6366f1" }: { url: string; color?: string }) {
  return (
    <div className="w-full h-full bg-muted/20">
      <Canvas
        shadows
        dpr={[1, 1.5]}
      // preserveDrawingBuffer removed — it forces the GPU to keep a full copy of every frame
      // in VRAM, unnecessary for the hover viewer and a significant memory cost.
      >
        <PerspectiveCamera makeDefault position={[-10, 10, 10]} fov={20} />

        {/* Updated Lighting with Shadow Bias */}
        <ambientLight intensity={0.8} />
        <hemisphereLight args={["#ffffff", "#444444", 0.6]} />

        <directionalLight
          position={[5, 10, 5]}
          intensity={2.0}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.001}
        />
        <directionalLight position={[-5, 5, -5]} intensity={0.8} />

        <Suspense fallback={null}>
          <Center>
            <ThreeErrorBoundary>
              <ModelGeometryFix url={url} color={color} />
            </ThreeErrorBoundary>
          </Center>

          <CameraFitter url={url} />

          <OrbitControls
            enableZoom={true}
            enablePan={false}
            autoRotate={false}
            target={[0, 0, 0]}
            makeDefault
          />
        </Suspense>
      </Canvas>
    </div>
  );
}