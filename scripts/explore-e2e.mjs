// Exploratory end-to-end pass: every feature, every role, with cleanup. Complements tests/e2e (which is the gate).
// Usage: BASE=http://localhost:5173 node scripts/explore-e2e.mjs [screenshot-dir]
// Needs the logins in tests/e2e/accounts.json (git-ignored) plus the e2e seed (a rep with a customer and PFI 3200); creates and removes its own exp-* data.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const A = JSON.parse(readFileSync(new URL("../tests/e2e/accounts.json", import.meta.url), "utf8")); // git-ignored, see tests/e2e/accounts.example.json
const EXP_PASS = "x" + Math.random().toString(36).slice(2, 10); // throwaway accounts created and deleted by this run
const BASE = process.env.BASE || "http://localhost:5173";
const S = process.argv[2] || ".";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const failures = [], passes = [];
page.on("pageerror", (e) => failures.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/401/.test(m.text())) failures.push(`CONSOLE: ${m.text().slice(0, 200)}`); });
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400 && !/auth\/me/.test(r.url())) failures.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
let n = 0;
const step = async (name, fn) => { n++; try { await fn(); passes.push(name); console.log(`ok   ${name}`); } catch (e) { const msg = `${name}: ${String(e.message).split("\n")[0].slice(0, 300)}`; failures.push(msg); console.log(`FAIL ${msg}`); await page.screenshot({ path: `${S}/explore-fail-${n}.png` }).catch(() => {}); } };
const expect = (cond, msg) => { if (!cond) throw new Error(`expect: ${msg}`); };
const settle = () => page.waitForTimeout(700);
const isOpen = async (loc) => /\bopen\b/.test((await loc.getAttribute("class")) || "");
const side = (text) => page.locator(".side-item", { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\d+)?\\s*$`) });
const pill = (text) => page.locator(".pill", { hasText: text });
const login = async (u, p) => {
  await page.goto(BASE + "/");
  const signIn = page.getByRole("button", { name: "Sign in" }); const lo = page.getByText("Log out");
  await Promise.race([signIn.waitFor(), lo.waitFor()]);
  if (await lo.count()) await lo.click();
  await signIn.waitFor();
  await page.locator("input.select-line").first().fill(u); await page.locator('input[type="password"]').fill(p);
  await signIn.click(); await lo.waitFor();
};
const saveBar = async () => {
  const b = page.getByRole("button", { name: "Save changes" });
  if (await b.isEnabled()) { const r = page.waitForResponse((x) => x.url().includes("/api/sync"), { timeout: 15000 }).catch(() => null); await b.click(); await r; }
  await page.locator(".save-bar").filter({ hasText: /all changes saved/i }).waitFor();
};
const closeModal = async () => { await page.getByRole("button", { name: "Close" }).click(); await settle(); };
const openRow = async (loc) => { await loc.click(); await page.locator(".detail-body").waitFor(); };
const lines = () => page.locator(".detail-body tbody tr:not(.sub-row):not(:has(td[colspan]))");
const realRows = (scope) => scope.locator("tbody tr:not(:has(td[colspan]))");

await step("admin creates three accounts", async () => {
  await login(A.admin.username, A.admin.password); await side("Accounts").click();
  const rows = page.locator(".account-row");
  for (const [role, name, user] of [["sale", "Explorer Sale", "exp-sale"], ["buyer", "Explorer Buyer", "exp-buyer"], ["admin", "Explorer Admin", "exp-admin"]]) {
    if (await rows.filter({ has: page.locator(`input[value="${user}"]`) }).count()) continue;
    const form = page.locator(".add-form").first();
    await form.locator("select").selectOption(role);
    await form.locator("input").nth(0).fill(name); await form.locator("input").nth(1).fill(user); await form.locator("input").nth(2).fill(EXP_PASS);
    await page.getByRole("button", { name: "Create account" }).click();
  }
  await settle();
  expect((await rows.filter({ has: page.locator('input[value="exp-sale"]') }).count()) === 1, "exp-sale row");
});

await step("each role sees only its tabs", async () => {
  await login("exp-sale", EXP_PASS);
  for (const t of ["Customer", "Order Tracking", "Container Rate"]) expect((await side(t).count()) === 1, `sale tab ${t}`);
  for (const t of ["Delivery Booking", "Mai", "Jobs", "Accounts"]) expect((await side(t).count()) === 0, `sale must not see ${t}`);
  await login("exp-buyer", EXP_PASS);
  for (const t of ["Inbox", "Orders to update", "PO Tracking", "Jobs", "Container Rate", "Delivery Booking"]) expect((await side(t).count()) === 1, `buyer tab ${t}`);
  for (const t of ["Mai", "Accounts"]) expect((await side(t).count()) === 0, `buyer must not see ${t}`);
  await login("exp-admin", EXP_PASS);
  for (const t of ["Explorer Sale", "Buyer Space", "Mai", "Container Rate", "Delivery Booking", "Accounts"]) expect((await side(t).count()) === 1, `admin tab ${t}`);
});

await step("sale: customer, note, PFI 9101 with lines, collection date (2-digit year), payment, document, export, reload", async () => {
  await login("exp-sale", EXP_PASS);
  if (!(await page.locator(".cust-row", { hasText: "Exp Customer Ltd" }).count())) {
    await page.getByRole("button", { name: "Add customer" }).click();
    const f = page.locator(".add-form").first();
    await f.locator("input").nth(0).fill("Exp Customer Ltd"); await f.locator("input").nth(1).fill("Exp x FMCG"); await f.locator("input").nth(2).fill("Tea, biscuits");
    await page.getByRole("button", { name: "Save customer" }).click();
  }
  const row = page.locator(".cust-row", { hasText: "Exp Customer Ltd" }); expect((await row.count()) === 1, "customer row");
  if (!(await isOpen(row))) await row.click(); // a new customer opens by itself
  const card = page.locator(".card").first();
  if (!(await card.innerText()).includes("EXP: please confirm Lagos rate")) {
    await card.locator("textarea").first().fill("EXP: please confirm Lagos rate");
    await page.getByRole("button", { name: "Add info" }).click();
  }
  expect(/awaiting buyer|buyer replied/i.test(await card.innerText()), "note awaiting buyer");
  await side("Order Tracking").click();
  const pfiRow = page.locator(".pfi-list-row", { hasText: "PFI 9101" });
  if (!(await pfiRow.count())) {
    await page.getByRole("button", { name: "Add PFI" }).click();
    const f = page.locator(".add-form").first();
    await f.locator("input").nth(0).fill("9101");
    await f.locator("select").nth(0).selectOption({ label: "Exp Customer Ltd" });
    await f.locator("select").nth(1).selectOption("GBP");
    await f.locator("select").nth(2).selectOption("delivered");
    await f.locator("input").nth(1).fill("Credit - 30 days");
    await page.getByRole("button", { name: "Create PFI" }).click();
    await page.locator(".detail-body").waitFor();
  } else await openRow(pfiRow);
  if ((await lines().count()) < 2) {
    const rf = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    for (const [name, ean, qty, rate] of [["Exp Tea 20 bags", "5012345678900", "10", "4.5"], ["Exp Biscuits 300g", "5012345678917", "8", "2.25"]]) {
      await rf.locator("input").nth(0).fill(name); await rf.locator("input").nth(1).fill(ean); await rf.locator("input").nth(4).fill(qty); await rf.locator("input").nth(5).fill(rate);
      await rf.getByRole("button", { name: "Add row" }).click();
    }
  }
  expect((await lines().count()) === 2, `2 lines, got ${await lines().count()}`);
  expect((await page.locator(".detail-body").innerText()).includes("£45.00"), "amount £45.00 computed");
  const delivery = page.locator(".detail-body .section-card").filter({ has: page.locator(".mini-field", { hasText: "Loaded or not" }) });
  await delivery.locator("select").first().selectOption("collection");
  const coll = delivery.locator(".mini-field", { hasText: "Collection date" });
  await coll.locator('input[type="text"]').fill("5/1/27"); await coll.locator('input[type="text"]').press("Enter");
  expect((await coll.locator('input[type="date"]').inputValue()) === "2027-01-05", "2-digit year → 2027-01-05");
  const pay = page.locator(".section-card:has(.pay-summary)");
  if (!(await realRows(pay).count())) {
    const pd = pay.locator(".mini-field", { hasText: /^Date/ });
    await pd.locator('input[type="text"]').fill("01/10/2026"); await pd.locator('input[type="text"]').press("Enter");
    await pay.locator('input[type="number"]').fill("20");
    await pay.getByRole("button", { name: "Record payment" }).click();
  }
  expect((await pay.innerText()).includes("01/10/2026"), "payment date shown dd/mm/yyyy");
  const docs = page.locator(".section-card", { hasText: "Documents" });
  if (!(await page.locator(".doc-card").count())) {
    await docs.locator("select").first().selectOption("COO"); await docs.locator("textarea").fill("Exp COO please"); await docs.getByRole("button", { name: "Add" }).click();
  }
  expect((await page.locator(".doc-card").count()) >= 1, "doc card");
  await saveBar();
  const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Export packing list" }).click();
  expect((await dl).suggestedFilename() === "PFI_9101_packing_list.xlsx", "export file name");
  await closeModal();
  await page.reload(); await side("Order Tracking").click();
  await openRow(page.locator(".pfi-list-row", { hasText: "PFI 9101" }));
  expect((await page.locator(".detail-body .mini-field", { hasText: "Collection date" }).locator('input[type="text"]').inputValue()) === "05/01/2027", "collection date persisted");
  expect((await page.locator(".section-card:has(.pay-summary)").innerText()).includes("£20.00"), "payment persisted");
  await closeModal();
});

await step("buyer: fulfil PFI 9101 fully → Complete Ordering; floor stock via PO; unlink; delete PO", async () => {
  await login("exp-buyer", EXP_PASS);
  await side("Orders to update").click();
  await openRow(page.locator(".fulfil-head", { hasText: "PFI 9101" }).first());
  const cnt = await lines().count(); expect(cnt === 2, `2 rows, got ${cnt}`);
  for (let i = 0; i < cnt; i++) {
    const r = lines().nth(i);
    const qty = (await r.locator("td").nth(3).innerText()).trim();
    await r.locator("select").first().selectOption("received");
    await r.locator('input[type="number"]').first().fill(qty);
    const est = r.locator(".date-field").first().locator('input[type="text"]'); await est.fill("15/10/2026"); await est.press("Enter");
  }
  await saveBar(); await closeModal();
  expect(/complete ordering/i.test(await page.locator(".fulfil-card", { hasText: "PFI 9101" }).innerText()), "buyer card shows Complete Ordering");
  await side("PO Tracking").click();
  if (!(await page.locator(".supplier-row", { hasText: "Exp Supplier" }).count())) {
    await page.getByRole("button", { name: "Add supplier" }).click();
    const f = page.locator(".add-form").first(); await f.locator("input").nth(0).fill("Exp Supplier"); await f.locator("input").nth(1).fill("exploratory");
    await page.getByRole("button", { name: "Save supplier" }).click();
  }
  await pill(/^PO$/).click();
  if (!(await page.locator(".pfi-list-row", { hasText: "PO 9201" }).count())) {
    await page.getByRole("button", { name: "Add PO" }).click();
    const f = page.locator(".add-form").first(); await f.locator("input").nth(0).fill("9201"); await f.locator("select").nth(0).selectOption({ label: "Exp Supplier" }); await f.locator("input").nth(1).fill("Prepaid");
    await page.getByRole("button", { name: "Create PO" }).click(); await page.locator(".detail-body").waitFor();
    const rf = page.locator(".detail-body .section-card").first().locator(".mini-form-row").first();
    await rf.locator("input").nth(0).fill("Exp Tea 20 bags"); await rf.locator("input").nth(1).fill("5012345678900"); await rf.locator("input").nth(4).fill("10"); await rf.locator("input").nth(5).fill("3");
    await rf.getByRole("button", { name: "Add row" }).click();
    await page.locator(".pfi-picker-trigger").first().click();
    await page.locator(".pfi-picker-option", { hasText: "PFI 9101" }).locator('input[type="checkbox"]').check();
    await page.locator(".picker-backdrop").click();
    const sub = page.locator(".detail-body tr.sub-row", { hasText: "PFI 9101" }).first();
    expect((await sub.locator("select.line-pick").inputValue()) !== "", "auto-matched by EAN");
    await sub.locator('input[placeholder="cases"]').fill("10");
    await sub.locator("select").nth(1).selectOption("floor_stock");
    await saveBar(); await closeModal();
  }
  await login("exp-sale", EXP_PASS); await side("Order Tracking").click();
  await openRow(page.locator(".pfi-list-row", { hasText: "PFI 9101" }));
  const st = (await lines().first().locator("td").nth(7).innerText()).trim();
  expect(/floor stock/i.test(st), `rollup shows Floor stock, got "${st}"`);
  expect((await page.locator(".detail-body tr.sub-row", { hasText: "PO 9201" }).count()) === 1, "PO 9201 sub-row on the PFI");
  await closeModal();
  await login("exp-buyer", EXP_PASS); await side("PO Tracking").click(); await pill(/^PO$/).click();
  await openRow(page.locator(".pfi-list-row", { hasText: "PO 9201" }));
  await page.locator('.detail-body tr.sub-row button[title="Unlink this PFI"]').first().click();
  await saveBar();
  await page.getByRole("button", { name: "Delete PO" }).click();
  const yes = page.getByRole("button", { name: /yes, delete/i }); if (await yes.count()) await yes.click();
  await settle();
  expect((await page.locator(".pfi-list-row", { hasText: "PO 9201" }).count()) === 0, "PO deleted");
  await login("exp-sale", EXP_PASS); await side("Order Tracking").click();
  await openRow(page.locator(".pfi-list-row", { hasText: "PFI 9101" }));
  expect((await page.locator(".detail-body tr.sub-row").count()) === 0, "no receipts left after the PO was deleted");
  await closeModal();
});

await step("container rate: lane, quotes, edit, remove quote, delete lane", async () => {
  await login("exp-buyer", EXP_PASS); await side("Container Rate").click();
  if (!(await page.locator(".lane-row", { hasText: "Exp Port" }).count())) {
    await page.getByRole("button", { name: "Add lane" }).click();
    const f = page.locator(".add-form").first(); await f.locator("input").nth(0).fill("Exp Port"); await f.locator("input").nth(1).fill("Exp Warehouse"); await f.locator("input").nth(2).fill("21 days");
    await page.getByRole("button", { name: "Save lane" }).click();
  }
  const laneRow = page.locator(".lane-row", { hasText: "Exp Port" });
  if (!(await isOpen(laneRow))) await laneRow.click(); // make sure THIS lane is the open one
  const lane = page.locator(".lane-detail").first();
  if (!(await realRows(lane).count())) {
    await lane.locator(".mini-form-row input").nth(0).fill("Exp Lines"); await lane.locator(".mini-form-row input").nth(1).fill("2500"); await lane.getByRole("button", { name: "Add rate" }).click();
    await lane.locator(".mini-form-row input").nth(0).fill("Exp Shipping"); await lane.locator(".mini-form-row input").nth(1).fill("2200"); await lane.getByRole("button", { name: "Add rate" }).click();
  }
  expect((await laneRow.innerText()).includes("2,200.00"), `best quote shown, row: ${(await laneRow.innerText()).replace(/\n/g, " | ")}`);
  await lane.locator('tbody tr input[type="number"]').last().fill("2100"); await settle();
  expect((await laneRow.innerText()).includes("2,100.00"), "best quote updates on edit");
  await lane.locator('button[title="Remove rate"]').last().click(); await settle();
  expect((await realRows(lane).count()) === 1, "quote removed");
  await page.getByRole("button", { name: "Delete lane" }).click(); await settle();
  expect((await laneRow.count()) === 0, "lane deleted");
});

await step("booking as buyer: all fields, 2-digit year, status, search by sale name, reload, delete", async () => {
  await login("exp-buyer", EXP_PASS); await side("Delivery Booking").click();
  const leftovers = page.locator(".booking-row", { hasText: "Exp Booking Ltd" });
  while (await leftovers.count()) { await leftovers.first().click(); await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click(); }
  await page.getByRole("button", { name: "Add booking" }).click();
  const grid = page.locator(".booking-grid").first();
  const field = (label) => grid.locator(".mini-field", { hasText: new RegExp(`^${label}`) });
  await field("Customer").locator("input").fill("Exp Booking Ltd");
  await field("Sale").locator("input").fill("Explorer Sale");
  await field("PFI / INV").locator("input").fill("9101");
  await field("POD").locator("input").fill("Tema");
  await field("Loading address").locator("input").fill("Unit 4, Exp Estate");
  await field("Forwarder").locator("input").fill("Exp Lines");
  await field("Rate").locator('input[type="number"]').fill("2100");
  const lb = field("Loading booked"); await lb.locator('input[type="text"]').fill("3/11/26"); await lb.locator('input[type="text"]').press("Enter");
  await field("Loading time").locator('input[type="time"]').fill("09:30");
  await field("Status").locator("select").selectOption("loaded");
  await page.getByRole("button", { name: "Done editing" }).click(); await settle();
  const row = page.locator(".booking-row", { hasText: "Exp Booking Ltd" });
  const txt = (await row.innerText()).replace(/\n/g, " | ");
  expect(txt.includes("03/11/2026") && txt.includes("09:30") && /loaded/i.test(txt), `row text: ${txt}`);
  await page.locator(".overview-bar input").first().fill("Explorer Sale"); await settle();
  expect((await page.locator(".booking-row").count()) === 1, "search by sale name narrows to the booking");
  await page.locator(".overview-bar input").first().fill("");
  await page.reload(); await side("Delivery Booking").click();
  await page.locator(".booking-row", { hasText: "Exp Booking Ltd" }).click();
  expect((await page.locator(".lane-detail").innerText()).includes("Explorer Sale"), "sale name persisted");
  await page.locator(".lane-detail").getByRole("button", { name: "Delete" }).click(); await settle();
  expect((await page.locator(".booking-row", { hasText: "Exp Booking Ltd" }).count()) === 0, "booking deleted");
});

await step("Mai: search, done styling; Jobs: notes on two jobs, chip follows Status now", async () => {
  await login("exp-admin", EXP_PASS); await side("Mai").click();
  const f = page.locator(".add-form").first();
  for (const t of ["Exp task alpha", "Exp task beta"]) { await f.locator("input").nth(0).fill(t); await page.getByRole("button", { name: "Add task" }).click(); }
  await page.locator(".overview-bar input").first().fill("beta"); await settle();
  expect((await page.locator("tr.mai-row").count()) === 1, "search narrows to 1");
  await page.locator(".overview-bar input").first().fill("");
  const alpha = page.locator("tr.mai-row", { hasText: "Exp task alpha" });
  await alpha.locator("select").selectOption("done"); await settle();
  expect(/row-done/.test(await alpha.getAttribute("class")), "done row class");
  for (const t of ["Exp task alpha", "Exp task beta"]) await page.locator("tr.mai-row", { hasText: t }).locator('button[title="Delete task"]').click();
  await side("Buyer Space").click(); await pill("Jobs").click();
  const jf = page.locator(".add-form").first();
  for (const j of ["Exp job one", "Exp job two"]) { await jf.locator('input:not([type="date"])').nth(1).fill(j); await page.getByRole("button", { name: "Add job" }).click(); }
  const two = page.locator(".jobs-row", { hasText: "Exp job two" });
  if (!(await page.locator(".job-detail").count())) await two.click();
  let detail = page.locator(".job-detail");
  await detail.locator(".mini-field", { hasText: "Status now" }).locator("select").selectOption("rejected"); await settle();
  expect(/rejected/i.test(await two.locator(".chip").innerText()), "row chip follows Status now");
  await detail.locator("textarea").fill("Exp note on two"); await detail.getByRole("button", { name: "Add note" }).click();
  expect(/rejected/i.test(await detail.locator(".job-note").last().locator(".chip").innerText()), "note stamped rejected");
  await page.locator(".jobs-row", { hasText: "Exp job one" }).click();
  detail = page.locator(".job-detail");
  await detail.locator("textarea").fill("Exp note on one"); await detail.getByRole("button", { name: "Add note" }).click();
  expect((await page.locator(".jobs-row", { hasText: "Exp job one" }).innerText()).includes("1 note"), "one note on job one");
  expect((await two.innerText()).includes("1 note"), "still one note on job two");
  for (const j of ["Exp job one", "Exp job two"]) await page.locator(".jobs-row", { hasText: j }).locator('button[title="Delete job"]').click();
});

await step("a change made right before Log out is kept", async () => {
  await login("exp-admin", EXP_PASS); await side("Mai").click();
  await page.locator(".add-form").first().locator("input").nth(0).fill("Exp logout task");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByText("Log out").click();
  await page.getByRole("button", { name: "Sign in" }).waitFor();
  await login("exp-admin", EXP_PASS); await side("Mai").click();
  const row = page.locator("tr.mai-row", { hasText: "Exp logout task" });
  expect((await row.count()) === 1, "task survived an immediate logout");
  await row.locator('button[title="Delete task"]').click();
});

await step("cleanup: delete PFI 9101 and the three accounts", async () => {
  await login("exp-sale", EXP_PASS); await side("Order Tracking").click();
  await openRow(page.locator(".pfi-list-row", { hasText: "PFI 9101" }));
  await page.getByRole("button", { name: "Delete PFI" }).click();
  const yes = page.getByRole("button", { name: /yes, delete/i }); if (await yes.count()) await yes.click();
  await settle();
  expect((await page.locator(".pfi-list-row", { hasText: "PFI 9101" }).count()) === 0, "PFI deleted");
  await login(A.admin.username, A.admin.password); await side("Accounts").click();
  for (const u of ["exp-sale", "exp-buyer", "exp-admin"]) {
    const r = page.locator(".account-row").filter({ has: page.locator(`input[value="${u}"]`) });
    await r.locator('button[title="Delete account"]').click();
  }
  await settle();
  expect((await page.locator(".account-row").filter({ has: page.locator('input[value="exp-sale"]') }).count()) === 0, "accounts deleted");
});

console.log(`\n${passes.length} passed, ${failures.length} failed`);
for (const f of failures) console.log(" - " + f);
await browser.close();
process.exit(failures.length ? 1 : 0);
