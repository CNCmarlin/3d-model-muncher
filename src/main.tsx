import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRoot } from "react-dom/client";
import App from "@/App.tsx";
import "./styles/globals.css";

import { queryClient } from '@/api/queryClient';

createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
        <App />
        {/* DevTools only in development - excluded from production builds */}
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
);  