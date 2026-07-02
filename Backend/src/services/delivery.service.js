import { HttpError } from "../lib/http-error.js";

const DEFAULT_CAMPUS_KEY = "default";

const DELIVERY_PRICING = {
  baseFeeKobo: 30000,
  perKmKobo: 18000,
  minimumFeeKobo: 30000,
  maximumFeeKobo: 150000,
  freeRadiusKm: 0.25,
  roundToKobo: 5000,
};

/**
 * Campus zones use simple x/y map coordinates measured in kilometres.
 * This is safer for a campus MVP than relying on unreliable free-text addresses.
 * Replace or extend these zones with your real campus map points later.
 */
const CAMPUS_MAPS = {
  default: {
    label: "Campus",
    defaultOrigin: "Campus Market",
    pricing: DELIVERY_PRICING,
    zones: [
      { id: "main-gate", label: "Main Gate", x: 0.1, y: 0.2 },
      { id: "campus-market", label: "Campus Market", x: 0.9, y: 0.8 },
      { id: "student-hostel", label: "Student Hostel", x: 1.5, y: 1.1 },
      { id: "faculty-area", label: "Faculty Area", x: 1.0, y: 1.9 },
      { id: "library", label: "Library", x: 1.7, y: 2.2 },
      { id: "admin-block", label: "Admin Block", x: 2.1, y: 1.7 },
      { id: "cafeteria", label: "Cafeteria", x: 1.2, y: 1.4 },
      { id: "sports-complex", label: "Sports Complex", x: 2.8, y: 1.0 },
    ],
  },

  fupre: {
    label: "FUPRE",
    defaultOrigin: "Campus Market",
    pricing: DELIVERY_PRICING,
    zones: [
      { id: "main-gate", label: "Main Gate", x: 0.1, y: 0.2 },
      { id: "campus-market", label: "Campus Market", x: 0.9, y: 0.75 },
      { id: "student-hostel", label: "Student Hostel Area", x: 1.55, y: 1.1 },
      { id: "engineering", label: "Engineering Faculty Area", x: 1.15, y: 1.95 },
      { id: "library", label: "Library / Academic Core", x: 1.7, y: 2.25 },
      { id: "admin", label: "Admin Block", x: 2.05, y: 1.65 },
      { id: "cafeteria", label: "Cafeteria / Food Court", x: 1.25, y: 1.35 },
      { id: "sport", label: "Sports Complex", x: 2.75, y: 1.0 },
    ],
  },
};

function normalise(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function campusKey(campus) {
  const value = normalise(campus);
  if (value.includes("fupre") || value.includes("petroleum-resources")) {
    return "fupre";
  }
  return DEFAULT_CAMPUS_KEY;
}

function getCampusMap(campus) {
  return CAMPUS_MAPS[campusKey(campus)] || CAMPUS_MAPS[DEFAULT_CAMPUS_KEY];
}

function findZone(campusMap, input, fallbackLabel = "") {
  const value = normalise(input || fallbackLabel);
  if (!value) return null;

  const direct = campusMap.zones.find((zone) => {
    const zoneId = normalise(zone.id);
    const zoneLabel = normalise(zone.label);
    return value === zoneId || value === zoneLabel;
  });

  if (direct) return direct;

  return (
    campusMap.zones.find((zone) => {
      const zoneId = normalise(zone.id);
      const zoneLabel = normalise(zone.label);
      return value.includes(zoneId) || value.includes(zoneLabel) || zoneLabel.includes(value);
    }) || null
  );
}

function distanceKm(origin, destination) {
  const dx = Number(origin.x) - Number(destination.x);
  const dy = Number(origin.y) - Number(destination.y);
  return Math.sqrt(dx * dx + dy * dy);
}

function roundFee(value, roundToKobo) {
  if (!roundToKobo) return Math.round(value);
  return Math.ceil(value / roundToKobo) * roundToKobo;
}

function toNaira(kobo) {
  return kobo / 100;
}

export function listDeliveryZones(campus = "") {
  const map = getCampusMap(campus);
  return {
    campus: map.label,
    defaultOrigin: map.defaultOrigin,
    pricing: map.pricing,
    zones: map.zones.map((zone) => ({
      id: zone.id,
      label: zone.label,
    })),
  };
}

export function calculateDeliveryQuote(input = {}) {
  const deliveryOption = input.deliveryOption === "Delivery" ? "Delivery" : "Pickup";
  const campus = input.campus || "";
  const map = getCampusMap(campus);
  const pricing = map.pricing || DELIVERY_PRICING;

  if (deliveryOption !== "Delivery") {
    return {
      campus: map.label,
      deliveryOption,
      origin: null,
      destination: null,
      distanceKm: 0,
      feeKobo: 0,
      fee: 0,
      label: "Pickup is free",
    };
  }

  const origin =
    findZone(map, input.origin, map.defaultOrigin) ||
    findZone(map, map.defaultOrigin) ||
    map.zones[0];

  const destination = findZone(map, input.destination || input.deliveryAddress);

  if (!destination) {
    throw new HttpError(
      422,
      "Select a valid campus delivery zone so delivery fee can be calculated.",
    );
  }

  const distance = Number(distanceKm(origin, destination).toFixed(2));
  let feeKobo = 0;

  if (distance > pricing.freeRadiusKm) {
    feeKobo = pricing.baseFeeKobo + distance * pricing.perKmKobo;
    feeKobo = roundFee(feeKobo, pricing.roundToKobo);
    feeKobo = Math.max(pricing.minimumFeeKobo, feeKobo);
    feeKobo = Math.min(pricing.maximumFeeKobo, feeKobo);
  }

  return {
    campus: map.label,
    deliveryOption,
    origin: { id: origin.id, label: origin.label },
    destination: { id: destination.id, label: destination.label },
    distanceKm: distance,
    feeKobo,
    fee: toNaira(feeKobo),
    label:
      feeKobo === 0
        ? "Same-zone campus delivery is free"
        : `${distance}km campus delivery`,
  };
}

export function calculateDeliveryFeeKobo(input = {}) {
  return calculateDeliveryQuote(input).feeKobo;
}
