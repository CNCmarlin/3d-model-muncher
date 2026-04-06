import { OrbitControls, PerspectiveCamera, TransformControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { ArrowDownToLine, Copy, LayoutGrid, MousePointer2, Move, Palette, Rotate3D, Trash2 } from "lucide-react";
import React, { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { useProjectMutations } from "../../hooks/useProjects_db";
import { BuildPlate, BuildPlateItem } from "../../types/project";
import { calculateAutoArrange, calculateAutoOrient, calculateDropToBed } from "../../utils/threeMathUtils";
import { Button } from "../ui/button";

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
function PlateModel({ item, color, isSelected, isMoveMode, onSelect, onTransformEnd, registerItemRef, onDragStart, onRightClick }: { item: BuildPlateItem; color: string; isSelected: boolean; isMoveMode: boolean; onSelect: () => void; onTransformEnd: (x: number, z: number, rx: number, ry: number, rz: number) => void; registerItemRef?: (id: string, obj: THREE.Object3D | null) => void; onDragStart?: () => void; onRightClick?: (e: any, id: string) => void }) {
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

        if (isStl) {
            const geom = object as THREE.BufferGeometry;
            if (!geom.userData.centered) {
                geom.center(); // Center vertices exactly around Object3D 0,0,0
                handleGeometryFix(geom);
                geom.userData.centered = true;
            }
        } else {
            const group = object as THREE.Group;
            if (!group.userData.centered) {
                const box = new THREE.Box3().setFromObject(group, true);
                const center = box.getCenter(new THREE.Vector3());
                group.traverse((child: any) => {
                    if (child.isMesh) {
                        child.geometry.translate(-center.x, -center.y, -center.z);
                        handleGeometryFix(child.geometry);
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.material = material;
                    }
                });
                group.userData.centered = true;
            } else {
                group.traverse((child: any) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.material = material;
                    }
                });
            }
        }
    }, [object, isStl, material]);

    if (!object) return null;

    // Apply BuildPlateItem positioning (default 0 if null, but note that 3D items usually get arranged. 
    // Right now we just dump them at their defined X/Y or 0,0)
    // Z is standard "up" in our viewer rotation, but Y is up in ThreeJS. We'll lay the STL flat on the grid.
    const posX = item.positionX || 0;
    const posZ = item.positionY || 0; // Using Y as Z depth on the flat grid

    // Handle initial orientation. If it's an STL and we have NO rotation saved, it defaults to standing up (pitch -90 deg)
    const rotX = item.rotationX !== null && item.rotationX !== undefined ? item.rotationX : (isStl ? -Math.PI / 2 : 0);
    const rotY = item.rotationY !== null && item.rotationY !== undefined ? item.rotationY : 0;
    const rotZ = item.rotationZ !== null && item.rotationZ !== undefined ? item.rotationZ : 0;

    const handlePointerDown = (e: any) => {
        e.stopPropagation();
        onSelect();
    };

    const handleContextMenu = (e: any) => {
        e.stopPropagation();
        onRightClick?.(e, item.id);
    };

    const objectRef = React.useRef<THREE.Object3D>(null);
    const [offsetY, setOffsetY] = React.useState(0);

    useEffect(() => {
        if (registerItemRef) {
            registerItemRef(item.id, objectRef.current);
            return () => registerItemRef(item.id, null);
        }
    }, [item.id, objectRef.current, registerItemRef]);

    useLayoutEffect(() => {
        if (!objectRef.current || !object) return;
        // Temporarily measure as if it was at Y=0
        const originalY = objectRef.current.position.y;
        objectRef.current.position.y = 0;
        const offset = calculateDropToBed(objectRef.current);
        objectRef.current.position.y = originalY; // restore
        setOffsetY(offset);
    }, [object, rotX, rotY, rotZ]);

    let content;
    if (isStl) {
        const geom = object as THREE.BufferGeometry;
        content = (
            <mesh
                ref={objectRef}
                geometry={geom}
                material={material}
                castShadow
                receiveShadow
                position={[posX, offsetY, posZ]}
                rotation={[rotX, rotY, rotZ]}
                onPointerDown={handlePointerDown}
                onContextMenu={handleContextMenu}
            />
        );
    } else {
        content = (
            <group ref={objectRef} position={[posX, offsetY, posZ]} rotation={[rotX, rotY, rotZ]} onPointerDown={handlePointerDown} onContextMenu={handleContextMenu}>
                <primitive object={object} />
            </group>
        );
    }

    return (
        <group>
            {content}
            {isSelected && isMoveMode && objectRef.current && (
                <TransformControls
                    object={objectRef.current}
                    mode="translate"
                    showY={false} // Only allow moving on the bed X/Z
                    onMouseDown={onDragStart}
                    onMouseUp={() => {
                        if (objectRef.current) {
                            // objectRef.current.position is the new absolute coordinates
                            onTransformEnd(
                                objectRef.current.position.x,
                                objectRef.current.position.z,
                                objectRef.current.rotation.x,
                                objectRef.current.rotation.y,
                                objectRef.current.rotation.z
                            );
                        }
                    }}
                />
            )}
        </group>
    );
}

