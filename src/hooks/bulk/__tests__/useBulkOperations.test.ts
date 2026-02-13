// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Model } from '@/types/model';
import { useBulkOperations } from '@/hooks/bulk/useBulkOperations';

// Mocks
const { mockBulkEditModels } = vi.hoisted(() => ({
    mockBulkEditModels: vi.fn(),
}));

vi.mock('../../mutations/useBulkEditModels', () => ({
    useBulkEditModels: () => ({
        mutateAsync: mockBulkEditModels
    })
}));

vi.mock('../../mutations/useUpdateModel', () => ({
    useUpdateModel: () => ({
        mutateAsync: vi.fn()
    })
}));

// Mock toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    }
}));

describe('useBulkOperations', () => {
    const mockModels: Model[] = [
        { id: '1', name: 'Model 1', filePath: 'path/to/1', collectionId: 'col1' } as any,
        { id: '2', name: 'Model 2', filePath: 'path/to/2', collectionId: 'col1' } as any,
    ];

    const mockForm = {
        editState: {},
        fieldSelection: {},
        uniqueKeyForModel: (m: Model) => m.id,
        isStlModel: () => false,
        setFieldSelection: vi.fn(),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle save with move confirmation', async () => {
        const openMoveConfirmation = vi.fn().mockResolvedValue(true);
        const onClose = vi.fn();

        mockForm.fieldSelection = { collection: true };
        mockForm.editState = { collectionId: 'new-col', collectionAction: 'add' };

        const { result } = renderHook(() => useBulkOperations({
            models: mockModels,
            form: mockForm,
            onClose,
            pendingBulkCollectionId: null,
            openMoveConfirmation
        }));

        await act(async () => {
            await result.current.handleSave();
        });

        expect(openMoveConfirmation).toHaveBeenCalled();
        expect(mockBulkEditModels).toHaveBeenCalledWith({
            ids: ['1', '2'],
            updates: {
                collectionId: 'new-col',
                moveFiles: true
            }
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('should not move files if confirmation denied', async () => {
        const openMoveConfirmation = vi.fn().mockResolvedValue(false);
        mockForm.fieldSelection = { collection: true };
        mockForm.editState = { collectionId: 'new-col', collectionAction: 'add' };

        const { result } = renderHook(() => useBulkOperations({
            models: mockModels,
            form: mockForm,
            onClose: vi.fn(),
            pendingBulkCollectionId: null,
            openMoveConfirmation
        }));

        await act(async () => {
            await result.current.handleSave();
        });

        expect(openMoveConfirmation).toHaveBeenCalled();
        expect(mockBulkEditModels).toHaveBeenCalledWith({
            ids: ['1', '2'],
            updates: {
                collectionId: 'new-col',
                moveFiles: false
            }
        });
    });
});
