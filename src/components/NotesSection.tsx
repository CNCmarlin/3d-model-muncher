import { useState, useEffect } from 'react';
import { StickyNote, Plus, Send, History, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Model } from "@/types/model";

interface NotesSectionProps {
  currentModel: Model;
  onSave: (notes: string) => void;
}

export const NotesSection = ({ currentModel, onSave }: NotesSectionProps) => {
  const [newEntry, setNewEntry] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // Helper to get current entries as an array
  const getLogEntries = () => {
    return currentModel.notes 
      ? currentModel.notes.split('\n---\n').filter(entry => entry.trim() !== "") 
      : [];
  };

  const handleAddEntry = () => {
    if (!newEntry.trim()) return;
    const timestamp = new Date().toLocaleString();
    const formattedEntry = `[${timestamp}]\n${newEntry}`;
    const entries = getLogEntries();
    
    // Add to the list and save
    onSave([...entries, formattedEntry].join('\n---\n'));
    setNewEntry("");
  };

  const handleStartEdit = (index: number, content: string) => {
    setEditingIndex(index);
    setEditValue(content);
  };

  const handleSaveEdit = (index: number) => {
    const entries = getLogEntries();
    entries[index] = editValue;
    onSave(entries.join('\n---\n'));
    setEditingIndex(null);
  };

  const handleDeleteEntry = (index: number) => {
    if (window.confirm("Delete this note?")) {
      const entries = getLogEntries();
      const updated = entries.filter((_, i) => i !== index);
      onSave(updated.join('\n---\n'));
    }
  };

  const handleClearLog = () => {
    if (window.confirm("Are you sure you want to delete the entire notes history?")) {
      onSave("");
    }
  };

  const logEntries = getLogEntries();

  return (
    <div className="space-y-6">
      {/* 1. THE LOG FEED */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-muted-foreground/60">
            <History className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Notes History</span>
          </div>
          {logEntries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearLog} className="h-5 px-2 text-[9px] text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3 mr-1" /> Delete Notes History
            </Button>
          )}
        </div>

        {logEntries.length > 0 ? (
          <div className="space-y-3">
            {logEntries.map((entry, index) => (
              <div 
                key={index} 
                className="relative group p-4 rounded-lg border border-border/40 bg-card/20 backdrop-blur-sm font-mono text-sm leading-relaxed transition-all hover:border-primary/30"
              >
                {/* Visual Indicator Line */}
                <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-primary/20 group-hover:bg-primary/50 transition-colors" />
                
                {editingIndex === index ? (
                  <div className="space-y-2">
                    <Textarea 
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="min-h-[80px] w-full bg-background/50 border-none p-0 focus-visible:ring-0 text-sm font-mono"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingIndex(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="default" className="h-6 w-6" onClick={() => handleSaveEdit(index)}>
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Action Hover Buttons */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary"
                        onClick={() => handleStartEdit(index, entry)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteEntry(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-foreground/80 whitespace-pre-wrap pr-12">
                      {entry}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center border border-dashed rounded-xl bg-muted/5">
             <p className="text-xs font-mono text-muted-foreground/40 italic"> Awaiting first entry...</p>
          </div>
        )}
      </div>

      {/* 2. THE PERMANENT "NEW ENTRY" BOX */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm focus-within:border-primary/40 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/20">
            <Plus className="h-3 w-3 text-primary" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">
            New entry
          </span>
        </div>

        <Textarea
          value={newEntry}
          onChange={(e) => setNewEntry(e.target.value)}
          placeholder="What did you do today? (e.g. Changed nozzle, adjusted Z-offset...)"
          className="min-h-[100px] w-full resize-none border-none bg-transparent p-0 font-mono text-sm leading-relaxed focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              handleAddEntry();
            }
          }}
        />

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-primary/10">
          <span className="text-[11px] text-muted-foreground/40 font-mono italic uppercase">
            Ctrl + Enter to Save
          </span>
          <Button 
            size="sm" 
            onClick={handleAddEntry}
            disabled={!newEntry.trim()}
            className="h-7 gap-2 px-3 text-[10px] font-bold uppercase shadow-lg shadow-primary/10"
          >
            <Send className="h-3 w-3" />
            Add Entry
          </Button>
        </div>
      </div>
    </div>
  );
};