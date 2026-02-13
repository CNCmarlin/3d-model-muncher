import { ReactNode } from "react";
import { cn } from "@/components/ui/utils";

interface ViewLayoutProps {
    title?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    sidebar?: ReactNode;
    className?: string;
}

/**
 * Standardized layout for main views (Models, Collections, Settings).
 * Provides consistent spacing, header styling, and sidebar positioning.
 */
export function ViewLayout({
    title,
    actions,
    children,
    sidebar,
    className
}: ViewLayoutProps) {
    return (
        <div className={cn("h-full flex flex-col", className)}>
            {/* Header Section */}
            {(title || actions) && (
                <div className="p-4 lg:p-6 border-b shrink-0 flex justify-between items-center bg-background z-10 gap-4">
                    {typeof title === 'string' ? <h2 className="text-lg font-semibold">{title}</h2> : <div className="flex-1">{title}</div>}
                    <div className="flex items-center gap-2">
                        {actions}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex relative">
                <div className="flex-1 overflow-auto p-4 lg:p-6">
                    {children}
                </div>

                {/* Optional Sidebar (e.g., Bulk Edit, Details) */}
                {sidebar}
            </div>
        </div>
    );
}
