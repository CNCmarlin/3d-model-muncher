
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { ArrowLeft, Check, ChevronRight, SkipForward } from "lucide-react";

interface OnboardingLayoutProps {
    currentPhase: number;
    totalPhases: number;
    title: string;
    subtitle: string;
    onNext: () => void;
    onBack: () => void;
    canNext: boolean;
    nextLabel?: string;
    isFinished?: boolean;
    leftContent: React.ReactNode;
    children: React.ReactNode;
    onSkip?: () => void; // Added for skip functionality
}

export function OnboardingLayout_DB({
    currentPhase,
    totalPhases,
    title,
    subtitle,
    onNext,
    onBack,
    canNext,
    nextLabel = "Next",
    isFinished = false,
    leftContent,
    children,
    onSkip
}: OnboardingLayoutProps) {

    return (
        <div className="fixed inset-0 bg-background flex flex-col xl:flex-row overflow-hidden">
            {/* Left Panel - Hero / Education */}
            {/* Desktop: Sidebar, Mobile: Top Banner */}
            <div className="w-full xl:w-1/3 bg-muted/30 border-b xl:border-b-0 xl:border-r border-border flex flex-col p-4 sm:p-6 xl:p-12 relative shrink-0 max-h-[25vh] xl:max-h-full overflow-y-auto xl:overflow-visible">
                <div className="flex items-center gap-3 mb-2 xl:mb-8">
                    <div className="flex items-center justify-center w-8 h-8 bg-gradient-primary rounded-lg shadow-sm shrink-0">
                        <img src="/images/favicon-32x32.png" alt="Logo" className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-lg tracking-tight truncate">3D Model Muncher</span>
                </div>

                <div className="flex-1 flex flex-col justify-center space-y-2 xl:space-y-6 min-h-0">
                    <div className="space-y-1 xl:space-y-2">
                        <div className="flex items-center gap-2 text-xs xl:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1 xl:mb-2">
                            Page {currentPhase} of {totalPhases}
                        </div>
                        <h1 className="text-xl xl:text-4xl font-bold tracking-tight text-foreground line-clamp-1 xl:line-clamp-none">
                            {title}
                        </h1>
                        <p className="text-sm xl:text-lg text-muted-foreground leading-relaxed line-clamp-2 xl:line-clamp-none">
                            {subtitle}
                        </p>
                    </div>

                    <div className="mt-2 xl:mt-8 hidden xl:block">
                        {leftContent}
                    </div>
                </div>

                {/* Desktop Stepper */}
                <div className="hidden xl:flex gap-2 mt-8 shrink-0">
                    {Array.from({ length: totalPhases }).map((_, idx) => (
                        <div
                            key={idx}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${idx + 1 === currentPhase ? "bg-primary" :
                                idx + 1 < currentPhase ? "bg-primary/40" : "bg-muted-foreground/20"
                                }`}
                        />
                    ))}
                </div>
            </div>

            {/* Right Panel - Interactive Area */}
            <div className="flex-1 flex flex-col min-h-0 bg-background">
                {/* Scrollable Content */}
                <main className="flex-1 overflow-y-auto w-full">
                    <div className="px-4 py-4 sm:p-8 xl:p-12 max-w-3xl mx-auto w-full">
                        {children}
                    </div>
                </main>

                {/* Fixed Footer */}
                <footer className="p-4 sm:p-6 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10 shrink-0">
                    <div className="max-w-3xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-4">

                        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                            <Button
                                variant="ghost"
                                onClick={onBack}
                                disabled={currentPhase === 1}
                                className={cn("shrink-0", currentPhase === 1 && "invisible")}
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>

                            {/* Mobile Stepper in Footer */}
                            <div className="flex xl:hidden gap-1.5 flex-1 justify-center px-4">
                                {Array.from({ length: totalPhases }).map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={`h-1.5 w-full max-w-[40px] rounded-full transition-all duration-300 ${idx + 1 === currentPhase ? "bg-primary" :
                                            idx + 1 < currentPhase ? "bg-primary/40" : "bg-muted-foreground/20"
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>


                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            {onSkip && !isFinished && (
                                <Button
                                    variant="ghost"
                                    onClick={onSkip}
                                    className="text-muted-foreground hover:text-foreground hidden sm:flex shrink-0"
                                >
                                    Skip Onboarding
                                    <SkipForward className="ml-2 h-4 w-4" />
                                </Button>
                            )}

                            {/* Mobile Skip Icon Only */}
                            {onSkip && !isFinished && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onSkip}
                                    className="text-muted-foreground hover:text-foreground sm:hidden shrink-0"
                                    title="Skip Onboarding"
                                >
                                    <SkipForward className="h-4 w-4" />
                                </Button>
                            )}

                            <Button
                                onClick={onNext}
                                disabled={!canNext}
                                variant={isFinished ? "default" : (canNext ? "default" : "secondary")}
                                className="min-w-[100px] sm:min-w-[120px] shrink-0"
                            >
                                {isFinished ? (
                                    <>
                                        Finish <Check className="ml-2 h-4 w-4" />
                                    </>
                                ) : (
                                    <>
                                        {nextLabel} <ChevronRight className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
