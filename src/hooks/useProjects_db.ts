import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BuildPlate, Project } from '../types/project';

// --- QUERIES ---

export function useGetProjects() {
    return useQuery<{ success: boolean; projects: Project[] }, Error>({
        queryKey: ['projects'],
        queryFn: async () => {
            const res = await fetch('/api/projects');
            if (!res.ok) throw new Error('Failed to fetch projects');
            return res.json();
        }
    });
}

export function useGetProjectDetails(projectId: string) {
    return useQuery<{ success: boolean; project: Project }, Error>({
        queryKey: ['projects', projectId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}`);
            if (!res.ok) throw new Error('Failed to fetch project details');
            return res.json();
        },
        enabled: !!projectId
    });
}

// --- MUTATIONS ---

export function useProjectMutations() {
    const queryClient = useQueryClient();

    // 1. Projects
    const createProject = useMutation({
        mutationFn: async (data: { name: string; description?: string }) => {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error('Failed to create project');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            toast.success("Project created");
        },
        onError: (err) => toast.error(`Error: ${err.message}`)
    });

    const deleteProject = useMutation({
        mutationFn: async (projectId: string) => {
            const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete project');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            toast.success("Project deleted");
        },
        onError: (err) => toast.error(`Error: ${err.message}`)
    });

    // 2. Build Plates
    const createBuildPlate = useMutation({
        mutationFn: async ({ projectId, name, width, height, customName }: { projectId: string; name?: string; width?: number; height?: number; customName?: string | null }) => {
            const res = await fetch(`/api/projects/${projectId}/plates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, width, height, customName })
            });
            if (!res.ok) throw new Error('Failed to create build plate');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
            toast.success("Build plate created");
        },
        onError: (err) => toast.error(`Error: ${err.message}`)
    });

    const updateBuildPlate = useMutation({
        mutationFn: async ({ plateId, data }: { plateId: string; data: Partial<BuildPlate> }) => {
            const res = await fetch(`/api/plates/${plateId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error('Failed to update build plate');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] }); // Broad invalidate
            toast.success("Build plate updated");
        }
    });

    const deleteBuildPlate = useMutation({
        mutationFn: async ({ plateId }: { plateId: string; projectId: string }) => {
            const res = await fetch(`/api/plates/${plateId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete build plate');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
            toast.success("Build plate requested deleted");
        },
        onError: (err) => toast.error(err.message)
    });

    // 3. Staging / Assigning
    const stageItems = useMutation({
        mutationFn: async ({ projectId, modelIds, quantityDesired = 1 }: { projectId: string; modelIds: string[]; quantityDesired?: number }) => {
            const res = await fetch(`/api/projects/${projectId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelIds, quantityDesired })
            });
            if (!res.ok) throw new Error('Failed to stage items');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
            toast.success("Parts added to project warehouse");
        },
        onError: (err) => toast.error(err.message)
    });

    const assignToPlate = useMutation({
        mutationFn: async ({ plateId, projectItemId, quantity = 1 }: { plateId: string; projectItemId: string; quantity?: number; projectId: string }) => {
            const res = await fetch(`/api/plates/${plateId}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectItemId, quantity })
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to assign');
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
            toast.success("Part assigned to plate");
        },
        onError: (err) => toast.error(err.message)
    });

    const unassignFromPlate = useMutation({
        mutationFn: async ({ plateItemId }: { plateItemId: string; projectId: string }) => {
            const res = await fetch(`/api/plate-items/${plateItemId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to unassign');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
        }
    });

    const updatePlateItemTransforms = useMutation({
        mutationFn: async ({ plateId, transforms }: { plateId: string; transforms: { id: string; positionX: number; positionY: number; rotationX: number; rotationY: number; rotationZ: number }[], projectId?: string }) => {
            const res = await fetch(`/api/plates/${plateId}/transforms`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transforms })
            });
            if (!res.ok) throw new Error('Failed to update transforms');
            return res.json();
        },
        onSuccess: (_, variables) => {
            if (variables.projectId) {
                // Background update without aggressive toast to not spam the user during dragging
                queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
            }
        }
    });

    // --- Phase 5: Parts List & Colors ---

    const clonePlateItem = useMutation({
        mutationFn: async ({ plateItemId }: { plateItemId: string; projectId: string }) => {
            const res = await fetch(`/api/plate-items/${plateItemId}/clone`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to clone item');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
            toast.success("Item cloned");
        },
        onError: (err) => toast.error(err.message)
    });

    const updatePlateItemColor = useMutation({
        mutationFn: async ({ plateItemId, colorHex }: { plateItemId: string; colorHex: string | null; projectId: string }) => {
            const res = await fetch(`/api/plate-items/${plateItemId}/color`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ colorHex })
            });
            if (!res.ok) throw new Error('Failed to update item color');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
        },
        onError: (err) => toast.error(err.message)
    });

    const updateProjectItemColor = useMutation({
        mutationFn: async ({ projectItemId, colorHex }: { projectItemId: string; colorHex: string | null; projectId: string }) => {
            const res = await fetch(`/api/project-items/${projectItemId}/color`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ colorHex })
            });
            if (!res.ok) throw new Error('Failed to update project item color');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
        },
        onError: (err) => toast.error(err.message)
    });

    const updateProjectItemQuantity = useMutation({
        mutationFn: async ({ projectItemId, quantityDesired }: { projectItemId: string; quantityDesired: number; projectId: string }) => {
            const res = await fetch(`/api/project-items/${projectItemId}/quantity`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantityDesired })
            });
            if (!res.ok) throw new Error('Failed to update quantity');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
        },
        onError: (err) => toast.error(err.message)
    });

    return {
        createProject,
        deleteProject,
        createBuildPlate,
        updateBuildPlate,
        deleteBuildPlate,
        stageItems,
        assignToPlate,
        unassignFromPlate,
        updatePlateItemTransforms,
        clonePlateItem,
        updatePlateItemColor,
        updateProjectItemColor,
        updateProjectItemQuantity
    };
}
