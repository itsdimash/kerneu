# Kerneu Group — Frontend

> This is the **FRONTEND** repository. The backend lives in a separate
> repository (`ERP_Bakend`).

Frontend for Kerneu Group's ERP system: project management, commercial
proposals, contracts, procurement, and warehouse tracking. A single-page
React application with role-based access (admin, commercial director,
PM, accountant, warehouse) that talks to the backend over relative
`/api/v1/...` requests — proxied by the Vite dev server locally, and
expected to be routed by Nginx (or an equivalent reverse proxy) in
production.

## Tech stack

- **React** 18 + **TypeScript** (strict mode, target `ES2020`)
- **Vite** 6 — build tool and dev server
- **Tailwind CSS** 4 (`@tailwindcss/vite`)
- **Radix UI** + **MUI** — UI component primitives
- **React Router** 7
- **Axios** — HTTP client
- **Recharts** — dashboard charts
- **React Hook Form**, **date-fns**, **lucide-react**, and other supporting libraries
- **pnpm** — package manager (`pnpm-workspace.yaml`, `pnpm.overrides` in `package.json`)

## Project structure

```
src/
  app/
    App.tsx              # root component: auth state, page/role routing
    components/
      layout/             # AppShell, Sidebar, TopBar, ProjectHeader
      screens/            # UploadCenter
      modals/              # InvoiceDetailModal, ShipmentModal
      common/              # reusable widgets (StatCard, Chip, ...)
      ui/                  # base UI primitives (shadcn/Radix wrappers)
      figma/                # helper components carried over from the Figma export
    context/               # BackgroundJobsContext
    theme/                  # ThemeProvider
  pages/                   # application pages (see below)
  store/                   # documentsStore.ts — client-side project documents state
  api/                     # api.ts (axios client + requests), user.ts, notifications.ts
  data/                    # static/seed data (roles, projects, invoices, stock, kpItems, notifications)
  types/                   # shared TypeScript types (Role, Page, ...)
  lib/                     # formatting utilities
  assets/                  # images
```

## Getting started locally

Clone the repository:

```bash
git clone <repo-url>
cd kerneu
```

Install dependencies:

```bash
pnpm install
```

Start the dev server (runs on Vite's default port, `http://localhost:5173`;
requests to `/api` are proxied to a backend expected at
`http://localhost:8000`, so the backend must be running locally for API
calls to work):

```bash
pnpm dev
```

## Production build

```bash
pnpm run build
```

The build output is written to `dist/`. Both `dist/` and `.vite/` are
listed in `.gitignore` as build artifacts and should not be committed.

## Roles and access

Roles are defined in `src/types/index.ts` (`Role`): `admin`,
`commercial_director`, `pm`, `accountant`, `warehouse`. The actual role
comes from the backend (`GET /auth/me`). For `admin` users, `AppShell`
exposes a "role for testing" switch that lets them preview the UI as any
other role without switching accounts — the backend still enforces
permissions based on the real role stored in the session cookie,
regardless of what is selected in this switch.

Which nav items are visible depends on role, defined in
`src/app/components/layout/Sidebar.tsx` (the `NAV` array, `roles` field):

| Page | Available to roles |
|---|---|
| Dashboard | commercial_director, pm |
| Projects | commercial_director, pm |
| Contract | commercial_director, pm, accountant |
| Procurement | commercial_director, pm, accountant |
| Warehouse | commercial_director, pm, warehouse |
| Documents | commercial_director, pm, accountant |
| Suppliers | commercial_director, pm, warehouse |

## Main pages (`src/pages/`)

- **DashboardPage** — summary dashboard (separate views for PM, director,
  and accountant: project stats, revenue, receipts).
- **ProjectPage** — project detail: KP (commercial proposal), line items,
  status (separate views for PM, director, and accountant).
- **ContractPage** — contract generation and status for a project.
- **ProcurementPage** — procurement: project line items, suppliers, pricing.
- **WarehousePage** — warehouse tracking: arrivals, shipments, stock levels.
- **DocumentsPage** — project documents (contract, power of attorney,
  waybills) and their approval workflow.
- **SupplierHistoryPage** — delivery history by supplier.
- **LoginPage** — sign-in screen.
