import { Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useGetProjects, useProjectMutations } from '../../hooks/useProjects_db';
import { Project } from '../../types/project';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export function ProjectsList_DB({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
    const { data, isLoading } = useGetProjects();
    const { createProject, deleteProject } = useProjectMutations();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newProjName, setNewProjName] = useState("");
    const [newProjDesc, setNewProjDesc] = useState("");

    const handleCreate = async () => {
        if (!newProjName.trim()) return;
        await createProject.mutateAsync({ name: newProjName, description: newProjDesc });
        setIsCreateOpen(false);
        setNewProjName("");
        setNewProjDesc("");
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground flex items-center justify-center h-full"><div className="animate-pulse">Loading Workspace...</div></div>;

    const projects = data?.projects || [];

    return (
        <div className="flex-1 overflow-auto bg-muted/10 p-6 md:p-8 lg:p-12 h-full">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Project Workspace</h1>
                        <p className="text-muted-foreground mt-1">Plan and manage complex multi-part printing projects.</p>
                    </div>

                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 shadow-sm rounded-full">
                                <Plus className="w-5 h-5" />
                                New Project
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New Project</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Project Name</Label>
                                    <Input
                                        id="name"
                                        autoFocus
                                        placeholder="e.g. Titan Printer Build"
                                        value={newProjName}
                                        onChange={e => setNewProjName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="desc">Description (Optional)</Label>
                                    <Input
                                        id="desc"
                                        placeholder="e.g. ABS parts for Voron build"
                                        value={newProjDesc}
                                        onChange={e => setNewProjDesc(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                                <Button onClick={handleCreate}>Create Workspace</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Grid */}
                {projects.length === 0 ? (
                    <div className="text-center py-20 bg-background rounded-2xl border border-dashed shadow-sm">
                        <Settings2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-xl font-medium">No Projects Yet</h3>
                        <p className="text-muted-foreground mt-2 mb-6">Create a project workspace to organize parts for complex prints.</p>
                        <Button variant="outline" onClick={() => setIsCreateOpen(true)}>Create Your First Project</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((proj: Project) => (
                            <Card
                                key={proj.id}
                                className="group hover:border-primary/50 transition-all cursor-pointer hover:shadow-md h-full flex flex-col"
                                onClick={() => onOpenProject(proj.id)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start gap-4">
                                        <CardTitle className="text-xl tracking-tight leading-tight group-hover:text-primary transition-colors">
                                            {proj.name}
                                        </CardTitle>
                                        <Badge variant={proj.status === 'Completed' ? 'default' : 'secondary'} className="select-none shrink-0 rounded-full">
                                            {proj.status}
                                        </Badge>
                                    </div>
                                    {proj.description && (
                                        <CardDescription className="line-clamp-2 mt-2 leading-relaxed">
                                            {proj.description}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent className="flex-1 pb-4">
                                    <div className="flex gap-4 text-sm mt-2 items-center text-muted-foreground">
                                        <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md border text-xs font-medium">
                                            <span className="text-foreground">{proj._count?.items || 0}</span> items staged
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-md border text-xs font-medium">
                                            <span className="text-foreground">{proj._count?.buildPlates || 0}</span> plates
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-2 pb-4 px-6 border-t bg-muted/10 group-hover:bg-muted/20 transition-colors flex justify-between items-center opacity-0 group-hover:opacity-100">
                                    <span className="text-xs text-muted-foreground font-medium">Click to open workspace</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Delete project "${proj.name}"?`)) deleteProject.mutate(proj.id);
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
