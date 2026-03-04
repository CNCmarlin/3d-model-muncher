import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import React, { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { BuildPlate, BuildPlateItem } from "../../types/project";

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

// Ensure React Three Fiber Intrinsic Elements work with TS
declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            mesh: any;
            group: any;
            ambientLight: any;
            hemisphereLight: any;
            directionalLight: any;
            boxGeometry: any;
            planeGeometry: any;
            meshBasicMaterial: any;
            meshStandardMaterial: any;
            primitive: any;
            gridHelper: any;
            axesHelper: any;
        }
    }
}

// Error Boundary
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

// Renders an individual model on the plate
function PlateModel({ item, color }: { item: BuildPlateItem; color: string }) {
    const model = item.projectItem?.model;
    if (!model) return null;

    const primaryFile = model.files?.find((f: any) => f.isPrimary) || model.files?.[0];
    if (!primaryFile) return null;

    const rawPath = primaryFile.filePath || (primaryFile as any).path || '';
    if (!rawPath) return null;

    const url = rawPath.startsWith('/') ? rawPath : `/models/${rawPath}`;
    const format = getFormat(rawPath);
    const isStl = format === 'stl';

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const data = useLoader(getLoader(format) as any, url);

    const material = useMemo(() => new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.4,
        metalness: 0.0,
        side: THREE.DoubleSide,
    }), []);

    useEffect(() => {
        material.color.set(color);
    }, [material, color]);

    useEffect(() => () => { material.dispose(); }, [material]);

    const object = useMemo(() => {
        if (!data) return null;
        if (isStl) return data;
        const source = data as any;
        return typeof source.clone === 'function' ? source.clone() : data;
    }, [data, isStl]);

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

    useLayoutEffect(() => {
        if (!object) return;
        const handleGeometryFix = (geometry: THREE.BufferGeometry) => {
            if (geometry.attributes.position) {
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
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.material = material;
                }
            });
        }
    }, [object, isStl, material]);

    if (!object) return null;

    // Apply BuildPlateItem positioning (default 0 if null, but note that 3D items usually get arranged. 
    // Right now we just dump them at their defined X/Y or 0,0)
    // Z is standard "up" in our viewer rotation, but Y is up in ThreeJS. We'll lay the STL flat on the grid.
    const posX = item.positionX || 0;
    const posZ = item.positionY || 0; // Using Y as Z depth on the flat grid
    const rotY = item.rotation ? (item.rotation * Math.PI) / 180 : 0;

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
                position={[posX, 0, posZ]}
                rotation={[-Math.PI / 2, 0, rotY]}
            />
        );
    }

    return (
        <group position={[posX, 0, posZ]} rotation={[-Math.PI / 2, 0, rotY]}>
            <primitive object={object} />
        </group>
    );
}

// Scene setup including Lights and Grid
function SceneEnviroment({ width, height }: { width: number, height: number }) {
    // Generate grid size based on physical measurements or a standard 220x220 fallback
    const gridW = width || 220;
    const gridH = height || 220;
    const maxGrid = Math.max(gridW, gridH);

    return (
        <>
            {/* Center the camera based on the grid size */}
            <PerspectiveCamera makeDefault position={[0, maxGrid * 0.8, maxGrid * 1.2]} fov={45} />
            <OrbitControls
                makeDefault
                target={[0, 0, 0]}
                minPolarAngle={0}
                maxPolarAngle={Math.PI / 2 - 0.05} // Prevent dipping below ground
                enableDamping
                dampingFactor={0.05}
            />

            <ambientLight intensity={0.6} />
            <hemisphereLight args={["#ffffff", "#444444", 0.6]} />
            <directionalLight
                position={[100, 200, 50]}
                intensity={1.5}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-near={0.5}
                shadow-camera-far={maxGrid * 3}
                shadow-camera-left={-maxGrid}
                shadow-camera-right={maxGrid}
                shadow-camera-top={maxGrid}
                shadow-camera-bottom={-maxGrid}
                shadow-bias={-0.0005}
            />

            {/* Print Bed Surface */}
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
                <planeGeometry args={[gridW, gridH]} />
                <meshStandardMaterial color="#222222" roughness={0.8} metalness={0.2} />
            </mesh>

            {/* Grid Lines */}
            <gridHelper args={[maxGrid, Math.ceil(maxGrid / 10), '#444444', '#333333']} position={[0, 0, 0]} />

            {/* Axis hints (XYZ) */}
            <axesHelper args={[maxGrid / 4]} position={[-gridW / 2, 0.5, -gridH / 2]} />
        </>
    );
}

export function InteractiveBuildPlate_DB({ plate }: { plate: BuildPlate }) {
    if (!plate) return null;

    const width = plate.width || 220;
    const height = plate.height || 220;

    return (
        <div className="w-full h-full relative cursor-move bg-black/5 rounded-xl border overflow-hidden">
            <Canvas shadows dpr={[1, 1.5]}>
                <SceneEnviroment width={width} height={height} />
                <Suspense fallback={null}>
                    {plate.items?.map((item) => (
                        <ThreeErrorBoundary key={item.id}>
                            <PlateModel item={item} color="#6366f1" />
                        </ThreeErrorBoundary>
                    ))}
                </Suspense>
            </Canvas>

            {/* Overlays / UI Hooks can go here */}
            <div className="absolute top-2 left-2 bg-background/80 backdrop-blur text-xs px-2 py-1 rounded shadow-sm border border-border/50 text-muted-foreground pointer-events-none">
                {width} x {height} mm
            </div>
        </div>
    );
}
