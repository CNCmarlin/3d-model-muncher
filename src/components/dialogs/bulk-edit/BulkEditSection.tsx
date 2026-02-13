import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ReactNode } from 'react';

interface BulkEditSectionProps {
    id: string;
    label: ReactNode;
    icon?: ReactNode;
    checked: boolean;
    onToggle: () => void;
    disabled?: boolean;
    children: ReactNode;
    className?: string;
}

export function BulkEditSection({
    id,
    label,
    icon,
    checked,
    onToggle,
    disabled,
    children,
    className = "space-y-4"
}: BulkEditSectionProps) {
    return (
        <div className={className}>
            <div className="flex items-center space-x-3">
                <Checkbox
                    id={`${id}-field`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={onToggle}
                />
                <Label
                    htmlFor={`${id}-field`}
                    className="font-medium flex items-center gap-2 cursor-pointer select-none"
                >
                    {icon}
                    {label}
                </Label>
            </div>

            {checked && (
                <div className="ml-6 animate-in fade-in slide-in-from-top-1 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
}
