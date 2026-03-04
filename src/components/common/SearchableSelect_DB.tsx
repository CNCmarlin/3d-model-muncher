import { Check, ChevronsUpDown } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/components/ui/utils"

export interface SearchableSelectOption {
    value: string;
    label: string;
    tooltip?: string;
    renderNode?: React.ReactNode;
}

interface SearchableSelectProps {
    options: SearchableSelectOption[];
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
}

export function SearchableSelect_DB({
    options,
    value,
    onValueChange,
    placeholder = "Select an option...",
    emptyText = "No results found.",
    disabled = false,
    className,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false)

    const selectedOption = React.useMemo(
        () => options.find((option) => option.value === value),
        [options, value]
    )

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn("w-full justify-between font-normal", className)}
                >
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className={cn("truncate", !selectedOption?.renderNode && "")}>
                                    {selectedOption ? (selectedOption.renderNode || selectedOption.label) : placeholder}
                                </span>
                            </TooltipTrigger>
                            {selectedOption?.tooltip && (
                                <TooltipContent side="top" align="start">
                                    <p className="max-w-[300px] break-words">{selectedOption.tooltip}</p>
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </TooltipProvider>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto" align="start">
                <Command>
                    <CommandInput placeholder={`Search...`} />
                    <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto">
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label}
                                    onSelect={() => {
                                        onValueChange(option.value)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4 shrink-0",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className={cn("truncate flex-1 text-left cursor-default", option.renderNode && "flex items-center w-full")}>
                                                    {option.renderNode || option.label}
                                                </span>
                                            </TooltipTrigger>
                                            {option.tooltip && (
                                                <TooltipContent side="right" className="z-[200]">
                                                    <p className="max-w-[300px] break-words text-sm">{option.tooltip}</p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </TooltipProvider>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
