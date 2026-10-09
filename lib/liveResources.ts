import type { ResourceCategory } from "../data/resources";

// Nationwide data from OpenStreetMap (via the public Overpass API) and US zip lookups from
// Zippopotam.us. Neither needs an API key. Responses are cached for an hour so repeat
// searches near the same spot don't hit the public servers again.

const overpassUrl = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const userAgent = "community-health-resource-finder (https://github.com/StaceyA132/community-health-resource-finder)";
const cacheSeconds = 60 * 60;
const searchRadiusMeters = 25000; // about 15 miles
const maxResults = 300;

export type Coordinates = { lat: number; lng: number };

export type LiveResource = {
  id: string;
  name: string;
  categories: ResourceCategory[];
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  website?: string;
  hours: string;
  cost: string;
  eligibility: string;
  coordinates: Coordinates;
  source: "openstreetmap";
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// Overpass filters for each category, plus a matcher that decides which categories a
// returned place belongs to (one query covers several categories at once).
const categoryQueries: Record<
  ResourceCategory,
  { filters: string[]; matches: (tags: Record<string, string>) => boolean }
> = {
  pharmacy: {
    filters: ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'],
    matches: (t) => t.amenity === "pharmacy" || t.healthcare === "pharmacy"
  },
  dental: {
    filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
    matches: (t) => t.amenity === "dentist" || t.healthcare === "dentist"
  },
  "emergency-care": {
    filters: ['["amenity"="hospital"]["emergency"="yes"]', '["urgent_care"="yes"]'],
    matches: (t) => (t.amenity === "hospital" && t.emergency === "yes") || t.urgent_care === "yes"
  },
  "mental-health": {
    filters: [
      '["healthcare"="psychotherapist"]',
      '["healthcare"="counselling"]',
      '["healthcare:speciality"~"psychiatry"]'
    ],
    matches: (t) =>
      t.healthcare === "psychotherapist" ||
      t.healthcare === "counselling" ||
      /psychiatry/.test(t["healthcare:speciality"] ?? "")
  },
  "womens-health": {
    filters: ['["healthcare:speciality"~"gynaecology|obstetrics"]', '["healthcare"="birthing_centre"]'],
    matches: (t) =>
      /gynaecology|obstetrics/.test(t["healthcare:speciality"] ?? "") || t.healthcare === "birthing_centre"
  },
  food: {
    filters: [
      '["social_facility"="food_bank"]',
      '["amenity"="food_bank"]',
      '["social_facility"="soup_kitchen"]'
    ],
    matches: (t) =>
      t.social_facility === "food_bank" || t.amenity === "food_bank" || t.social_facility === "soup_kitchen"
  },
  shelter: {
    filters: ['["social_facility"="shelter"]', '["social_facility:for"~"homeless"]'],
    matches: (t) => t.social_facility === "shelter" || /homeless/.test(t["social_facility:for"] ?? "")
  }
};

const allCategories = Object.keys(categoryQueries) as ResourceCategory[];

export function buildOverpassQuery(center: Coordinates, categories: ResourceCategory[]) {
  const wanted = categories.length ? categories : allCategories;
  const around = `(around:${searchRadiusMeters},${center.lat.toFixed(4)},${center.lng.toFixed(4)})`;
  const lines = wanted.flatMap((category) =>
    categoryQueries[category].filters.map((filter) => `  nwr${filter}${around};`)
  );
  return `[out:json][timeout:20];\n(\n${lines.join("\n")}\n);\nout center tags ${maxResults};`;
}

export function parseOverpassElements(elements: OverpassElement[]): LiveResource[] {
  const results: LiveResource[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    // Unnamed places can't be found or called, so they aren't useful to list.
    if (!tags.name || lat === undefined || lng === undefined) continue;

    const categories = allCategories.filter((category) => categoryQueries[category].matches(tags));
    if (!categories.length) continue;

    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    const isFree = tags.fee === "no" || categories.every((c) => c === "food" || c === "shelter");

    results.push({
      id: `osm-${element.type}-${element.id}`,
      name: tags.name,
      categories,
      description: tags.description ?? "Listed on OpenStreetMap. Call ahead to confirm services and cost.",
      address: street || "Address not listed",
      city: tags["addr:city"] ?? "",
      state: tags["addr:state"] ?? "",
      zip: tags["addr:postcode"] ?? "",
      phone: tags.phone ?? tags["contact:phone"],
      website: safeWebsite(tags.website ?? tags["contact:website"]),
      hours: tags.opening_hours ?? "Not listed",
      cost: isFree ? "Usually free; call to confirm" : "Call to confirm",
      eligibility: "Call to confirm",
      coordinates: { lat, lng },
      source: "openstreetmap"
    });
  }
  return results;
}

// Only link to http(s) sites; OSM tags are user-edited and could hold other URL schemes.
function safeWebsite(value: string | undefined) {
  if (!value) return undefined;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchLiveResources(
  center: Coordinates,
  categories: ResourceCategory[]
): Promise<LiveResource[]> {
  // Round to about 1 km so nearby searches share a cache entry.
  const rounded = { lat: Math.round(center.lat * 100) / 100, lng: Math.round(center.lng * 100) / 100 };
  const query = buildOverpassQuery(rounded, [...categories].sort());
  const response = await fetch(`${overpassUrl}?data=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
    next: { revalidate: cacheSeconds }
  });
  if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);
  const data = (await response.json()) as { elements?: OverpassElement[] };
  return parseOverpassElements(data.elements ?? []);
}

export async function lookupZip(
  zip: string
): Promise<(Coordinates & { city: string }) | undefined> {
  if (!/^\d{5}$/.test(zip)) return undefined;
  const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 60 * 60 * 24 * 7 }
  });
  if (!response.ok) return undefined;
  const data = (await response.json()) as {
    places?: Array<{ latitude: string; longitude: string; "place name": string; "state abbreviation": string }>;
  };
  const place = data.places?.[0];
  if (!place) return undefined;
  const lat = Number.parseFloat(place.latitude);
  const lng = Number.parseFloat(place.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng, city: `${place["place name"]}, ${place["state abbreviation"]}` };
}
