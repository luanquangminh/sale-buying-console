// Push any PDF/image through the app's Import PDF and print what came back.
// Usage: node scripts/try-import.mjs <file> [baseUrl] [username] [password]
import { chromium } from "@playwright/test";
import path from "node:path";

const [file, base = "http://localhost:5173", user, pass] = process.argv.slice(2);
if (!file || !user || !pass) { console.error("usage: node scripts/try-import.mjs <file> [baseUrl] <username> <password>"); process.exit(1); }
if (!file) { console.error("usage: node scripts/try-import.mjs <file> [baseUrl] [user] [pass]"); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error]", m.text().slice(0, 200)); });
await page.goto(base);
if (await page.getByText("Log out").count()) await page.getByText("Log out").click();
await page.getByRole("button", { name: "Sign in" }).waitFor();
await page.locator("input.select-line").first().fill(user);
await page.locator('input[type="password"]').fill(pass);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByText("Log out").waitFor();
await page.locator(".side-item", { hasText: "Order Tracking" }).click();
if (!(await page.locator(".pfi-list-row").count())) { console.error("No PFI to open for this user; create one first."); process.exit(2); }
await page.locator(".pfi-list-row").first().click();
await page.locator(".detail-body").waitFor();
const rowsBefore = await page.locator(".detail-body tbody tr:not(.sub-row):not(:has(td[colspan]))").count();

const calls = [];
page.on("response", async (r) => { if (r.url().includes("/api/ai/parse-document")) { let body = null; try { body = await r.json(); } catch {} calls.push({ status: r.status(), provider: body?.provider, lines: body?.parsed?.lines?.length, error: body?.error, warnings: body?.warnings?.length }); } });
const t0 = Date.now();
await page.locator('.detail-body input[accept=".pdf,image/*"]').setInputFiles(path.resolve(file));
await page.locator(".import-note.ok, .import-note.err").waitFor({ timeout: 600_000 });
const note = await page.locator(".import-note").innerText();
const rows = await page.locator(".detail-body tbody tr:not(.sub-row):not(:has(td[colspan]))").count();
const cells = await page.locator(".detail-body tbody tr:not(.sub-row):not(:has(td[colspan]))").evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("input,select")).map((e) => e.value).slice(0, 8).join(" | ")));
console.log(`file: ${file}\ntime: ${((Date.now() - t0) / 1000).toFixed(1)}s\nnote: ${note}\nrows before: ${rowsBefore}, after: ${rows}, added: ${rows - rowsBefore}`);
console.log("api calls:", JSON.stringify(calls));
cells.forEach((c, i) => console.log(i < rowsBefore ? " (old)" : " (new)", c));
await page.getByRole("button", { name: "Discard" }).click();
await browser.close();
