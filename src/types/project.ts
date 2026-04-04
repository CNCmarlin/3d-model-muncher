import { Model } from './model';

export type ProjectStatus = 'Planning' | 'Printing' | 'Completed';
export type BuildPlateStatus = 'Draft' | 'Sliced' | 'Processing' | 'Printing' | 'Done';

export interface Project {
    id: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;

    // Virtual loaded fields
    _count?: {
        buildPlates: number;
        items: number;
    };
    buildPlates?: BuildPlate[];
    items?: ProjectItem[];
}

export interface ProjectItem {
    id: string;
    projectId: string;
    modelId: string;
    quantityDesired: number;
    quantityAssigned: number;
    colorHex?: string | null;

    model?: Model;
}

export interface BuildPlate {
    id: string;
    projectId: string;
    name: string;
    status: BuildPlateStatus;
    printerAssigned: string | null;
    materialRequired: string | null;
    order: number;

    // Physical dimensions
    width?: number;
    height?: number;
    customName?: string | null;

    items?: BuildPlateItem[];
}

export interface BuildPlateItem {
    id: string;
    buildPlateId: string;
    projectItemId: string;
    quantity: number;

    positionX: number | null;
    positionY: number | null;
    rotationX: number | null;
    rotationY: number | null;
    rotationZ: number | null;
    colorHex?: string | null;
    createdAt: string;
    updatedAt: string;

    projectItem?: ProjectItem;
}
