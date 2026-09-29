import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { A } from "./accounts";

/*
 * Three-role end-to-end pass over the live console. Re-runnable: every step checks
 * whether its record already exists before creating it.
 */
test.describe.configure({ mode: "serial" });

// Pushes on their way to the server, per page: a test is over only when they have all landed.
const inFlight = new WeakMap<Page, Set<unknown>>();
const watchPushes = (page: Page) => {
  const open = new Set<unknown>();
  inFlight.set(page, open);
  page.on("request", (r) => { if (r.url().includes("/api/sync") && r.method() === "POST") open.add(r); });
  page.on("requestfinished", (r) => open.delete(r));
  page.on("requestfailed", (r) => open.delete(r));
};
/** Wait until nothing has been on its way for a moment (the store debounces by 300 ms), however slow the server is. */
const settled = async (page: Page, quiet = 900, limit = 30_000) => {
  const open = inFlight.get(page);
  const end = Date.now() + limit;
  let calmSince = Date.now();
  while (Date.now() < end) {
    if (open && open.size) calmSince = Date.now();
    else if (Date.now() - calmSince >= quiet) return;
    await page.waitForTimeout(100);
  }
};

// Every /api/sync response is logged so a failed or slow push shows up in the report.
test.beforeEach(async ({ page }) => {
  watchPushes(page);
  page.on("response", async (r) => {
    if (!r.url().includes("/api/sync")) return;
    let body = ""; try { body = (await r.text()).slice(0, 160); } catch { /* aborted */ }
    console.log(`[sync] ${r.status()} ${r.request().postData()?.length ?? 0}B ${body}`);
  });
  page.on("requestfailed", (r) => { if (r.url().includes("/api/")) console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`); });
  page.on("console", (m) => { if (m.type() === "error") console.log(`[console] ${m.text().slice(0, 200)}`); });
});
// The store debounces pushes by 300 ms; the page closes only once the last one has landed, so a slow server loses nothing.
test.afterEach(async ({ page }) => { await settled(page, 1200); });

const FIX = (f: string) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url));
const NOTE = "E2E: please confirm 40ft reefer rate to Lagos for Acme";

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/");
  const signInButton = page.getByRole("button", { name: "Sign in" });
  const logout = page.getByText("Log out");
  await Promise.race([signInButton.waitFor(), logout.waitFor()]); // the app decides which screen after /auth/me
  if (await logout.count()) { await logout.click(); }
  await signInButton.waitFor();
  await page.locator("input.select-line").first().fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Log out")).toBeVisible();
}

const side = (page: Page, text: string) => page.locator(".side-item", { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\d+)?\\s*$`) }); // whole label, badge count allowed
const pill = (page: Page, text: string | RegExp) => page.locator(".pill", { hasText: text });
const openDetail = async (page: Page, row: ReturnType<Page["locator"]>) => { await row.click(); await page.locator(".detail-body").waitFor(); };
const save = async (page: Page) => {
  const btn = page.getByRole("button", { name: "Save changes" });
  if (await btn.isEnabled()) {
    const pushed = page.waitForResponse((r) => r.url().includes("/api/sync"), { timeout: 15000 }).catch(() => null);
    await btn.click();
    await pushed;
  } // nothing to save on a re-run is fine
  await expect(page.locator(".save-bar")).toContainText(/all changes saved/i);
};
const close = (page: Page) => page.getByRole("button", { name: "Close" }).click();
/** Orders to update lists the PFIs under their sale rep: open every rep, then the row is there. */
const order = async (page: Page, pfi: string) => {
  await page.locator(".sale-group-head").first().waitFor();
  const closed = page.locator(".sale-group:not(.open) > .sale-group-head");
  while (await closed.count()) await closed.first().click();
  return page.locator(".fulfil-head", { hasText: pfi }).first();
};

test("sale rep: note, PFI lines, attachment, payment, export", async ({ page }) => {
  await signIn(page, A.sale.username, A.sale.password);
  await expect(page.locator(".cust-row").first()).toContainText("Acme Foods Ltd");
  await page.locator(".cust-row").first().click();
  const card = page.locator(".card").first();
  if (!(await card.innerText()).includes(NOTE)) {
    await card.locator("textarea").first().fill(NOTE);
    await card.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Add info" }).click();
  }
  const notify = card.getByRole("button", { name: "Notify Buyer", exact: true });
  if (await notify.count()) await notify.first().click();
  await expect(card).toContainText(/awaiting buyer|buyer replied/i);

  await side(page, "Order Tracking").click();
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PFI 3200" }));
  const rows = page.locator(".detail-body tbody tr:not(.sub-row):not(:has(td[colspan]))");
  if ((await rows.count()) === 0) {
    await page.locator('.detail-body input[accept=".xlsx,.xls"]').setInputFiles(FIX("products.xlsx"));
    await expect(rows).toHaveCount(2);
    const parsed = page.waitForResponse((r) => r.url().includes("/api/ai/parse-document"));
    await page.locator('.detail-body input[accept=".pdf,image/*"]').setInputFiles(FIX("proforma-3200.pdf"));
    expect((await parsed).status()).toBe(200);
    await expect(page.locator(".import-note")).toContainText("Imported 6 line(s)");
    await expect(rows).toHaveCount(8);
  }
  if (!(await page.locator(".doc-card").count())) {
    const docs = page.locator(".section-card", { hasText: "Documents" });
    await docs.locator("select").first().selectOption("INV");
    await docs.locator("textarea").fill("E2E invoice");
    const uploaded = page.waitForResponse((r) => r.url().includes("/api/files") && r.request().method() === "POST");
    await docs.locator('input[type="file"]').setInputFiles(FIX("invoice-3200.txt"));
    expect((await uploaded).status()).toBe(200);
    await docs.getByRole("button", { name: "Add" }).click();
  }
  const pay = page.locator(".section-card:has(.pay-summary)");
  if (!(await pay.locator("tbody tr:not(:has(td[colspan]))").count())) {
    await pay.locator('input[type="date"]').fill("2026-09-21");
    await pay.locator('input[type="number"]').fill("500");
    await pay.getByRole("button", { name: "Record payment" }).click();
  }
  await page.locator(".section-card:has(.delivery-block) input[type=\"date\"]").nth(1).fill("2026-10-01");
  if ((await page.locator(".save-bar").innerText()).includes("UNSAVED")) await save(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export packing list" }).click();
  expect((await download).suggestedFilename()).toBe("PFI_3200_packing_list.xlsx");
  const href = await page.locator(".doc-file-link").first().getAttribute("href");
  const file = await page.request.get(href!);
  expect(file.status()).toBe(200);
  expect(await file.text()).toContain("INVOICE 3200");
  await close(page);
});

test("buyer: inbox reply, PFI update, PO linked to the PFI, container rate", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  const item = page.locator(".feed-item", { hasText: NOTE }).first();
  await expect(item).toBeVisible();
  if (await item.locator(".reply-box").count()) {
    await item.locator(".reply-box textarea").fill("Yes: USD 4,150 with Maersk, 28 days.");
    await item.locator(".reply-box").getByRole("button", { name: "Send" }).click();
  }
  await expect(item).toContainText(/replied/i);

  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3200"));
  // A line already covered by a PO rolls up (no dropdown), so pick the first line that still has one.
  const first = page.locator(".detail-body tbody tr:not(.sub-row)").filter({ has: page.locator('option[value="ordered"]') }).first();
  if (await first.count()) {
    await first.locator("select").filter({ has: page.locator('option[value="ordered"]') }).first().selectOption("ordered");
    await first.locator('input[type="date"]').first().fill("2026-10-05");
  }
  await page.locator(".doc-card select").first().selectOption("applied");
  await save(page);
  await close(page);

  await pill(page, "PO Tracking").click();
  if (!(await page.locator(".supplier-row").count())) {
    await page.getByRole("button", { name: "Add supplier" }).click();
    const form = page.locator(".add-form").first();
    await form.locator("input").nth(0).fill("Yogi Tea GmbH");
    await form.locator("input").nth(1).fill("E2E supplier");
    await page.getByRole("button", { name: "Save supplier" }).click();
  }
  await pill(page, /^PO$/).click();
  if (!(await page.locator(".pfi-list-row", { hasText: "PO 4500" }).count())) {
    await page.getByRole("button", { name: "Add PO" }).click();
    const form = page.locator(".add-form").first();
    await form.locator("input").nth(0).fill("4500");
    await form.locator("input").nth(1).fill("Prepaid");
    await page.getByRole("button", { name: "Create PO" }).click();
    await page.locator(".detail-body").waitFor();
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    const inputs = rowForm.locator("input");
    await inputs.nth(0).fill("Yogi Tea Organic Bags Classic Chai 37.4g");
    await inputs.nth(1).fill("4012824406711");
    await inputs.nth(4).fill("20");
    await inputs.nth(5).fill("7.5");
    await rowForm.getByRole("button", { name: "Add row" }).click();
    await page.locator(".pfi-picker-trigger").first().click();
    await page.locator(".pfi-picker-option", { hasText: "PFI 3200" }).locator('input[type="checkbox"]').check();
    await page.locator(".picker-backdrop").click();
    await page.locator('.detail-body input[placeholder="cases"]').first().fill("20");
    await page.locator('.detail-body input[placeholder="received"]').first().fill("18");
    await page.getByRole("button", { name: "Sent", exact: true }).click();
    await page.getByRole("button", { name: "Received", exact: true }).click();
    await save(page);
    await close(page);
  }
  await expect(page.locator(".pfi-list-row", { hasText: "PO 4500" })).toBeVisible();

  await side(page, "Container Rate").click();
  if (!(await page.locator(".lane-row", { hasText: "Lagos" }).count())) {
    await page.getByRole("button", { name: "Add lane" }).click();
    const form = page.locator(".add-form").first();
    await form.locator("input").nth(0).fill("Lagos, Apapa");
    await form.locator("input").nth(1).fill("20 Saddleback Road, Northampton");
    await form.locator("input").nth(2).fill("28 days");
    await page.getByRole("button", { name: "Save lane" }).click();
    const lane = page.locator(".lane-detail").first();
    await lane.locator(".mini-form-row input").nth(0).fill("Maersk");
    await lane.locator(".mini-form-row input").nth(1).fill("4150");
    await lane.getByRole("button", { name: "Add rate" }).click();
    await lane.locator(".mini-form-row input").nth(0).fill("MSC");
    await lane.locator(".mini-form-row input").nth(1).fill("3990");
    await lane.getByRole("button", { name: "Add rate" }).click();
  }
  await expect(page.locator(".lane-row", { hasText: "Lagos" })).toContainText("$3,990.00");
});

test("sale rep sees the buyer's updates and the PO receipt, requests a reorder", async ({ page }) => {
  await signIn(page, A.sale.username, A.sale.password);
  await expect(page.locator(".cust-row").first()).toContainText("1 answered");
  await side(page, "Order Tracking").click();
  await expect(page.locator(".activity-panel")).toContainText("Buyer saved PFI 3200");
  await expect(page.locator(".activity-panel")).toContainText(/Buyer (saved|updated) PO 4500/);
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PFI 3200" }));
  const receipt = page.locator(".detail-body tr.sub-row", { hasText: "PO 4500" }).first();
  await expect(receipt).toContainText("Received");
  await expect(receipt).toContainText("Short 2");
  if (!(await receipt.innerText()).includes("Reordered")) {
    await receipt.locator(".reorder-btn").click();
    await save(page);
  }
  await expect(receipt).toContainText("Reordered");
  await close(page);
});

test("buyer handles the reorder request", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  const row = page.locator(".reorder-row").first();
  await expect(row).toContainText("2 short");
  if (await row.getByRole("button", { name: "Added to a PO" }).count()) await row.getByRole("button", { name: "Added to a PO" }).click();
  await expect(row).toHaveClass(/handled/);
});

test("admin: rep workspace, bookings with second-tab sync, accounts", async ({ page, context }) => {
  await signIn(page, A.admin.username, A.admin.password);
  await side(page, A.sale.name).click();
  await expect(page.locator(".cust-row").first()).toContainText("Acme Foods Ltd");

  await side(page, "Delivery Booking").click();
  const stale = page.locator(".booking-row", { hasText: "E2E Booking Ltd" }); // left by a run whose last push never landed
  while (await stale.count()) { await stale.first().click(); await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click(); }
  await settled(page);
  await page.getByRole("button", { name: "Add booking" }).click();
  const grid = page.locator(".booking-grid").first();
  await grid.locator("input").nth(0).fill("E2E Booking Ltd");
  await grid.locator("input").nth(1).fill("3200");
  await grid.locator("select").first().selectOption("loaded");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("Log out")).toBeVisible();
  await other.locator(".side-item", { hasText: "Delivery Booking" }).click();
  await expect.poll(async () => {
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    return other.locator(".booking-row", { hasText: "E2E Booking Ltd" }).count();
  }, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect(other.locator(".booking-row", { hasText: "E2E Booking Ltd" })).toContainText(/loaded/i);
  await other.close();
  await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".booking-row", { hasText: "E2E Booking Ltd" })).toHaveCount(0);
  await settled(page);
  const kept = await page.evaluate(async () => (await (await fetch("/api/state")).json()).slices.bookings.filter((b: any) => b.customerName === "E2E Booking Ltd").length);
  expect(kept).toBe(0); // gone on the server too, not only on the screen

  await side(page, "Accounts").click();
  const rows = page.locator(".account-row");
  const before = await rows.count();
  const form = page.locator(".add-form").first();
  await form.locator("select").selectOption("sale");
  await form.locator("input").nth(0).fill("Temp User");
  await form.locator("input").nth(1).fill("temp-e2e");
  await form.locator("input").nth(2).fill("temp123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(rows).toHaveCount(before + 1);
  await rows.nth(before).locator(".btn-icon").click();
  await expect(rows).toHaveCount(before);
  await expect(rows.nth(0).locator(".btn-icon")).toBeDisabled();
});

test("dates: typed as dd/mm/yyyy, stored as ISO, shown as dd/mm/yyyy", async ({ page }) => {
  await signIn(page, A.admin.username, A.admin.password);
  await side(page, "Delivery Booking").click();
  const leftovers = page.locator(".booking-row", { hasText: "E2E Dates Ltd" });
  while (await leftovers.count()) { await leftovers.first().click(); await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click(); }
  await page.getByRole("button", { name: "Add booking" }).click();
  const grid = page.locator(".booking-grid").first();
  await grid.locator("input").nth(0).fill("E2E Dates Ltd");
  const loading = grid.locator(".mini-field", { hasText: "Loading booked" });
  await loading.locator('input[type="text"]').fill("28/09/2026");
  await loading.locator('input[type="text"]').press("Enter");
  await expect(loading.locator('input[type="date"]')).toHaveValue("2026-09-28"); // ISO underneath
  await loading.locator('input[type="text"]').fill("31/02/2026"); // impossible → flagged, stored value untouched
  await loading.locator('input[type="text"]').press("Tab");
  await expect(loading.locator(".date-field")).toHaveClass(/invalid/);
  await expect(loading.locator('input[type="date"]')).toHaveValue("2026-09-28");
  await loading.locator('input[type="text"]').fill("28092026"); // bare digits, as on a phone keypad
  await loading.locator('input[type="text"]').press("Enter");
  await expect(loading.locator(".date-field")).not.toHaveClass(/invalid/);
  await expect(loading.locator('input[type="text"]')).toHaveValue("28/09/2026");
  const etd = grid.locator(".mini-field", { hasText: "ETD" });
  await etd.locator('input[type="date"]').fill("2026-10-02"); // native picker path
  await expect(etd.locator('input[type="text"]')).toHaveValue("02/10/2026");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(loading).toContainText("28/09/2026");
  await expect(page.locator(".booking-row", { hasText: "E2E Dates Ltd" })).toContainText("28/09/2026");
  await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".booking-row", { hasText: "E2E Dates Ltd" })).toHaveCount(0);
});

test("buyer can open Delivery Booking and record the Sale name", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Delivery Booking").click();
  const leftovers = page.locator(".booking-row", { hasText: "E2E Buyer Booking Ltd" });
  while (await leftovers.count()) { await leftovers.first().click(); await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click(); }
  await page.getByRole("button", { name: "Add booking" }).click();
  const grid = page.locator(".booking-grid").first();
  await grid.locator("input").nth(0).fill("E2E Buyer Booking Ltd");
  const sale = grid.locator(".mini-field", { hasText: /^Sale/ });
  await sale.locator("input").fill(A.sale.name || "Rep");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(sale).toContainText(A.sale.name || "Rep");
  await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".booking-row", { hasText: "E2E Buyer Booking Ltd" })).toHaveCount(0);
});

