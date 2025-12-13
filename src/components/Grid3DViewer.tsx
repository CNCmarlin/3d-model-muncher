import { Canvas, useThree } from "@react-three/fiber";
import { Center, OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei";
import { useSafeThreeMFLoader } from "../utils/useSafeThreeMFLoader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";

// Helper component to handle the "Static Fit" logic
function StaticCameraFit() {
  const { camera, scene } = useThree();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    
    // 1. Calculate bounding box of the whole scene (the centered model)
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // 2. Math to fit object in FOV 20 (Same as capture.html)
    const fov = 20;
    const fovRad = (fov * Math.PI) / 180;
    let cameraDist = Math.abs(maxDim / 2 / Math.tan(fovRad / 2));
    
    // [FIX] Increased margin to 1.5 to zoom out a bit more
    cameraDist *= 1.5; 

    // 3. Set Position using our "Magic Vector" direction
    const direction = new THREE.Vector3(-66, 79, 83).normalize();
    const newPos = direction.multiplyScalar(cameraDist).add(center);

    camera.position.copy(newPos);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    fitted.current = true;
  }); 

  return null;
}

function ModelContent({ url, color }: { url: string; color: string }) {
  const isStl = url.toLowerCase().endsWith(".stl");
  const geometry = isStl 
    ? useLoader(STLLoader, url) 
    : useSafeThreeMFLoader(url);

  if (!geometry) return null;

  if (isStl) {
      return (
        <mesh 
          geometry={geometry as any} 
          castShadow 
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]} 
        >
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
        </mesh>
      );
  }

  return <primitive object={geometry} rotation={[-Math.PI / 2, 0, 0]} />;
}

export function Grid3DViewer({ url, color = "#6366f1" }: { url: string; color?: string }) {
  return (
    <div className="w-full h-full bg-muted/20">
      <Canvas 
        shadows 
        dpr={[1, 1.5]} 
        gl={{ preserveDrawingBuffer: true }} 
      >
        <PerspectiveCamera makeDefault position={[-10, 10, 10]} fov={20} />

        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
        <directionalLight position={[-5, 3, -5]} intensity={0.5} />
        <Environment preset="studio" />

        <Suspense fallback={null}>
          <Center>
            <ModelContent url={url} color={color} />
          </Center>
          
          <StaticCameraFit />
          
          <OrbitControls 
            enableZoom={true} // [FIX] Enabled manual zoom
            enablePan={false}
            autoRotate={false} 
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}