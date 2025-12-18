# BidBeacon Agent Context

Context and tribal knowledge for working with BidBeacon, particularly the AMS worker.

## Architecture

Two services, same Docker image, separate containers:
- **API Server**: Fastify HTTP API (`node dist/index.js`)
- **Worker**: SQS processor for Amazon Marketing Stream (`node dist/worker.js`)

Both share the same PostgreSQL database.

## Key Design Decisions

1. **No raw events table** - Only validated data enters DB. Invalid messages fail validation and get retried by SQS (eventually DLQ).
2. **Separate containers** - Worker crashes don't affect API. Can scale independently.
3. **Idempotency via unique indexes** - `idempotency_id` for metrics, composite keys for campaign management. Retries are harmless.
4. **Canonical SQS shutdown** - Set flag, finish current batch, exit. Visibility timeout handles in-flight messages.
5. **No index re-exports** - Each API endpoint is in its own file. Import directly from individual files (e.g., `@/api/dashboard/status`), never create `index.ts` files that re-export. One file, one API endpoint.
6. **Database-driven UI state** - UI components derive state from database tables (Single Source of Truth). Use a single `{table}:updated` event fired whenever the table changes. Components use optimistic updates for immediate feedback, then refetch on event. On load, components fetch the table; when the table updates, the event invalidates the query to trigger a refetch.
7. **Helper functions at bottom** - When organizing code, place helper functions at the bottom of the file, after the main exports/definitions. This keeps the primary code at the top and implementation details below.
8. **No .js extensions in imports** - Do not use `.js` extensions in import statements. Use `import { x } from '@/utils/logger'` not `import { x } from '@/utils/logger.js'`. The TypeScript compiler and bundler handle module resolution without explicit extensions.

## Important Context

- **SNS envelopes**: Messages arrive wrapped in SNS. Worker parses `Type` field - only `Notification` types contain AMS data.
- **Dataset routing**: Uses `datasetId` prefix (e.g., `sp-traffic`, `ads-campaign-management-campaigns`).
- **AWS region**: Must match queue region. Check queue URL - `sqs.us-east-1.amazonaws.com` means `us-east-1`.
- **Error handling**: Failed messages aren't deleted, so SQS retries. Only delete on success or unknown dataset types.

## Adding New Dataset Handler

1. Zod schema in `schemas.ts` (use `.passthrough()` for tolerance)
2. Handler in `handlers/` (validate → map → upsert)
3. Export from `handlers/index.ts`
4. Route in `router.ts` by `datasetId` prefix
5. Unique index in `schema.ts` for idempotency
6. Migration: `yarn db:generate`

## Adding New Amazon Ads API

When adding a new Amazon Ads API integration (e.g., a new endpoint in `src/amazon-ads/`):

1. Create the API function in `src/amazon-ads/` (e.g., `get-campaigns.ts`)
2. Wrap the API call with `withTracking` from `@/utils/api-tracker`:
   ```typescript
   import { withTracking } from '@/utils/api-tracker';
   
   return withTracking({ apiName: 'getCampaigns', region }, async () => {
     // API call logic here
   });
   ```
3. **Important**: Add the `apiName` to the `SUPPORTED_APIS` array in `src/api/dashboard/api-metrics.ts`:
   ```typescript
   const SUPPORTED_APIS = ['listAdvertiserAccounts', 'createReport', 'retrieveReport', 'getCampaigns'] as const;
   ```
   This ensures the API appears in the dashboard metrics chart even when it has zero invocations.

**Current tracked APIs:**
- `listAdvertiserAccounts` - Lists advertiser accounts for a profile
- `createReport` - Creates an async report request
- `retrieveReport` - Retrieves a completed report

## DLQ Triage Workflow

When messages fail validation, they're retried by SQS and eventually end up in the Dead Letter Queue (DLQ). Use this workflow to triage and fix DLQ issues.

### 1. Check DLQ Status

