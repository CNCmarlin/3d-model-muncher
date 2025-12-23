import { Canvas, useThree, useLoader } from "@react-three/fiber";
import { Center, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls';

// --- Helper: Model Geometry Fixes ---
function ModelGeometryFix({ url, color }: { url: string; color: string }) {
  const isStl = url.toLowerCase().endsWith(".stl");
  
  const data = isStl 
    ? useLoader(STLLoader, url) 
    : useLoader(ThreeMFLoader as any, url); 

  const object = useMemo(() => {
    if (!data) return null;
    if (isStl) return data;

    const source = data as any;
    if (typeof source.clone === "function") {
        return source.clone();
    }
    return data;
  }, [data, isStl]);

  // Traversal & VISIBILITY FIXES
  useLayoutEffect(() => {
    if (!object) return;

    const handleGeometryFix = (geometry: THREE.BufferGeometry) => {
        if (geometry.attributes.position) {
            // [FIX] Compute Normals if missing. 
            // 3MFs often lack normals, causing them to appear black/dark under light.
            if (!geometry.attributes.normal) {
                geometry.computeVertexNormals();
            }
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

                // Apply a bright standard material
                child.material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(color),
                    roughness: 0.4, // Lower roughness = slightly shinier/brighter
                    metalness: 0.0, // No metalness avoids "black reflection" issues without HDRI
                    side: THREE.DoubleSide, 
                });
            }
        });
    }
  }, [object, isStl, color]);

  if (!object) return null;

  if (isStl) {
    const geom = object as THREE.BufferGeometry;
    if (geom.attributes.position && !geom.boundingSphere) {
        geom.computeBoundingSphere();
        // Also ensure normals for STLs just in case
        if (!geom.attributes.normal) geom.computeVertexNormals();
    }
    
    return (
      <mesh 
        geometry={geom} 
        castShadow 
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]} 
      >
        <meshStandardMaterial 
          color={color} 
          roughness={0.4} 
          metalness={0.0} 
          side={THREE.DoubleSide} 
        />
      </mesh>
    );
  }

  // Render 3MF
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
export function Grid3DViewer({ url, color = "#6366f1" }: { url: string; color?: string }) {
  return (
    <div className="w-full h-full bg-muted/20">
      <Canvas 
        shadows 
        dpr={[1, 1.5]} 
        gl={{ preserveDrawingBuffer: true }} 
      >
        <PerspectiveCamera makeDefault position={[-10, 10, 10]} fov={20} />

        {/* [FIX] Manual Studio Lighting 
            Replacing external Environment map with strong local lights 
            so models are visible even without internet/HDRI.
        */}
        <ambientLight intensity={1.5} />
        <hemisphereLight args={["#ffffff", "#444444", 2.0]} />
        
        <directionalLight position={[5, 10, 5]} intensity={2.0} castShadow />
        <directionalLight position={[-5, 5, -5]} intensity={1.5} />
        <directionalLight position={[0, -5, 5]} intensity={0.5} />
        
        <Suspense fallback={null}>
          <Center>
            {url.toLowerCase().endsWith(".3mf") ? (
              <group onPointerOver={undefined} onPointerOut={undefined}> 
                <ModelGeometryFix url={url} color={color} />
              </group>
            ) : (
              <ModelGeometryFix url={url} color={color} />
            )}
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