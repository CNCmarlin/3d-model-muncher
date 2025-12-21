// src/components/FilterSidebar.tsx
import { useState, useRef, useEffect } from "react";
import { Search, Filter, Layers, X, Settings, FileText, Eye, CircleCheckBig, FileBox, Tag, ChevronRight, ChevronDown, LayoutGrid } from "lucide-react";
import * as LucideIcons from 'lucide-react';
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { LICENSES } from '../constants/licenses';
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Category } from "../types/category";
import { Model } from "../types/model";
import { ScrollArea } from "./ui/scroll-area";
import { Collection } from "../types/collection";

interface FilterSidebarProps {
  onFilterChange: (filters: {
    search: string;
    category: string;
    printStatus: string;
    license: string;
    fileType: string;
    tags: string[];
    showHidden: boolean;
    showMissingImages: boolean;
    sortBy?: string;
  }) => void;
  onCategoryChosen?: (categoryLabel: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onSettingsClick: () => void;
  categories: Category[];
  models: Model[];
  collections: Collection[];
  onOpenCollection: (col: Collection) => void;
  onBackToRoot?: () => void;
  initialFilters?: {
    search: string;
    category: string;
    printStatus: string;
    license: string;
    fileType: string;
    tags: string[];
    showHidden: boolean;
    showMissingImages: boolean;
    sortBy?: string;
  };
}

const normalizeIconName = (input?: string) => {
  if (!input) return '';
  const cleaned = input.trim().replace(/\.(svg|js|tsx?)$/i, '').replace(/[^a-z0-9-_ ]/gi, '');
  if (!cleaned) return '';
  const parts = cleaned.split(/[-_\s]+/).filter(Boolean);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
};

// --- Collection Tree Helpers ---
interface CollectionNode {
  id: string;
  label: string;
  fullPath: string; 
  children: CollectionNode[];
}

const buildCollectionTree = (collections: Collection[]): CollectionNode[] => {
  if (!collections || !Array.isArray(collections)) {
    return [];
  }

  const nodeMap = new Map<string, CollectionNode>();
  const rootNodes: CollectionNode[] = [];

  collections.forEach(col => {
    if (!col || !col.id) return;
    nodeMap.set(col.id, { 
      id: col.id, 
      label: col.name || 'Unnamed', 
      fullPath: col.name || 'Unnamed', 
      children: [] 
    });
  });

  collections.forEach(col => {
    if (!col || !col.id) return;
    const node = nodeMap.get(col.id);
    if (!node) return;

    if (col.parentId && nodeMap.has(col.parentId)) {
      const parent = nodeMap.get(col.parentId);
      if (parent && parent.id !== node.id) {
        parent.children.push(node);
        node.fullPath = `${parent.fullPath} / ${node.label}`;
      } else {
        rootNodes.push(node);
      }
    } else {
      rootNodes.push(node);
    }
  });

  const sortNodes = (nodes: CollectionNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(rootNodes);

  return rootNodes;
};

// Recursive Collection Item
const CollectionTreeItem = ({ node, level, onSelect }: { 
  node: CollectionNode, 
  level: number, 
  onSelect: (id: string) => void 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div className="w-full select-none">
      <div 
        className={`flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent cursor-pointer ${level > 0 ? 'ml-3 border-l border-border/50' : ''}`}
        onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id); 
        }}
      >
        {/* Toggle Expansion Only */}
        {hasChildren ? (
          <span 
            className="p-0.5 hover:bg-muted rounded cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
          >
            {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </span>
        ) : <span className="w-4" />} 
        
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm truncate flex-1">{node.label}</span>
      </div>
      
      {isOpen && hasChildren && (
        <div className="mt-1">
          {node.children.map((child) => (
            <CollectionTreeItem 
              key={child.id} 
              node={child} 
              level={level + 1} 
              onSelect={onSelect} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function FilterSidebar({
  onFilterChange,
  onCategoryChosen,
  isOpen,
  onClose,
  onSettingsClick,
  categories,
  models,
  collections = [],
  onOpenCollection,
  onBackToRoot,
  initialFilters
}: FilterSidebarProps) {
  const TAG_DISPLAY_LIMIT = 25;
  
  const normalizeCategoryToLabel = (raw?: string | null) => {
    if (!raw) return 'all';
    if (raw === 'all') return 'all';
    const byId = categories.find(c => c.id === raw);
    if (byId) return byId.label;
    const byLabel = categories.find(c => c.label === raw);
    if (byLabel) return byLabel.label;
    return raw;
  };

  const [searchTerm, setSearchTerm] = useState(initialFilters?.search ?? "");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen && searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [isOpen]);

  const [selectedCategory, setSelectedCategory] = useState(normalizeCategoryToLabel(initialFilters?.category ?? "all"));
  const [selectedPrintStatus, setSelectedPrintStatus] = useState(initialFilters?.printStatus ?? "all");
  const [selectedLicense, setSelectedLicense] = useState(initialFilters?.license ?? "all");
  const [selectedFileType, setSelectedFileType] = useState(initialFilters?.fileType ?? "all");
  const [selectedTags, setSelectedTags] = useState<string[]>(initialFilters?.tags ?? []);
  const [showHidden, setShowHidden] = useState(initialFilters?.showHidden ?? false);
  const [showMissingImages, setShowMissingImages] = useState(initialFilters?.showMissingImages ?? false);
  const [selectedSort, setSelectedSort] = useState<string>(initialFilters?.sortBy ?? 'none');
  const [showAllTags, setShowAllTags] = useState(false);

  const getAllTags = (): string[] => {
    const tagSet = new Set<string>();
    if (!models) return [];
    models.forEach(model => {
      if (!model || !Array.isArray(model.tags)) return;
      model.tags.forEach(tag => {
        if (tag && typeof tag === 'string') tagSet.add(tag);
      });
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  };

  const availableTags = getAllTags();
  const displayedTags = showAllTags ? availableTags : availableTags.slice(0, TAG_DISPLAY_LIMIT);
  const remainingTagCount = Math.max(availableTags.length - TAG_DISPLAY_LIMIT, 0);
  const availableLicenses = LICENSES;

  const updateFilters = (overrides: any) => {
    const newState = {
      search: searchTerm,
      category: selectedCategory,
      printStatus: selectedPrintStatus,
      license: selectedLicense,
      fileType: selectedFileType,
      tags: selectedTags,
      showHidden: showHidden,
      showMissingImages: showMissingImages,
      sortBy: selectedSort,
      ...overrides
    };
    onFilterChange(newState);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    updateFilters({ search: value });
  };

  const handleCategoryChange = (value: string) => {
    const cat = categories.find(c => c.id === value) || categories.find(c => c.label === value);
    const labelToUse = cat ? cat.label : value;
    setSelectedCategory(labelToUse);
    updateFilters({ category: labelToUse });
    onCategoryChosen?.(labelToUse);
  };

  const handlePrintStatusChange = (value: string) => {
    setSelectedPrintStatus(value);
    updateFilters({ printStatus: value });
  };

  const handleLicenseChange = (value: string) => {
    setSelectedLicense(value);
    updateFilters({ license: value });
  };

  const handleFileTypeChange = (value: string) => {
    setSelectedFileType(value);
    updateFilters({ fileType: value });
  };

  const handleSortChange = (value: string) => {
    setSelectedSort(value);
    updateFilters({ sortBy: value });
  };

  const handleTagToggle = (tag: string) => {
    const newSelectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newSelectedTags);
    updateFilters({ tags: newSelectedTags });
  };

  const handleShowHiddenChange = (checked: boolean) => {
    setShowHidden(checked);
    updateFilters({ showHidden: checked });
  };

  const handleShowMissingImagesChange = (checked: boolean) => {
    setShowMissingImages(checked);
    updateFilters({ showMissingImages: checked });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCategory("all");
    setSelectedPrintStatus("all");
    setSelectedLicense("all");
    setSelectedFileType("all");
    setSelectedTags([]);
    setShowHidden(false);
    setShowMissingImages(false);
    setSelectedSort('none');
    setShowAllTags(false);
    
    updateFilters({
      search: "",
      category: "all",
      printStatus: "all",
      license: "all",
      fileType: "all",
      tags: [],
      showHidden: false,
      showMissingImages: false,
      sortBy: 'none',
    });
  };

  const handleGoHome = () => {
    clearFilters(); 
    if (onBackToRoot) onBackToRoot(); // Navigate to root
  };

  const collectionTree = buildCollectionTree(collections);

  return (
    <div className="h-full bg-sidebar flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border shrink-0 bg-gradient-primary">
        {isOpen ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 shadow-lg">
                <img src="/images/favicon-32x32.png" alt="3D Model Muncher" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-lg tracking-tight cursor-pointer hover:underline" onClick={() => window.location.pathname = "/"}>
                  3D Model Muncher
                </h2>
                <p className="text-xs text-white/80 font-medium">Organize & Print</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onSettingsClick} className="p-2 text-white hover:bg-white/20 hover:backdrop-blur-sm border-0">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose} className="p-2 text-white hover:bg-white/20 hover:backdrop-blur-sm border-0 lg:hidden">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="flex items-center justify-center w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg border border-white/30">
              <img src="/images/favicon-16x16.png" alt="3D Model Muncher" />
            </div>
            <Button variant="ghost" size="sm" onClick={onSettingsClick} className="p-2 text-white hover:bg-white/20 hover:backdrop-blur-sm border-0">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isOpen && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="h-full p-4 space-y-4">

            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search models..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      handleSearchChange('');
                      if (searchInputRef.current) searchInputRef.current.focus();
                    }
                  }}
                  className="pl-10 pr-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {searchTerm && searchTerm.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleSearchChange("");
                      if (searchInputRef.current) searchInputRef.current.focus();
                    }}
                    className="absolute right-2 top-2 p-1 h-6 w-6 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* "All Models" (Home Button) */}
            <div className="space-y-2">
              <div 
                className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent cursor-pointer transition-colors text-foreground"
                onClick={handleGoHome} 
              >
                  <LayoutGrid className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">All Models</span>
              </div>
            </div>

            {/* Collections Accordion */}
            <Accordion type="multiple" defaultValue={[]} className="w-full">
              <AccordionItem value="collections" className="border-b-0">
                <AccordionTrigger className="py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-foreground" />
                    <span className="text-sm font-medium text-foreground">Collections</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pl-1">
                    {collectionTree.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-2">No collections found</div>
                    ) : (
                      collectionTree.map(node => (
                        <CollectionTreeItem 
                          key={node.id} 
                          node={node} 
                          level={0} 
                          onSelect={(id) => {
                            clearFilters(); // Clear search/tags when entering a collection
                            const original = collections?.find(c => c.id === id);
                            if (original) onOpenCollection(original);
                          }}
                        />
                      ))
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Categories (Collapsible) */}
            <Collapsible className="space-y-2">
              <CollapsibleTrigger className="flex items-center w-full gap-2 group cursor-pointer text-foreground hover:text-primary transition-colors py-2">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium flex-1 text-left">Categories</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
              </CollapsibleTrigger>
              
              <CollapsibleContent className="space-y-1 pt-1">
                <Button
                  variant={selectedCategory === "all" ? "default" : "ghost"}
                  onClick={() => handleCategoryChange("all")}
                  className={`w-full justify-start h-10 px-3 ${
                    selectedCategory === "all" 
                      ? "text-primary-foreground hover:text-primary-foreground" 
                      : "text-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <Filter className="h-4 w-4 mr-3" />
                  <span>All Categories</span>
                </Button>
  
                {categories.map((category) => {
                  const iconKey = normalizeIconName(category.icon);
                  const Icon = (LucideIcons as any)[iconKey] as React.ComponentType<any> || (LucideIcons as any)['Folder'];
                  return (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.label ? "default" : "ghost"}
                      onClick={() => handleCategoryChange(category.label)}
                      className={`w-full justify-start h-10 px-3 ${
                        selectedCategory === category.label 
                          ? "text-primary-foreground hover:text-primary-foreground" 
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 mr-3" />
                      <span>{category.label}</span>
                    </Button>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>

            {/* Print Status */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CircleCheckBig className="h-4 w-4 text-foreground" />
                <label className="text-sm font-medium text-foreground">Print Status</label>
              </div>
              <Select value={selectedPrintStatus} onValueChange={handlePrintStatusChange}>
                <SelectTrigger className="bg-background border-border text-foreground focus:ring-2 focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="printed">Printed</SelectItem>
                  <SelectItem value="not-printed">Not Printed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileBox className="h-4 w-4 text-foreground" />
                <label className="text-sm font-medium text-foreground">Type</label>
              </div>
              <Select value={selectedFileType} onValueChange={handleFileTypeChange}>
                <SelectTrigger className="bg-background border-border text-foreground focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="3mf">3MF</SelectItem>
                  <SelectItem value="stl">STL</SelectItem>
                  <SelectItem value="collections">Collections</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <LucideIcons.SortAsc className="h-4 w-4 text-foreground" />
                <label className="text-sm font-medium text-foreground">Sort By</label>
              </div>
              <Select value={selectedSort} onValueChange={handleSortChange}>
                <SelectTrigger className="bg-background border-border text-foreground focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="modified_desc">Recently modified (newest)</SelectItem>
                  <SelectItem value="modified_asc">Modified (oldest)</SelectItem>
                  <SelectItem value="name_asc">Name A → Z</SelectItem>
                  <SelectItem value="name_desc">Name Z → A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* License Filter */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-foreground" />
                <label className="text-sm font-medium text-foreground">License</label>
              </div>
              <Select value={selectedLicense} onValueChange={handleLicenseChange}>
                <SelectTrigger className="bg-background border-border text-foreground focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="All Licenses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Licenses</SelectItem>
                  {availableLicenses.map((license) => (
                    <SelectItem key={license} value={license}>
                      {license}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Show Hidden Models */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-foreground" />
                  <label className="text-sm font-medium text-foreground">Show Hidden</label>
                </div>
                <Switch
                  checked={showHidden}
                  onCheckedChange={handleShowHiddenChange}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>

            {/* Show Missing Images */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LucideIcons.ImageOff className="h-4 w-4 text-foreground" />
                  <label className="text-sm font-medium text-foreground">Show Missing Images</label>
                </div>
                <Switch
                  checked={showMissingImages}
                  onCheckedChange={handleShowMissingImagesChange}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-foreground" />
                <label className="text-sm font-medium text-foreground">Tags</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {displayedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "secondary"}
                    className="cursor-pointer text-xs hover:bg-primary/90 transition-colors"
                    onClick={() => handleTagToggle(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              {remainingTagCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllTags((prev) => !prev)}
                  className="px-2 h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showAllTags ? "Show fewer tags" : `Show ${remainingTagCount} more`}
                </Button>
              )}
              {selectedTags.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''} selected
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedTags.map((tag) => (
                      <Badge
                        key={`selected-${tag}`}
                        variant="default"
                        className="text-xs cursor-pointer hover:bg-primary/80"
                        onClick={() => handleTagToggle(tag)}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      )}
      {isOpen && (
        <div className="p-4 border-t border-sidebar-border bg-sidebar shrink-0">
          <Button 
            variant="outline" 
            onClick={clearFilters}
            className="w-full bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary transition-colors"
          >
            Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
}