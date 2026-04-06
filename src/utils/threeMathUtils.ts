import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull';

/**
 * Calculates the required Y-axis offset to sit the given 3D object flush on the print bed (Y = 0).
 * 
 * @param object The THREE.Object3D or THREE.Group to measure
 * @returns The new Y offset required to drop to the bed.
 */
export function calculateDropToBed(object: THREE.Object3D): number {
    // Force matrix update to ensure rotation/scale are applied
    object.updateMatrixWorld(true);

    // Compute the exact bounding box of the object in world space
    const box = new THREE.Box3().setFromObject(object, true);

    // Since we want the lowest point (box.min.y) to be at 0,
    // and the object's current position is object.position.y,
    // we want a new local Y that translates the mesh up/down so world min Y = 0.
    // However, if the object is mapped in React Fiber, we just want to return the delta.
    // delta = 0 - box.min.y
    return -box.min.y;
}

/**
 * Calculates the optimal rotation to lay the object flat on its largest surface.
 * Uses ConvexHull to build a lightweight enclosure of the points, then finds the polygon
 * with the largest surface area, and calculates the Euler angles to point that face's normal downwards.
 * 
 * @param object The 3D object to orient
 * @returns { x, y, z } Euler angles in radians
 */
export function calculateAutoOrient(object: THREE.Object3D): { x: number; y: number; z: number } {
    const triangles: { v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3 }[] = [];
    const points: THREE.Vector3[] = [];

    // We clone to not mess up the active rendering object while computing
    const clone = object.clone();
    // Reset rotation before extracting points, so we orient relative to standard 0,0,0
    clone.rotation.set(0, 0, 0);
    clone.updateMatrixWorld(true);

    clone.traverse((child: any) => {
        if (child.isMesh) {
            const geometry = child.geometry as THREE.BufferGeometry;
            if (geometry.attributes.position) {
                const pos = geometry.attributes.position;
                const matrix = child.matrixWorld;
                const index = geometry.index;

                if (index) {
                    for (let i = 0; i < index.count; i += 3) {
                        const vA = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i)).applyMatrix4(matrix);
                        const vB = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i + 1)).applyMatrix4(matrix);
                        const vC = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i + 2)).applyMatrix4(matrix);
                        triangles.push({ v0: vA, v1: vB, v2: vC });
                        points.push(vA, vB, vC);
                    }
                } else {
                    for (let i = 0; i < pos.count; i += 3) {
                        const vA = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrix);
                        const vB = new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(matrix);
                        const vC = new THREE.Vector3().fromBufferAttribute(pos, i + 2).applyMatrix4(matrix);
                        triangles.push({ v0: vA, v1: vB, v2: vC });
                        points.push(vA, vB, vC);
                    }
                }
            }
        }
    });

    if (points.length < 4) {
        // Not enough points to make a hull
        return { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z };
    }

    // Deduplicate points for ConvexHull to run faster
    const uniquePointsMap = new Map<string, THREE.Vector3>();
    for (const p of points) {
        // Round to avoid float precision issues generating duplicate unique keys
        const key = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
        if (!uniquePointsMap.has(key)) {
            uniquePointsMap.set(key, p);
        }
    }
    const uniquePoints = Array.from(uniquePointsMap.values());

    // 2. Compute the Convex Hull
    const hull = new ConvexHull().setFromPoints(uniquePoints);

    // 3. Find candidate faces
    let candidateFaces = [];
    const faces = hull.faces;
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        let edge = face.edge;
        const v0 = edge.vertex.point;
        const v1 = edge.next.vertex.point;
        const v2 = edge.next.next.vertex.point;

        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        const cross = new THREE.Vector3().crossVectors(edge1, edge2);
        const area = 0.5 * cross.length();

        if (area > 0.1) candidateFaces.push({ face, area }); // Only test viable flat planes
    }

    // Sort candidate faces by area and take top 8 to prevent UI freezing on immense 500k poly models
    candidateFaces.sort((a, b) => b.area - a.area);
    const topCandidates = candidateFaces.slice(0, 8);

    // 4. Evaluate each candidate's real-world overhangs and stability
    let bestScore = -Infinity;
    let bestNormal = new THREE.Vector3(0, -1, 0);
    const targetNormal = new THREE.Vector3(0, -1, 0);

    const rotatedV0 = new THREE.Vector3();
    const rotatedV1 = new THREE.Vector3();
    const rotatedV2 = new THREE.Vector3();
    const tEdge1 = new THREE.Vector3();
    const tEdge2 = new THREE.Vector3();
    const tCross = new THREE.Vector3();

    for (const candidate of topCandidates) {
        const normal = candidate.face.normal.clone().normalize();

        // Calculate the rotation needed to point this normal downwards
        const quaternion = new THREE.Quaternion().setFromUnitVectors(normal, targetNormal);

        let minY = Infinity;
        let maxY = -Infinity;
        // Find minY using just unique points for optimization
        for (const p of uniquePoints) {
            const rotatedY = p.clone().applyQuaternion(quaternion).y;
            if (rotatedY < minY) minY = rotatedY;
            if (rotatedY > maxY) maxY = rotatedY;
        }

        let baseArea = 0;
        let overhangArea = 0;

        // Iterate over all actual triangles in the mesh
        for (const tri of triangles) {
            rotatedV0.copy(tri.v0).applyQuaternion(quaternion);
            rotatedV1.copy(tri.v1).applyQuaternion(quaternion);
            rotatedV2.copy(tri.v2).applyQuaternion(quaternion);

            tEdge1.subVectors(rotatedV1, rotatedV0);
            tEdge2.subVectors(rotatedV2, rotatedV0);
            tCross.crossVectors(tEdge1, tEdge2);

            const crossLen = tCross.length();
            if (crossLen < 0.0001) continue;

            const ny = tCross.y / crossLen;

            // If normal is pointing downwards (it casts a shadow downwards)
            if (ny < -0.05) {
                const area = 0.5 * crossLen;
                const lowestY = Math.min(rotatedV0.y, rotatedV1.y, rotatedV2.y);

                // If it's within 1mm of the bottom, it's touching the bed (Base Adhesion)
                if (lowestY <= minY + 1.0) {
                    baseArea += area * (-ny); // Multiply by -ny to get projected horizontal area
                } else {
                    // Otherwise it's an overhang floating in the air
                    overhangArea += area * (-ny);
                }
            }
        }

        const height = maxY - minY;

        // Score algorithm: 
        // Maximize base adhesion. HEAVILY penalize overhang area. Penalize tall height.
        const score = baseArea - (overhangArea * 5.0) - (height * 2.0);

        if (score > bestScore) {
            bestScore = score;
            bestNormal = normal;
        }
    }

    // 5. Calculate the required final rotation
    const finalQuat = new THREE.Quaternion().setFromUnitVectors(bestNormal, targetNormal);
    const euler = new THREE.Euler().setFromQuaternion(finalQuat, 'XYZ');

    return { x: euler.x, y: euler.y, z: euler.z };
}