test("order tracking shows a status chip that follows the Loaded flag", async ({ page }) => {
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  const row = page.locator(".pfi-list-row", { hasText: "PFI 3200" });
  await expect(row.locator(".chip").last()).toHaveText(/pending|complete ordering|loaded/i);
  await openDetail(page, row);
  const loaded = page.locator(".detail-body .mini-field", { hasText: "Loaded or not" }).locator("select");
  await loaded.selectOption("loaded");
  await save(page);
  await close(page);
  await expect(row.locator(".chip").last()).toHaveText(/^loaded$/i);
  await openDetail(page, row);
  await loaded.selectOption("not_loaded");
  await save(page);
  await close(page);
  await expect(row.locator(".chip").last()).not.toHaveText(/^loaded$/i);
});

test("a row-level PO edit reaches the sale's open PFI without reopening it", async ({ browser }) => {
  const saleCtx = await browser.newContext();
  const sale = await saleCtx.newPage();
  await signIn(sale, A.sale.username, A.sale.password);
  await side(sale, "Order Tracking").click();
  await openDetail(sale, sale.locator(".pfi-list-row", { hasText: "PFI 3200" }));
  const saleRow = sale.locator(".detail-body tr.sub-row", { hasText: "PO 4500" }).first();
  await expect(saleRow).toBeVisible();
  const headers = await sale.locator(".detail-body thead th").allInnerTexts();
  const receivedCell = saleRow.locator("td").nth(headers.findIndex((h) => /received qty/i.test(h))); // read-only for the sale
  const before = (await receivedCell.innerText()).trim();
  const next = before === "18" ? "19" : "18";

  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  await signIn(buyer, A.buyer.username, A.buyer.password);
  await pill(buyer, "PO Tracking").click();
  await pill(buyer, /^PO$/).click();
  await openDetail(buyer, buyer.locator(".pfi-list-row", { hasText: "PO 4500" }));
  const alloc = buyer.locator(".detail-body tr.sub-row", { hasText: "PFI 3200" }).first();
  await alloc.locator('input[placeholder="received"]').fill(next);
  await save(buyer);
  await close(buyer);
  await buyer.waitForTimeout(500);

  // The sale's modal stays open; the poll (triggered here by a focus event) refreshes the receipt row.
  await expect.poll(async () => {
    await sale.evaluate(() => window.dispatchEvent(new Event("focus")));
    return (await receivedCell.innerText()).trim();
  }, { timeout: 60_000 }).toBe(next);
  await close(sale);
  await expect(sale.locator(".activity-panel")).toContainText(new RegExp(`updated PO 4500 for PFI 3200 — "Yogi Tea[^"]*": received ${next} of 20`));

  // Leave the row as the buyer test created it (18 of 20) so the other tests keep their expectations.
  if (next !== "18") {
    await openDetail(buyer, buyer.locator(".pfi-list-row", { hasText: "PO 4500" }));
    await alloc.locator('input[placeholder="received"]').fill("18");
    await save(buyer);
    await close(buyer);
  }
  await buyerCtx.close();
  await saleCtx.close();
});

test("a PO row that matches no PFI line is listed as unmatched and can be attached", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PO 4500" }));
  const rows = page.locator(".detail-body tbody tr:not(.sub-row)");
  const mystery = rows.filter({ has: page.locator('input[value="Mystery Crunch Bar 40g"]') }); // product names live in inputs
  if (await mystery.count()) {
    // Re-run: detach it again so the sale's "Unmatched PO rows" path is exercised every time.
    const pick = page.locator(".detail-body tr.sub-row", { hasText: "PFI 3200" }).last().locator("select.line-pick");
    if ((await pick.inputValue()) !== "") { await pick.selectOption(""); await save(page); }
  } else {
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    await rowForm.locator("input").nth(0).fill("Mystery Crunch Bar 40g");
    await rowForm.locator("input").nth(4).fill("12");
    await rowForm.locator("input").nth(5).fill("1.5");
    await rowForm.getByRole("button", { name: "Add row" }).click();
    await rows.last().locator(".pfi-picker-trigger").click();
    await page.locator(".pfi-picker-option", { hasText: "PFI 3200" }).locator('input[type="checkbox"]').check();
    await page.locator(".picker-backdrop").click();
    await expect(page.locator(".detail-body tr.sub-row", { hasText: "PFI 3200" }).last().locator("select.line-pick")).toHaveValue("");
    await save(page);
  }
  await close(page);

  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PFI 3200" }));
  const unmatched = page.locator(".unmatched-block");
  await expect(unmatched).toContainText("Mystery Crunch Bar 40g");
  await unmatched.locator("select").first().selectOption({ label: "McVities Family Circle 400g" });
  await save(page);
  await expect(page.locator(".unmatched-block")).toHaveCount(0);
  await expect(page.locator(".detail-body tr.sub-row", { hasText: "PO 4500" })).toHaveCount(2);
  await close(page);
});

test("admin: Mai tab — add, edit, change status, delete; sale never sees the tab", async ({ page }) => {
  await signIn(page, A.admin.username, A.admin.password);
  await side(page, "Mai").click();
  const leftovers = page.locator("tr.mai-row", { hasText: "E2E: chase COO for PFI 3200" });
  while (await leftovers.count()) await leftovers.first().locator('button[title="Delete task"]').click(); // from an aborted run
  const form = page.locator(".add-form").first();
  await form.locator("input").nth(0).fill("E2E: chase COO for PFI 3200");
  await form.locator("input").nth(1).fill(A.sale.name || "Rep");
  await form.locator("input").nth(2).fill("Yogi Tea GmbH");
  await page.getByRole("button", { name: "Add task" }).click();
  const row = page.locator("tr.mai-row", { hasText: "E2E: chase COO for PFI 3200" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("select")).toHaveValue("not_started");
  await row.locator('button[title="Edit task"]').click();
  const editRow = page.locator("tr.mai-row", { has: page.locator('input[value="E2E: chase COO for PFI 3200"]') }); // in edit mode the text sits in inputs
  await editRow.locator("input").nth(2).fill("Yogi Tea GmbH (Germany)");
  await editRow.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Yogi Tea GmbH (Germany)");
  await row.locator("select").selectOption("waiting");
  await expect(row.locator("select")).toHaveValue("waiting");
  await row.locator('button[title="Delete task"]').click();
  await expect(page.locator("tr.mai-row", { hasText: "E2E: chase COO for PFI 3200" })).toHaveCount(0);

  await signIn(page, A.sale.username, A.sale.password);
  await expect(page.locator(".side-item", { hasText: "Mai" })).toHaveCount(0);
});

test("buyer: Jobs tab — add a job, two Buyer's Notes with status stamps, admin sees them, edit, delete", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Jobs").click();
  const leftovers = page.locator(".jobs-row", { hasText: "E2E: get a container quote to Lagos" });
  while (await leftovers.count()) await leftovers.first().locator('button[title="Delete job"]').click(); // from an aborted run
  const form = page.locator(".add-form").first();
  const inputs = form.locator('input:not([type="date"])'); // typed date, jobs, Mai's note
  await inputs.nth(0).fill("24/09/2026");
  await inputs.nth(0).press("Enter");
  await inputs.nth(1).fill("E2E: get a container quote to Lagos");
  await inputs.nth(2).fill("Urgent, customer waiting");
  await page.getByRole("button", { name: "Add job" }).click();
  const row = page.locator(".jobs-row", { hasText: "E2E: get a container quote to Lagos" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("24/09/2026");
  await expect(row.locator(".chip")).toHaveText(/pending/i);
  const detail = page.locator(".job-detail");
  await expect(detail).toBeVisible(); // opens on creation
  await detail.locator("textarea").fill("Asked Maersk and MSC for rates.");
  await detail.getByRole("button", { name: "Add note" }).click();
  await expect(detail.locator(".job-note")).toHaveCount(1);
  await detail.locator(".mini-field", { hasText: "Status now" }).locator("select").selectOption("in_process");
  await detail.locator("textarea").fill("MSC came back at 3,990.");
  await detail.getByRole("button", { name: "Add note" }).click();
  await expect(detail.locator(".job-note")).toHaveCount(2);
  await expect(detail.locator(".job-note").nth(0).locator(".chip")).toHaveText(/pending/i);
  await expect(detail.locator(".job-note").nth(1).locator(".chip")).toHaveText(/in process/i);

  await signIn(page, A.admin.username, A.admin.password);
  await side(page, "Buyer Space").click();
  await pill(page, "Jobs").click();
  const adminRow = page.locator(".jobs-row", { hasText: "E2E: get a container quote to Lagos" });
  await expect(adminRow).toContainText("2 notes");
  await adminRow.click();
  const adminDetail = page.locator(".job-detail");
  await expect(adminDetail.locator(".job-note")).toHaveCount(2);
  await expect(adminDetail.locator(".job-note").nth(1)).toContainText("MSC came back at 3,990.");
  await adminRow.locator('button[title="Edit job"]').click();
  await adminDetail.locator(".mini-field", { hasText: /^Jobs/ }).locator("input").fill("E2E: get a container quote to Lagos (done)");
  await adminDetail.getByRole("button", { name: "Save job" }).click();
  await expect(page.locator(".jobs-row", { hasText: "Lagos (done)" })).toHaveCount(1);
  await page.locator(".jobs-row", { hasText: "E2E: get a container quote to Lagos (done)" }).locator('button[title="Delete job"]').click();
  await expect(page.locator(".jobs-row", { hasText: "E2E: get a container quote to Lagos" })).toHaveCount(0);
});

test("a change made right before the tab is hidden is pushed at once, not after the debounce", async ({ page }) => {
  await signIn(page, A.admin.username, A.admin.password);
  await side(page, "Mai").click();
  const leftovers = page.locator("tr.mai-row", { hasText: "E2E: hide flush" });
  while (await leftovers.count()) await leftovers.first().locator('button[title="Delete task"]').click();
  await page.waitForTimeout(800); // let those deletes leave first
  await page.locator(".add-form").first().locator("input").nth(0).fill("E2E: hide flush");
  const requested = page.waitForRequest((r) => r.url().includes("/api/sync") && r.method() === "POST");
  const responded = page.waitForResponse((r) => r.url().includes("/api/sync") && r.request().method() === "POST");
  const t0 = Date.now();
  await page.getByRole("button", { name: "Add task" }).click();
  await page.evaluate(() => { // simulate the tab being hidden straight after the click
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await requested;
  expect(Date.now() - t0).toBeLessThan(200); // the 300 ms debounce was skipped
  expect((await responded).status()).toBe(200);
  await page.reload(); // the record must be on the server, not just in memory
  await side(page, "Mai").click();
  const row = page.locator("tr.mai-row", { hasText: "E2E: hide flush" });
  await expect(row).toHaveCount(1);
  await row.locator('button[title="Delete task"]').click();
  await expect(row).toHaveCount(0);
});

test("a sale's save of an open PFI keeps the buyer's status change made meanwhile (and vice versa)", async ({ browser }) => {
  const LINE = "Heinz Baked Beans in Tomato Sauce 415g"; // imported by the first test; never covered by a PO
  const saleCtx = await browser.newContext(); const sale = await saleCtx.newPage();
  await signIn(sale, A.sale.username, A.sale.password);
  await side(sale, "Order Tracking").click();
  await openDetail(sale, sale.locator(".pfi-list-row", { hasText: "PFI 3200" }));
  const saleRow = sale.locator(".detail-body tbody tr:not(.sub-row)").filter({ has: sale.locator(`input[value="${LINE}"]`) }).first();
  const packInput = saleRow.locator("input").nth(3);
  const packBefore = await packInput.inputValue();
  await packInput.fill("24 x 415g (sale edit)"); // unsaved edit held open

  const buyerCtx = await browser.newContext(); const buyer = await buyerCtx.newPage();
  await signIn(buyer, A.buyer.username, A.buyer.password);
  await pill(buyer, "Orders to update").click();
  await openDetail(buyer, await order(buyer, "PFI 3200"));
  const buyerRow = () => buyer.locator(".detail-body tbody tr:not(.sub-row)", { hasText: LINE }).first();
  const statusBefore = await buyerRow().locator("select").first().inputValue();
  const statusNext = statusBefore === "ordered" ? "sending_order" : "ordered";
  await buyerRow().locator("select").first().selectOption(statusNext);
  await save(buyer);
  await close(buyer);

  await save(sale); // straight away, no poll in between: the server keeps the buyer's status
  await close(sale);

  await buyer.reload();
  await pill(buyer, "Orders to update").click();
  await openDetail(buyer, await order(buyer, "PFI 3200"));
  await expect(buyerRow().locator("select").first()).toHaveValue(statusNext);
  await expect(buyerRow()).toContainText("24 x 415g (sale edit)"); // and the sale's edit landed too
  // restore for the next run
  await buyerRow().locator("select").first().selectOption(statusBefore);
  await save(buyer); await close(buyer);
  await sale.reload();
  await side(sale, "Order Tracking").click();
  await openDetail(sale, sale.locator(".pfi-list-row", { hasText: "PFI 3200" }));
  await sale.locator(".detail-body tbody tr:not(.sub-row)").filter({ has: sale.locator('input[value="' + LINE + '"]') }).first().locator("input").nth(3).fill(packBefore);
  await save(sale); await close(sale);
  await buyerCtx.close(); await saleCtx.close();
});

test("warehouse: admin creates the login; it sees only the calendar; entries add, move, and reach the buyer", async ({ page }) => {
  await signIn(page, A.admin.username, A.admin.password);
  await side(page, "Accounts").click();
  const rows = page.locator(".account-row");
  if (!(await rows.filter({ has: page.locator(`input[value="${A.warehouse.username}"]`) }).count())) {
    const form = page.locator(".add-form").first();
    await form.locator("select").selectOption("warehouse");
    await form.locator("input").nth(0).fill(A.warehouse.name || "Warehouse"); await form.locator("input").nth(1).fill(A.warehouse.username); await form.locator("input").nth(2).fill(A.warehouse.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(rows.filter({ has: page.locator(`input[value="${A.warehouse.username}"]`) })).toHaveCount(1);
  }

  await signIn(page, A.warehouse.username, A.warehouse.password);
  await expect(page.locator(".side-item")).toHaveCount(1);
  await expect(page.locator(".side-item").first()).toContainText("Warehouse's Space");
  await expect(page.locator(".cal-grid")).toBeVisible();
  const TITLE = "E2E: Siam PO 2424";
  const leftovers = page.locator(".cal-event", { hasText: TITLE });
  while (await leftovers.count()) { await leftovers.first().click(); await page.getByRole("button", { name: "Delete entry" }).click(); await page.getByRole("button", { name: "Yes, delete" }).click(); }
  const day = (n: number) => page.locator(".cal-day:not(.out)", { has: page.locator(".cal-date", { hasText: new RegExp(`^${n}$`) }) });
  await day(15).hover();
  await day(15).locator(".cal-add").click();
  await page.locator(".modal-panel input").first().fill(TITLE);
  await page.locator('.modal-panel select[aria-label="Customer or supplier"]').selectOption("supplier");
  await page.locator('.modal-panel select[aria-label="Type"]').selectOption("collection");
  await page.locator(".modal-panel textarea").fill("2 pallets, 10am");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(day(15).locator(".cal-event", { hasText: TITLE })).toHaveCount(1);
  await expect(day(15).locator(".cal-event", { hasText: TITLE })).toHaveClass(/type-collection/);

  await day(15).locator(".cal-event", { hasText: TITLE }).click(); // move it to the 16th
  const dateText = page.locator('.modal-panel .date-field input[type="text"]');
  const cur = await dateText.inputValue();
  await dateText.fill("16" + cur.slice(2)); await dateText.press("Enter");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(day(16).locator(".cal-event", { hasText: TITLE })).toHaveCount(1);
  await expect(day(15).locator(".cal-event", { hasText: TITLE })).toHaveCount(0);

  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Warehouse's Space").click();
  const seen = page.locator(".cal-event", { hasText: TITLE });
  await expect(seen).toHaveCount(1);
  await seen.click();
  await expect(page.locator(".modal-panel textarea")).toHaveValue("2 pallets, 10am");
  await page.getByRole("button", { name: "Delete entry" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.locator(".cal-event", { hasText: TITLE })).toHaveCount(0);
});

test("AI agent link: phase-by-phase guide, key test against the real endpoint, per-assistant steps", async ({ page, baseURL }) => {
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "AI agent link").click();
  const card = page.locator(".agent-card");
  const mcpUrl = `${baseURL}/mcp`;
  await expect(card.locator(".agent-phase")).toHaveCount(5);
  await expect(card.locator(".agent-lead")).toContainText(`${mcpUrl}`);
  await expect(card.locator(".agent-lead")).toContainText(`${A.sale.username}:your-password`); // reps type their password; it is never in the browser

  // phase 2: a wrong key is refused by the real endpoint, the right one is accepted
  await card.locator(".agent-pass input").fill("wrong");
  await card.getByRole("button", { name: "Test my key" }).click();
  await expect(card.locator(".agent-test-result")).toHaveClass(/err/);
  await card.locator(".agent-pass input").fill(A.sale.password);
  await card.getByRole("button", { name: "Test my key" }).click();
  await expect(card.locator(".agent-test-result")).toHaveText(/Connected — 5 tools/);

  // phase 3 follows the chosen assistant
  const phase3 = card.locator(".agent-phase").nth(2);
  await card.locator(".agent-pick .pill", { hasText: "Claude Code" }).click();
  await expect(phase3.locator(".agent-cmd")).toHaveText(`claude mcp add --transport http sale-buying-console ${mcpUrl} --header "X-API-Key: ${A.sale.username}:${A.sale.password}"`);
  await card.locator(".agent-pick .pill", { hasText: "ChatGPT" }).click();
  await expect(phase3).toContainText(`${mcpUrl}?key=${A.sale.username}:${A.sale.password}`);
  await card.locator(".agent-pick .pill", { hasText: "Claude.ai" }).click();
  const href = await phase3.locator("a.agent-claude-btn").getAttribute("href");
  expect(href).toContain("https://claude.ai/settings/connectors?modal=add-custom-connector");
  expect(href).toContain(encodeURIComponent(`${mcpUrl}?key=${A.sale.username}:${A.sale.password}`)); // the dialog has no header field: the key rides in the URL
  await expect(phase3).toContainText("Register automatically");
  await expect(phase3).not.toContainText("X-API-Key");
  await expect(card.locator(".agent-foot")).toContainText("list_pfis");
  await expect(card.locator(".agent-foot")).not.toContainText("list_pos"); // sale reps have no PO tools

  await signIn(page, A.admin.username, A.admin.password);
  await side(page, "AI agent link").click();
  await expect(page.locator(".agent-lead")).toContainText(`${A.admin.username}:${A.admin.password}`); // admin's own key is prefilled
  await page.getByRole("button", { name: "Test my key" }).click();
  await expect(page.locator(".agent-test-result")).toHaveText(/Connected — 15 tools/);
  await expect(page.locator(".agent-foot")).toContainText("add_task");
});

test("no-limit PDF path: the tab builds the prompt per document, and #agent opens the tab directly", async ({ page }) => {
  await signIn(page, A.sale.username, A.sale.password);
  await page.goto("/#agent"); // the link shown when Import PDF fails
  await expect(page.locator(".page-title")).toHaveText("AI agent link");
  const box = page.locator(".agent-pdf");
  await expect(box.locator("select")).toHaveCount(0); // a sale rep only has PFIs
  await box.locator("input").fill("3200");
  await expect(box.locator("pre")).toContainText("PFI 3200");
  await expect(box.locator("pre")).toContainText("add_pfi_lines");

  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "AI agent link").click();
  await page.locator(".agent-pdf select").selectOption("PO");
  await page.locator(".agent-pdf input").fill("4500");
  await expect(page.locator(".agent-pdf pre")).toContainText("PO 4500");
  await expect(page.locator(".agent-pdf pre")).toContainText("add_po_lines");
});

test("PO: FOB is an incoterm on a new PO, and UK Local Transport hides the sub-type", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  const row = page.locator(".pfi-list-row", { hasText: "PO 4510" });
  if (await row.count()) {
    await openDetail(page, row);
  } else {
    await page.getByRole("button", { name: "Add PO" }).click();
    const form = page.locator(".add-form").first();
    await form.locator("input").nth(0).fill("4510");
    const incoterm = form.locator("select").nth(2);
    await expect(incoterm.locator("option")).toHaveText(["Ex-Work", "Delivered", "FOB"]);
    await incoterm.selectOption("fob");
    await page.getByRole("button", { name: "Create PO" }).click();
    await page.locator(".detail-body").waitFor();
  }
  await expect(page.locator(".modal-sub")).toContainText("FOB");

  const delivery = page.locator(".detail-body .section-card", { hasText: "Delivery from supplier" });
  const vehicle = delivery.locator(".mini-field", { hasText: "Vehicle" }).locator("select");
  const subType = delivery.locator(".mini-field", { hasText: "Sub-type" });
  await vehicle.selectOption("container");
  await subType.locator("select").selectOption("40ft Reefer");
  await vehicle.selectOption("uk_local");
  await expect(subType).toHaveCount(0);
  await save(page);
  await close(page);
  await expect(row).toContainText("FOB");

  await openDetail(page, row); // still hidden after a reload of the record, and back again with a container
  await expect(vehicle).toHaveValue("uk_local");
  await expect(subType).toHaveCount(0);
  await vehicle.selectOption("container");
  await expect(subType.locator("select")).toHaveValue("20ft Dry");
  await vehicle.selectOption("uk_local");
  await expect(subType).toHaveCount(0);
  await close(page);

  // The PFI form keeps its two incoterms.
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await page.getByRole("button", { name: "Add PFI" }).click();
  await expect(page.locator(".add-form").first().locator("select").nth(2).locator("option")).toHaveText(["Ex-Work", "Delivered"]);
});

test("warehouse: the note box takes the full width and holds a long note", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Warehouse's Space").click();
  const TITLE = "E2E: long note";
  const NOTE_TEXT = ["Gate B, 10:00 to 12:00.", "6 pallets, 2 of them chilled.", "Driver: call the office 30 minutes before arrival.", "Bring the signed packing list back."].join("\n");
  const leftovers = page.locator(".cal-event", { hasText: TITLE });
  while (await leftovers.count()) { await leftovers.first().click(); await page.getByRole("button", { name: "Delete entry" }).click(); await page.getByRole("button", { name: "Yes, delete" }).click(); }
  const day = (n: number) => page.locator(".cal-day:not(.out)", { has: page.locator(".cal-date", { hasText: new RegExp(`^${n}$`) }) });
  await day(12).hover();
  await day(12).locator(".cal-add").click();
  const note = page.locator(".modal-panel textarea");
  const box = await note.boundingBox();
  const body = await page.locator(".modal-body").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(140);
  expect(box!.width).toBeGreaterThan(body!.width * 0.9); // the whole row, not a corner of it
  await page.locator(".modal-panel input").first().fill(TITLE);
  await page.locator('.modal-panel select[aria-label="Customer or supplier"]').selectOption("supplier");
  await note.fill(NOTE_TEXT);
  await page.getByRole("button", { name: "Save entry" }).click();
  await day(12).locator(".cal-event", { hasText: TITLE }).click();
  await expect(note).toHaveValue(NOTE_TEXT);
  await page.getByRole("button", { name: "Delete entry" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.locator(".cal-event", { hasText: TITLE })).toHaveCount(0);
});

test("container rate: forwarders typed before are offered when adding a rate", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Container Rate").click();
  const POD = "E2E Suggest Port";
  const stale = page.locator(".lane-row", { hasText: POD });
  while (await stale.count()) {
    await stale.first().click();
    await page.locator(".lane-detail").getByRole("button", { name: "Delete lane" }).click();
  }
  await page.getByRole("button", { name: "Add lane" }).click();
  const form = page.locator(".add-form").first();
  await form.locator("input").nth(0).fill(POD);
  await form.locator("input").nth(1).fill("1 Test Way, Northampton");
  await page.getByRole("button", { name: "Save lane" }).click();

  const lane = page.locator(".lane-detail").first();
  const forwarder = lane.locator(".mini-form-row input").nth(0);
  const options = page.locator(".suggest-panel .suggest-option");
  await forwarder.click();
  await expect(options.filter({ hasText: /^Maersk$/ })).toHaveCount(1); // entered on the Lagos lane by the buyer test
  await expect(options.filter({ hasText: /^MSC$/ })).toHaveCount(1);
  const names = await options.allInnerTexts();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));

  await forwarder.fill("ms"); // typing narrows the list
  await expect(options).toHaveText(["MSC"]);
  await options.first().click();
  await expect(forwarder).toHaveValue("MSC");
  await expect(page.locator(".suggest-panel")).toHaveCount(0);
  await lane.locator(".mini-form-row input").nth(1).fill("3800");
  await lane.getByRole("button", { name: "Add rate" }).click();
  await expect(lane.locator("tbody tr")).toHaveCount(1);
  await expect(lane.locator("tbody tr").first()).toContainText("MSC");

  await forwarder.fill("Brand New Lines"); // a name never seen is still accepted, and offered from then on
  await lane.locator(".mini-form-row input").nth(1).fill("4100");
  await lane.getByRole("button", { name: "Add rate" }).click();
  await expect(lane.locator("tbody tr")).toHaveCount(2);
  await forwarder.fill("brand");
  await expect(options).toHaveText(["Brand New Lines"]);
  await forwarder.fill("");

  await lane.getByRole("button", { name: "Delete lane" }).click();
  await expect(page.locator(".lane-row", { hasText: POD })).toHaveCount(0);
});