Monitor DLQ metrics via the CLI or API:
- CLI shows DLQ message count and sparkline
- API endpoint: `GET /api/worker/metrics` → `dlq.approximateVisible`

### 2. Peek at DLQ Messages (Local Script)

Use the local `peek-dlq` script to inspect messages without deleting them:

```bash
# Basic usage - peek at 10 messages
yarn peek-dlq

# Peek at more messages
yarn peek-dlq --limit 50

# Filter by specific dataset
yarn peek-dlq --dataset ads-campaign-management-campaigns
```

**Requirements:**
- `.env` file with `AWS_QUEUE_URL` (or `AMS_QUEUE_URL`) and AWS credentials
- Script automatically loads `.env` and converts ARN to URL if needed
- Messages are peeked (not deleted) - they become visible again after 30 seconds

### 3. Identify Validation Errors

The script groups messages by `dataset_id` and shows payload previews. Common validation issues:

- **Type mismatches**: Field expected as object but received as string (or vice versa)
- **Missing required fields**: Schema expects field but AMS doesn't send it
- **Null values**: Schema expects array/object but receives null
- **Format variations**: AMS sends different formats for the same field

### 4. Fix Schema Issues

Update the schema in `src/worker/schemas.ts`:

1. **Make fields optional** if AMS doesn't always send them:
   ```typescript
   field: z.string().optional()
   ```

2. **Accept multiple formats** using `z.union()`:
   ```typescript
   field: z.union([z.string(), z.object({...})]).optional()
   ```

3. **Allow null values**:
   ```typescript
   field: z.array(z.string()).nullable().optional()
   ```

4. **Use `.passthrough()`** on the schema for tolerance of unknown fields

### 5. Common Patterns

**State fields**: AMS sends `state` as a simple string (e.g., `"PAUSED"`, `"ENABLED"`), not an object:
```typescript
state: z.string().optional()  // ✅ Correct
state: z.object({...}).optional()  // ❌ Too strict
```

**Tags**: Can be array or object depending on AMS version:
```typescript
tags: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional()
```

**Budgets**: Can be object or array:
```typescript
budgets: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional()
```

### 6. Deploy and Verify

1. Deploy the schema fixes
2. Monitor DLQ metrics - message count should decrease
3. Check worker logs for successful processing
4. Re-run `peek-dlq` to verify remaining messages (if any)

### 7. Reprocess DLQ Messages

After fixing schemas, DLQ messages need to be reprocessed:
- Move messages from DLQ back to main queue (via AWS Console or CLI)
- Worker will process them with the updated schemas
- Messages that still fail will go back to DLQ (investigate further)

**Note**: The worker only processes the main queue, not the DLQ. Messages must be moved back to the main queue for reprocessing.

## Deployment

Worker needs `AMS_QUEUE_URL` and AWS credentials. See [INFRA.md](./INFRA.md) for server setup.

---

# Report Datum State Machine

Context and principles for the report datum state machine that determines when reports should be created, processed, or left alone.

## Architecture

The report datum state machine is isolated in `src/lib/report-datum-state-machine/` separate from parsing logic. This separation keeps decision-making logic distinct from execution logic.

## Key Design Decisions

1. **State machine module separation** - Report datum state machine logic is isolated in `src/lib/report-datum-state-machine/` separate from parsing logic. The state machine determines what action to take, while parse-report handles the actual processing.

2. **Timezone handling** - Report timestamps and `lastReportCreatedAt` are stored as timezone-less but represent local time in the country's timezone. All eligibility comparisons happen in local timezone to avoid conversion complexity. When storing `lastReportCreatedAt`, convert UTC now to the country's timezone using `getTimezoneForCountry(countryCode)`.

3. **Eligibility rules** - Reports are eligible for refresh at specific time offsets (T-1, T-3, T-5, T-7, T-14, T-30, T-60 days for daily; T-24, T-72, T-312 hours for hourly) only if no report was already created at that offset. This prevents duplicate report creation while ensuring data freshness.

