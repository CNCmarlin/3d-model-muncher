import { useLoader } from '@react-three/fiber';
import { createElement, useMemo } from 'react';
// @ts-ignore
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader';
// @ts-ignore
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

interface ModelMeshProps {
  modelUrl: string;
  isWireframe?: boolean;
  materialType?: 'standard' | 'normal';
  customColor?: string;
  onBoundingBox?: (box: THREE.Box3 | null) => void;
}

type FileFormat = 'stl' | '3mf' | 'obj';

function getFileFormat(url: string): FileFormat {
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

export function ModelMesh_DB({ modelUrl, isWireframe, materialType = 'standard', customColor, onBoundingBox }: ModelMeshProps) {
  const format = getFileFormat(modelUrl);
  const isSTL = format === 'stl';

  // Load the model with the appropriate loader
  const modelData = useLoader(getLoader(format) as any, modelUrl);

  const group = useMemo(() => {
    const material = materialType === 'normal'
      ? new THREE.MeshNormalMaterial()
      : new THREE.MeshStandardMaterial({
        color: customColor || 0xaaaaaa,
        roughness: 0.4,
        metalness: 0.1
      });

    if (isSTL) {
      // STL loader returns a BufferGeometry — wrap in a mesh + group
      const geometry = modelData as THREE.BufferGeometry;
      const mesh = new THREE.Mesh(geometry, material);
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.rotation.x = -Math.PI / 2;
      return grp;
    } else {
      // 3MF and OBJ loaders both return a Group
      const grp = (modelData as THREE.Group).clone();
      if (materialType === 'normal') {
        grp.traverse((child: any) => {
          if (child.isMesh) {
            child.material = material;
          }
        });
      } else if (customColor) {
        grp.traverse((child: any) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat: any) => {
                if (mat.color) mat.color.set(customColor);
              });
            } else if (child.material.color) {
              child.material.color.set(customColor);
            }
          }
        });
      } else if (format === 'obj') {
        // OBJ files may not have materials — apply a default standard material
        grp.traverse((child: any) => {
          if (child.isMesh) {
            child.material = material;
          }
        });
      }
      grp.rotation.x = -Math.PI / 2;
      return grp;
    }
  }, [modelData, isSTL, format, materialType, customColor]);

  // Recursively set wireframe on all mesh materials if needed
  useMemo(() => {
    if (group && isWireframe !== undefined) {
      group.traverse((child: any) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => {
              mat.wireframe = isWireframe;
            });
          } else {
            child.material.wireframe = isWireframe;
          }
        }
      });
    }
  }, [group, isWireframe]);

  // Compute bounding box and call onBoundingBox
  useMemo(() => {
    if (group && onBoundingBox) {
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) {
        onBoundingBox(null);
      } else {
        onBoundingBox(box);
      }
    } else if (onBoundingBox) {
      onBoundingBox(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, onBoundingBox]);

  return createElement('primitive', { object: group });
}