// Scene setup including Lights and Grid
function SceneEnviroment({ width, height, isDragging }: { width: number, height: number, isDragging: boolean }) {
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
                enabled={!isDragging}
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
    const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
    const [isMoveMode, setIsMoveMode] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);
    const [contextMenu, setContextMenu] = React.useState<{ x: number, y: number, itemId: string, colorHex: string } | null>(null);
    const colorInputRef = React.useRef<HTMLInputElement>(null);

    const { updatePlateItemTransforms, clonePlateItem, updatePlateItemColor, unassignFromPlate } = useProjectMutations();
    const itemRefs = React.useRef(new Map<string, THREE.Object3D>());

    if (!plate) return null;

    const width = plate.width || 220;
    const height = plate.height || 220;

    useEffect(() => {
        // Reset move mode on unmount or when changing plates to prevent locked controls
        return () => setIsMoveMode(false);
    }, [plate.id]);

    const handleCanvasPointerMissed = () => {
        setSelectedItemId(null);
    };

    const registerItemRef = React.useCallback((id: string, obj: THREE.Object3D | null) => {
        if (obj) {
            itemRefs.current.set(id, obj);
        } else {
            itemRefs.current.delete(id);
        }
    }, []);

    const handleAutoOrient = (itemId: string) => {
        const obj = itemRefs.current.get(itemId);
        if (!obj) return;

        const newEuler = calculateAutoOrient(obj);
        handleTransformEnd(itemId, obj.position.x, obj.position.z, newEuler.x, newEuler.y, newEuler.z);
    };

    const handleAutoArrange = () => {
        if (!itemRefs.current.size) return;

        // Use 10mm margins explicitly for visual spacing
        const result = calculateAutoArrange(itemRefs.current, width, height, 10);

        if (result.isOversized) {
            toast.error("Build Plate Full", {
                description: "The arranged models exceed the physical bounds of this build plate. Printing this arrangement may fail.",
            });
        }

        const transformsToUpdate = result.positions.map(pos => {
            const obj = itemRefs.current.get(pos.id)!;
            return {
                id: pos.id,
                positionX: pos.x,
                positionY: pos.z, // Z maps to positionY in our database schema
                rotationX: obj.rotation.x,
                rotationY: obj.rotation.y,
                rotationZ: obj.rotation.z
            };
        });

        if (transformsToUpdate.length > 0) {
            updatePlateItemTransforms.mutate({
                plateId: plate.id,
                transforms: transformsToUpdate,
                projectId: plate.projectId
            });
        }
    };

    const handleAutoOrientAll = () => {
        const transformsToUpdate: any[] = [];

        plate.items?.forEach(item => {
            const obj = itemRefs.current.get(item.id);
            if (obj) {
                const newEuler = calculateAutoOrient(obj);
                transformsToUpdate.push({
                    id: item.id,
                    positionX: obj.position.x,
                    positionY: obj.position.z, // Z depth maps to Y in DB
                    rotationX: newEuler.x,
                    rotationY: newEuler.y,
                    rotationZ: newEuler.z
                });
            }
        });

        if (transformsToUpdate.length > 0) {
            updatePlateItemTransforms.mutate({
                plateId: plate.id,
                transforms: transformsToUpdate,
                projectId: plate.projectId
            });
        }
    };

    const handleTransformEnd = (itemId: string, x: number, z: number, rx: number, ry: number, rz: number) => {
        setIsDragging(false);
        updatePlateItemTransforms.mutate({
            plateId: plate.id,
            transforms: [{
                id: itemId,
                positionX: x,
                positionY: z,
                rotationX: rx,
                rotationY: ry,
                rotationZ: rz
            }],
            projectId: plate.projectId
        });
    };

    return (
        <div
            className="w-full h-full relative cursor-move bg-black/5 rounded-xl border overflow-hidden"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
            <Canvas shadows dpr={[1, 1.5]} onPointerMissed={handleCanvasPointerMissed}>
                <SceneEnviroment width={width} height={height} isDragging={isDragging} />
                <Suspense fallback={null}>
                    {plate.items?.map((item) => {
                        const defaultColor = item.projectItem?.colorHex || "#6366f1";
                        const activeColor = item.colorHex || defaultColor;
                        return (
                            <ThreeErrorBoundary key={item.id}>
                                <PlateModel
                                    item={item}
                                    color={selectedItemId === item.id ? "#818cf8" : activeColor}
                                    isSelected={selectedItemId === item.id}
                                    isMoveMode={isMoveMode}
                                    onSelect={() => setSelectedItemId(item.id)}
                                    onTransformEnd={(x, z, rx, ry, rz) => handleTransformEnd(item.id, x, z, rx, ry, rz)}
                                    registerItemRef={registerItemRef}
                                    onDragStart={() => setIsDragging(true)}
                                    onRightClick={(e, id) => {
                                        setContextMenu({ x: e.clientX, y: e.clientY, itemId: id, colorHex: activeColor });
                                    }}
                                />
                            </ThreeErrorBoundary>
                        );
                    })}
                </Suspense>
            </Canvas>

            {contextMenu && (
                <div
                    style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x }}
                    className="z-50 bg-popover shadow-md border rounded-md p-1 min-w-[150px] flex flex-col gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Button variant="ghost" className="w-full justify-start text-sm h-8" onClick={() => {
                        clonePlateItem.mutate({ plateItemId: contextMenu.itemId, projectId: plate.projectId });
                        setContextMenu(null);
                    }}>
                        <Copy className="w-3 h-3 mr-2" /> Clone
                    </Button>

                    <div className="relative">
                        <Button variant="ghost" className="w-full justify-start text-sm h-8" onClick={(e) => {
                            e.preventDefault();
                            colorInputRef.current?.click();
                        }}>
                            <Palette className="w-3 h-3 mr-2" /> Set Color
                            <div className="ml-auto w-4 h-4 rounded border shadow-sm" style={{ backgroundColor: contextMenu.colorHex }} />
                        </Button>
                        <input
                            ref={colorInputRef}
                            type="color"
                            value={contextMenu.colorHex}
                            onChange={(e) => {
                                const newColor = e.target.value;
                                setContextMenu(prev => prev ? { ...prev, colorHex: newColor } : null);
                            }}
                            onBlur={(e) => {
                                updatePlateItemColor.mutate({ plateItemId: contextMenu.itemId, colorHex: e.target.value, projectId: plate.projectId });
                                setContextMenu(null);
                            }}
                            className="absolute opacity-0 pointer-events-none w-0 h-0"
                        />
                    </div>

                    <Button variant="ghost" className="w-full justify-start text-sm h-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => {
                        unassignFromPlate.mutate({ plateItemId: contextMenu.itemId, projectId: plate.projectId });
                        setContextMenu(null);
                    }}>
                        <Trash2 className="w-3 h-3 mr-2" /> Remove
                    </Button>
                </div>
            )}

            {/* Background Grid Size Indicator */}
            <div className="absolute top-2 left-2 bg-background/80 backdrop-blur text-xs px-2 py-1 rounded shadow-sm border border-border/50 text-muted-foreground pointer-events-none z-10">
                {width} x {height} mm
            </div>

            {/* Selected Item Toolbar (Top Right) */}
            {selectedItemId && (
                <div className="absolute top-2 right-2 bg-background/95 backdrop-blur shadow-md border p-1.5 rounded-lg flex flex-col gap-1 z-10 pointer-events-auto">
                    <Button
                        size="icon"
                        variant={!isMoveMode ? "secondary" : "ghost"}
                        className="h-8 w-8"
                        onClick={() => setIsMoveMode(false)}
                        title="Select Mode"
                    >
                        <MousePointer2 className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant={isMoveMode ? "secondary" : "ghost"}
                        className="h-8 w-8"
                        onClick={() => setIsMoveMode(true)}
                        title="Move Mode"
                    >
                        <Move className="h-4 w-4" />
                    </Button>
                    <div className="h-px bg-border my-1 mx-1" />
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Drop to Bed" disabled>
                        <ArrowDownToLine className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Auto Orient" onClick={() => handleAutoOrient(selectedItemId)}>
                        <Rotate3D className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Global Plate Toolbar (Bottom Center) */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur shadow-md border px-2 py-1.5 rounded-full flex gap-1 z-10 pointer-events-auto">
                <Button size="sm" variant="ghost" className="rounded-full h-8 text-xs font-medium px-3 gap-1.5" onClick={handleAutoArrange}>
                    <LayoutGrid className="h-3.5 w-3.5" /> Auto Arrange
                </Button>
                <div className="w-px h-8 bg-border mx-1" />
                <Button size="sm" variant="ghost" className="rounded-full h-8 text-xs font-medium px-3 gap-1.5" onClick={handleAutoOrientAll}>
                    <Rotate3D className="h-3.5 w-3.5" /> Orient All
                </Button>
            </div>
        </div>
    );
}
