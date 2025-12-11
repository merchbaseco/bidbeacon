import {
    createRootRouteWithContext,
    HeadContent,
    Link,
    Outlet,
    Scripts,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import type { RouterContext } from '../router';

export const Route = createRootRouteWithContext<RouterContext>()({
    component: RootComponent,
    head: () => ({
        meta: [
            { charSet: 'utf-8' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
            { title: 'BidBeacon Dashboard' },
        ],
    }),
});

function RootComponent() {
    return (
        <RootDocument>
            <div className="page">
                <header className="header">
                    <div>
                        <p className="eyebrow">BidBeacon</p>
                        <h1 className="title">Dashboard</h1>
                        <p className="subtitle">
                            Status visibility and controls for report dataset ingestion.
                        </p>
                    </div>
                    <nav className="nav">
                        <Link
                            to="/"
                            activeProps={{ className: 'nav-link active' }}
                            inactiveProps={{ className: 'nav-link' }}
                        >
                            Status
                        </Link>
                    </nav>
                </header>

                <main className="content">
                    <Outlet />
                </main>
            </div>

            <Scripts />
            {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
        </RootDocument>
    );
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
                <style>{globalStyles}</style>
            </head>
            <body>
                <div id="app">{children}</div>
            </body>
        </html>
    );
}

const globalStyles = `
  :root {
    color: #f8fafc;
    background: #0b1221;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.5;
    font-weight: 400;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: radial-gradient(circle at 20% 20%, #122040, #0b1221 50%), #0b1221;
    min-height: 100vh;
  }

  #app {
    min-height: 100vh;
  }

  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 20px 48px;
  }

  .header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
  }

  .eyebrow {
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 12px;
    color: #94a3b8;
    margin: 0 0 6px 0;
  }

  .title {
    margin: 0;
    font-size: 32px;
    color: #e2e8f0;
  }

  .subtitle {
    margin: 6px 0 0 0;
    color: #cbd5e1;
  }

  .nav {
    display: flex;
    gap: 12px;
  }

  .nav-link {
    color: #cbd5e1;
    text-decoration: none;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .nav-link:hover {
    color: #e2e8f0;
    border-color: #1d4ed8;
    background: #0f172a;
  }

  .nav-link.active {
    color: #e2e8f0;
    background: linear-gradient(135deg, #1d4ed8, #22d3ee);
    border-color: transparent;
    font-weight: 600;
  }

  .content {
    margin-top: 28px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
  }

  .card {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(226, 232, 240, 0.08);
    border-radius: 14px;
    padding: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }

  .card h3 {
    margin: 0 0 8px 0;
    color: #e2e8f0;
    font-size: 16px;
  }

  .card .value {
    font-size: 24px;
    font-weight: 700;
    color: #22d3ee;
  }

  .muted {
    color: #94a3b8;
    font-size: 14px;
  }

  .controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 14px;
  }

  .input, select {
    background: #0f172a;
    border: 1px solid rgba(226, 232, 240, 0.15);
    color: #e2e8f0;
    padding: 10px 12px;
    border-radius: 10px;
    min-width: 140px;
  }

  .button {
    background: linear-gradient(135deg, #1d4ed8, #22d3ee);
    color: #e2e8f0;
    border: none;
    padding: 10px 14px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.1s ease, box-shadow 0.1s ease;
  }

  .button.secondary {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(226, 232, 240, 0.1);
    color: #e2e8f0;
  }

  .button:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(34, 211, 238, 0.25);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(226, 232, 240, 0.08);
    border-radius: 14px;
    overflow: hidden;
  }

  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid rgba(226, 232, 240, 0.05);
  }

  th {
    font-size: 13px;
    letter-spacing: 0.01em;
    color: #94a3b8;
    text-transform: uppercase;
  }

  tr:last-child td {
    border-bottom: none;
  }

  .status-pill {
    padding: 6px 10px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 12px;
    text-transform: capitalize;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .status-pill.success { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
  .status-pill.warning { background: rgba(234, 179, 8, 0.15); color: #fcd34d; }
  .status-pill.danger { background: rgba(248, 113, 113, 0.18); color: #fca5a5; }
  .status-pill.info { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }

  .empty {
    text-align: center;
    padding: 32px;
    color: #94a3b8;
  }

  .badge {
    background: rgba(226, 232, 240, 0.1);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
    color: #cbd5e1;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.16);
    color: #e2e8f0;
    font-weight: 500;
  }
`;
