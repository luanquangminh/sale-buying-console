import { describe, expect, it } from "vitest";
import { BOOKING_STATUS_LABEL, bookingFromPfi, bookingOf, bookingStatus, emptyBooking, etaSoon, etaSoonText, loadedForDelivery } from "../src/booking.js";

const today = "2026-10-25";
const row = (status: string, etd = "", eta = "") => ({ status, etd, eta });

describe("bookingStatus follows the dates once loaded", () => {
  it("stays Loaded before the ETD, In Transit from the ETD, Arrived from the ETA", () => {
    expect(bookingStatus(row("loaded", "2026-10-28", "2026-11-10"), today)).toBe("loaded");
    expect(bookingStatus(row("loaded", "2026-10-25", "2026-11-10"), today)).toBe("in_transit");
    expect(bookingStatus(row("loaded", "2026-10-19", "2026-10-25"), today)).toBe("arrived");
    expect(bookingStatus(row("loaded", "2026-09-25", "2026-10-13"), today)).toBe("arrived");
  });
  it("needs no ETD to arrive, and no ETA to be in transit", () => {
    expect(bookingStatus(row("loaded", "", "2026-10-20"), today)).toBe("arrived");
    expect(bookingStatus(row("loaded", "2026-10-20", ""), today)).toBe("in_transit");
    expect(bookingStatus(row("loaded"), today)).toBe("loaded");
  });
  it("leaves a Pending row alone whatever its dates say: it is not loaded yet", () => {
    expect(bookingStatus(row("pending", "2026-10-22", "2026-11-07"), today)).toBe("pending");
    expect(bookingStatus(row("pending", "2026-09-01", "2026-09-10"), today)).toBe("pending");
    expect(bookingStatus({ status: "whatever" }, today)).toBe("pending");
  });
  it("keeps a status set by hand that is further along than the dates", () => {
    expect(bookingStatus(row("in_transit", "2027-10-07", "2027-12-10"), today)).toBe("in_transit"); // an ETD typed a year out
    expect(bookingStatus(row("in_transit"), today)).toBe("in_transit");
    expect(bookingStatus(row("arrived", "2026-10-28", "2026-11-10"), today)).toBe("arrived");
    expect(bookingStatus(row("loaded", "2026-10-19", "2026-11-09"), today)).toBe("in_transit"); // the dates win when they are ahead
  });
  it("has a label for every status it returns", () => {
    for (const s of ["pending", "loaded", "in_transit", "arrived"]) expect(BOOKING_STATUS_LABEL[s]).toBeTruthy();
  });
});

describe("etaSoon warns under In Transit in the last two days", () => {
  it("counts the days to the ETA", () => {
    expect(etaSoon(row("loaded", "2026-10-19", "2026-10-27"), today)).toBe(2);
    expect(etaSoon(row("loaded", "2026-10-19", "2026-10-26"), today)).toBe(1);
    expect(etaSoon(row("loaded", "2026-10-19", "2026-10-28"), today)).toBeNull();
  });
  it("says nothing before the ETD, after the ETA, without an ETA, or for a Pending row", () => {
    expect(etaSoon(row("loaded", "2026-10-26", "2026-10-27"), today)).toBeNull();
    expect(etaSoon(row("loaded", "2026-10-19", "2026-10-25"), today)).toBeNull();
    expect(etaSoon(row("loaded", "2026-10-19", ""), today)).toBeNull();
    expect(etaSoon(row("pending", "2026-10-19", "2026-10-26"), today)).toBeNull();
  });
  it("words the warning", () => {
    expect(etaSoonText(2)).toBe("ETA in 2 days");
    expect(etaSoonText(1)).toBe("ETA tomorrow");
    expect(etaSoonText(0)).toBe("ETA today");
  });
});