4. **State machine flow** - Determines next action (process/create/none) based on report existence and status from retrieve API, not just database status. The state machine checks the actual report status via the retrieve API to ensure accuracy.

## State Machine Logic

The state machine follows this flow:

1. If report exists AND status is COMPLETED → 'process'
2. If report exists AND status is NOT COMPLETED → 'none'
3. If no report AND eligible → 'create'
4. If no report AND not eligible → 'none'

---

# BidBeacon Dashboard

Context and tribal knowledge for working with the BidBeacon Dashboard, a TanStack Start application.

## Architecture

The dashboard is a full-stack React application built with:
- **TanStack Start**: Full-stack React framework with SSR, streaming, and file-based routing
- **TanStack Router**: Type-safe routing with built-in data loading
- **React 19**: Latest React with concurrent features
- **Vite**: Build tool and dev server

## Key Design Decisions

1. **File-based routing** - Routes are defined in `src/dashboard/routes/` directory, automatically generating type-safe route trees
2. **Server-side rendering** - All routes are SSR by default for better SEO and initial load performance
3. **API integration** - Dashboard connects to the BidBeacon API server (default: `http://localhost:8080`)
4. **Context-based API URL** - Router context provides `apiBaseUrl` resolved from environment variables or defaults
5. **Component naming convention** - Component files should use kebab-case (e.g., `theme-toggle.tsx`), not PascalCase (e.g., `ThemeToggle.tsx`)

## Important Context

- **Router context**: The router provides `apiBaseUrl` in context, resolved from:
  - `VITE_API_BASE_URL` (client-side env var)
  - `BIDBEACON_API_URL` (server-side env var)
  - Defaults to `http://localhost:8080`
- **Route loaders**: Use `loader` functions in route definitions to fetch data server-side
- **Search params**: Use `validateSearch` with Zod schemas for type-safe URL search parameters
- **Route invalidation**: Use `router.invalidate()` to refetch data after mutations
- **Memoizing dates in React**: When using dates as query parameters or dependencies, always memoize them with `useMemo` to prevent infinite refetch loops. Creating new `Date` objects on every render causes React Query to treat them as new queries, triggering continuous refetches:
  ```typescript
  // ❌ Bad - creates new Date objects on every render
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  const { data } = useQuery({ queryKey: ['metrics', from, to], ... });
  
  // ✅ Good - memoized, stable reference
  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const { data } = useQuery({ queryKey: ['metrics', dateRange.from, dateRange.to], ... });
  ```

## Data Fetching & State Management

### Sync vs Async Pattern

- **Sync APIs**: Caller awaits response, then invalidates React Query directly. No WebSocket events.
- **Async Jobs** (pg-boss): Emit WebSocket events on completion so UI can react to background changes.

**Rule**: Use WebSocket events only for changes the caller didn't initiate (background jobs, worker processes, external triggers). If the caller made the request, they invalidate the query themselves.

**Scope**: Single-tab focus. No multi-tab sync optimization.

## Component Library: coss ui

