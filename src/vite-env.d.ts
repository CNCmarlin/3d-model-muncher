/// <reference types="vite/client" />

// Shim for React Three Fiber elements

declare global {
    namespace JSX {
        interface IntrinsicElements {
            mesh: any;
            boxGeometry: any;
            meshBasicMaterial: any;
            meshStandardMaterial: any;
            primitive: any;
            ambientLight: any;
            hemisphereLight: any;
            directionalLight: any;
            group: any;
            // Add others as needed
        }
    }
}
