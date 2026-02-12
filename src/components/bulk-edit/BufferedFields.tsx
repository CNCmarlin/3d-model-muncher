import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

interface BufferedFieldProps<T> {
    value: T;
    onApply: (val: T) => void;
    placeholder?: string;
    description?: string; // e.g. "Current: ..."
}

export function BufferedInput({ value, onApply, placeholder, description, type = "text", ...props }: BufferedFieldProps<string | number> & { type?: string } & React.ComponentProps<typeof Input>) {
    const [localValue, setLocalValue] = useState<string | number>(value ?? '');

    // Sync with external value changes (e.g. selection change)
    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const isDirty = localValue !== (value || '');

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Input
                    {...props}
                    value={localValue}
                    onChange={e => setLocalValue(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1"
                    type={type}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && isDirty) {
                            onApply(localValue);
                        }
                    }}
                />
                <Button
                    size="icon"
                    variant={isDirty ? "default" : "ghost"}
                    className={`h-9 w-9 shrink-0 ${isDirty ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-muted-foreground opacity-50'}`}
                    onClick={() => onApply(localValue)}
                    disabled={!isDirty}
                    title="Apply to selected models"
                >
                    <Check className="h-4 w-4" />
                </Button>
            </div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
    );
}

export function BufferedTextarea({ value, onApply, placeholder, description, rows = 3 }: BufferedFieldProps<string> & { rows?: number }) {
    const [localValue, setLocalValue] = useState(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const isDirty = localValue !== (value || '');

    return (
        <div className="space-y-1">
            <div className="flex items-start gap-2">
                <Textarea
                    value={localValue}
                    onChange={e => setLocalValue(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 resize-none"
                    rows={rows}
                />
                <div className="pt-0.5">
                    <Button
                        size="icon"
                        variant={isDirty ? "default" : "ghost"}
                        className={`h-9 w-9 shrink-0 ${isDirty ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-muted-foreground opacity-50'}`}
                        onClick={() => onApply(localValue)}
                        disabled={!isDirty}
                        title="Apply to selected models"
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
    );
}

interface BufferedSelectOption {
    value: string;
    label: string;
}

export function BufferedSelect({ value, onApply, options, placeholder, description }: BufferedFieldProps<string> & { options: BufferedSelectOption[] }) {
    const [localValue, setLocalValue] = useState(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const isDirty = localValue !== (value || '');

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Select value={localValue} onValueChange={setLocalValue}>
                    <SelectTrigger className="flex-1">
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    size="icon"
                    variant={isDirty ? "default" : "ghost"}
                    className={`h-9 w-9 shrink-0 ${isDirty ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-muted-foreground opacity-50'}`}
                    onClick={() => onApply(localValue)}
                    disabled={!isDirty}
                    title="Apply to selected models"
                >
                    <Check className="h-4 w-4" />
                </Button>
            </div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
    );
}

export function BufferedSwitch({ value, onApply, label }: BufferedFieldProps<boolean | undefined> & { label: string }) {
    // We treat undefined as false for display, but distinct for dirty checking
    const [localValue, setLocalValue] = useState(value ?? false);

    useEffect(() => {
        setLocalValue(value ?? false);
    }, [value]);

    // If value is undefined (not staged), any explicit value (even false) is a change/dirty if we consider we want to STAGE it.
    // However, if we just defaulted to false, we don't want it to look dirty immediately.
    // Strategy: user must interact to make it dirty? 
    // Or simpler: If value is undefined, we assume it matches "Original".
    // But we don't know original here.
    // Let's rely on strict equality check, but if value is undefined, localValue (false) is technically "different" if we want to enforce explicit "Unset".
    // Use Case: "Mark as Visible" (false). Current state: Undefined.
    // User wants to click apply. Apply button needs to be enabled.
    // So if value is undefined, we allow apply?

    // Better UX: Always allow apply for Switch if it's acting as a "Setter".
    // Use the `isDirty` mostly for visual cues, but don't disable the button if value is undefined.
    // OR: track if user touched it?

    const isDirty = value === undefined || localValue !== value;

    return (
        <div className="flex items-center gap-2">
            <Switch checked={localValue} onCheckedChange={setLocalValue} />
            <span className="text-sm flex-1">{label}</span>
            <Button
                size="icon"
                variant={isDirty ? "default" : "ghost"}
                className={`h-8 w-8 shrink-0 ${isDirty ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-muted-foreground opacity-50'}`}
                onClick={() => onApply(localValue)}
                // KEY FIX: Always allow applying if value is undefined (mixed/clean), 
                // OR if localValue differs from staged value.
                // We do NOT disable if !isDirty && value === undefined, because user might want to FORCE a value even if it matches default.
                disabled={value !== undefined && !isDirty}
                title="Apply changes"
            >
                <Check className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
