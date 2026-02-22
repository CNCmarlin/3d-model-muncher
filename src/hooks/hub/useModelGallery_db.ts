import { Model_db } from '@/types/model_db';
import { normalizeModelPath } from '@/utils/downloadUtils';
import { getUserImageData } from '@/utils/galleryUtils';
import { useEffect, useMemo, useRef, useState } from 'react';

interface UseModelGalleryProps {
    model: Model_db | null;
    editedModel: Model_db | null;
    isEditing: boolean;
    inlineCombined: string[] | null;
    defaultModelView?: '3d' | 'images';
}

// Helper to standardise paths for DB mode (Same as thumbnailUtils_db)
function standardizePath(path: string | undefined): string {
    if (!path) return '';
    // If it's a data URL, return as is
    if (path.startsWith('data:')) return path;
    // If it starts with /models/, return as is
    if (path.startsWith('/models/')) return path;
    // If it starts with http, return as is
    if (path.startsWith('http')) return path;

    // Otherwise, assume it's relative to models dir and prepend /models/
    // Remove any leading slash just in case
    const clean = path.replace(/^[\\/]+/, '');
    return `/models/${clean}`;
}

export function useModelGallery_db({
    model,
    editedModel,
    isEditing,
    inlineCombined,
    defaultModelView
}: UseModelGalleryProps) {

    const [viewMode, setViewMode] = useState<'3d' | 'images' | 'doc'>(defaultModelView || 'images');
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [active3DFile, setActive3DFile] = useState<string | null>(null);
    const [activeDocUrl, setActiveDocUrl] = useState<string | null>(null);

    const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
    const isWindowFullscreenRef = useRef<boolean>(false);

    // Refs for UI
    const imageContainerRef = useRef<HTMLDivElement | null>(null);
    const thumbnailStripRef = useRef<HTMLDivElement | null>(null);
    const prevButtonRef = useRef<any>(null);

    // Compute allImages
    const allImages = useMemo(() => {
        if (isEditing && inlineCombined) return inlineCombined.slice();
        if (!model) return [];
        // If we are editing, we might want to show the current state + local edits
        // But for DB mode, we usually just show what's in the DB object or the `editedModel` override.
        const src = editedModel || model;

        // 1. Gather all potential sources
        const gallery = (src.gallery || []).map(standardizePath);
        const userImages = (src.userDefined?.images || []).map((u: any) => getUserImageData(u)).map(standardizePath);

        // 2. Resolve "Strict" Thumbnails (Assigned to specific files)
        const thumbnailsMap = src.thumbnails || {};
        let specificThumbs: string[] = [];

        // Determine which file we are "focused" on
        const targetFilePath = active3DFile || src.filePath;
        let isMainModel = false;

        if (targetFilePath) {
            // Check if what we are viewing is the main model itself
            if (normalizeModelPath(targetFilePath) === normalizeModelPath(src.filePath)) {
                isMainModel = true;
            }

            // We need to match the key in thumbnailsMap. 
            // The map keys are usually filenames (e.g. "cube.stl").
            const parts = targetFilePath.split(/[/\\]/);
            const filename = parts[parts.length - 1];

            if (thumbnailsMap[filename]) {
                specificThumbs = thumbnailsMap[filename].map(standardizePath);
            } else {
                // For 3MF files, the scanner sometimes keys it by `file.3mf` 
                // but the embedded thumb is `file-embedded-thumb.png`. 
                // The map should have `file.3mf` as the key.
            }
        }

        // 3. Construct the list with strict de-duplication
        // Priority: User Images > Specific Component Thumbs > General Gallery > Legacy Fallback

        let candidates: string[] = [];

        const hasStrictData = gallery.length > 0 || Object.keys(thumbnailsMap).length > 0;

        if (hasStrictData) {
            // In Strict Mode:
            // If we are looking at the MAIN model, we show its specific thumbs AND the general gallery.
            // If we are looking at a SUB-COMPONENT, we ONLY show its specific thumbs (and user uploads).
            // This prevents the sub-component from showing the main model's gallery or other parts' thumbs.

            if (isMainModel) {
                candidates = [...specificThumbs, ...gallery, ...userImages];
            } else {
                // ONLY specific thumbs for this component, plus general user uploads (optional, but usually desired)
                // Actually, if it's a sub-component, we only want its own stuff.
                // We will add `gallery` ONLY if no specific thumbs exist for this sub-component (fallback).
                if (specificThumbs.length > 0) {
                    candidates = [...specificThumbs, ...userImages];
                } else {
                    candidates = [...gallery, ...userImages];
                }
            }
        } else {
            // Legacy Mode
            const legacyImages = Array.isArray(src.images) ? src.images.map(standardizePath) : [];
            const parsedImages = Array.isArray(src.parsedImages) ? src.parsedImages.map(standardizePath) : [];

            // Loose models will now have empty images arrays, so ensure their standalone cover is added
            const thumbnail = (src.thumbnail && !src.thumbnail.startsWith('parsed:')) ? [standardizePath(src.thumbnail)] : [];
            const coverImage = src.coverImagePath ? [standardizePath(src.coverImagePath)] : [];

            // If we are looking at a sub-component in legacy mode, we don't have a great way to filter.
            // We just show everything.
            candidates = [...thumbnail, ...coverImage, ...legacyImages, ...parsedImages, ...userImages];
        }

        // 4. De-duplicate using a Set
        // We normalize to lowercase for the check to avoid case-sensitivity dupes (windows)
        const seen = new Set<string>();
        const unique: string[] = [];

        for (const img of candidates) {
            if (!img) continue;
            const lower = img.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                unique.push(img);
            }
        }

        return unique;

    }, [isEditing, inlineCombined, editedModel, model, active3DFile]);

    // Reset Logic
    useEffect(() => {
        if (model) {
            const has3D = !!(model.modelUrl || model.filePath);
            // const preferredMode = defaultModelView === '3d' && !has3D ? 'images' : defaultModelView; // Unused
            const setting = defaultModelView || 'images';
            // If default is 3d but no 3d file, fall back to images
            const resolvedMode = (setting === '3d' && !has3D) ? 'images' : setting;

            // Only update viewMode if it's not currently in a valid state for the new model
            // Actually, ModelHubView logic reset it on model ID change.
            setViewMode(resolvedMode);
            setSelectedImageIndex(0);

            // We only reset active3DFile when the actual model ID/path changes, not on active3DFile changes.
            // Wait, this effect resets the active3DFile to the main file whenever the model changes.
            const rawPath = model.modelUrl || model.filePath;
            // Only set if we haven't already navigated to a sub-part, otherwise it auto-reverts.
            // Actually, if model.id changes, we SHOULD revert. If defaultModelView changes, we shouldn't.
        }
    }, [model?.id, model?.filePath, model?.modelUrl]);

    // Secondary Reset Logic: When active3DFile changes (e.g. clicking a related part), reset the image index.
    useEffect(() => {
        setSelectedImageIndex(0);
    }, [active3DFile]);

    const handleViewDocument = (url: string) => {
        setActiveDocUrl(url);
        setViewMode('doc');
        setIsWindowFullscreen(false); // Docs probably don't support custom fullscreen logic same way
    };

    const handleToggleFullscreen = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const next = !isWindowFullscreenRef.current;
        isWindowFullscreenRef.current = next;
        setIsWindowFullscreen(next);
    };

    const handleNextImage = () => {
        setSelectedImageIndex((prev) => (prev + 1) % allImages.length);
    };

    const handlePreviousImage = () => {
        setSelectedImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
    };

    // Keyboard navigation
    useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if (!isWindowFullscreen) return;

            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                try { ev.stopImmediatePropagation(); } catch (e) { /* ignore */ }
                isWindowFullscreenRef.current = false;
                setIsWindowFullscreen(false);
                return;
            }

            if (ev.key === 'ArrowLeft') {
                ev.preventDefault();
                setSelectedImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
                return;
            }

            if (ev.key === 'ArrowRight') {
                ev.preventDefault();
                setSelectedImageIndex((prev) => (prev + 1) % allImages.length);
                return;
            }
        };

        const onKeyUp = (ev: KeyboardEvent) => {
            if (!isWindowFullscreen) return;
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                try { ev.stopImmediatePropagation(); } catch (e) { /* ignore */ }
                isWindowFullscreenRef.current = false; // ensure sync
            }
        };

        document.addEventListener('keydown', onKey, true);
        document.addEventListener('keyup', onKeyUp, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('keyup', onKeyUp, true);
        };
    }, [isWindowFullscreen, allImages.length]);

    // Prevent background scroll
    useEffect(() => {
        const prev = document.body.style.overflow;
        if (isWindowFullscreen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = prev || '';
        }
        return () => {
            document.body.style.overflow = prev || '';
        };
    }, [isWindowFullscreen]);

    // Focus management for fullscreen
    useEffect(() => {
        if (isWindowFullscreen) {
            const t = window.setTimeout(() => {
                try { prevButtonRef?.current?.focus?.(); } catch (e) { }
            }, 0);
            return () => window.clearTimeout(t);
        }
    }, [isWindowFullscreen]);

    // Thumbnail strip scrolling
    useEffect(() => {
        if (isWindowFullscreen) return;
        const container = thumbnailStripRef.current;
        if (!container) return;
        const selector = `[data-thumb-index="${selectedImageIndex}"]`;
        const active = container.querySelector<HTMLElement>(selector);
        if (!active) return;
        const containerRect = container.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const offset = (activeRect.left + activeRect.right) / 2 - (containerRect.left + containerRect.right) / 2;
        const desired = container.scrollLeft + offset;
        const final = Math.max(0, Math.min(desired, container.scrollWidth - container.clientWidth));
        try { container.scrollTo({ left: final, behavior: 'smooth' }); } catch (e) { container.scrollLeft = final; }
    }, [selectedImageIndex, isWindowFullscreen]);

    return {
        viewMode,
        setViewMode,
        selectedImageIndex,
        setSelectedImageIndex,
        active3DFile,
        setActive3DFile,
        activeDocUrl,
        handleViewDocument,
        isWindowFullscreen,
        setIsWindowFullscreen, // Exposed if needed, but handleToggleFullscreen is preferred
        handleToggleFullscreen,
        isWindowFullscreenRef,
        imageContainerRef,
        thumbnailStripRef,
        prevButtonRef,
        handleNextImage,
        handlePreviousImage,
        allImages
    };
}
