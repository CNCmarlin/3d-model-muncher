import React from 'react';
import { Box } from 'lucide-react';

export const ProjectsSidebarButton = ({ onProjectsClick }: { onProjectsClick?: () => void }) => {
    return (
        <div
            className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent cursor-pointer transition-colors text-foreground"
            onClick={() => onProjectsClick && onProjectsClick()}
        >
            <Box className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Project Workspace</span>
        </div>
    );
};