**coss ui** is a collection of beautifully designed, accessible, and composable components for your React apps. Built on top of [Base UI](https://base-ui.com/) and styled with [Tailwind CSS](https://tailwindcss.com/), it's designed for you to copy, paste, and own.

### Overview

- [Introduction](https://coss.com/ui/docs/index.md)
- [Get Started](https://coss.com/ui/docs/get-started.md)
- [Roadmap](https://coss.com/ui/docs/roadmap.md)

### Components

- [Accordion](https://coss.com/ui/docs/components/accordion.md): A set of collapsible panels with headings.
- [Alert](https://coss.com/ui/docs/components/alert.md): A callout for displaying important information.
- [Alert Dialog](https://coss.com/ui/docs/components/alert-dialog.md): A modal dialog that interrupts the user workflow for critical confirmations.
- [Autocomplete](https://coss.com/ui/docs/components/autocomplete.md): An input that suggests options as you type.
- [Avatar](https://coss.com/ui/docs/components/avatar.md): A visual representation of a user or entity.
- [Badge](https://coss.com/ui/docs/components/badge.md): A small status indicator or label component.
- [Breadcrumb](https://coss.com/ui/docs/components/breadcrumb.md): Displays the path to the current resource using a hierarchy of links.
- [Button](https://coss.com/ui/docs/components/button.md): A button or a component that looks like a button.
- [Card](https://coss.com/ui/docs/components/card.md): A content container for grouping related information.
- [Checkbox](https://coss.com/ui/docs/components/checkbox.md): A binary toggle input for selecting one or multiple options.
- [Checkbox Group](https://coss.com/ui/docs/components/checkbox-group.md): A collection of related checkboxes with group-level control.
- [Collapsible](https://coss.com/ui/docs/components/collapsible.md): A component that toggles visibility of content sections.
- [Combobox](https://coss.com/ui/docs/components/combobox.md): An input combined with a list of predefined items to select.
- [Dialog](https://coss.com/ui/docs/components/dialog.md): A modal overlay for displaying content that requires user interaction.
- [Empty](https://coss.com/ui/docs/components/empty.md): A container for displaying empty state information.
- [Field](https://coss.com/ui/docs/components/field.md): A wrapper component for form inputs with labels and validation.
- [Fieldset](https://coss.com/ui/docs/components/fieldset.md): A group of related form fields with a common label.
- [Form](https://coss.com/ui/docs/components/form.md): A complete form implementation with validation and submission handling.
- [Frame](https://coss.com/ui/docs/components/frame.md): A container component for displaying content in a frame.
- [Group](https://coss.com/ui/docs/components/group.md): A container component for grouping related content with consistent styling.
- [Input](https://coss.com/ui/docs/components/input.md): A native input element.
- [Input Group](https://coss.com/ui/docs/components/input-group.md): A flexible component for grouping inputs with addons, buttons, and other elements.
- [Kbd](https://coss.com/ui/docs/components/kbd.md): A component for displaying keyboard keys and shortcuts.
- [Label](https://coss.com/ui/docs/components/label.md): Renders an accessible label associated with controls.
- [Menu](https://coss.com/ui/docs/components/menu.md): A list of actions or options revealed on demand.
- [Meter](https://coss.com/ui/docs/components/meter.md): A visual representation of a value within a known range.
- [Number Field](https://coss.com/ui/docs/components/number-field.md): A specialized input for numeric values with increment/decrement controls.
- [Pagination](https://coss.com/ui/docs/components/pagination.md): A pagination with page navigation, next and previous links.
- [Popover](https://coss.com/ui/docs/components/popover.md): A floating container that appears near a trigger element.
- [Preview Card](https://coss.com/ui/docs/components/preview-card.md): A rich preview component for displaying linked content.
- [Progress](https://coss.com/ui/docs/components/progress.md): A visual indicator showing the completion status of a task.
- [Radio Group](https://coss.com/ui/docs/components/radio-group.md): A set of mutually exclusive options presented as radio buttons.
- [Scroll Area](https://coss.com/ui/docs/components/scroll-area.md): A container with custom scrollbars for overflow content.
- [Select](https://coss.com/ui/docs/components/select.md): A common form component for choosing a predefined value in a dropdown menu.
- [Separator](https://coss.com/ui/docs/components/separator.md): A visual divider for separating content sections.
- [Sheet](https://coss.com/ui/docs/components/sheet.md): A flyout that opens from the side of the screen, based on the dialog component.
- [Skeleton](https://coss.com/ui/docs/components/skeleton.md): A placeholder for loading content.
- [Slider](https://coss.com/ui/docs/components/slider.md): A draggable control for selecting values from a continuous range.
- [Spinner](https://coss.com/ui/docs/components/spinner.md): An indicator that can be used to show a loading state.
- [Switch](https://coss.com/ui/docs/components/switch.md): A toggle control for binary on/off states.
- [Table](https://coss.com/ui/docs/components/table.md): A structured data display component with rows and columns.
- [Tabs](https://coss.com/ui/docs/components/tabs.md): A navigation component for switching between different views or content panels.
- [Textarea](https://coss.com/ui/docs/components/textarea.md): A multi-line text input for longer content.
- [Toast](https://coss.com/ui/docs/components/toast.md): A temporary notification message that appears and disappears automatically.
- [Toggle](https://coss.com/ui/docs/components/toggle.md): A button that switches between two states.
- [Toggle Group](https://coss.com/ui/docs/components/toggle-group.md): A group of toggle buttons where one or multiple can be selected.
- [Toolbar](https://coss.com/ui/docs/components/toolbar.md): A container for grouping related actions or controls.
- [Tooltip](https://coss.com/ui/docs/components/tooltip.md): A small overlay that provides contextual information on hover or focus.

## Adding New Routes

1. Create a new file in `src/dashboard/routes/` directory (e.g., `src/dashboard/routes/about.tsx`)
2. Use `createFileRoute` to define the route:
   ```typescript
   import { createFileRoute } from '@tanstack/react-router';
   
   export const Route = createFileRoute('/about')({
     component: AboutPage,
   });
   ```
3. The route tree (`src/dashboard/routeTree.gen.ts`) will be automatically generated on next dev server start or build - **do not edit this file manually**
4. Use `loader` for server-side data fetching:
   ```typescript
   export const Route = createFileRoute('/about')({
     loader: async ({ context }) => {
       const data = await fetch(`${context.apiBaseUrl}/api/data`);
       return data.json();
     },
     component: AboutPage,
   });
   ```

## Development

### Running the Dashboard

```bash
# Start dev server (runs on port 4173)
yarn dev:dashboard

# Build for production
yarn build:dashboard

# Preview production build
yarn preview:dashboard
```

### Environment Variables

- `VITE_API_BASE_URL`: API server URL for client-side requests (default: `http://localhost:8080`)
- `BIDBEACON_API_URL`: API server URL for server-side requests (default: `http://localhost:8080`)

### API Integration

The dashboard communicates with the BidBeacon API server:
- Status endpoint: `GET /api/dashboard/status`
- Trigger update: `POST /api/dashboard/trigger-update`
- Reprocess: `POST /api/dashboard/reprocess`

All API requests use the `apiBaseUrl` from router context, which is automatically resolved from environment variables.

## Styling

The dashboard currently uses:
- **Custom global styles**: Defined inline in `src/dashboard/routes/__root.tsx` via a `<style>` tag for consistent theming
- **Tailwind CSS config files**: `tailwind.config.js` and `postcss.config.js` exist but Tailwind CSS is not currently installed in `package.json`
- **coss ui**: Component library built on Base UI and Tailwind CSS (recommended for future components)

**Note**: To use Tailwind CSS or coss ui components, you'll need to:
1. Install Tailwind CSS: `yarn add -D tailwindcss postcss autoprefixer`
2. Create a CSS file that imports Tailwind directives (e.g., `src/dashboard/index.css` with `@tailwind base; @tailwind components; @tailwind utilities;`)
3. Import the CSS file in your root route or entry point

When adding new components, prefer coss ui components when available, as they provide:
- Accessibility built-in
- Consistent design system
- Copy-paste ownership (no external dependencies)
- Tailwind CSS styling

## Deployment

The dashboard builds to static files that can be served by any static hosting service:
- Build output: `dist/dashboard/client/` (client assets)
- Server output: `dist/dashboard/server/` (SSR server)

For production deployment:
1. Build the dashboard: `yarn build:dashboard`
2. Deploy `dist/dashboard/client/` to your static hosting service
3. Deploy `dist/dashboard/server/` to your Node.js server (if using SSR)

