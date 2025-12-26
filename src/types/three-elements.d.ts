import { Object3DNode } from '@react-three/fiber';

// This tells TypeScript to treat these Three.js elements as valid JSX
declare global {
    namespace JSX {
      interface IntrinsicElements {
        mesh: any;
        group: any;
        primitive: any;
        ambientLight: any;
        hemisphereLight: any;
        directionalLight: any;
        pointLight: any;
        meshStandardMaterial: any;
        meshBasicMaterial: any;
        shadowMaterial: any;
        planeGeometry: any;
        sphereGeometry: any;
        // Add any others that complain here
      }
    }
  }