test("order status Removed: offered on every screen, kept on a PO-wide change, ignored for Complete Ordering", async ({ page }) => {
  const KEEP = "E2E Keep Tea 100g";
  const DROP = "E2E Drop Jam 200g";
  const lineRows = page.locator(".detail-body tbody tr:not(.sub-row):not(:has(td[colspan]))");
  const lineOf = (name: string) => lineRows.filter({ has: page.locator(`input[value="${name}"]`) });
  const cell = async (tr: ReturnType<Page["locator"]>, header: RegExp) => {
    const headers = await page.locator(".detail-body thead").first().locator("th").allInnerTexts();
    return tr.locator("td").nth(headers.findIndex((h) => header.test(h)));
  };

  // Sale: a PFI with two lines.
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3290" });
  if (!(await pfiRow.count())) {
    await page.getByRole("button", { name: "Add PFI" }).click();
    await page.locator(".add-form").first().locator("input").nth(0).fill("3290");
    await page.getByRole("button", { name: "Create PFI" }).click();
    await page.locator(".detail-body").waitFor();
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    for (const [name, qty] of [[KEEP, "10"], [DROP, "8"]]) {
      await rowForm.locator("input").nth(0).fill(name);
      await rowForm.locator("input").nth(4).fill(qty);
      await rowForm.locator("input").nth(5).fill("2");
      await rowForm.getByRole("button", { name: "Add row" }).click();
    }
    await expect(lineRows).toHaveCount(2);
    await save(page);
    await close(page);
  }

  // Buyer, PO Tracking: the PO row covering the second line is marked Removed.
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PO 4510" }));
  if (!(await lineOf(DROP).count())) {
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    await rowForm.locator("input").nth(0).fill(DROP);
    await rowForm.locator("input").nth(4).fill("8");
    await rowForm.locator("input").nth(5).fill("1.2");
    await rowForm.getByRole("button", { name: "Add row" }).click();
    await lineOf(DROP).locator(".pfi-picker-trigger").click();
    await page.locator(".pfi-picker-option", { hasText: "PFI 3290" }).locator('input[type="checkbox"]').check();
    await page.locator(".picker-backdrop").click();
    await page.locator(".detail-body tr.sub-row", { hasText: "PFI 3290" }).locator('input[placeholder="cases"]').fill("8");
  }
  const alloc = page.locator(".detail-body tr.sub-row", { hasText: "PFI 3290" }).first();
  const allocStatus = alloc.locator("select").filter({ has: page.locator('option[value="removed"]') });
  await expect(allocStatus.locator("option")).toHaveText(["Not ordered", "Sending order", "Ordered", "Received", "Floor stock", "Removed"]);
  await allocStatus.selectOption("removed");
  await expect(allocStatus).toHaveCSS("color", "rgb(178, 59, 59)");
  await expect(await cell(lineOf(DROP), /order status/i)).toHaveText("Removed");
  await page.getByRole("button", { name: "Sent", exact: true }).click(); // a PO-wide change leaves the removed row alone
  await page.getByRole("button", { name: "Received", exact: true }).click();
  await expect(allocStatus).toHaveValue("removed");
  await page.getByRole("button", { name: "Not received yet", exact: true }).click();
  await page.getByRole("button", { name: "Have not Sent", exact: true }).click();
  await expect(allocStatus).toHaveValue("removed");
  await save(page);
  await close(page);

  // Buyer, Orders to update: same list of statuses; the first line arrives in full.
  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3290"));
  const keepLine = page.locator(".detail-body tbody tr:not(.sub-row)", { hasText: KEEP });
  await expect(keepLine.locator("select").filter({ has: page.locator('option[value="removed"]') })).toHaveCount(1);
  await keepLine.locator("select").filter({ has: page.locator('option[value="removed"]') }).selectOption("received");
  await keepLine.locator('input[type="number"]').fill("10");
  const dropLine = page.locator(".detail-body tbody tr:not(.sub-row)", { hasText: DROP });
  await expect(await cell(dropLine, /order status/i)).toHaveText("Removed");
  await expect(await cell(dropLine, /short \/ surplus/i)).toHaveText("—");
  await expect(page.locator(".detail-body tr.sub-row", { hasText: "PO 4510" }).locator("select").filter({ has: page.locator('option[value="removed"]') })).toHaveValue("removed");
  await save(page);
  await close(page);

  // Sale, Order Tracking: the removed line no longer holds the order back.
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await expect(pfiRow.locator(".chip").last()).toHaveText(/^complete ordering$/i);
  await openDetail(page, pfiRow);
  const saleSub = page.locator(".detail-body tr.sub-row", { hasText: "PO 4510" }).first();
  await expect(await cell(saleSub, /order status/i)).toHaveText("Removed");
  await expect((await cell(saleSub, /order status/i)).locator("span")).toHaveCSS("color", "rgb(178, 59, 59)"); // red, also when read-only
  await close(page);

  // Put the row back on order: the line counts again and the PFI is Pending.
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PO 4510" }));
  await allocStatus.selectOption("ordered");
  await save(page);
  await close(page);
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await expect(pfiRow.locator(".chip").last()).toHaveText(/^pending$/i);
});