const pfi = (delivery: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: "pfi-1", saleId: "rep-1", saleName: "Anna", pfiNo: "3200", customerName: "Acme Foods Ltd",
  delivery: { type: "delivery", loaded: "loaded", vehicleType: "container", subType: "40ft HC Dry", loadingDate: "2026-10-24", loadingTime: "09:30", etd: "2026-10-28", eta: "2026-11-20", pod: "Ashdod", loadingAddress: "NN5 7UW", ...delivery },
  ...extra,
});

describe("loadedForDelivery", () => {
  it("fires when a customer delivery turns Loaded", () => {
    expect(loadedForDelivery(pfi({ loaded: "not_loaded" }), pfi({}))).toBe(true);
    expect(loadedForDelivery(undefined, pfi({}))).toBe(true);
  });
  it("does not fire for a collection, a PFI still not loaded, or one that was loaded already", () => {
    expect(loadedForDelivery(pfi({ loaded: "not_loaded" }), pfi({ type: "collection" }))).toBe(false);
    expect(loadedForDelivery(pfi({ loaded: "not_loaded" }), pfi({ loaded: "not_loaded" }))).toBe(false);
    expect(loadedForDelivery(pfi({}), pfi({ etd: "2026-10-29" }))).toBe(false);
    expect(loadedForDelivery(pfi({}), { id: "pfi-1" })).toBe(false);
  });
});

describe("bookingOf", () => {
  it("finds the row made from the PFI, or one typed in by hand under its number", () => {
    const made = { id: "b1", pfiId: "pfi-1", docNo: "" };
    const typed = { id: "b2", pfiId: "", docNo: " 3200 " };
    const other = { id: "b3", pfiId: "pfi-9", docNo: "3201" };
    expect(bookingOf([other, made], pfi({}))).toBe(made);
    expect(bookingOf([other, typed], pfi({}))).toBe(typed);
    expect(bookingOf([other], pfi({}))).toBeNull();
    expect(bookingOf([{ id: "b4", pfiId: "", docNo: "" }], pfi({}, { pfiNo: "" }))).toBeNull(); // no number: blank rows do not match
  });
});

describe("bookingFromPfi", () => {
  it("carries the customer, number, places, vehicle and dates over, loaded", () => {
    const b = bookingFromPfi(pfi({}), "book-1", "2026-10-25T10:00:00.000Z");
    expect(b).toMatchObject({
      id: "book-1", pfiId: "pfi-1", saleId: "rep-1", customerName: "Acme Foods Ltd", saleName: "Anna", docNo: "3200",
      pod: "Ashdod", loadingAddress: "NN5 7UW", mode: "container", subType: "40ft HC Dry",
      loadingBooked: "2026-10-24", loadingTime: "09:30", etd: "2026-10-28", eta: "2026-11-20",
      status: "loaded", forwarder: "", rate: "", note: "", createdAt: "2026-10-25T10:00:00.000Z",
    });
    expect(Object.keys(b).sort()).toEqual(Object.keys(emptyBooking("x", "y")).sort()); // same shape as a row added by hand
  });
  it("maps a vehicle whose sub-type the booking list does not know to the first one of that mode", () => {
    expect(bookingFromPfi(pfi({ vehicleType: "truck", subType: "Dry" }), "b", "t")).toMatchObject({ mode: "truck", subType: "Dry Truck" });
    expect(bookingFromPfi(pfi({ vehicleType: "air_freight", subType: "Temperature Controlled" }), "b", "t")).toMatchObject({ mode: "air_freight", subType: "General Cargo" });
    expect(bookingFromPfi(pfi({ vehicleType: "spaceship", subType: "X" }), "b", "t")).toMatchObject({ mode: "container", subType: "20ft Dry" });
  });
  it("copes with an old PFI whose delivery lacks the new fields", () => {
    expect(bookingFromPfi(pfi({ pod: undefined, loadingAddress: undefined, loadingTime: undefined }), "b", "t")).toMatchObject({ pod: "", loadingAddress: "", loadingTime: "" });
  });
});
