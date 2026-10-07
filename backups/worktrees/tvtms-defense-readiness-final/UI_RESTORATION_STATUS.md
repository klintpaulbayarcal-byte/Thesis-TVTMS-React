# TVTMS UI/UX Restoration Status

This source package restores the previous finalized TVTMS visual language into the current React + Vite frontend while preserving the PHP REST API + Supabase PostgreSQL architecture.

## Verified in this workspace
- Automated contract tests: 49 passed / 0 failed
- React/JS syntax + relative imports: 48 files passed
- PHP syntax: 20 files / 0 errors
- Distribution/secret checks: 8 passed
- UI restoration contract: 13 passed

## Restored visual areas
- Landing/public portal
- Login and password reset
- Admin shell/sidebar/topbar/dashboard/overview
- Officer shell/dashboard
- Issue Ticket and Search Violator
- Ticket lists and ticket details
- Users, Violations, Payments, Disputes
- Notifications, Audit Trail, Settings, Profile
- Reports and Analytics/KPI dashboard
- Public ticket lookup
- Desktop and mobile responsive styling

## Build note
The current execution workspace received `node_modules` from a Windows ZIP. Its Rollup optional dependency is Windows-only, so a Linux Vite production build cannot be regenerated here without downloading the Linux optional package. Source tests and JSX verification pass.

On the user's Windows machine, run:

```powershell
npm install
npm test
npm run verify:jsx
npm run build:hostinger
```

The final Hostinger `deploy/` directory should only be used after that build passes.

## Secrets
`api/config/config.local.php`, `.env` files, `node_modules`, stale `dist/`, and stale `deploy/` are intentionally excluded from this package.
