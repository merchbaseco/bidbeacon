import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import '@fontsource/geist-mono/300.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
import '@fontsource/geist-mono/700.css';
import './global.css';
import { HugeiconsIcon } from '@hugeicons/react';
import LighthouseIcon from '@merchbaseco/icons/core-solid-rounded/LighthouseIcon';
import { Outlet } from 'react-router';
import { MoreMenu } from './components/more-menu';
import { Toaster } from './components/ui/toast';
import { api } from './lib/trpc';
import { createTRPCClient } from './lib/trpc-client';
import { AccountSelector } from './routes/components/account-selector/account-selector';
import { useWebSocket } from './routes/hooks/use-websocket';

export function RootRoute() {
    // Initialize WebSocket connection for real-time events
    useWebSocket();

    return (
        <div className="relative isolate min-h-screen bg-background">
            <div aria-hidden className="background-frame" />

            <div className="relative z-10">
                <header className="border-b border-border">
                    <div className="mx-auto max-w-background-frame-max p-4">
                        <div className="flex items-center justify-between gap-4 md:grid md:grid-cols-3">
                            <div className="hidden md:flex items-center gap-4">
                                <AccountSelector />
                            </div>
                            <div className="flex gap-2 items-center md:justify-center text-neutral-950 dark:text-neutral-50">
                                <HugeiconsIcon icon={LighthouseIcon} size={28} />
                                <p className="font-mono text-xl md:text-2xl font-bold">BidBeacon</p>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                                <div className="md:hidden">
                                    <AccountSelector />
                                </div>
                                <MoreMenu />
                            </div>
                        </div>
                    </div>
                </header>

                <main>
                    <div className="font-mono pb-24">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}

const queryClient = new QueryClient();
const apiClient = api.createClient(createTRPCClient());

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

createRoot(rootElement).render(
    <StrictMode>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <api.Provider client={apiClient} queryClient={queryClient}>
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={router} />
                    <Toaster position="bottom-right" />
                </QueryClientProvider>
            </api.Provider>
        </ThemeProvider>
    </StrictMode>
);