const RESOLUTION = 2; // 2mm per cell for good precision

/**
 * Calculates a 2D bin-packing arrangement for multiple 3D objects using a Grid-Based Footprint.
 * Projects all geometry triangles down to 2D to allow for nesting inside hollow shapes.
 * 
 * @returns Array of new X and Z coordinates per item ID, and a boolean indicating if it's oversized
 */
export function calculateAutoArrange(
    items: Map<string, THREE.Object3D>,
    gridW: number,
    gridH: number,
    spacing = 10
): { positions: Array<{ id: string, x: number, z: number }>; isOversized: boolean } {

    // 1. Initialize Plate Grid
    const targetCols = Math.ceil(gridW / RESOLUTION);
    const targetRows = Math.ceil(gridH / RESOLUTION);

    // Expand the bounding canvas so we never go out of bounds during spiral search.
    // We will center the final cluster and detect if it exceed physical grid bounds.
    const maxCols = targetCols * 4;
    const maxRows = targetRows * 4;
    const plateGrid = new Uint8Array(maxCols * maxRows);

    // Start searching from the exact center of our massive grid canvas
    const startCol = Math.floor(maxCols / 2);
    const startRow = Math.floor(maxRows / 2);

    const list = Array.from(items.entries()).map(([id, obj]) => {
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj, true);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Needed for exact snapping
        const offsetX = center.x - obj.position.x;
        const offsetZ = center.z - obj.position.z;

        // Build 2D Rasterized Mask
        // Dilate the bounding box by (spacing / 2) to build spacing physically into the mask
        const margin = spacing / 2.0;
        const maskMinX = box.min.x - margin;
        const maskMaxX = box.max.x + margin;
        const maskMinZ = box.min.z - margin;
        const maskMaxZ = box.max.z + margin;

        const cols = Math.ceil((maskMaxX - maskMinX) / RESOLUTION);
        const rows = Math.ceil((maskMaxZ - maskMinZ) / RESOLUTION);
        const mask = new Uint8Array(cols * rows);

        // Rasterize triangles
        obj.traverse((child: any) => {
            if (child.isMesh && child.geometry) {
                const geom = child.geometry;
                const pos = geom.attributes.position;
                if (!pos) return;

                const v0 = new THREE.Vector3();
                const v1 = new THREE.Vector3();
                const v2 = new THREE.Vector3();

                // Build a matrix to convert local -> world
                const m = child.matrixWorld;

                if (geom.index) {
                    const indices = geom.index.array;
                    for (let i = 0; i < indices.length; i += 3) {
                        v0.fromBufferAttribute(pos, indices[i]).applyMatrix4(m);
                        v1.fromBufferAttribute(pos, indices[i + 1]).applyMatrix4(m);
                        v2.fromBufferAttribute(pos, indices[i + 2]).applyMatrix4(m);
                        rasterizeTriangle(v0, v1, v2, mask, cols, rows, maskMinX, maskMinZ, RESOLUTION);
                    }
                } else {
                    for (let i = 0; i < pos.count; i += 3) {
                        v0.fromBufferAttribute(pos, i).applyMatrix4(m);
                        v1.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
                        v2.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
                        rasterizeTriangle(v0, v1, v2, mask, cols, rows, maskMinX, maskMinZ, RESOLUTION);
                    }
                }
            }
        });

        // The mask might be mostly empty if the geometry didn't cover its own bounds.
        // We dilate the mask visually by `spacing / 2` (converted to grid cells) to provide collision buffers.
        // This also flawlessly bridges over any microscopic floating point gaps in collinear thin walls.
        const dilatedMask = dilateMask(mask, cols, rows, Math.ceil(margin / RESOLUTION));

        return {
            id,
            width: size.x,
            depth: size.z,
            offsetX,
            offsetZ,
            mask: dilatedMask,
            maskCols: cols,
            maskRows: rows,
            maskMinX,
            maskMinZ,
            boxMinX: box.min.x,
            boxMinZ: box.min.z
        };
    });

    // Sort Largest First (pack biggest objects near center, then nestle small items in)
    list.sort((a, b) => (b.width * b.depth) - (a.width * a.depth));

    const positions: Array<{ id: string, x: number, z: number }> = [];

    let minGroupCol = Infinity;
    let maxGroupCol = -Infinity;
    let minGroupRow = Infinity;
    let maxGroupRow = -Infinity;

    for (const item of list) {
        let placed = false;

        let foundCol = startCol;
        let foundRow = startRow;

        // Spiral search starting directly from the absolute center
        let x = 0;
        let y = 0;
        let dx = 0;
        let dy = -1;

        // Bounding the search so it does not loop infinitely
        const searchLimit = Math.max(maxCols, maxRows);

        for (let i = 0; i < searchLimit * searchLimit; i++) {

            const searchCol = startCol + x;
            const searchRow = startRow + y;

            if (canPlace(plateGrid, maxCols, maxRows, item.mask, item.maskCols, item.maskRows, searchCol, searchRow)) {
                foundCol = searchCol;
                foundRow = searchRow;
                placed = true;
                break;
            }

            if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
                const tmp = dx;
                dx = -dy;
                dy = tmp;
            }
            x += dx;
            y += dy;
        }

        if (placed) {
            // Write mask into plateGrid
            for (let r = 0; r < item.maskRows; r++) {
                for (let c = 0; c < item.maskCols; c++) {
                    if (item.mask[r * item.maskCols + c] > 0) {
                        const pr = foundRow + r;
                        const pc = foundCol + c;
                        if (pr >= 0 && pr < maxRows && pc >= 0 && pc < maxCols) {
                            plateGrid[pr * maxCols + pc] = 1;
                        }
                    }
                }
            }

            // Calculate Mathematical Final Coordinates
            const newMaskMinX = foundCol * RESOLUTION;
            const newMaskMinZ = foundRow * RESOLUTION;

            const shiftDiffX = newMaskMinX - item.maskMinX;
            const shiftDiffZ = newMaskMinZ - item.maskMinZ;

            const finalBoxMinX = item.boxMinX + shiftDiffX;
            const finalBoxMinZ = item.boxMinZ + shiftDiffZ;

            const newCenterX = finalBoxMinX + item.width / 2;
            const newCenterZ = finalBoxMinZ + item.depth / 2;

            const posX = newCenterX - item.offsetX;
            const posZ = newCenterZ - item.offsetZ;

            positions.push({ id: item.id, x: posX, z: posZ });

            // Track bounding rectangle of the full arrangement for perfect centering
            minGroupCol = Math.min(minGroupCol, foundCol);
            maxGroupCol = Math.max(maxGroupCol, foundCol + item.maskCols);
            minGroupRow = Math.min(minGroupRow, foundRow);
            maxGroupRow = Math.max(maxGroupRow, foundRow + item.maskRows);
        }
    }

    // Now geometrically center the clustered mass directly over (0,0)
    const groupColWidth = maxGroupCol - minGroupCol;
    const groupRowHeight = maxGroupRow - minGroupRow;

    const packedWidth = groupColWidth * RESOLUTION;
    const packedDepth = groupRowHeight * RESOLUTION;

    const currentGroupOriginX = minGroupCol * RESOLUTION;
    const currentGroupOriginZ = minGroupRow * RESOLUTION;

    const centerShiftX = - (currentGroupOriginX + packedWidth / 2);
    const centerShiftZ = - (currentGroupOriginZ + packedDepth / 2);

    for (const pos of positions) {
        pos.x += centerShiftX;
        pos.z += centerShiftZ;
    }

    const isOversized = packedWidth > gridW || packedDepth > gridH;

    return { positions, isOversized };
}

