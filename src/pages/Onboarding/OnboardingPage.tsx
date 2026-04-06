
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { PhaseHealth, PhaseHealthInfo } from "@/components/onboarding/phases/PhaseHealth";
import { PhasePreferences, PhasePreferencesInfo } from "@/components/onboarding/phases/PhasePreferences";
import { PhaseVisuals, PhaseVisualsInfo } from "@/components/onboarding/phases/PhaseVisuals";
import { PhaseWelcome, PhaseWelcomeInfo } from "@/components/onboarding/phases/PhaseWelcome";
import { useConfig } from "@/context/ConfigContext";
import { useNavigation } from "@/context/NavigationContext";
import { useState } from "react";
import { toast } from "sonner";

export function OnboardingPage() {
    const { appConfig, updateConfig } = useConfig();
    const [currentPhase, setCurrentPhase] = useState(1);
    const { setCurrentView } = useNavigation();

    if (!appConfig) return null;

    const totalPhases = 4;

    const handleNext = () => {
        if (currentPhase < totalPhases) {
            setCurrentPhase(prev => prev + 1);
        } else {
            handleFinish();
        }
    };

    const handleBack = () => {
        if (currentPhase > 1) {
            setCurrentPhase(prev => prev - 1);
        }
    };



    const handleSkipAll = () => {
        // Just mark as completed, preserving all current config state
        // This relies on appConfig being the source of truth
        handleFinish();
    };

    const handleFinish = async () => {
        // [Safety Check] - Ensure we don't accidentally wipe settings if config is partial (unlikely due to context)
        if (!appConfig || !appConfig.settings) return;

        const updated = {
            ...appConfig,
            settings: {
                ...appConfig.settings,
                onboardingCompleted: true
            }
        };
        await updateConfig(updated);
        toast.success("Welcome to your library!");
        setCurrentView('models');
    };

    // Render Phase Content
    const renderPhaseContent = () => {
        switch (currentPhase) {
            case 1:
                return (
                    <PhaseWelcome
                        config={appConfig}
                        onUpdateConfig={updateConfig}
                        onNext={handleNext}
                    />
                );
            case 2:
                return (
                    <PhasePreferences
                        config={appConfig}
                        onUpdateConfig={updateConfig}
                        onNext={handleNext}
                    />
                );
            case 3:
                return (
                    <PhaseHealth
                        onNext={handleNext}
                    />
                );
            case 4:
                return (
                    <PhaseVisuals
                        onNext={handleNext}
                    />
                );
            default:
                return null;
        }
    };

    // Render Left Panel Info
    const renderLeftContent = () => {
        switch (currentPhase) {
            case 1:
                return <PhaseWelcomeInfo />;
            case 2:
                return <PhasePreferencesInfo />;
            case 3:
                return <PhaseHealthInfo />;
            case 4:
                return <PhaseVisualsInfo />;
            default:
                return <PhaseWelcomeInfo />; // Fallback
        }
    };

    // Titles
    const titles = [
        "Welcome to 3D Model Muncher",
        "Make it Yours",
        "Keep it Safe",
        "Make it Pretty"
    ];

    const subtitles = [
        "Let's get your library connected and ready for action.",
        "Customize the application to match your workflow.",
        "Secure your data and fix common issues.",
        "Generate thumbnails and organize your collection."
    ];

    return (
        <OnboardingLayout
            currentPhase={currentPhase}
            totalPhases={totalPhases}
            title={titles[currentPhase - 1]}
            subtitle={subtitles[currentPhase - 1]}
            onNext={handleNext}
            onBack={handleBack}
            // Explicitly "Skip Setup" which exits the whole flow
            onSkip={handleSkipAll}
            canNext={currentPhase === 1 ? !!appConfig.settings.modelDirectory : true}
            nextLabel={currentPhase === totalPhases ? "Finish" : "Next"}
            isFinished={currentPhase === totalPhases}
            leftContent={renderLeftContent()}
        >
            {renderPhaseContent()}
        </OnboardingLayout>
    );
}
