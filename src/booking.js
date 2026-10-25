/*
 * Delivery Booking: one row per customer shipment. A PFI saved as Loaded for a delivery gets its row here by itself,
 * and every row's status follows its dates: Loaded until the ETD, In Transit from the ETD, Arrived from the ETA.
 * The delivery block of the PFI itself lives here too, since a booking is made from it.
 */
import { dayNumber } from "./dates";

/** The ways a shipment goes out: a PFI's Vehicle and its booking's mode are the same list. */
export const SHIPMENT_MODES = [
  { value: "container", label: "Container" },
  { value: "truck", label: "Truck" },
  { value: "uk_delivery", label: "UK Delivery" },
  { value: "air_freight", label: "Air Freight" },
];
/** The sub-types a PFI's delivery offers per mode; a booking names its own in SHIPMENT_SUBTYPES. */
export const VEHICLE_SUBTYPES = {
  container: ["20ft Dry", "20ft Reefer", "40ft Dry", "40ft HC Dry", "40ft Reefer"],
  truck: ["Dry", "Temperature Controlled"],
  uk_delivery: ["Dry", "Temperature Controlled"],
  air_freight: ["General Cargo", "Temperature Controlled"],
};
/** The delivery block a new PFI starts with, in the UI and in the MCP tools alike. */
export function emptyPfiDelivery() {
  return {
    type: "delivery", bookedStatus: "not_booked", loaded: "not_loaded",
    vehicleType: "container", subType: VEHICLE_SUBTYPES.container[0],
    loadingDate: "", loadingTime: "",
    collectionDate: "", collectionTime: "",
    etd: "", eta: "",
    pod: "", loadingAddress: "",
  };
}
export const SHIPMENT_SUBTYPES = {
  container: ["20ft Dry", "20ft Reefer", "40ft Dry", "40ft Reefer", "40ft HC Dry"],
  truck: ["Dry Truck", "Reefer Truck"],
  uk_delivery: ["Truck", "Van"],
  air_freight: ["General Cargo", "Temperature Control"],
};
export const LOADING_METHODS = ["Palletized", "Handload"];

export const BOOKING_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "loaded", label: "Loaded" },
  { value: "in_transit", label: "In Transit" },
  { value: "arrived", label: "Arrived" },
];
export const BOOKING_STATUS_LABEL = Object.fromEntries(BOOKING_STATUSES.map((s) => [s.value, s.label]));
export const BOOKING_STATUS_TONE = { pending: "gray", loaded: "amber", in_transit: "blue", arrived: "green" };
const RANK = Object.fromEntries(BOOKING_STATUSES.map((s, i) => [s.value, i]));

/** How many days before the ETA the In Transit chip starts warning. */
export const ETA_SOON_DAYS = 2;

/** What the dates say about a loaded shipment on a given day: Arrived from the ETA, In Transit from the ETD, Loaded before both. */
function statusByDates(booking, todayIso) {
  const today = dayNumber(todayIso);
  const etd = dayNumber(booking.etd);
  const eta = dayNumber(booking.eta);
  if (today === null) return "loaded";
  if (eta !== null && today >= eta) return "arrived";
  if (etd !== null && today >= etd) return "in_transit";
  return "loaded";
}

/**
 * The status a booking shows: the later of what was set by hand and what the dates say, so the dates move a shipment
 * forward on their own and a hand-set Arrived still holds. A Pending row is not loaded yet; its dates move nothing.
 */
export function bookingStatus(booking, todayIso) {
  const set = RANK[booking.status] === undefined ? "pending" : booking.status;
  if (set === "pending") return "pending";
  const byDates = statusByDates(booking, todayIso);
  return RANK[byDates] > RANK[set] ? byDates : set;
}

/** Days left to the ETA while In Transit, once it is ETA_SOON_DAYS away or nearer; null when there is nothing to warn about. */
export function etaSoon(booking, todayIso) {
  if (bookingStatus(booking, todayIso) !== "in_transit") return null;
  const eta = dayNumber(booking.eta);
  const today = dayNumber(todayIso);
  if (eta === null || today === null) return null;
  const days = eta - today;
  return days <= ETA_SOON_DAYS ? Math.max(days, 0) : null;
}

export const etaSoonText = (days) => (days <= 0 ? "ETA today" : days === 1 ? "ETA tomorrow" : `ETA in ${days} days`);

/** A save that turns a customer delivery to Loaded; a collection has no booking, and a PFI already loaded gets no second row. */
export function loadedForDelivery(before, after) {
  const d = after.delivery || {};
  return d.type === "delivery" && d.loaded === "loaded" && before?.delivery?.loaded !== "loaded";
}

/** The booking that already covers a PFI: made from it, or typed in by hand under its number. */
export function bookingOf(bookings, pfi) {
  const no = String(pfi.pfiNo || "").trim();
  return bookings.find((b) => b.pfiId === pfi.id || (no && String(b.docNo || "").trim() === no)) || null;
}

/** An empty booking, as the Add button makes it. */
export function emptyBooking(id, at) {
  return {
    id, pfiId: "", saleId: "", customerName: "", saleName: "", docNo: "", pod: "", loadingAddress: "",
    mode: "container", subType: SHIPMENT_SUBTYPES.container[0],
    forwarder: "", currency: "USD", rate: "", method: LOADING_METHODS[0],
    loadingBooked: "", loadingTime: "", etd: "", eta: "", note: "", status: "pending",
    createdAt: at,
  };
}

/** The booking a loaded PFI gets: its customer, number, places, vehicle and dates carried over, status Loaded. */
export function bookingFromPfi(pfi, id, at) {
  const d = pfi.delivery || {};
  const mode = SHIPMENT_SUBTYPES[d.vehicleType] ? d.vehicleType : "container";
  const subtypes = SHIPMENT_SUBTYPES[mode];
  return {
    ...emptyBooking(id, at),
    pfiId: pfi.id, saleId: pfi.saleId || "",
    customerName: pfi.customerName || "", saleName: pfi.saleName || "", docNo: pfi.pfiNo || "",
    pod: d.pod || "", loadingAddress: d.loadingAddress || "",
    mode, subType: subtypes.includes(d.subType) ? d.subType : subtypes[0],
    loadingBooked: d.loadingDate || "", loadingTime: d.loadingTime || "", etd: d.etd || "", eta: d.eta || "",
    status: "loaded",
  };
}