test("totals include VAT: subtotal, VAT and total on the order, payment status against the total", async ({ page }) => {
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3291" });
  const removePfi = async () => {
    await openDetail(page, pfiRow);
    await page.getByRole("button", { name: "Delete PFI" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(pfiRow).toHaveCount(0);
  };
  if (await pfiRow.count()) await removePfi(); // left by an aborted run

  await page.getByRole("button", { name: "Add PFI" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("3291");
  await page.getByRole("button", { name: "Create PFI" }).click();
  await page.locator(".detail-body").waitFor();
  const products = page.locator(".detail-body .section-card").first();
  const rowForm = products.locator(".mini-form-row").first();
  for (const [name, qty, rate, vat] of [["E2E Tea 100g", "10", "10", "20.0% S"], ["E2E Jam 200g", "5", "10", "5.0%"], ["E2E Rice 1kg", "3", "10", "0.0% Z"]]) {
    await rowForm.locator("input").nth(0).fill(name);
    await rowForm.locator("select").first().selectOption(vat);
    await rowForm.locator("input").nth(4).fill(qty);
    await rowForm.locator("input").nth(5).fill(rate);
    await rowForm.getByRole("button", { name: "Add row" }).click();
  }
  // 100 at 20% + 50 at 5% + 30 at 0% = 180 net, 22.50 VAT, 202.50 owed
  const strip = products.locator(".totals-strip");
  await expect(strip).toContainText("Subtotal$180.00");
  await expect(strip).toContainText("VAT$22.50");
  await expect(strip).toContainText("Total$202.50");
  const pay = page.locator(".section-card:has(.pay-summary)");
  await expect(pay.locator(".pay-summary")).toContainText("Subtotal$180.00");
  await expect(pay.locator(".pay-summary")).toContainText("VAT$22.50");
  await expect(pay.locator(".pay-summary")).toContainText("Order total (incl. VAT)$202.50");
  await expect(pay.locator(".pay-summary")).toContainText("Remaining$202.50");

  // Paying the net amount no longer settles the order.
  const payDate = pay.locator('.date-field input[type="text"]');
  await payDate.fill("21/09/2026"); await payDate.press("Enter");
  await pay.locator('input[type="number"]').fill("180");
  await pay.getByRole("button", { name: "Record payment" }).click();
  await expect(pay.locator(".section-title .chip")).toHaveText(/partial/i);
  await expect(pay.locator(".pay-summary")).toContainText("Remaining$22.50");
  await save(page);
  await close(page);
  await expect(pfiRow).toContainText("$202.50");
  await expect(pfiRow).toContainText(/partial/i);

  await openDetail(page, pfiRow);
  await payDate.fill("22/09/2026"); await payDate.press("Enter");
  await pay.locator('input[type="number"]').fill("22.5");
  await pay.getByRole("button", { name: "Record payment" }).click();
  await expect(pay.locator(".section-title .chip")).toHaveText(/^paid$/i);
  await expect(pay.locator(".pay-summary")).toContainText("Remaining$0.00");

  // Changing a line's VAT moves the total at once.
  const tea = page.locator(".detail-body tbody tr:not(.sub-row)").filter({ has: page.locator('input[value="E2E Tea 100g"]') });
  await tea.locator("select").filter({ has: page.locator('option[value="5.0%"]') }).selectOption("0.0% Z");
  await expect(strip).toContainText("VAT$2.50");
  await expect(strip).toContainText("Total$182.50");
  await save(page);
  await close(page);
  await expect(pfiRow).toContainText("$182.50");
  await expect(pfiRow).toContainText(/paid/i);

  await removePfi();
});

test("BBD received is a month: typed mm/yyyy, shown mm/yyyy everywhere, older full dates lose their day", async ({ page }) => {
  const KEEP = "E2E Keep Tea 100g"; // lines of PFI 3290, created by the Removed scenario
  const DROP = "E2E Drop Jam 200g";
  const headerIndex = async (header: RegExp) => (await page.locator(".detail-body thead").first().locator("th").allInnerTexts()).findIndex((h) => header.test(h));

  // Buyer, Orders to update: the line's own box.
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3290"));
  const keepLine = page.locator(".detail-body tbody tr:not(.sub-row)", { hasText: KEEP });
  const bbdCell = keepLine.locator("td").nth(await headerIndex(/bbd received/i));
  const box = bbdCell.locator('.month-field input[type="text"]');
  await expect(box).toHaveAttribute("placeholder", "mm/yyyy");
  await expect(bbdCell.locator('input[type="date"]')).toHaveCount(0);
  await box.fill("03/2027"); await box.press("Enter");
  await expect(box).toHaveValue("03/2027");
  await expect(bbdCell.locator('input[type="month"]')).toHaveValue("2027-03"); // stored as yyyy-mm
  await box.fill("15/04/2027"); await box.press("Enter"); // a full date typed out of habit keeps its month
  await expect(box).toHaveValue("04/2027");
  await box.fill("13/2027"); await box.press("Enter"); // not a month: flagged, previous value kept
  await expect(bbdCell.locator(".month-field")).toHaveClass(/invalid/);
  await expect(box).toHaveValue("04/2027");
  await box.fill("0427"); await box.press("Enter");
  await expect(box).toHaveValue("04/2027");
  await save(page);
  await close(page);

  // Buyer, PO Tracking: the box of a PO row.
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PO 4510" }));
  const alloc = page.locator(".detail-body tr.sub-row", { hasText: "PFI 3290" }).first();
  const allocBox = alloc.locator('.month-field input[type="text"]');
  await allocBox.fill("5/27"); await allocBox.press("Enter");
  await expect(allocBox).toHaveValue("05/2027");
  await save(page);
  await close(page);

  // Sale, Order Tracking: read-only cells and the packing list.
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3290" });
  await openDetail(page, pfiRow);
  const col = await headerIndex(/bbd received/i);
  await expect(page.locator(".detail-body tbody tr:not(.sub-row)").filter({ has: page.locator(`input[value="${KEEP}"]`) }).locator("td").nth(col)).toHaveText("04/2027");
  await expect(page.locator(".detail-body tr.sub-row", { hasText: "PO 4510" }).first().locator("td").nth(col)).toHaveText("05/2027");
  const sheetRows = async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export packing list" }).click();
    const wb = XLSX.read(await (await import("node:fs/promises")).readFile((await (await download).path())!));
    return XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  };
  let rows = await sheetRows();
  expect(rows.find((r) => r[2] === KEEP)![4]).toBe("04/2027");
  expect(rows.find((r) => r[2] === DROP)![4]).toBe("05/2027");
  await close(page);

  // A record saved before the change holds a full date: it shows without the day and is not rewritten by looking at it.
  const state = await page.evaluate(async () => (await fetch("/api/state")).json());
  const saleId = Object.keys(state.slices.pfisBySale).find((k) => state.slices.pfisBySale[k].some((p: any) => p.pfiNo === "3290"))!;
  const record = state.slices.pfisBySale[saleId].find((p: any) => p.pfiNo === "3290");
  const old = { ...record, products: record.products.map((p: any) => (p.product === KEEP ? { ...p, bbdReceived: "2027-06-15" } : p)) };
  delete old.receipts; delete old.unmatchedReceipts;
  await signIn(page, A.buyer.username, A.buyer.password); // BBD received is a buyer's field
  const pushed = await page.evaluate(async ([rec, sid]) => {
    const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes: [{ kind: "pfis", id: rec.id, saleId: sid, createdAt: rec.createdAt, data: rec }] }) });
    return res.status;
  }, [old, saleId] as const);
  expect(pushed).toBe(200);
  await page.reload();
  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3290"));
  await expect(box).toHaveValue("06/2027");
  await box.click(); await box.press("Tab");
  await expect(page.locator(".save-bar")).toContainText(/all changes saved/i);
  await close(page);

  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await openDetail(page, pfiRow);
  rows = await sheetRows();
  expect(rows.find((r) => r[2] === KEEP)![4]).toBe("06/2027");
  await close(page);
});

test("warehouse: an entry is red until it is ticked Done, then green, for every role that sees the calendar", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Warehouse's Space").click();
  const TITLE = "E2E: done tick";
  const entry = page.locator(".cal-event", { hasText: TITLE });
  while (await entry.count()) { await entry.first().click(); await page.getByRole("button", { name: "Delete entry" }).click(); await page.getByRole("button", { name: "Yes, delete" }).click(); }
  const day = (n: number) => page.locator(".cal-day:not(.out)", { has: page.locator(".cal-date", { hasText: new RegExp(`^${n}$`) }) });
  await day(20).hover();
  await day(20).locator(".cal-add").click();
  const tick = page.locator(".modal-panel .done-tick input");
  await expect(tick).not.toBeChecked(); // a new entry starts as not done
  await page.locator(".modal-panel input").first().fill(TITLE);
  await page.locator('.modal-panel select[aria-label="Customer or supplier"]').selectOption("supplier");
  await page.getByRole("button", { name: "Save entry" }).click();

  const RED = "rgb(251, 225, 222)"; const GREEN = "rgb(213, 238, 220)";
  await expect(entry).toHaveClass(/is-todo/);
  await expect(entry).toHaveCSS("background-color", RED);
  await expect(entry).toHaveAttribute("title", /^Not done/);

  await entry.click();
  await tick.check();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(entry).toHaveClass(/is-done/);
  await expect(entry).toHaveCSS("background-color", GREEN);
  await expect(entry).toHaveClass(/type-delivery/); // the type dot stays
  await page.waitForTimeout(1200);

  await signIn(page, A.warehouse.username, A.warehouse.password); // the warehouse login sees the same colour and can untick
  await expect(entry).toHaveCSS("background-color", GREEN);
  await entry.click();
  await expect(tick).toBeChecked();
  await tick.uncheck();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(entry).toHaveCSS("background-color", RED);
  await page.waitForTimeout(1200);

  await signIn(page, A.admin.username, A.admin.password);
  await side(page, "Warehouse's Space").click();
  await expect(entry).toHaveCSS("background-color", RED);
  await entry.click();
  await page.getByRole("button", { name: "Delete entry" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(entry).toHaveCount(0);
});

test("container rate: a lane and a rate can be edited, and nothing changes until Save", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Container Rate").click();
  for (const pod of ["E2E Edit Port", "E2E Edited Port"]) {
    const stale = page.locator(".lane-row", { hasText: pod });
    while (await stale.count()) { await stale.first().click(); await page.locator(".lane-detail").getByRole("button", { name: "Delete lane" }).click(); }
  }
  await page.getByRole("button", { name: "Add lane" }).click();
  const form = page.locator(".add-form").first();
  await form.locator("input").nth(0).fill("E2E Edit Port");
  await form.locator("input").nth(1).fill("1 Tset Way, Northampton"); // the typo the edit is for
  await form.locator("input").nth(2).fill("30 days");
  await page.getByRole("button", { name: "Save lane" }).click();
  const lane = page.locator(".lane-detail").first();
  await lane.locator(".mini-form-row input").nth(0).fill("Hapag-Lloyd");
  await lane.locator(".mini-form-row input").nth(1).fill("4000");
  await lane.getByRole("button", { name: "Add rate" }).click();
  await lane.locator(".mini-form-row input").nth(0).fill("MSC");
  await lane.locator(".mini-form-row input").nth(1).fill("4200");
  await lane.getByRole("button", { name: "Add rate" }).click();
  const rates = lane.locator("tbody tr");
  await expect(rates).toHaveCount(2);
  await expect(rates.locator("input")).toHaveCount(0); // rows are read until Edit is clicked

  // Lane: edit, cancel keeps the old values, save applies the new ones.
  const laneRow = page.locator(".lane-row.open");
  await lane.getByRole("button", { name: "Edit lane" }).click();
  const edit = lane.locator(".lane-edit");
  await expect(edit.locator("input").nth(0)).toHaveValue("E2E Edit Port");
  await edit.locator("input").nth(0).fill("Something else");
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(laneRow).toContainText("E2E Edit Port");
  await lane.getByRole("button", { name: "Edit lane" }).click();
  await edit.locator("input").nth(0).fill("E2E Edited Port");
  await edit.locator("input").nth(1).fill("1 Test Way, Northampton");
  await edit.locator("select").selectOption("40ft Reefer");
  await edit.locator("input").nth(2).fill("26 days");
  await edit.getByRole("button", { name: "Save lane changes" }).click();
  await expect(edit).toHaveCount(0);
  await expect(laneRow).toContainText("E2E Edited Port");
  await expect(laneRow).toContainText("1 Test Way, Northampton");
  await expect(laneRow).toContainText("40ft Reefer");
  await expect(laneRow).toContainText("26 days");
  await expect(rates).toHaveCount(2); // the rates stay with the lane

  // Rate: edit MSC down to the cheapest, with the forwarder picked from the suggestions.
  const msc = rates.filter({ hasText: "MSC" });
  await msc.getByTitle("Edit rate").click();
  const editing = rates.filter({ has: page.locator('input[type="number"]') });
  await expect(editing).toHaveCount(1);
  await editing.locator('input[type="number"]').fill("3900");
  await editing.getByRole("button", { name: "Cancel" }).click();
  await expect(msc).toContainText("$4,200.00");
  await msc.getByTitle("Edit rate").click();
  await editing.locator("input").first().fill("mae"); // Maersk was entered on the Lagos lane
  await page.locator(".suggest-panel .suggest-option", { hasText: /^Maersk$/ }).click();
  await editing.locator("select").selectOption("GBP");
  await editing.locator('input[type="number"]').fill("3100");
  await editing.getByRole("button", { name: "Save" }).click();
  await expect(rates.locator("input")).toHaveCount(0);
  const edited = rates.filter({ hasText: "Maersk" });
  await expect(edited).toContainText("£3,100.00");
  await expect(edited).toContainText("Cheapest");
  await expect(laneRow).toContainText("£3,100.00");
  await page.waitForTimeout(1200);

  await page.reload(); // saved for real
  await side(page, "Container Rate").click();
  const saved = page.locator(".lane-row", { hasText: "E2E Edited Port" });
  await expect(saved).toContainText("£3,100.00");
  await saved.click();
  await page.locator(".lane-detail").getByRole("button", { name: "Delete lane" }).click();
  await expect(saved).toHaveCount(0);
});

test("customer: the rep's own notes save by themselves, admin reads them, the buyer never gets them", async ({ page }) => {
  const NOTE_A = "E2E private: agreed 2% off above 10 pallets.";
  const NOTE_B = "E2E private: call Linh, not the office.";
  await signIn(page, A.sale.username, A.sale.password);
  const row = page.locator(".cust-row", { hasText: "Acme Foods Ltd" }).first();
  await row.click();
  const memo = page.locator(".memo-box textarea");
  await expect(page.locator(".memo-box")).toContainText("Nothing here is sent to the Buyer");
  await memo.fill(""); // whatever an earlier run left
  await memo.fill(NOTE_A);
  await expect(page.locator(".memo-state")).toHaveText("saving…");
  await expect(page.locator(".memo-state")).toHaveText("saved"); // no button: it saves once typing stops
  await page.waitForTimeout(1200);

  await page.reload();
  await row.click();
  await expect(memo).toHaveValue(NOTE_A);
  await memo.fill(`${NOTE_A}\n${NOTE_B}`);
  await row.click(); // closing the customer right away still saves what was typed
  await page.waitForTimeout(1200);
  await row.click();
  await expect(memo).toHaveValue(`${NOTE_A}\n${NOTE_B}`);
  // the request box next to it is untouched: nothing was sent to the buyer
  await expect(page.locator(".detail-panel .ticket", { hasText: "E2E private" })).toHaveCount(0);

  await signIn(page, A.buyer.username, A.buyer.password);
  await expect(page.locator("body")).not.toContainText("E2E private");
  const buyerState = await page.evaluate(async () => (await fetch("/api/state")).json());
  expect(buyerState.slices.customerMemos).toEqual([]);
  expect(JSON.stringify(buyerState.slices.customersBySale)).not.toContain("E2E private");

  await signIn(page, A.admin.username, A.admin.password); // admin, in the rep's workspace
  await side(page, A.sale.name).click();
  const adminRow = page.locator(".cust-row", { hasText: "Acme Foods Ltd" }).first();
  await adminRow.click();
  await expect(page.locator(".memo-box textarea")).toHaveValue(`${NOTE_A}\n${NOTE_B}`);

  await signIn(page, A.sale.username, A.sale.password); // emptied: the note is gone for good
  await row.click();
  await memo.fill("");
  await memo.blur();
  await page.waitForTimeout(1200);
  await page.reload();
  await row.click();
  await expect(memo).toHaveValue("");
});

