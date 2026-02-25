/**
 * App — Root component.
 *
 * Mounts the config provider, context router (which selects legacy vs DB providers),
 * and the AppContentRouter (which lazy-loads the correct AppContent component).
 *
 * This file should stay minimal. All app logic lives in AppContent_DB or AppContent_Legacy.
 */

import { AppContentRouter } from "@/components/app/AppContentRouter";
import { Toaster } from "@/components/ui/sonner";
import { AppConfigProvider } from "@/context/AppConfigContext";
import { ContextRouter } from "@/context/ContextRouter";
import { TooltipProvider } from "@radix-ui/react-tooltip";

export default function App() {
  return (
    <AppConfigProvider>
      <ContextRouter>
        <TooltipProvider delayDuration={0}>
          <AppContentRouter />
          <Toaster />
        </TooltipProvider>
      </ContextRouter>
    </AppConfigProvider>
  );
}
