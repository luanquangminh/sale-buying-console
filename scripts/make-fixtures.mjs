// Builds harder Import PDF fixtures: a 2-page text PDF with a different layout, and an image-only (scanned) PDF.
import { chromium } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { writeFileSync, readFileSync } from "node:fs";

const rows = [
  ["Yogi Tea Organic Bags Classic Chai 37.4g", "4012824406711", "4012824436718", "6 x 17s", "02/2027", 20, 9.02, "0.0% Z"],
  ["McVities Family Circle 400g", "5000168014920", "05000168014913", "10 x 400g", "11/2026", 50, 20.63, "0.0% Z"],
  ["Heinz Baked Beans in Tomato Sauce 415g", "5000157024671", "05000157024688", "24 x 415g", "06/2028", 30, 14.4, "0.0% Z"],
  ["Walkers Ready Salted Crisps 32.5g (Multipack 6)", "5000328019741", "05000328019758", "10 x 6pk", "01/2027", 40, 11.75, "20.0% S"],
  ["Cadbury Dairy Milk 95g", "7622210997432", "07622210997449", "16 x 95g", "03/2027", 25, 18.2, "20.0% S"],
  ["Tetley Tea Bags 240s", "5000208034765", "05000208034772", "6 x 240s", "08/2027", 12, 32.9, "0.0% Z"],
  ["Kellogg's Corn Flakes 500g", "5050083012303", "05050083012310", "12 x 500g", "05/2027", 18, 24.5, "0.0% Z"],
  ["Nescafe Gold Blend 200g", "7613036062756", "07613036062763", "6 x 200g", "09/2027", 15, 41.2, "20.0% S"],
  ["Pringles Original 165g", "5053990101597", "05053990101603", "19 x 165g", "04/2027", 22, 16.05, "20.0% S"],
  ["Robinsons Orange Squash 1L", "5000107028912", "05000107028929", "12 x 1L", "07/2027", 10, 13.8, "0.0% Z"],
];
const money = (n) => n.toLocaleString("en-GB", { minimumFractionDigits: 2 });
// Layout B: product with EAN in the same cell, quantity before pack, no visible row numbers, page break mid-table.
const tr = (r) => `<tr><td><b>${r[0]}</b><br><span class="s">EAN ${r[1]} · Case ${r[2]}</span></td><td class="n">${r[5]}</td><td>${r[3]}</td><td>${r[4]}</td><td class="n">${money(r[6])}</td><td>${r[7]}</td><td class="n">${money(r[5] * r[6])}</td></tr>`;
const head = `<tr><th>Item</th><th>Cases</th><th>Pack</th><th>BBD</th><th>Unit £</th><th>VAT</th><th>Total £</th></tr>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Georgia,serif;font-size:11.5px;margin:30px;color:#222} h1{font-size:18px;margin:0} .s{color:#555;font-size:10px}
table{border-collapse:collapse;width:100%;margin-top:10px} th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left;vertical-align:top} th{font-size:10px;text-transform:uppercase}
td.n{text-align:right} .hdr{display:flex;justify-content:space-between} .brk{page-break-before:always}
</style></head><body>
<div class="hdr"><div><h1>FMCG TRADING LTD</h1>20 Saddleback Road, Northampton, UK</div><div><b>PROFORMA / ESTIMATE No. 3201</b><br>Date: 19 Sep 2026<br>Customer: Blue Ocean Distributors Ltd, Accra<br>Terms: FOB Felixstowe · Currency GBP</div></div>
<table>${head}${rows.slice(0, 6).map(tr).join("")}</table>
<div class="brk"></div>
<div class="hdr"><div>FMCG TRADING LTD · Proforma 3201 · page 2</div></div>
<table>${head}${rows.slice(6).map(tr).join("")}</table>
<table style="width:40%;margin-left:auto"><tr><td>Subtotal</td><td class="n">${money(rows.reduce((a, r) => a + r[5] * r[6], 0))}</td></tr><tr><td><b>Total GBP</b></td><td class="n"><b>${money(rows.reduce((a, r) => a + r[5] * r[6], 0) + 285.9)}</b></td></tr></table>
</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({ path: "tests/fixtures/proforma-3201-2pages.pdf", format: "A4", printBackground: true });
// Scanned version: screenshot each page region as PNG and embed into an image-only PDF.
await page.setViewportSize({ width: 1240, height: 1754 });
const pngs = [];
for (const part of [rows.slice(0, 6), rows.slice(6)]) {
  const h = html.replace(/<table>[\s\S]*<\/body>/, `<table>${head}${part.map(tr).join("")}</table></body>`);
  await page.setContent(h, { waitUntil: "load" });
  pngs.push(await page.screenshot({ fullPage: false, type: "png" }));
}
await browser.close();
const doc = await PDFDocument.create();
for (const png of pngs) { const img = await doc.embedPng(png); const p = doc.addPage([img.width, img.height]); p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height }); }
writeFileSync("tests/fixtures/proforma-3201-scanned.pdf", await doc.save());
console.log("fixtures: proforma-3201-2pages.pdf (text, 2 pages, layout B), proforma-3201-scanned.pdf (image-only, 2 pages)");
