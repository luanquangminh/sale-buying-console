# Sale & Buying Console

Production build of the "Sale & Buying Console" artifact: a React UI on Cloudflare Workers with D1
(records), R2 (attachments) and Workers AI (Import PDF), plus an MCP endpoint at `/mcp` so Claude
or ChatGPT can read the console and add lines, jobs and calendar entries.

## Run locally

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc     # fill in your own D1 / R2 ids
npm run db:migrate:local                     # creates the local database and the first admin (see migrations/0002)
npm run dev                                  # http://localhost:5173
```

Sign in with the admin account seeded by `migrations/0002_seed_admin.sql` and change its password in
Accounts straight away. Create Sale, Buyer, Admin and Warehouse logins there.

## Tests

```bash
npx vitest run                                              # Workers runtime: API, sync, roles, helpers
cp tests/e2e/accounts.example.json tests/e2e/accounts.json  # logins of the environment under test (git-ignored)
E2E_BASE_URL=http://localhost:5173 npm run e2e              # Playwright, against `npm run dev`
E2E_STAGING_URL=https://<your-staging> E2E_ACCOUNTS=accounts.staging.json npm run e2e:staging
BASE=http://localhost:5173 node scripts/explore-e2e.mjs     # wider exploratory pass
```

## Deploy

`wrangler login`, create a D1 database and an R2 bucket, put their ids in `wrangler.jsonc`, then
`npm run db:migrate:remote` and `npm run deploy`. A staging environment is defined under
`env.staging`: `npm run deploy:staging`. Back up the live database first with `npm run backup -- <label>`
(writes to `backups/`, git-ignored). Release order: staging → e2e on staging → backup → live → smoke as every role.

## MCP (Claude / ChatGPT)

The **AI agent link** tab inside the app walks each user through connecting their own Claude.ai,
ChatGPT or Claude Code, with a key test against the server. The key is the user's console login,
`username:password`, sent as `X-API-Key`, `Authorization: Bearer` or `?key=`.

## Pages

Every screen has its own address, so links can be shared and the browser's Back works. A role that opens an
address it may not use lands on its home page.

| Address | Who | Screen |
|---------|-----|--------|
| `/customers`, `/orders`, `/payments-received` | Sale | the rep's own pages |
| `/reps/<rep id>/customers`, `/reps/<rep id>/orders`, `/reps/<rep id>/payments-received` | Admin | a rep's pages |
| `/buyer/inbox`, `/buyer/orders-to-update`, `/buyer/po-tracking`, `/buyer/jobs` | Buyer, Admin | Buyer Space |
| `/admin/mai`, `/admin/customer-balance`, `/admin/accounts` | Admin | |
| `/accounting/payments-received` | Accountant, Admin | Payments Received Tracking |
| `/container-rate`, `/warehouse`, `/delivery-booking`, `/agent` | shared, by role | |

## Layout

| Path | What |
|------|------|
| `src/App.jsx` | the UI, one file, plus small modules: dates, status, receipts (PO ↔ PFI), merge (role-aware saves), push queue, calendar, money (VAT and totals), payments (due dates), suggest (names typed before), lanes (list order), allocation (PO cases against what a PFI line needs), popup (where a drop-down opens), sentMark (what Sale changed after a PO was sent), orderGroups (orders by sale rep) |
| `worker/` | Hono API: auth, snapshot, sync, files, AI proxy, MCP |
| `migrations/` | D1 schema and the first admin |
| `tests/` | Vitest (Workers runtime); `tests/e2e/` Playwright |
| `scripts/` | backup, exploratory pass, MCP client, fixture builders |
