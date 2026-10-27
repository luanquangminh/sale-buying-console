/* A PFI as the Sale's Add button and the MCP create_pfi tool make it: the header as given, everything else empty. */

/** The sub-types a PFI's delivery offers per mode (the modes are SHIPMENT_MODES); a booking names its own in SHIPMENT_SUBTYPES. */
export const VEHICLE_SUBTYPES = {
  container: ["20ft Dry", "20ft Reefer", "40ft Dry", "40ft HC Dry", "40ft Reefer"],
  truck: ["Dry", "Temperature Controlled"],
  uk_delivery: ["Dry", "Temperature Controlled"],
  air_freight: ["General Cargo", "Temperature Controlled"],
};

/** The delivery block a new PFI starts with. */
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

/** A new PFI from its header; lines, documents and payments come later. A field added here reaches the UI and the MCP tool alike. */
export function newPfi(id, at, { saleId, saleName, pfiNo, customerId, customerName, currency, paymentTerm = "", incoterm }) {
  return { id, saleId, saleName, pfiNo, customerId, customerName, currency, paymentTerm, incoterm, createdAt: at, products: [], delivery: emptyPfiDelivery(), documents: [], payments: [] };
}

/** The line the buyer's feed gets when a PFI is made. */
export const pfiCreatedMessage = (pfiNo) => `Created PFI ${pfiNo} — track order status once products are added.`;
