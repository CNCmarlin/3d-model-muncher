import { useCallback, useState } from 'react';

/**
 * Standardized hook for managing dialog open/close state.
 * Returns { isOpen, open, close, toggle, setOpen }
 */
export function useDialog(initialState = false) {
    const [isOpen, setIsOpen] = useState(initialState);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen(prev => !prev), []);

    return {
        isOpen,
        setIsOpen, // Exposed for direct control if needed (e.g. binding to onOpenChange)
        open,
        close,
        toggle
    };
}
