import { ModelMesh_DB } from "@/components/models/ModelMesh_DB";
import { Bounds, Center, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as React from "react";
import { Suspense, memo } from "react";

interface SharedModelSceneProps {
  modelUrl?: string;
  customColor?: string;
  autoRotate?: boolean;
  materialType?: "standard" | "normal";
  onModelLoaded?: () => void;
}

export const SharedModelScene_DB = memo(({
  modelUrl,
  customColor,
  autoRotate = false,
  materialType = "standard",
  onModelLoaded,
}: SharedModelSceneProps) => {
  const loadedRef = React.useRef(false);
  return (
    <>
      <PerspectiveCamera makeDefault position={[-66, 79, 83]} rotation={[-0.76, -0.52, -0.44]} fov={20} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        autoRotate={autoRotate}
        autoRotateSpeed={2.0}
      />

      {/* --- [FIX] Manual "Studio" Lighting (Brighter & Offline) --- */}

      {/* 1. Global Ambience: Raises the brightness floor so nothing is pitch black */}
      {/* @ts-ignore: react-three/fiber JSX intrinsic types */}
      <ambientLight intensity={1.5} />

      {/* 2. Sky/Ground Fill: Crucial for 3MFs to show shape/depth without an HDRI */}
      {/* @ts-ignore: react-three/fiber JSX intrinsic types */}
      <hemisphereLight args={["#ffffff", "#444444", 2.0]} />

      {/* 3. Main Key Light: Creates the primary shadows */}
      {/* @ts-ignore: react-three/fiber JSX intrinsic types */}
      <directionalLight position={[5, 5, 5]} intensity={2.5} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

      {/* 4. Rim Light: Highlights edges from behind */}
      {/* @ts-ignore: react-three/fiber JSX intrinsic types */}
      <directionalLight position={[-5, 3, -5]} intensity={1.5} />

      <Suspense fallback={null}>
        {modelUrl ? (
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <ModelMesh_DB
                modelUrl={modelUrl}
                materialType={materialType}
                customColor={customColor}
                onBoundingBox={(box) => {
                  if (!loadedRef.current && box && !box.isEmpty()) {
                    loadedRef.current = true;
                    try { onModelLoaded && onModelLoaded(); } catch (e) { }
                  }
                }}
              />
            </Center>
          </Bounds>
        ) : null}
      </Suspense>
    </>
  );
});

SharedModelScene_DB.displayName = "SharedModelScene_DB";