test("customers: edit renames the customer on its PFIs and requests; delete waits until its PFIs are gone", async ({ page }) => {
  const OLD = "E2E Rename Ltd"; const NEW = "E2E Renamed Ltd"; const ASK = "E2E: price list for the renamed customer?";
  const custRow = (name: string) => page.locator(".cust-row", { hasText: name });
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3292" });
  const removePfi = async () => {
    await side(page, "Order Tracking").click();
    if (await pfiRow.count()) {
      await openDetail(page, pfiRow);
      await page.getByRole("button", { name: "Delete PFI" }).click();
      await page.getByRole("button", { name: "Yes, delete" }).click();
      await expect(pfiRow).toHaveCount(0);
    }
    await side(page, "Customer").click();
  };

  await signIn(page, A.sale.username, A.sale.password);
  await removePfi(); // leftovers of an aborted run
  for (const name of [OLD, NEW]) {
    while (await custRow(name).count()) {
      await custRow(name).first().getByTitle("Delete customer").click();
      await page.locator(".confirm-strip").getByRole("button", { name: "Yes, delete" }).click();
    }
  }

  await page.getByRole("button", { name: "Add customer" }).click();
  const add = page.locator(".add-form").first();
  await add.locator("input").nth(0).fill(OLD);
  await add.locator("input").nth(1).fill("Rename x FMCG");
  await add.locator("input").nth(2).fill("Tea");
  await page.getByRole("button", { name: "Save customer" }).click();
  const detail = page.locator(".detail-panel");
  await detail.locator("textarea").first().fill(ASK);
  await page.getByRole("button", { name: "Add info" }).click(); // Notify Buyer now is ticked by default
  await expect(detail).toContainText(/awaiting buyer/i);

  await side(page, "Order Tracking").click();
  await page.getByRole("button", { name: "Add PFI" }).click();
  const pfiForm = page.locator(".add-form").first();
  await pfiForm.locator("input").nth(0).fill("3292");
  await pfiForm.locator("select").first().selectOption({ label: OLD });
  await page.getByRole("button", { name: "Create PFI" }).click();
  await page.locator(".detail-body").waitFor();
  await close(page);
  await expect(pfiRow).toContainText(OLD);

  // Edit: Cancel changes nothing, Save renames everywhere.
  await side(page, "Customer").click();
  await custRow(OLD).getByTitle("Edit customer").click();
  const edit = page.locator(".row-edit");
  await expect(edit.locator("input").nth(0)).toHaveValue(OLD);
  await expect(edit).toContainText("also shows on this customer's 1 PFI");
  await edit.locator("input").nth(0).fill("Never saved Ltd");
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(custRow(OLD)).toHaveCount(1);
  await custRow(OLD).getByTitle("Edit customer").click();
  await edit.locator("input").nth(0).fill(NEW);
  await edit.locator("input").nth(1).fill("Renamed x FMCG");
  await edit.locator("input").nth(2).fill("Tea, jam");
  await edit.getByRole("button", { name: "Save customer" }).click();
  await expect(custRow(NEW)).toContainText("Renamed x FMCG");
  await expect(custRow(NEW)).toContainText("Tea, jam");
  await expect(custRow(NEW)).toContainText("1 PFI");
  await expect(custRow(OLD)).toHaveCount(0);
  await side(page, "Order Tracking").click();
  await expect(pfiRow).toContainText(NEW);
  await openDetail(page, pfiRow);
  await expect(page.locator(".modal-title")).toContainText(NEW);
  await close(page);
  await page.waitForTimeout(1200);

  await signIn(page, A.buyer.username, A.buyer.password); // the buyer sees the new name on the request and on the order
  await expect(page.locator(".feed-item", { hasText: ASK }).first()).toContainText(NEW);
  await pill(page, "Orders to update").click();
  await expect(await order(page, "PFI 3292")).toContainText(NEW);

  // Delete: refused while the PFI exists, with the reason; allowed once it is gone.
  await signIn(page, A.sale.username, A.sale.password);
  await custRow(NEW).getByTitle("Delete customer").click();
  const strip = page.locator(".confirm-strip");
  await expect(strip).toContainText("has 1 PFI, so it cannot be deleted");
  await expect(strip.getByRole("button", { name: "Yes, delete" })).toHaveCount(0);
  await strip.getByRole("button", { name: "OK" }).click();
  await expect(custRow(NEW)).toHaveCount(1);
  await removePfi();
  await custRow(NEW).getByTitle("Delete customer").click();
  await expect(strip).toContainText(`Delete ${NEW}?`);
  await strip.getByRole("button", { name: "Cancel" }).click();
  await expect(custRow(NEW)).toHaveCount(1);
  await custRow(NEW).getByTitle("Delete customer").click();
  await strip.getByRole("button", { name: "Yes, delete" }).click();
  await expect(custRow(NEW)).toHaveCount(0);
  await expect(custRow("Acme Foods Ltd")).toHaveCount(1); // nobody else was touched
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator(".cust-row").first()).toBeVisible();
  await expect(custRow(NEW)).toHaveCount(0);

  await signIn(page, A.buyer.username, A.buyer.password); // its request left the buyer's inbox with it
  await expect(page.locator(".feed-item").first()).toBeVisible();
  await expect(page.locator(".feed-item", { hasText: ASK })).toHaveCount(0);
});

test("suppliers: edit renames the supplier on its POs; delete waits until its POs are gone", async ({ page }) => {
  const OLD = "E2E Supplier Co"; const NEW = "E2E Supplier Renamed";
  const supRow = (name: string) => page.locator(".supplier-row", { hasText: name });
  const poRow = page.locator(".pfi-list-row", { hasText: "PO 4520" });
  const removePo = async () => {
    await pill(page, /^PO$/).click();
    if (await poRow.count()) {
      await openDetail(page, poRow);
      await page.getByRole("button", { name: "Delete PO" }).click();
      await page.getByRole("button", { name: "Yes, delete" }).click();
      await expect(poRow).toHaveCount(0);
    }
    await pill(page, /^Suppliers$/).click();
  };

  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "PO Tracking").click();
  await removePo();
  for (const name of [OLD, NEW]) {
    while (await supRow(name).count()) {
      await supRow(name).first().getByTitle("Delete supplier").click();
      await page.locator(".confirm-strip").getByRole("button", { name: "Yes, delete" }).click();
    }
  }
  const others = await page.locator(".supplier-row").count();

  await page.getByRole("button", { name: "Add supplier" }).click();
  const add = page.locator(".add-form").first();
  await add.locator("input").nth(0).fill(OLD);
  await add.locator("input").nth(1).fill("first note");
  await page.getByRole("button", { name: "Save supplier" }).click();
  await expect(supRow(OLD)).toContainText("first note");

  await pill(page, /^PO$/).click();
  await page.getByRole("button", { name: "Add PO" }).click();
  const poForm = page.locator(".add-form").first();
  await poForm.locator("input").nth(0).fill("4520");
  await poForm.locator("select").first().selectOption({ label: OLD });
  await page.getByRole("button", { name: "Create PO" }).click();
  await page.locator(".detail-body").waitFor();
  await close(page);
  await expect(poRow).toContainText(OLD);

  await pill(page, /^Suppliers$/).click();
  await supRow(OLD).getByTitle("Edit supplier").click();
  const edit = page.locator(".row-edit");
  await expect(edit.locator("input").nth(0)).toHaveValue(OLD);
  await edit.locator("input").nth(0).fill("Never saved Co");
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(supRow(OLD)).toHaveCount(1);
  await supRow(OLD).getByTitle("Edit supplier").click();
  await edit.locator("input").nth(0).fill(NEW);
  await edit.locator("input").nth(1).fill("pays in 30 days");
  await edit.getByRole("button", { name: "Save supplier" }).click();
  await expect(supRow(NEW)).toContainText("pays in 30 days");
  await expect(supRow(OLD)).toHaveCount(0);
  await pill(page, /^PO$/).click();
  await expect(poRow).toContainText(NEW);
  await openDetail(page, poRow);
  await expect(page.locator(".modal-title")).toContainText(NEW);
  await close(page);

  await pill(page, /^Suppliers$/).click();
  await supRow(NEW).getByTitle("Delete supplier").click();
  const strip = page.locator(".confirm-strip");
  await expect(strip).toContainText("has 1 PO, so it cannot be deleted");
  await expect(strip.getByRole("button", { name: "Yes, delete" })).toHaveCount(0);
  await strip.getByRole("button", { name: "OK" }).click();
  await removePo();
  await supRow(NEW).getByTitle("Delete supplier").click();
  await strip.getByRole("button", { name: "Yes, delete" }).click();
  await expect(supRow(NEW)).toHaveCount(0);
  await expect(page.locator(".supplier-row")).toHaveCount(others);
  await page.waitForTimeout(1200);
  await page.reload();
  await pill(page, "PO Tracking").click();
  await pill(page, /^Suppliers$/).click();
  await expect(page.locator(".supplier-row")).toHaveCount(others);
  await expect(supRow(NEW)).toHaveCount(0);
});

test("customer balance: invoices sit under their customer with the outstanding total; each invoice has its status", async ({ page }) => {
  const iso = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dmy = (offsetDays: number) => { const [y, m, d] = iso(offsetDays).split("-"); return `${d}/${m}/${y}`; };
  const typeDate = async (field: ReturnType<Page["locator"]>, value: string) => { const box = field.locator('.date-field input[type="text"]'); await box.fill(value); await box.press("Enter"); };

  for (const who of [A.sale, A.buyer, A.warehouse]) {
    await signIn(page, who.username, who.password);
    await expect(page.locator(".side-item", { hasText: "Customer Balance" })).toHaveCount(0);
    const state = await page.evaluate(async () => (await fetch("/api/state")).json());
    expect(state.slices.paymentTracks).toEqual([]);
  }

  await signIn(page, A.admin.username, A.admin.password);
  await expect(page.locator(".side-item", { hasText: "Payment tracking" })).toHaveCount(0); // the tab's first name
  await side(page, "Customer Balance").click();
  await expect(page.locator(".page-title")).toHaveText("Customer Balance");
  const find = page.locator(".overview-bar input");
  const row = (inv: string) => page.locator("tr.pay-row", { hasText: inv });
  const customer = (name: string) => page.locator(".pay-cust", { has: page.locator(".pay-cust-row .company-name", { hasText: name }) });
  const dropAll = async () => {
    await find.fill("E2E-INV"); // a search opens what it finds
    while (await page.locator("tr.pay-row").count()) {
      await page.locator("tr.pay-row").first().getByTitle("Delete payment").click();
      await page.locator(".confirm-strip").getByRole("button", { name: "Yes, delete" }).click();
    }
    await find.fill("");
  };
  await dropAll();
  const customersBefore = await page.locator(".pay-cust").count();

  const form = page.locator(".add-form").first();
  const field = (label: string) => form.locator(".form-grid > div", { has: page.locator("label", { hasText: new RegExp(`^${label}$`) }) });
  const add = async (name: string, inv: string, currency: string, amount: string, due: number | null, hold = false, pick = false) => {
    await page.getByRole("button", { name: "Add payment" }).click();
    if (pick) { await field("Customer").locator("input").fill("acme"); await page.locator(".suggest-panel .suggest-option", { hasText: "Acme Foods Ltd" }).click(); }
    else await field("Customer").locator("input").fill(name);
    await field("INV").locator("input").fill(inv);
    await field("Currency").locator("select").selectOption(currency);
    await field("Amount").locator("input").fill(amount);
    if (due !== null) await typeDate(field("Due date"), dmy(due));
    if (hold) await field("Container on hold").locator('input[type="checkbox"]').check();
    await form.getByRole("button", { name: "Save payment" }).click();
    await expect(row(inv)).toHaveCount(1); // the customer opens on its new invoice
  };
  await page.getByRole("button", { name: "Add payment" }).click();
  await expect(form.locator(".form-grid > div > label:first-child")).toHaveText(["Customer", "INV", "Loading date", "ETA", "Currency", "Amount", "Due date", "Container on hold"]);
  await expect(form.getByRole("button", { name: "Save payment" })).toBeDisabled();
  await form.getByRole("button", { name: "Cancel" }).click();
  await add("Acme Foods Ltd", "E2E-INV-1", "GBP", "12500.5", -3, true, true); // three days late, container held
  await add("  acme foods ltd ", "E2E-INV-2", "GBP", "800", 10); // typed differently: the same customer
  await add("Acme Foods Ltd", "E2E-INV-3", "USD", "300", null);
  await add("E2E Walk-in Trading", "E2E-INV-4", "EUR", "950.25", 0);

  // One row per customer, A to Z, with what is still owed.
  await expect(page.locator(".pay-cust-head > div")).toHaveText(["Customer", "Invoices", "Outstanding balance", "", ""]);
  await expect(page.locator(".pay-cust")).toHaveCount(customersBefore + 2);
  const names = (await page.locator(".pay-cust-row .company-name").allInnerTexts()).map((n) => n.trim());
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })));
  const acme = customer("Acme Foods Ltd");
  const head = acme.locator(".pay-cust-row");
  await expect(head).toContainText("3 invoices");
  await expect(head.locator(".pay-cust-total")).toHaveText("$300.00 + £13,300.50");
  await expect(head.locator(".pay-cust-flags")).toContainText("1 overdue");
  await expect(head.locator(".pay-cust-flags")).toContainText("1 on hold");
  await expect(customer("E2E Walk-in Trading").locator(".pay-cust-total")).toHaveText("€950.25");

  // A click folds the customer away and brings its invoices back.
  await expect(acme.locator("tr.pay-row")).toHaveCount(3);
  await head.click();
  await expect(acme.locator("tr.pay-row")).toHaveCount(0);
  await head.click();
  await expect(acme.locator("tr.pay-row")).toHaveCount(3);
  await expect(acme.locator(".pay-track-table thead th")).toHaveText(["INV", "Loading date", "ETA", "Currency", "Amount", "Due date", "Container on hold", "Status", "Due", ""]);
  await expect(acme.locator(".pay-cust-foot")).toContainText("Invoiced $300.00 + £13,300.50");

  // Status per invoice: Have not paid to start with, then Received proof, then Received.
  const status = (inv: string) => row(inv).locator("select.pay-status");
  const due = (inv: string) => row(inv).locator("td").nth(8);
  await expect(status("E2E-INV-1").locator("option")).toHaveText(["Have not paid", "Received proof", "Received"]);
  for (const inv of ["E2E-INV-1", "E2E-INV-2", "E2E-INV-3", "E2E-INV-4"]) await expect(status(inv)).toHaveValue("not_paid");
  await expect(row("E2E-INV-1").locator('input[type="checkbox"]')).toHaveCount(1); // only Container on hold is still a tick
  await expect(due("E2E-INV-1")).toHaveText(/overdue 3 days/i);
  await expect(row("E2E-INV-1")).toHaveClass(/is-overdue/);
  await expect(due("E2E-INV-2")).toHaveText(/due in 10 days/i);
  await expect(due("E2E-INV-3")).toHaveText(/no due date/i);
  await expect(due("E2E-INV-4")).toHaveText(/due today/i);

  await status("E2E-INV-1").selectOption("proof"); // a proof of payment is not the money: still owed, still late
  await expect(due("E2E-INV-1")).toHaveText(/overdue 3 days/i);
  await expect(head.locator(".pay-cust-total")).toHaveText("$300.00 + £13,300.50");
  await expect(head.locator(".pay-cust-flags")).toContainText("1 overdue");

  await status("E2E-INV-1").selectOption("received");
  await expect(due("E2E-INV-1")).toHaveText(/settled/i);
  await expect(row("E2E-INV-1")).not.toHaveClass(/is-overdue/);
  await expect(head.locator(".pay-cust-total")).toHaveText("$300.00 + £800.00");
  await expect(head).toContainText("3 invoices · 2 outstanding");
  await expect(head.locator(".pay-cust-flags .chip")).toHaveCount(0); // nothing late or held among what is still owed
  await status("E2E-INV-2").selectOption("received");
  await status("E2E-INV-3").selectOption("received");
  await expect(head.locator(".pay-cust-total")).toHaveText(/settled/i);
  await expect(acme.locator(".pay-cust-foot")).toContainText("outstanding nothing");
  await status("E2E-INV-2").selectOption("not_paid"); // and back
  await expect(head.locator(".pay-cust-total")).toHaveText("£800.00");

  // Edit and the tick still work from the invoice row.
  await row("E2E-INV-2").locator('input[aria-label="Container on hold"]').check();
  await expect(head.locator(".pay-cust-flags")).toContainText("1 on hold");
  await row("E2E-INV-2").getByTitle("Edit payment").click();
  const edit = page.locator("tr.pay-edit-row");
  const editField = (label: string) => edit.locator(".form-grid > div", { has: page.locator("label", { hasText: new RegExp(`^${label}$`) }) });
  await editField("Amount").locator("input").fill("1");
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(row("E2E-INV-2").locator("td").nth(4)).toHaveText("£800.00");
  await row("E2E-INV-2").getByTitle("Edit payment").click();
  await editField("Amount").locator("input").fill("900.75");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(head.locator(".pay-cust-total")).toHaveText("£900.75");
  await page.waitForTimeout(1200);

  // A record saved before the status existed, ticked Paid, reads as Received.
  const pushed = await page.evaluate(async ([dueDate]) => {
    const now = new Date().toISOString();
    const data = { id: "ptrack-e2e-legacy", customer: "E2E Walk-in Trading", inv: "E2E-INV-OLD", loadingDate: "", eta: "", currency: "EUR", amount: 120, dueDate, onHold: false, paid: true, createdBy: "e2e", createdAt: now, updatedAt: now };
    return (await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes: [{ kind: "paymentTracks", id: data.id, createdAt: now, data }] }) })).status;
  }, [iso(-30)]);
  expect(pushed).toBe(200);

  await page.reload(); // everything was saved; the list opens folded
  await side(page, "Customer Balance").click();
  await expect(page.locator(".pay-cust-row").first()).toBeVisible();
  await expect(page.locator("tr.pay-row")).toHaveCount(0);
  await expect(customer("Acme Foods Ltd").locator(".pay-cust-total")).toHaveText("£900.75");
  const walkin = customer("E2E Walk-in Trading");
  await expect(walkin.locator(".pay-cust-row")).toContainText("2 invoices · 1 outstanding");
  await expect(walkin.locator(".pay-cust-total")).toHaveText("€950.25");
  await walkin.locator(".pay-cust-row").click();
  await expect(status("E2E-INV-OLD")).toHaveValue("received");
  await expect(due("E2E-INV-OLD")).toHaveText(/settled/i);
  await customer("Acme Foods Ltd").locator(".pay-cust-row").click();
  await expect(status("E2E-INV-1")).toHaveValue("received");
  await expect(status("E2E-INV-2")).toHaveValue("not_paid");

  // Find by INV or customer: only what matches, opened.
  await find.fill("e2e-inv-3");
  await expect(page.locator(".pay-cust")).toHaveCount(1);
  await expect(page.locator("tr.pay-row")).toHaveCount(1);
  await expect(row("E2E-INV-3")).toHaveCount(1);
  await find.fill("walk-in");
  await expect(page.locator(".pay-cust")).toHaveCount(1);
  await expect(page.locator("tr.pay-row")).toHaveCount(2);
  await find.fill("");

  await row("E2E-INV-4").getByTitle("Delete payment").click();
  await page.locator(".confirm-strip").getByRole("button", { name: "Cancel" }).click();
  await expect(row("E2E-INV-4")).toHaveCount(1);
  await dropAll();
  await expect(page.locator(".pay-cust")).toHaveCount(customersBefore);
});

