import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { A } from "./accounts";

/*
 * Three-role end-to-end pass over the live console. Re-runnable: every step checks
 * whether its record already exists before creating it.
 */
test.describe.configure({ mode: "serial" });

// Every /api/sync response is logged so a failed or slow push shows up in the report.
test.beforeEach(async ({ page }) => {
  page.on("response", async (r) => {
    if (!r.url().includes("/api/sync")) return;
    let body = ""; try { body = (await r.text()).slice(0, 160); } catch { /* aborted */ }
    console.log(`[sync] ${r.status()} ${r.request().postData()?.length ?? 0}B ${body}`);
  });
  page.on("requestfailed", (r) => { if (r.url().includes("/api/")) console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`); });
  page.on("console", (m) => { if (m.type() === "error") console.log(`[console] ${m.text().slice(0, 200)}`); });
});
// The store debounces pushes by 300 ms; give the last one time to leave before the page closes.
test.afterEach(async ({ page }) => { await page.waitForTimeout(1500); });

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
  await openDetail(page, page.locator(".pfi-list-row").first());
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
  await openDetail(page, page.locator(".fulfil-head", { hasText: "PFI 3200" }).first());
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
  await openDetail(page, page.locator(".pfi-list-row").first());
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
  await openDetail(buyer, buyer.locator(".fulfil-head", { hasText: "PFI 3200" }).first());
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
  await openDetail(buyer, buyer.locator(".fulfil-head", { hasText: "PFI 3200" }).first());
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
  await page.locator(".modal-panel select").first().selectOption("collection");
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
