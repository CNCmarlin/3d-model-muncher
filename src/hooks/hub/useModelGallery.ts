import { Model } from '@/types/model';
import { normalizeModelPath } from '@/utils/downloadUtils';
import { getUserImageData, resolveImageOrderToUrls } from '@/utils/galleryUtils';
import { useEffect, useMemo, useRef, useState } from 'react';

interface UseModelGalleryProps {
    model: Model | null;
    editedModel: Model | null;
    isEditing: boolean;
    inlineCombined: string[] | null;
    defaultModelView?: '3d' | 'images';
}

export function useModelGallery({
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
        const src = editedModel || model;
        if (!src) return [];

        // 2. Fallback to Legacy/Parsed
        const parsedImages = Array.isArray(src.parsedImages) ? src.parsedImages : [];
        const userImages = Array.isArray((src as any).userDefined?.images)
            ? (src as any).userDefined.images.map((u: any) => getUserImageData(u))
            : [];

        const resolved = resolveImageOrderToUrls(src as Model);
        if (resolved && resolved.length > 0) return resolved;

        if (parsedImages.length > 0) {
            return [...parsedImages, ...userImages];
        }

        const legacyImages = Array.isArray(src.images) ? src.images : [];
        const thumbnail = src.thumbnail ? [src.thumbnail] : [];
        return [...thumbnail, ...legacyImages, ...userImages];
    }, [isEditing, inlineCombined, editedModel, model]);

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

            const rawPath = model.modelUrl || model.filePath;
            setActive3DFile(normalizeModelPath(rawPath));
            // setActiveDocUrl(null); // ModelHubView didn't reset doc url? Should probably.
        }
    }, [model?.id, model?.filePath, model?.modelUrl, defaultModelView]);

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
