/*
 * Every screen has its own address, so a link can be shared or bookmarked and the browser's Back button works.
 * The address is derived from the shell's state (pathFor) and parsed back when the app loads or the user
 * goes back (stateFor). A path a role may not open, or one that names nothing, falls back to the role's home.
 */

const SALE_PAGES = { customer: "customers", orders: "orders", payments: "payments-received" };
const BUYER_PAGES = { feed: "inbox", fulfillment: "orders-to-update", po: "po-tracking", jobs: "jobs" };
const SINGLE_PAGES = {
  mai: "/admin/mai",
  payments: "/admin/customer-balance",
  accounts: "/admin/accounts",
  paymentsReceived: "/accounting/payments-received",
  delivery: "/container-rate",
  warehouse: "/warehouse",
  agent: "/agent",
  booking: "/delivery-booking",
};
const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const SALE_BY_PATH = invert(SALE_PAGES); const BUYER_BY_PATH = invert(BUYER_PAGES); const SINGLE_BY_PATH = invert(SINGLE_PAGES);

/** The sections each role may open; admin opens everything. */
const ALLOWED = {
  admin: null,
  sale: ["customer", "delivery", "warehouse", "agent"],
  buyer: ["buyerspace", "delivery", "warehouse", "agent", "booking"],
  warehouse: ["warehouse"],
  accountant: ["paymentsReceived"],
};
export const sectionAllowed = (topSection, role) => { const a = ALLOWED[role]; return a === null || (Array.isArray(a) && a.includes(topSection)); };

/** Where a role lands after signing in. */
export const homeFor = (role) => (role === "warehouse" ? "warehouse" : role === "accountant" ? "paymentsReceived" : role === "buyer" ? "buyerspace" : "customer");

/** The address of the shell's state. An admin's rep pages name the rep: /reps/<id>/orders. */
export function pathFor(state, role) {
  const { topSection, subSection = "customer", buyerSubTab = "feed", selectedSaleId = "" } = state || {};
  if (topSection === "customer") {
    const page = SALE_PAGES[subSection] || SALE_PAGES.customer;
    return role === "admin" && selectedSaleId ? `/reps/${encodeURIComponent(selectedSaleId)}/${page}` : `/${page}`;
  }
  if (topSection === "buyerspace") return `/buyer/${BUYER_PAGES[buyerSubTab] || BUYER_PAGES.feed}`;
  return SINGLE_PAGES[topSection] || "/";
}

/**
 * The shell state an address names, for a role: { topSection, subSection?, buyerSubTab?, selectedSaleId? }, or null when the
 * address names nothing the role may open (the caller then goes home). `reps` are the sale reps an admin may pick;
 * the legacy `/#agent` link still opens the AI agent page.
 */
export function stateFor(path, role, { hash = "", reps = [] } = {}) {
  let p = String(path || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/" && hash === "#agent") p = "/agent";
  let state = null; let m;
  if (SINGLE_BY_PATH[p]) state = { topSection: SINGLE_BY_PATH[p] };
  else if ((m = /^\/buyer\/([a-z-]+)$/.exec(p)) && BUYER_BY_PATH[m[1]]) state = { topSection: "buyerspace", buyerSubTab: BUYER_BY_PATH[m[1]] };
  else if ((m = /^\/reps\/([^/]+)\/([a-z-]+)$/.exec(p)) && SALE_BY_PATH[m[2]]) state = { topSection: "customer", subSection: SALE_BY_PATH[m[2]], selectedSaleId: decodeURIComponent(m[1]) };
  else if ((m = /^\/([a-z-]+)$/.exec(p)) && SALE_BY_PATH[m[1]]) state = { topSection: "customer", subSection: SALE_BY_PATH[m[1]] };
  if (!state || !sectionAllowed(state.topSection, role)) return null;
  if (state.selectedSaleId !== undefined) {
    if (role !== "admin") return null; // a rep has no other rep's pages
    if (!reps.some((r) => r.id === state.selectedSaleId)) return null; // an admin needs a rep that exists
  }
  return state;
}

/** Every address, for the site map: path, who may open it, what it shows. */
export const SITE_MAP = [
  ["/customers", "sale", "Customer"], ["/orders", "sale", "Order Tracking"], ["/payments-received", "sale", "Payments Received (the rep's)"],
  ["/reps/<rep id>/customers", "admin", "A rep's Customer page"], ["/reps/<rep id>/orders", "admin", "A rep's Order Tracking"], ["/reps/<rep id>/payments-received", "admin", "A rep's Payments Received"],
  ["/buyer/inbox", "buyer, admin", "Inbox"], ["/buyer/orders-to-update", "buyer, admin", "Orders to update"], ["/buyer/po-tracking", "buyer, admin", "PO Tracking"], ["/buyer/jobs", "buyer, admin", "Jobs"],
  ["/admin/mai", "admin", "Mai"], ["/admin/customer-balance", "admin", "Customer Balance"], ["/admin/accounts", "admin", "Accounts"],
  ["/accounting/payments-received", "accountant, admin", "Payments Received Tracking"],
  ["/container-rate", "sale, buyer, admin", "Container Rate"], ["/warehouse", "everyone but the accountant", "Warehouse's Space"], ["/delivery-booking", "buyer, admin", "Delivery Booking"], ["/agent", "sale, buyer, admin", "AI agent link"],
];
