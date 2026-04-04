export const VIEWABLE_3D_EXTENSIONS = ['stl', '3mf', 'obj'];
export const GCODE_EXTENSIONS = ['gcode', 'bgcode'];
export const SOURCE_CAD_EXTENSIONS = [
    // Parametric / direct modellers
    'f3d', 'f3z',                              // Autodesk Fusion 360
    'ipt', 'iam',                              // Autodesk Inventor (part, assembly)
    'sldprt', 'sldasm', 'slddrw',             // SolidWorks
    'fcstd',                                   // FreeCAD
    'blend',                                   // Blender
    'skp',                                     // SketchUp
    '3dm',                                     // Rhino 3D
    'c4d',                                     // Cinema 4D
    'lwo', 'lws',                              // LightWave
    // STEP / IGES / kernel formats
    'step', 'stp', 'stpz',                    // STEP (all variants)
    'iges', 'igs',                             // IGES
    'sat', 'sab',                              // ACIS (Fusion 360 export, SolidWorks)
    'brep',                                    // OpenCASCADE boundary rep (FreeCAD)
    'jt',                                      // JT open format (Siemens)
    // Slicer native projects
    'splrt',                                   // Bambu Studio / PrusaSlicer project
    '3mfp',                                    // 3MF project
    // Scripted / generative
    'scad',                                    // OpenSCAD
    // Exchange / CNC / laser
    'dxf', 'dwg',                             // AutoCAD
    'svg', 'ai', 'eps',                       // Vector (laser cutting / CNC)
    // Legacy / specialty
    'x3d', 'dae',                             // X3D, Collada
    'wrl', 'vrml',                            // Virtual Reality Modeling Language
    'amf', 'ply',                             // AMF, PLY
];
