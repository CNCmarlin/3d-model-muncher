import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, HelpCircle, Layers, ShoppingCart, Zap } from "lucide-react";
import { useState } from "react";

export function BulkEditHelpDialog_DB() {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                    <HelpCircle className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                        <Zap className="h-6 w-6 text-primary" />
                        Bulk Editor Guide
                    </DialogTitle>
                    <DialogDescription>
                        Master the new batch processing capabilities.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 p-6 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* LEFT COL */}
                        <div className="space-y-8">
                            {/* Feature 1: Sticky Selection */}
                            <section className="space-y-3">
                                <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                                    <ShoppingCart className="h-5 w-5" />
                                    Sticky Selection (Shopping Cart)
                                </h3>
                                <p className="text-muted-foreground leading-relaxed text-sm">
                                    Selections now <strong>persist across the app</strong>. Navigate between collections, search, and filter without losing your selected models.
                                    <br /><br />
                                    Build up a "cart" of models from various folders (e.g., 3 from "Sci-Fi", 2 from "Tools") and hit <strong>Bulk Edit</strong> to process them all.
                                </p>
                            </section>

                            {/* Feature 2: Per-Model Staging */}
                            <section className="space-y-3">
                                <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                                    <Layers className="h-5 w-5" />
                                    Per-Model Staging
                                </h3>
                                <p className="text-muted-foreground leading-relaxed text-sm">
                                    Edits are no longer just "global". When you change a field, it is staged only for the <strong>currently selected models</strong> in the Bulk Editor list.
                                </p>
                                <div className="bg-muted/50 p-4 rounded-lg text-xs space-y-2 border">
                                    <p><strong>Example Workflow:</strong></p>
                                    <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                                        <li>Select Model A &rarr; Set Category "Toys"</li>
                                        <li>Deselect A, Select Model B &rarr; Set Category "Tools"</li>
                                        <li>Select A & B &rarr; Add Tag "New"</li>
                                    </ol>
                                </div>
                            </section>
                        </div>

                        {/* RIGHT COL */}
                        <div className="space-y-8">
                            {/* Feature 3: Removing Edits */}
                            <section className="space-y-3">
                                <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                                    <Zap className="h-5 w-5" />
                                    Review & Remove Edits
                                </h3>
                                <p className="text-muted-foreground leading-relaxed text-sm">
                                    The <strong>"Staged Changes"</strong> column shows exactly what will happen to each model.
                                </p>
                                <p className="text-muted-foreground leading-relaxed text-sm">
                                    <strong>Mistake?</strong> Click the colored badges in the grid to remove pending edits:
                                </p>
                                <ul className="list-disc pl-4 space-y-1 text-sm text-muted-foreground">
                                    <li>Click a <span className="text-blue-500 font-medium">Blue Badge</span> (Value Change) to revert that specific field.</li>
                                    <li>Click a <span className="text-green-500 font-medium">Green Badge</span> (Tag Add) to cancel the addition.</li>
                                    <li>Click a <span className="text-red-500 font-medium">Red Badge</span> (Tag Remove) to keep the tag instead.</li>
                                </ul>
                            </section>

                            {/* Feature 4: Global Bar */}
                            <section className="space-y-3">
                                <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                                    <Check className="h-5 w-5" />
                                    Global Bar & Actions
                                </h3>
                                <p className="text-muted-foreground leading-relaxed text-sm">
                                    The <strong>Shopping Cart</strong> indicator in the browse view keeps track of your total selection count.
                                    Use it to quickly <strong>Clear</strong> your selection or jump straight into <strong>Bulk Edit</strong> mode from anywhere.
                                </p>
                            </section>
                        </div>
                    </div>
                </ScrollArea>

                <div className="p-4 border-t bg-muted/20 shrink-0 flex justify-end">
                    <Button onClick={() => setOpen(false)}>Got it</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
