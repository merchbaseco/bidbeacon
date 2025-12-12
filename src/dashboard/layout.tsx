import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import '@fontsource/aclonica';
import '@fontsource/fira-code';
import './global.css';
import { HugeiconsIcon } from '@hugeicons/react';
import { LighthouseIcon } from '@merchbaseco/icons/core-solid-rounded';
import { Outlet } from 'react-router';
import { ThemeToggle } from './components/theme-toggle';

export function RootRoute() {
    return (
        <div className="relative isolate min-h-screen bg-neutral-50/50 dark:bg-zinc-950">
            <div aria-hidden className="background-frame" />

            <div className="relative z-10">
                <header className="border-b border-border">
                    <div className="mx-auto max-w-background-frame-max p-4">
                        <div className="flex items-center justify-between">
                            <div></div>
                            <div className="flex gap-2 items-center text-neutral-950 dark:text-neutral-50">
                                <HugeiconsIcon icon={LighthouseIcon} size={28} />
                                <p className="font-mono text-2xl font-bold">BidBeacon</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <ThemeToggle />
                            </div>
                        </div>
                    </div>
                </header>

                <main>
                    <div className="mx-auto max-w-background-frame-max p-4 font-mono">
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
                <RouterProvider router={router} />
            </QueryClientProvider>
        </ThemeProvider>
    </StrictMode>
);