// -----------------------------------------------------------------------------------------
// Helpers: Rasterization & Packing Math
// -----------------------------------------------------------------------------------------

function rasterizeTriangle(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, mask: Uint8Array, maskCols: number, maskRows: number, minX: number, minZ: number, resolution: number) {
    const x0 = Math.floor((p0.x - minX) / resolution);
    const y0 = Math.floor((p0.z - minZ) / resolution);
    const x1 = Math.floor((p1.x - minX) / resolution);
    const y1 = Math.floor((p1.z - minZ) / resolution);
    const x2 = Math.floor((p2.x - minX) / resolution);
    const y2 = Math.floor((p2.z - minZ) / resolution);

    const minGridX = Math.max(0, Math.min(x0, x1, x2));
    const maxGridX = Math.min(maskCols - 1, Math.max(x0, x1, x2));
    const minGridY = Math.max(0, Math.min(y0, y1, y2));
    const maxGridY = Math.min(maskRows - 1, Math.max(y0, y1, y2));

    const edge = (AX: number, AY: number, BX: number, BY: number, CX: number, CY: number) => (CX - AX) * (BY - AY) - (CY - AY) * (BX - AX);

    for (let py = minGridY; py <= maxGridY; py++) {
        for (let px = minGridX; px <= maxGridX; px++) {
            const w0 = edge(x1, y1, x2, y2, px, py);
            const w1 = edge(x2, y2, x0, y0, px, py);
            const w2 = edge(x0, y0, x1, y1, px, py);

            if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
                mask[py * maskCols + px] = 1;
            }
        }
    }
}

function dilateMask(mask: Uint8Array, cols: number, rows: number, dilateAmount: number): Uint8Array {
    if (dilateAmount <= 0) return mask;
    const newMask = new Uint8Array(mask.length);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (mask[r * cols + c]) {
                for (let dr = -dilateAmount; dr <= dilateAmount; dr++) {
                    for (let dc = -dilateAmount; dc <= dilateAmount; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            newMask[nr * cols + nc] = 1;
                        }
                    }
                }
            }
        }
    }
    return newMask;
}

function canPlace(plateGrid: Uint8Array, maxCols: number, maxRows: number, mask: Uint8Array, maskCols: number, maskRows: number, startCol: number, startRow: number): boolean {
    if (startCol < 0 || startRow < 0 || startCol + maskCols > maxCols || startRow + maskRows > maxRows) {
        return false;
    }
    for (let r = 0; r < maskRows; r++) {
        for (let c = 0; c < maskCols; c++) {
            if (mask[r * maskCols + c] > 0) {
                if (plateGrid[(startRow + r) * maxCols + (startCol + c)] > 0) {
                    return false;
                }
            }
        }
    }
    return true;
}
