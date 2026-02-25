import { Model_db } from '@/types/model_db';
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
        const src = editedModel || model;

        // DB mode: model.images may be ModelImage_db objects, not plain strings
        const toPath = (img: any): string => {
            if (!img) return '';
            if (typeof img === 'string') return img;
            return img.path || img.url || img.src || '';
        };

        // 1. Gather all potential sources
        const gallery = (src.gallery || []).map((g: any) => standardizePath(toPath(g)));
        const userImages = (src.userDefined?.images || []).map((u: any) => getUserImageData(u)).map(standardizePath);

        // 2. Resolve "Strict" Thumbnails (Assigned to specific files)
        const thumbnailsMap = src.thumbnails || {};
        let specificThumbs: string[] = [];

        // Determine which file we are "focused" on
        // IMPORTANT: Use modelUrl (actual 3D file) for thumbnail lookup, NOT filePath (munchie JSON path)
        const targetFilePath = active3DFile || src.modelUrl || src.filePath;

        if (targetFilePath) {
            const parts = targetFilePath.split(/[/\\]/);
            const filename = parts[parts.length - 1];

            if (thumbnailsMap[filename]) {
                specificThumbs = thumbnailsMap[filename].map(standardizePath);
            }
        }

        // 3. Construct the list with strict de-duplication
        let candidates: string[] = [];
        const hasStrictData = gallery.length > 0 || Object.keys(thumbnailsMap).length > 0;

        if (hasStrictData) {
            // Cover image (model's own thumbnail) always comes first
            const coverImage = src.thumbnailPath ? [standardizePath(src.thumbnailPath)] :
                (src.thumbnail && !src.thumbnail.startsWith('parsed:')) ? [standardizePath(src.thumbnail)] : [];
            // Then current file's thumbnails, then shared gallery, then user images
            // De-dup below handles overlaps (e.g. cover image === specific thumb)
            candidates = [...coverImage, ...specificThumbs, ...gallery, ...userImages];

            // Fallback: if strict mode yields nothing, use parsedImages/thumbnail
            if (candidates.length === 0) {
                const parsedImages = Array.isArray(src.parsedImages) ? src.parsedImages.map(standardizePath) : [];
                const thumbnail = (src.thumbnail && !src.thumbnail.startsWith('parsed:')) ? [standardizePath(src.thumbnail)] : [];
                const coverImage = src.thumbnailPath ? [standardizePath(src.thumbnailPath)] : [];
                candidates = [...thumbnail, ...coverImage, ...parsedImages, ...userImages];
            }
        } else {
            // Legacy Mode (also catches DB model.images which are ModelImage_db objects)
            const legacyImages = Array.isArray(src.images) ? src.images.map((img: any) => standardizePath(toPath(img))) : [];
            const parsedImages = Array.isArray(src.parsedImages) ? src.parsedImages.map((p: any) => standardizePath(toPath(p))) : [];

            const thumbnail = (src.thumbnail && !src.thumbnail.startsWith('parsed:')) ? [standardizePath(src.thumbnail)] : [];
            const coverImage = src.thumbnailPath ? [standardizePath(src.thumbnailPath)] : [];

            candidates = [...thumbnail, ...coverImage, ...legacyImages, ...parsedImages, ...userImages];
        }

        // 4. De-duplicate
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
