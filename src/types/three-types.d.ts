export { };

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
            pointLight: any;
            group: any;
            shadowMaterial: any;
            planeGeometry: any;
            sphereGeometry: any;
            // Add others as needed
        }
    }
}
