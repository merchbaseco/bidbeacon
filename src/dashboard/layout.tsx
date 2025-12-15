import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import '@fontsource/fira-code';
import './global.css';
import { HugeiconsIcon } from '@hugeicons/react';
import LighthouseIcon from '@merchbaseco/icons/core-solid-rounded/LighthouseIcon';
import { Outlet } from 'react-router';
import { MoreMenu } from './components/more-menu';
import { ThemeToggle } from './components/theme-toggle';
import { ToastProvider } from './components/ui/toast';
import { AccountSelector } from './routes/components/account-selector/account-selector';
import { useWebSocket } from './routes/hooks/use-websocket';

export function RootRoute() {
    // Initialize WebSocket connection for real-time events
    useWebSocket();

    return (
        <div className="relative isolate min-h-screen bg-neutral-50/50 dark:bg-zinc-950">
            <div aria-hidden className="background-frame" />

            <div className="relative z-10">
                <header className="border-b border-border">
                    <div className="mx-auto max-w-background-frame-max p-4">
                        <div className="grid grid-cols-3 items-center">
                            <div className="flex items-center gap-4 justify-start">
                                <AccountSelector />
                            </div>
                            <div className="flex gap-2 items-center justify-center text-neutral-950 dark:text-neutral-50">
                                <HugeiconsIcon icon={LighthouseIcon} size={28} />
                                <p className="font-mono text-2xl font-bold">BidBeacon</p>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                                <MoreMenu />
                                <ThemeToggle />
                            </div>
                        </div>
                    </div>
                </header>

                <main>
                    <div className="mx-auto max-w-background-frame-max p-4 pt-2 font-mono pb-24">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}

const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

createRoot(rootElement).render(
    <StrictMode>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <QueryClientProvider client={queryClient}>
                <ToastProvider position="bottom-center">
                    <RouterProvider router={router} />
                </ToastProvider>
            </QueryClientProvider>
        </ThemeProvider>
    </StrictMode>
);