test("container rate: lanes are listed A to Z by POD, also after a new lane, a rename and a reload", async ({ page }) => {
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Container Rate").click();
  const PODS = ["E2E Sort Zeta", "e2e sort alpha", "E2E Sort Mid", "E2E Sort Omega"];
  const clean = async () => {
    for (const pod of PODS) {
      const stale = page.locator(".lane-row", { hasText: pod });
      while (await stale.count()) { await stale.first().click(); await page.locator(".lane-detail").getByRole("button", { name: "Delete lane" }).click(); }
    }
  };
  await clean();
  const addLane = async (pod: string) => {
    await page.getByRole("button", { name: "Add lane" }).click();
    const form = page.locator(".add-form").first();
    await form.locator("input").nth(0).fill(pod);
    await form.locator("input").nth(1).fill("1 Sort Way, Northampton");
    await page.getByRole("button", { name: "Save lane" }).click();
    await expect(page.locator(".lane-row.open .company-name")).toHaveText(pod); // the new lane opens wherever it lands
  };
  const listed = () => page.locator(".lane-row .company-name").allInnerTexts();
  const mine = async () => (await listed()).filter((p) => /e2e sort/i.test(p));
  const inOrder = (names: string[]) => [...names].sort((a, b) => a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base", numeric: true }));

  for (const pod of PODS.slice(0, 3)) await addLane(pod); // entered Zeta, alpha, Mid
  expect(await mine()).toEqual(["e2e sort alpha", "E2E Sort Mid", "E2E Sort Zeta"]);
  const all = await listed();
  expect(all).toEqual(inOrder(all)); // the whole list, the older lanes included
  expect(all.indexOf("Lagos, Apapa")).toBeGreaterThan(all.indexOf("E2E Sort Zeta"));

  // Renaming a lane moves it to its new place.
  await expect(page.locator(".lane-row.open .company-name")).toHaveText("E2E Sort Mid"); // still open from being added last
  await page.locator(".lane-detail").getByRole("button", { name: "Edit lane" }).click();
  await page.locator(".lane-edit input").nth(0).fill("E2E Sort Omega");
  await page.locator(".lane-edit").getByRole("button", { name: "Save lane changes" }).click();
  expect(await mine()).toEqual(["e2e sort alpha", "E2E Sort Omega", "E2E Sort Zeta"]);
  await expect(page.locator(".lane-row.open .company-name")).toHaveText("E2E Sort Omega"); // and stays open

  // The search keeps the order; so does a reload.
  await page.locator(".overview-bar input").fill("e2e sort");
  expect(await listed()).toEqual(["e2e sort alpha", "E2E Sort Omega", "E2E Sort Zeta"]);
  await page.locator(".overview-bar input").fill("");
  await page.waitForTimeout(1200);
  await page.reload();
  await side(page, "Container Rate").click();
  await expect(page.locator(".lane-row").first()).toBeVisible();
  expect(await mine()).toEqual(["e2e sort alpha", "E2E Sort Omega", "E2E Sort Zeta"]);
  const after = await listed();
  expect(after).toEqual(inOrder(after));

  await clean();
  expect(await mine()).toEqual([]);
});

test("PO: a PFI line that the cases ordered do not cover is flagged, with the cases missing", async ({ page }) => {
  const TEA = "E2E Cover Tea 100g"; const JAM = "E2E Cover Jam 200g";
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3293" });
  const poRow = (no: string) => page.locator(".pfi-list-row", { hasText: `PO ${no}` });
  const lineRows = page.locator(".detail-body tbody tr:not(.sub-row):not(:has(td[colspan]))");
  const lineOf = (name: string) => lineRows.filter({ has: page.locator(`input[value="${name}"]`) });
  const addRow = async (name: string, qty: string) => {
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    await rowForm.locator("input").nth(0).fill(name);
    await rowForm.locator("input").nth(4).fill(qty);
    await rowForm.locator("input").nth(5).fill("1");
    await rowForm.getByRole("button", { name: "Add row" }).click();
  };
  const linkToPfi = async (name: string) => {
    await lineOf(name).locator(".pfi-picker-trigger").click();
    await page.locator(".pfi-picker-option", { hasText: "PFI 3293" }).locator('input[type="checkbox"]').check();
    await page.locator(".picker-backdrop").click();
  };
  const removeDoc = async (row: ReturnType<Page["locator"]>, button: string) => {
    if (!(await row.count())) return;
    await openDetail(page, row);
    await page.getByRole("button", { name: button }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(row).toHaveCount(0);
  };
  const openPos = async () => { await pill(page, "PO Tracking").click(); await pill(page, /^PO$/).click(); };
  const newPo = async (no: string) => {
    await page.getByRole("button", { name: "Add PO" }).click();
    await page.locator(".add-form").first().locator("input").nth(0).fill(no);
    await page.getByRole("button", { name: "Create PO" }).click();
    await page.locator(".detail-body").waitFor();
  };
  const alloc = page.locator(".detail-body tr.sub-row", { hasText: "PFI 3293" });
  const warning = page.locator(".detail-body .short-warning");

  // Leftovers of an aborted run, then the order: tea 100 cases, jam 40.
  await signIn(page, A.buyer.username, A.buyer.password);
  await openPos();
  await removeDoc(poRow("4531"), "Delete PO");
  await removeDoc(poRow("4530"), "Delete PO");
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await removeDoc(pfiRow, "Delete PFI");
  await page.getByRole("button", { name: "Add PFI" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("3293");
  await page.getByRole("button", { name: "Create PFI" }).click();
  await page.locator(".detail-body").waitFor();
  await addRow(TEA, "100");
  await addRow(JAM, "40");
  await save(page);
  await close(page);

  // First PO: 80 cases of tea for an order of 100.
  await signIn(page, A.buyer.username, A.buyer.password);
  await openPos();
  await newPo("4530");
  await expect(warning).toHaveCount(0); // nothing linked yet, nothing to warn about
  await addRow(TEA, "80");
  await linkToPfi(TEA);
  const teaAlloc = alloc.first();
  await expect(teaAlloc.locator(".cover-note")).toHaveClass(/short/); // no cases typed: the whole row goes to the PFI
  await expect(teaAlloc.locator(".cover-note")).toContainText("Short 20");
  await expect(teaAlloc.locator(".cover-note")).toContainText("80 of 100 for this PFI");
  await expect(warning).toContainText("1 PFI line is not fully covered");
  await expect(warning).toContainText(`PFI 3293 · Acme Foods Ltd — ${TEA}: needs 100, allocated 80, short 20`);

  const cases = teaAlloc.locator('input[placeholder="cases"]');
  await cases.fill("60");
  await expect(teaAlloc.locator(".cover-note")).toContainText("Short 40");
  await expect(warning).toContainText("allocated 60, short 40");
  await cases.fill("100"); // covered: the warning goes
  await expect(teaAlloc.locator(".cover-note")).toHaveClass(/ok/);
  await expect(teaAlloc.locator(".cover-note")).toContainText("Covered");
  await expect(teaAlloc.locator(".cover-note")).toContainText("100 of 100 for this PFI");
  await expect(warning).toHaveCount(0);
  await cases.fill("80");
  await expect(warning).toContainText("short 20");

  await addRow(JAM, "40"); // a second line of the same PFI, covered in full
  await linkToPfi(JAM);
  const jamAlloc = alloc.nth(1);
  await jamAlloc.locator('input[placeholder="cases"]').fill("40");
  await expect(jamAlloc.locator(".cover-note")).toContainText("Covered");
  await expect(warning).toContainText("1 PFI line is not fully covered"); // still only the tea
  await expect(warning).not.toContainText(JAM);

  // A removed row gives nothing and asks for nothing.
  const teaStatus = teaAlloc.locator("select").filter({ has: page.locator('option[value="removed"]') });
  await teaStatus.selectOption("removed");
  await expect(teaAlloc.locator(".cover-note")).toHaveCount(0);
  await expect(warning).toHaveCount(0);
  await teaStatus.selectOption("ordered");
  await expect(warning).toContainText("short 20");
  await save(page);
  await expect(warning).toContainText("short 20"); // saving does not hide it
  await close(page);

  // The sale sees the same on the PFI, before anything has arrived; so does the buyer in Orders to update.
  const pfiLine = (name: string) => page.locator(".detail-body tbody tr:not(.sub-row)", { hasText: name });
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await openDetail(page, pfiRow);
  await expect(warning).toContainText("1 line is not fully covered by the cases ordered on the POs");
  await expect(warning).toContainText(`${TEA}: needs 100, ordered 80, short 20`);
  await expect(warning).not.toContainText(JAM);
  await expect(lineOf(TEA).locator(".cover-note")).toHaveClass(/short/);
  await expect(lineOf(TEA).locator(".cover-note")).toContainText("Short 20");
  await expect(lineOf(TEA).locator(".cover-note")).toContainText("80 of 100 ordered");
  await expect(lineOf(JAM).locator(".cover-note")).toHaveClass(/ok/);
  await expect(lineOf(JAM).locator(".cover-note")).toContainText("40 of 40 ordered");
  await close(page);
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3293"));
  await expect(warning).toContainText(`${TEA}: needs 100, ordered 80, short 20`);
  await expect(pfiLine(TEA).locator(".cover-note")).toContainText("Short 20");
  await close(page);
  await openPos();

  // Second PO tops the tea up: what the first PO gives is counted.
  await newPo("4531");
  await addRow(TEA, "30");
  await linkToPfi(TEA);
  await alloc.first().locator('input[placeholder="cases"]').fill("15");
  await expect(alloc.first().locator(".cover-note")).toContainText("Short 5");
  await expect(alloc.first().locator(".cover-note")).toContainText("95 of 100 for this PFI");
  await expect(warning).toContainText("needs 100, allocated 95 (this PO 15 + other POs 80), short 5");
  await alloc.first().locator('input[placeholder="cases"]').fill("20");
  await expect(alloc.first().locator(".cover-note")).toContainText("Covered");
  await expect(warning).toHaveCount(0);
  await save(page);
  await close(page);

  await openDetail(page, poRow("4530")); // and the first PO no longer warns
  await expect(alloc.first().locator(".cover-note")).toContainText("Covered");
  await expect(alloc.first().locator(".cover-note")).toContainText("100 of 100 for this PFI");
  await expect(warning).toHaveCount(0);
  await close(page);

  // The sale orders 20 more: both POs warn again.
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await openDetail(page, pfiRow);
  await expect(warning).toHaveCount(0); // two POs, 80 + 20: covered
  await expect(lineOf(TEA).locator(".cover-note")).toContainText("Covered");
  await expect(lineOf(TEA).locator(".cover-note")).toContainText("100 of 100 ordered");
  await lineOf(TEA).locator('input[type="number"]').first().fill("120");
  await expect(warning).toContainText(`${TEA}: needs 120, ordered 100, short 20`); // as soon as the quantity is typed
  await expect(lineOf(TEA).locator(".cover-note")).toContainText("Short 20");
  await save(page);
  await close(page);
  await signIn(page, A.buyer.username, A.buyer.password);
  await openPos();
  await openDetail(page, poRow("4530"));
  await expect(warning).toContainText("needs 120, allocated 100 (this PO 80 + other POs 20), short 20");
  await close(page);

  await removeDoc(poRow("4531"), "Delete PO");
  await removeDoc(poRow("4530"), "Delete PO");
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Order Tracking").click();
  await removeDoc(pfiRow, "Delete PFI");
});

test("drop-down panels open upwards when their button sits at the bottom of the window", async ({ page }) => {
  const viewport = page.viewportSize()!;
  // Button and panel are measured in one go, so a scroll in between cannot skew the comparison.
  const measure = (anchorSel: string, panelSel: string) => page.evaluate(([a, p]) => {
    const anchors = document.querySelectorAll(a);
    const t = anchors[anchors.length - 1].getBoundingClientRect();
    const b = document.querySelector(p)!.getBoundingClientRect();
    return { top: t.top, bottom: t.bottom, panel: { top: b.top, bottom: b.bottom, left: b.left, right: b.right }, vh: window.innerHeight, vw: window.innerWidth };
  }, [anchorSel, panelSel]);
  const check = (m: Awaited<ReturnType<typeof measure>>, panelHeight: number) => {
    expect(m.panel.top).toBeGreaterThanOrEqual(0); // all of it on screen
    expect(m.panel.bottom).toBeLessThanOrEqual(m.vh);
    expect(m.panel.left).toBeGreaterThanOrEqual(0);
    expect(m.panel.right).toBeLessThanOrEqual(m.vw);
    const above = m.panel.bottom <= m.top + 1; const below = m.panel.top >= m.bottom - 1;
    expect(above || below).toBe(true); // attached to its button
    const roomBelow = m.vh - m.bottom; const roomAbove = m.top;
    expect(above).toBe(roomBelow < panelHeight && roomAbove > roomBelow); // upwards only when there is no room underneath
    return { above, below };
  };

  // Link PFI on a PO row.
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, page.locator(".pfi-list-row", { hasText: "PO 4500" }));
  const TRIGGER = ".detail-body .pfi-picker-trigger"; const PICKER = ".pfi-picker-panel";
  const trigger = page.locator(TRIGGER).last();
  const picker = page.locator(PICKER);
  await trigger.evaluate((el) => el.scrollIntoView({ block: "end" })); // the last row, at the very bottom
  await trigger.click();
  await expect(picker).toBeVisible();
  expect(check(await measure(TRIGGER, PICKER), 236).above).toBe(true);
  await expect(picker.locator(".pfi-picker-option").first()).toBeInViewport({ ratio: 1 });
  await picker.locator(".pfi-picker-search").fill("3200"); // usable where it opened; a shorter list stays attached to the button
  await expect(picker.locator(".pfi-picker-option")).toHaveCount(1);
  expect(check(await measure(TRIGGER, PICKER), 236).above).toBe(true);
  await page.locator(".picker-backdrop").click();
  await expect(picker).toHaveCount(0);

  const first = page.locator(TRIGGER).first(); // a row with room underneath opens downwards, as before
  await first.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await first.click();
  await expect(picker).toBeVisible();
  const m = await page.evaluate(([a, p]) => {
    const t = document.querySelector(a)!.getBoundingClientRect(); const b = document.querySelector(p)!.getBoundingClientRect();
    return { top: t.top, bottom: t.bottom, panel: { top: b.top, bottom: b.bottom, left: b.left, right: b.right }, vh: window.innerHeight, vw: window.innerWidth };
  }, [TRIGGER, PICKER]);
  expect(check(m, 236).below).toBe(true);
  await page.locator(".picker-backdrop").click();
  const discard = page.getByRole("button", { name: "Discard" });
  if (await discard.isEnabled()) await discard.click();
  await close(page);

  // Forwarder suggestions in Container Rate, in a window only tall enough for the form.
  await side(page, "Container Rate").click();
  await page.locator(".lane-row", { hasText: "Lagos" }).first().click();
  const FORWARDER = ".lane-detail .mini-form-row input";
  const forwarder = page.locator(FORWARDER).first();
  const box = (await forwarder.boundingBox())!;
  await page.setViewportSize({ width: viewport.width, height: Math.ceil(box.y + box.height + 40) });
  await forwarder.click();
  const suggest = page.locator(".suggest-panel");
  await expect(suggest).toBeVisible();
  const s = await page.evaluate(([a, p]) => {
    const t = document.querySelector(a)!.getBoundingClientRect(); const b = document.querySelector(p)!.getBoundingClientRect();
    return { top: t.top, bottom: t.bottom, panel: { top: b.top, bottom: b.bottom, left: b.left, right: b.right }, vh: window.innerHeight, vw: window.innerWidth };
  }, [FORWARDER, ".suggest-panel"]);
  expect(check(s, 214).above).toBe(true);
  await suggest.locator(".suggest-option", { hasText: /^MSC$/ }).click();
  await expect(forwarder).toHaveValue("MSC");
  await forwarder.fill("");
  await page.setViewportSize(viewport);
});

test("orders to update: the PFIs are listed under their sale rep, pending first", async ({ page }) => {
  const REP = "E2E Zed Rep"; const REP_USER = "e2e-zed"; const CUSTOMER = "E2E Zed Customer";
  const repRow = () => page.locator(".account-row").filter({ has: page.locator(`input[value="${REP_USER}"]`) });
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3294" });
  const group = (name: string) => page.locator(".sale-group", { has: page.locator(".sale-group-name", { hasText: name }) });
  const removeRep = async () => {
    await signIn(page, A.admin.username, A.admin.password);
    if (await side(page, REP).count()) {
      await side(page, REP).click();
      await pill(page, "Order Tracking").click();
      if (await pfiRow.count()) {
        await openDetail(page, pfiRow);
        await page.getByRole("button", { name: "Delete PFI" }).click();
        await page.getByRole("button", { name: "Yes, delete" }).click();
        await expect(pfiRow).toHaveCount(0);
      }
      await pill(page, "Customer").click();
      const cust = page.locator(".cust-row", { hasText: CUSTOMER });
      while (await cust.count()) { await cust.first().getByTitle("Delete customer").click(); await page.locator(".confirm-strip").getByRole("button", { name: "Yes, delete" }).click(); }
    }
    await side(page, "Accounts").click();
    if (await repRow().count()) { await repRow().locator('button[title="Delete account"]').click(); await expect(repRow()).toHaveCount(0); }
    await page.waitForTimeout(1200);
  };
  await removeRep(); // leftovers of an aborted run

  // A second rep with one order, entered by admin in that rep's workspace.
  const form = page.locator(".add-form").first();
  await form.locator("select").selectOption("sale");
  await form.locator("input").nth(0).fill(REP);
  await form.locator("input").nth(1).fill(REP_USER);
  await form.locator("input").nth(2).fill(`z${Math.random().toString(36).slice(2, 10)}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(repRow()).toHaveCount(1);
  await side(page, REP).click();
  await page.getByRole("button", { name: "Add customer" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill(CUSTOMER);
  await page.getByRole("button", { name: "Save customer" }).click();
  await pill(page, "Order Tracking").click();
  await page.getByRole("button", { name: "Add PFI" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("3294");
  await page.getByRole("button", { name: "Create PFI" }).click();
  await page.locator(".detail-body").waitFor();
  await close(page);
  await page.waitForTimeout(1200);

  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  // Names only to start with, A to Z.
  await expect(page.locator(".sale-group-head").first()).toBeVisible();
  await expect(page.locator(".fulfil-head")).toHaveCount(0);
  const names = (await page.locator(".sale-group-name").allInnerTexts()).map((n) => n.trim());
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })));
  expect(names).toContain(REP);
  expect(names).toContain(A.sale.name);
  expect(new Set(names).size).toBe(names.length); // one row per rep

  // A rep opens to that rep's PFIs only, pending ones first.
  await expect(group(REP).locator(".sale-group-counts")).toContainText("1 pending");
  await expect(group(REP).locator(".sale-group-counts")).toContainText("1 PFI");
  await group(REP).locator(".sale-group-head").click();
  await expect(page.locator(".fulfil-head")).toHaveCount(1);
  await expect(page.locator(".fulfil-head")).toContainText(`${CUSTOMER} — ${REP}`);
  await expect(page.locator(".fulfil-head")).toContainText("PFI 3294");
  await expect(page.locator(".fulfil-head .chip").first()).toHaveText(/pending/i);

  const mine = group(A.sale.name!);
  await mine.locator(".sale-group-head").click(); // a second rep can be open at the same time
  const rows = mine.locator(".fulfil-head");
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await expect(mine.locator(".sale-group-counts")).toContainText(`${total} PFIs`);
  await expect(rows.filter({ hasText: "PFI 3200" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "PFI 3294" })).toHaveCount(0);
  for (const text of await rows.allInnerTexts()) expect(text).toContain(`— ${A.sale.name}`);
  const rank = (await rows.locator(".chip:not(.yellow)").allInnerTexts()).map((t) => ["PENDING", "COMPLETE ORDERING", "LOADED"].indexOf(t.trim().toUpperCase()));
  expect(rank.every((r) => r >= 0)).toBe(true);
  expect(rank).toEqual([...rank].sort((a, b) => a - b));
  const pendingShown = rank.filter((r) => r === 0).length;
  await expect(mine.locator(".sale-group-counts")).toContainText(`${pendingShown} pending`);
  await expect(page.locator(".fulfil-head")).toHaveCount(total + 1);

  // Opening an order works as before, and the list is as it was left.
  await openDetail(page, rows.filter({ hasText: "PFI 3200" }));
  await expect(page.locator(".modal-title")).toContainText("PFI 3200");
  await close(page);
  await expect(page.locator(".fulfil-head")).toHaveCount(total + 1);
  await group(REP).locator(".sale-group-head").click(); // and a rep closes again
  await expect(page.locator(".fulfil-head")).toHaveCount(total);

  await removeRep();
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  await expect(page.locator(".sale-group-head").first()).toBeVisible();
  await expect(group(REP)).toHaveCount(0);
});

test("after a PO is sent: a quantity changed by Sale turns the row yellow, a removed line is named in red", async ({ page }) => {
  const TEA = "E2E Mark Tea 100g"; const JAM = "E2E Mark Jam 200g"; const RICE = "E2E Mark Rice 1kg";
  const YELLOW = "rgb(255, 246, 214)"; const RED = "rgb(255, 241, 239)";
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3295" });
  const poRow = page.locator(".pfi-list-row", { hasText: "PO 4540" });
  const TABLE = ".detail-body table.sticky-first tbody"; // the products table, not the unmatched rows under it
  const lineRows = page.locator(`${TABLE} tr:not(.sub-row):not(.ghost-row):not(:has(td[colspan]))`);
  const lineOf = (name: string) => lineRows.filter({ has: page.locator(`input[value="${name}"]`) });
  const roLine = (name: string) => page.locator(`${TABLE} tr:not(.sub-row):not(.ghost-row)`, { hasText: name }); // the buyer reads the names
  const allocOf = (name: string) => lineOf(name).locator("xpath=following-sibling::tr[contains(@class,'sub-row')][1]");
  const addRow = async (name: string, qty: string) => {
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    await rowForm.locator("input").nth(0).fill(name);
    await rowForm.locator("input").nth(4).fill(qty);
    await rowForm.locator("input").nth(5).fill("1");
    await rowForm.getByRole("button", { name: "Add row" }).click();
  };
  const removeDoc = async (row: ReturnType<Page["locator"]>, button: string) => {
    if (!(await row.count())) return;
    await openDetail(page, row);
    await page.getByRole("button", { name: button }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(row).toHaveCount(0);
  };
  const asSale = async () => { await signIn(page, A.sale.username, A.sale.password); await side(page, "Order Tracking").click(); };
  const asBuyerOnPos = async () => { await signIn(page, A.buyer.username, A.buyer.password); await pill(page, "PO Tracking").click(); await pill(page, /^PO$/).click(); };
  const setQty = async (name: string, qty: string) => { await openDetail(page, pfiRow); await lineOf(name).locator('input[type="number"]').first().fill(qty); await save(page); await close(page); await page.waitForTimeout(1200); };

  await asBuyerOnPos();
  await removeDoc(poRow, "Delete PO");
  await asSale();
  await removeDoc(pfiRow, "Delete PFI");
  await page.getByRole("button", { name: "Add PFI" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("3295");
  await page.getByRole("button", { name: "Create PFI" }).click();
  await page.locator(".detail-body").waitFor();
  for (const [n, q] of [[TEA, "100"], [JAM, "40"], [RICE, "30"]]) await addRow(n, q);
  await save(page);
  await close(page);

  // The buyer orders all three, without sending the PO yet.
  await asBuyerOnPos();
  await page.getByRole("button", { name: "Add PO" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("4540");
  await page.getByRole("button", { name: "Create PO" }).click();
  await page.locator(".detail-body").waitFor();
  for (const [n, q] of [[TEA, "100"], [JAM, "40"], [RICE, "30"]]) {
    await addRow(n, q);
    await lineOf(n).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await lineOf(n).locator(".pfi-picker-trigger").click();
    await page.locator(".pfi-picker-option", { hasText: "PFI 3295" }).locator('input[type="checkbox"]').check();
    await page.locator(".picker-backdrop").click();
    await allocOf(n).locator('input[placeholder="cases"]').fill(q);
  }
  await save(page);
  await close(page);

  // A change made before the PO is sent is not flagged.
  await asSale();
  await setQty(TEA, "110");
  await asBuyerOnPos();
  await openDetail(page, poRow);
  await expect(page.locator(".detail-body tr.row-changed")).toHaveCount(0);
  await page.getByRole("button", { name: "Sent", exact: true }).click(); // from here on the buyer has to hear about changes
  await save(page);
  await expect(page.locator(".detail-body tr.row-changed, .detail-body tr.row-gone")).toHaveCount(0);
  await close(page);

  // Sale changes a quantity and removes a line.
  await asSale();
  await openDetail(page, pfiRow);
  await lineOf(TEA).locator('input[type="number"]').first().fill("120");
  await expect(lineOf(TEA)).toHaveClass(/row-changed/); // the sale sees it as soon as the quantity is typed
  await expect(lineOf(TEA).locator("td").first()).toHaveCSS("background-color", YELLOW);
  await expect(lineOf(TEA).locator(".change-note")).toContainText("was 110");
  await expect(lineOf(TEA).getByRole("button", { name: "Seen" })).toHaveCount(0); // only the buyer can settle it
  await expect(lineOf(JAM)).not.toHaveClass(/row-changed/);
  await lineOf(RICE).getByTitle("Remove product line").click();
  await expect(lineRows).toHaveCount(2);
  await save(page);
  await close(page);
  await page.waitForTimeout(1200);
  await openDetail(page, pfiRow); // and on the sale's own screen the removed line is named where it was
  await expect(lineOf(TEA)).toHaveClass(/row-changed/);
  await expect(page.locator(".detail-body tr.ghost-row .gone-note")).toContainText(`${RICE} has been removed`);
  await expect(page.locator(".detail-body tr.ghost-row .gone-note")).toHaveCSS("color", "rgb(178, 59, 59)");
  await expect(page.locator(".save-bar")).toContainText(/all changes saved/i);
  await close(page);

  // Orders to update: the list points at the order, the order shows where.
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  const group = page.locator(".sale-group", { has: page.locator(".sale-group-name", { hasText: A.sale.name! }) });
  await expect(group.locator(".sale-group-counts")).toContainText("changed by Sale");
  const listed = await order(page, "PFI 3295");
  await expect(listed.locator(".chip.yellow")).toHaveText(/changed by sale/i);
  await expect((await order(page, "PFI 3200")).locator(".chip.yellow")).toHaveCount(0);
  await openDetail(page, listed);
  await expect(roLine(TEA)).toHaveClass(/row-changed/);
  await expect(roLine(TEA).locator("td").first()).toHaveCSS("background-color", YELLOW);
  await expect(roLine(TEA).locator(".change-note")).toContainText("was 110");
  await expect(roLine(JAM)).not.toHaveClass(/row-changed/);
  const ghost = page.locator(".detail-body tr.ghost-row");
  await expect(ghost).toHaveCount(1);
  await expect(ghost.locator(".gone-note")).toContainText(`${RICE} has been removed`);
  await expect(ghost.locator(".gone-note")).toHaveCSS("color", "rgb(178, 59, 59)");
  await expect(ghost.locator("td").first()).toHaveCSS("background-color", RED);
  const order16 = await page.locator(`${TABLE} tr:not(.sub-row)`).evaluateAll((rows) => rows.map((r) => (r.classList.contains("ghost-row") ? "GONE" : r.textContent!.includes("Tea") ? "TEA" : r.textContent!.includes("Jam") ? "JAM" : "?")));
  expect(order16).toEqual(["TEA", "JAM", "GONE"]); // where the line used to be: third
  await close(page);

  // The PO shows the same on its rows; Seen and Removed settle them.
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, poRow);
  await expect(allocOf(TEA)).toHaveClass(/row-changed/);
  await expect(allocOf(TEA).locator("td").nth(1)).toHaveCSS("background-color", YELLOW);
  await expect(allocOf(TEA).locator(".change-note")).toContainText("Sale changed this line after the order went out: quantity 110 → 120");
  await expect(allocOf(JAM)).not.toHaveClass(/row-changed|row-gone/);
  await expect(allocOf(RICE)).toHaveClass(/row-gone/);
  await expect(allocOf(RICE).locator(".gone-note")).toContainText(`${RICE} has been removed`);
  await expect(allocOf(RICE).locator(".gone-note")).toHaveCSS("color", "rgb(178, 59, 59)");
  await allocOf(TEA).getByRole("button", { name: "Seen" }).click();
  await expect(allocOf(TEA)).not.toHaveClass(/row-changed/);
  await allocOf(RICE).locator("select").filter({ has: page.locator('option[value="removed"]') }).selectOption("removed");
  await expect(allocOf(RICE)).not.toHaveClass(/row-gone/);
  await save(page);
  await close(page);
  await pill(page, "Orders to update").click();
  await expect((await order(page, "PFI 3295")).locator(".chip.yellow")).toHaveCount(0);
  await openDetail(page, await order(page, "PFI 3295"));
  await expect(page.locator(".detail-body tr.row-changed, .detail-body tr.ghost-row")).toHaveCount(0);
  await close(page);

  // Seen from the order itself works too.
  await asSale();
  await openDetail(page, pfiRow); // settled by the buyer: the sale's screen is plain again
  await expect(page.locator(".detail-body tr.row-changed, .detail-body tr.ghost-row")).toHaveCount(0);
  await close(page);
  await setQty(JAM, "45");
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3295"));
  await expect(roLine(JAM)).toHaveClass(/row-changed/);
  await expect(roLine(JAM).locator(".change-note")).toContainText("was 40");
  await roLine(JAM).getByRole("button", { name: "Seen" }).click();
  await expect(roLine(JAM)).not.toHaveClass(/row-changed/);
  await save(page);
  await close(page);
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, poRow);
  await expect(page.locator(".detail-body tr.row-changed")).toHaveCount(0);

  // Back to not sent: nothing is remembered, so a later change is not flagged.
  await page.getByRole("button", { name: "Have not Sent", exact: true }).click();
  await save(page);
  await close(page);
  await asSale();
  await setQty(TEA, "130");
  await asBuyerOnPos();
  await openDetail(page, poRow);
  await expect(page.locator(".detail-body tr.row-changed")).toHaveCount(0);
  await close(page);

  await removeDoc(poRow, "Delete PO");
  await asSale();
  await removeDoc(pfiRow, "Delete PFI");
});

test("a row set to Ordered counts as sent, even when the PO's Sent button was never pressed", async ({ page }) => {
  const TEA = "E2E Row Tea 100g"; const JAM = "E2E Row Jam 200g";
  const YELLOW = "rgb(255, 246, 214)";
  const TABLE = ".detail-body table.sticky-first tbody";
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3296" });
  const poRow = page.locator(".pfi-list-row", { hasText: "PO 4550" });
  const lineRows = page.locator(`${TABLE} tr:not(.sub-row):not(.ghost-row):not(:has(td[colspan]))`);
  const lineOf = (name: string) => lineRows.filter({ has: page.locator(`input[value="${name}"]`) });
  const roLine = (name: string) => page.locator(`${TABLE} tr:not(.sub-row):not(.ghost-row)`, { hasText: name });
  const allocOf = (name: string) => lineOf(name).locator("xpath=following-sibling::tr[contains(@class,'sub-row')][1]");
  const statusOf = (row: ReturnType<Page["locator"]>) => row.locator("select").filter({ has: page.locator('option[value="removed"]') });
  const addRow = async (name: string, qty: string) => {
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    await rowForm.locator("input").nth(0).fill(name);
    await rowForm.locator("input").nth(4).fill(qty);
    await rowForm.locator("input").nth(5).fill("1");
    await rowForm.getByRole("button", { name: "Add row" }).click();
  };
  const removeDoc = async (row: ReturnType<Page["locator"]>, button: string) => {
    if (!(await row.count())) return;
    await openDetail(page, row);
    await page.getByRole("button", { name: button }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(row).toHaveCount(0);
  };
  const asSale = async () => { await signIn(page, A.sale.username, A.sale.password); await side(page, "Order Tracking").click(); };
  const asBuyerOnPos = async () => { await signIn(page, A.buyer.username, A.buyer.password); await pill(page, "PO Tracking").click(); await pill(page, /^PO$/).click(); };
  const setQty = async (name: string, qty: string) => { await openDetail(page, pfiRow); await lineOf(name).locator('input[type="number"]').first().fill(qty); await save(page); await close(page); await page.waitForTimeout(1200); };

  await asBuyerOnPos();
  await removeDoc(poRow, "Delete PO");
  await asSale();
  await removeDoc(pfiRow, "Delete PFI");
  await page.getByRole("button", { name: "Add PFI" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("3296");
  await page.getByRole("button", { name: "Create PFI" }).click();
  await page.locator(".detail-body").waitFor();
  await addRow(TEA, "1400");
  await addRow(JAM, "280");
  await save(page);
  await close(page);

  // The buyer links both lines and sets the tea row to Ordered; the PO itself stays "Have not Sent".
  await asBuyerOnPos();
  await page.getByRole("button", { name: "Add PO" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("4550");
  await page.getByRole("button", { name: "Create PO" }).click();
  await page.locator(".detail-body").waitFor();
  for (const [n, q] of [[TEA, "1400"], [JAM, "280"]]) {
    await addRow(n, q);
    await lineOf(n).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await lineOf(n).locator(".pfi-picker-trigger").click();
    await page.locator(".pfi-picker-option", { hasText: "PFI 3296" }).locator('input[type="checkbox"]').check();
    await page.locator(".picker-backdrop").click();
    await allocOf(n).locator('input[placeholder="cases"]').fill(q);
  }
  await statusOf(allocOf(TEA)).selectOption("ordered");
  await expect(page.locator(".toggle-btn.notsent-on", { hasText: "Have not Sent" })).toHaveCount(1);
  await save(page);
  await close(page);

  // Sale changes both quantities: only the ordered row is flagged.
  await asSale();
  await openDetail(page, pfiRow);
  await lineOf(TEA).locator('input[type="number"]').first().fill("1500");
  await expect(lineOf(TEA)).toHaveClass(/row-changed/);
  await expect(lineOf(TEA).locator("td").first()).toHaveCSS("background-color", YELLOW);
  await expect(lineOf(TEA).locator(".change-note")).toContainText("was 1400");
  await lineOf(JAM).locator('input[type="number"]').first().fill("300");
  await expect(lineOf(JAM)).not.toHaveClass(/row-changed/); // its order has not gone out
  await save(page);
  await close(page);
  await page.waitForTimeout(1200);

  await asBuyerOnPos();
  await openDetail(page, poRow);
  await expect(allocOf(TEA)).toHaveClass(/row-changed/);
  await expect(allocOf(TEA).locator(".change-note")).toContainText("1400 → 1500");
  await expect(allocOf(JAM)).not.toHaveClass(/row-changed/);
  await close(page);

  // Set to Ordered from Orders to update: from then on the jam is watched too.
  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3296"));
  await expect(roLine(TEA)).toHaveClass(/row-changed/);
  const jamSub = roLine(JAM).locator("xpath=following-sibling::tr[contains(@class,'sub-row')][1]");
  await statusOf(jamSub).selectOption("ordered");
  await save(page);
  await close(page);
  await asSale();
  await setQty(JAM, "320");
  await signIn(page, A.buyer.username, A.buyer.password);
  await pill(page, "Orders to update").click();
  await openDetail(page, await order(page, "PFI 3296"));
  await expect(roLine(JAM)).toHaveClass(/row-changed/);
  await expect(roLine(JAM).locator(".change-note")).toContainText("was 300"); // what it was when the row was set to Ordered
  await close(page);

  // Back to Not ordered: the row forgets, and the mark goes.
  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await openDetail(page, poRow);
  await statusOf(allocOf(TEA)).selectOption("not_ordered");
  await save(page);
  await expect(allocOf(TEA)).not.toHaveClass(/row-changed/);
  await expect(allocOf(JAM)).toHaveClass(/row-changed/);
  await close(page);

  await removeDoc(poRow, "Delete PO");
  await asSale();
  await removeDoc(pfiRow, "Delete PFI");
});

test("any change by Sale on an ordered line is flagged, and a PO row named more briefly finds its line", async ({ page }) => {
  const LONG = "E2E Wide Nutella Biscuits Tube T12 168g"; const BRIEF = "E2E Wide Nutella Biscuits Tube"; const RENAMED = "E2E Wide Nutella Biscuits Tube T12 170g";
  const TABLE = ".detail-body table.sticky-first tbody";
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 3297" });
  const poRow = page.locator(".pfi-list-row", { hasText: "PO 4560" });
  const lineRows = page.locator(`${TABLE} tr:not(.sub-row):not(.ghost-row):not(:has(td[colspan]))`);
  const lineOf = (name: string) => lineRows.filter({ has: page.locator(`input[value="${name}"]`) });
  const allocOf = (name: string) => lineOf(name).locator("xpath=following-sibling::tr[contains(@class,'sub-row')][1]");
  const addRow = async (name: string, qty: string, rate: string) => {
    const rowForm = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    await rowForm.locator("input").nth(0).fill(name);
    await rowForm.locator("input").nth(4).fill(qty);
    await rowForm.locator("input").nth(5).fill(rate);
    await rowForm.getByRole("button", { name: "Add row" }).click();
  };
  const removeDoc = async (row: ReturnType<Page["locator"]>, button: string) => {
    if (!(await row.count())) return;
    await openDetail(page, row);
    await page.getByRole("button", { name: button }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(row).toHaveCount(0);
  };
  const asSale = async () => { await signIn(page, A.sale.username, A.sale.password); await side(page, "Order Tracking").click(); };
  const asBuyerOnPos = async () => { await signIn(page, A.buyer.username, A.buyer.password); await pill(page, "PO Tracking").click(); await pill(page, /^PO$/).click(); };

  await asBuyerOnPos();
  await removeDoc(poRow, "Delete PO");
  await asSale();
  await removeDoc(pfiRow, "Delete PFI");
  await page.getByRole("button", { name: "Add PFI" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("3297");
  await page.getByRole("button", { name: "Create PFI" }).click();
  await page.locator(".detail-body").waitFor();
  await addRow(LONG, "630", "5");
  await save(page);
  await close(page);

  // The PO names the product more briefly: the row still finds its line by itself.
  await asBuyerOnPos();
  await page.getByRole("button", { name: "Add PO" }).click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("4560");
  await page.getByRole("button", { name: "Create PO" }).click();
  await page.locator(".detail-body").waitFor();
  await addRow(BRIEF, "630", "4");
  await lineOf(BRIEF).locator(".pfi-picker-trigger").click();
  await page.locator(".pfi-picker-option", { hasText: "PFI 3297" }).locator('input[type="checkbox"]').check();
  await page.locator(".picker-backdrop").click();
  const pick = allocOf(BRIEF).locator("select.line-pick");
  await expect(pick).not.toHaveValue("");
  await expect(pick.locator("option:checked")).toContainText(LONG);
  await allocOf(BRIEF).locator('input[placeholder="cases"]').fill("630");
  await expect(allocOf(BRIEF).locator(".cover-note")).toContainText("630 of 630 for this PFI");
  await allocOf(BRIEF).locator("select").filter({ has: page.locator('option[value="removed"]') }).selectOption("ordered");
  await save(page);
  await close(page);

  // Sale changes the rate, then the name: each is flagged, and named.
  await asSale();
  await openDetail(page, pfiRow);
  await expect(page.locator(".unmatched-block")).toHaveCount(0); // the PO row sits under its line
  await expect(page.locator(`${TABLE} tr.sub-row`, { hasText: "PO 4560" })).toHaveCount(1);
  await expect(lineOf(LONG)).not.toHaveClass(/row-changed/);
  await lineOf(LONG).locator('input[type="number"]').nth(1).fill("5.5");
  await expect(lineOf(LONG)).toHaveClass(/row-changed/);
  await expect(lineOf(LONG).locator(".change-note")).toHaveText(/^rate was 5$/);
  await lineOf(LONG).locator("input").first().fill(RENAMED);
  await expect(lineOf(RENAMED).locator(".change-note")).toContainText(`name was ${LONG}; rate was 5`);
  await lineOf(RENAMED).locator("input").first().fill(LONG); // typed back: only the rate is left
  await expect(lineOf(LONG).locator(".change-note")).toHaveText(/^rate was 5$/);
  await lineOf(LONG).locator("input").first().fill(RENAMED);
  await save(page);
  await close(page);
  await page.waitForTimeout(1200);

  await asBuyerOnPos();
  await openDetail(page, poRow);
  await expect(allocOf(BRIEF)).toHaveClass(/row-changed/);
  await expect(allocOf(BRIEF).locator(".change-note")).toContainText(`Sale changed this line after the order went out: name ${LONG} → ${RENAMED}; rate 5 → 5.5`);
  await expect(pick.locator("option:checked")).toContainText(RENAMED); // still the same line
  await allocOf(BRIEF).getByRole("button", { name: "Seen" }).click();
  await expect(allocOf(BRIEF)).not.toHaveClass(/row-changed/);
  await save(page);
  await close(page);
  await pill(page, "Orders to update").click();
  await expect((await order(page, "PFI 3297")).locator(".chip.yellow")).toHaveCount(0);

  await pill(page, "PO Tracking").click();
  await pill(page, /^PO$/).click();
  await removeDoc(poRow, "Delete PO");
  await asSale();
  await removeDoc(pfiRow, "Delete PFI");
});

test("warehouse calendar: every entry says customer or supplier; sale reps see the customer entries only, and only look", async ({ page }) => {
  const CUST = "E2E: customer collection"; const SUPP = "E2E: supplier delivery"; const OLD = "E2E: entered before the choice";
  const party = page.locator('.modal-panel select[aria-label="Customer or supplier"]');
  const day = (n: number) => page.locator(".cal-day:not(.out)", { has: page.locator(".cal-date", { hasText: new RegExp(`^${n}$`) }) });
  const entry = (title: string) => page.locator(".cal-event", { hasText: title });
  const clean = async () => {
    for (const t of [CUST, SUPP, OLD]) while (await entry(t).count()) { await entry(t).first().click(); await page.getByRole("button", { name: "Delete entry" }).click(); await page.getByRole("button", { name: "Yes, delete" }).click(); }
    await settled(page);
  };

  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Warehouse's Space").click();
  await clean();

  // The form: the choice comes before Type, and a new entry cannot be saved without it.
  await day(18).hover();
  await day(18).locator(".cal-add").click();
  const labels = (await page.locator(".modal-panel .booking-grid .mini-field > label:first-child").allInnerTexts()).map((l) => l.toUpperCase());
  expect(labels).toEqual(["TITLE", "DATE", "CUSTOMER / SUPPLIER", "TYPE", "PO / PFI NO.", "STATUS", "NOTE"]);
  await expect(party.locator("option")).toHaveText(["Choose…", "Customer", "Supplier"]);
  await expect(party).toHaveValue("");
  await page.locator(".modal-panel input").first().fill(CUST);
  await expect(page.getByRole("button", { name: "Save entry" })).toBeDisabled();
  await party.selectOption("customer");
  await expect(page.locator(".modal-body")).toContainText("Sale reps can see this entry (view only).");
  await page.locator('.modal-panel select[aria-label="Type"]').selectOption("collection");
  await page.locator(".modal-panel textarea").fill("3 pallets, gate B");
  await page.getByRole("button", { name: "Save entry" }).click();
  await day(18).hover();
  await day(18).locator(".cal-add").click();
  await page.locator(".modal-panel input").first().fill(SUPP);
  await party.selectOption("supplier");
  await expect(page.locator(".modal-body")).toContainText("Hidden from Sale reps.");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(entry(CUST).locator(".cal-party")).toHaveText("C");
  await expect(entry(SUPP).locator(".cal-party")).toHaveText("S");
  await settled(page);

  // An entry made before the choice existed: shown to the team with a question mark, editable, and saved without the choice if need be.
  const iso = await day(18).getAttribute("data-date");
  const pushed = await page.evaluate(async ([date, title]) => {
    const now = new Date().toISOString();
    const data = { id: "wh-e2e-before-the-choice", date, title, type: "delivery", refNo: "", note: "", done: false, createdBy: "e2e", createdAt: now };
    return (await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes: [{ kind: "warehouseEvents", id: data.id, createdAt: now, data }] }) })).status;
  }, [iso, OLD]);
  expect(pushed).toBe(200);
  await page.reload();
  await side(page, "Warehouse's Space").click();
  await expect(entry(OLD).locator(".cal-party")).toHaveText("?");
  await entry(OLD).click();
  await expect(party).toHaveValue("");
  await expect(page.locator(".modal-body")).toContainText("hidden from Sale reps until it is");
  await page.locator(".modal-panel .done-tick input").check();
  await page.getByRole("button", { name: "Save entry" }).click(); // ticking Done does not force the choice
  await expect(entry(OLD)).toHaveClass(/is-done/);
  await settled(page);

  // Warehouse and admin see all three.
  for (const who of [A.warehouse, A.admin]) {
    await signIn(page, who.username, who.password);
    if (who === A.admin) await side(page, "Warehouse's Space").click();
    for (const t of [CUST, SUPP, OLD]) await expect(entry(t)).toHaveCount(1);
  }

  // A sale rep: the tab is there, with the customer entry only, and nothing to add or change.
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Warehouse's Space").click();
  await expect(page.locator(".page-sub")).toContainText("view only");
  await expect(entry(CUST)).toHaveCount(1);
  await expect(entry(SUPP)).toHaveCount(0);
  await expect(entry(OLD)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New entry" })).toHaveCount(0);
  await expect(page.locator(".cal-add")).toHaveCount(0);
  await expect(page.locator(".cal-party")).toHaveCount(0);
  await day(19).dblclick();
  await expect(page.locator(".modal-panel")).toHaveCount(0);
  await entry(CUST).click();
  await expect(page.locator(".modal-title")).toHaveText(CUST);
  await expect(page.locator(".modal-sub")).toContainText("view only");
  await expect(page.locator(".modal-body")).toContainText("3 pallets, gate B");
  await expect(page.locator(".modal-body")).toContainText("Collection");
  await expect(page.locator(".modal-panel input, .modal-panel select, .modal-panel textarea")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /save entry|delete entry/i })).toHaveCount(0);
  await close(page);
  const state = await page.evaluate(async () => (await fetch("/api/state")).json());
  expect(state.slices.warehouseEvents.map((e: any) => e.title)).toEqual(expect.arrayContaining([CUST]));
  expect(state.slices.warehouseEvents.every((e: any) => e.party === "customer")).toBe(true);
  expect(JSON.stringify(state)).not.toContain(SUPP); // the supplier entry never reached the rep's browser
  expect(JSON.stringify(state)).not.toContain(OLD);
  const refused = await page.evaluate(async ([title]) => (await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes: [{ kind: "warehouseEvents", id: "wh-e2e-from-a-rep", data: { id: "wh-e2e-from-a-rep", date: "2026-09-29", title, party: "customer" } }] }) })).status, ["from a rep"]);
  expect(refused).toBe(403);

  // Moved to Supplier by the buyer: gone from the rep's calendar. Marked Customer: it appears.
  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Warehouse's Space").click();
  await entry(CUST).click();
  await party.selectOption("supplier");
  await page.getByRole("button", { name: "Save entry" }).click();
  await entry(OLD).click();
  await party.selectOption("customer");
  await page.getByRole("button", { name: "Save entry" }).click();
  await settled(page);
  await signIn(page, A.sale.username, A.sale.password);
  await side(page, "Warehouse's Space").click();
  await expect(entry(OLD)).toHaveCount(1);
  await expect(entry(CUST)).toHaveCount(0);
  await expect(entry(SUPP)).toHaveCount(0);

  await signIn(page, A.buyer.username, A.buyer.password);
  await side(page, "Warehouse's Space").click();
  await clean();
  for (const t of [CUST, SUPP, OLD]) await expect(entry(t)).toHaveCount(0);
});
