import type { ResourceCategory } from "../data/resources";
import { haversineMiles } from "./geo";

// Nationwide data from OpenStreetMap (via the public Overpass API) and US zip lookups from
// Zippopotam.us. Neither needs an API key. Responses are cached for an hour so repeat
// searches near the same spot don't hit the public servers again.

// OVERPASS_URL may list several servers, separated by commas; they're tried in order.
const overpassUrls = (process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const retryDelayMs = 1500;
// Large queries can take 10-20 s on the busy public server (the query itself allows 20 s),
// so each attempt gets up to 25 s, within an overall budget for the whole lookup.
const attemptTimeoutMs = 25000;
const totalBudgetMs = 30000;
const minAttemptMs = 5000;
const userAgent = "community-health-resource-finder (https://github.com/StaceyA132/community-health-resource-finder)";
const cacheSeconds = 60 * 60;
const searchRadiusMeters = 25000; // about 15 miles
// Results kept per search, shared evenly between the requested categories. Overpass returns
// places in ID order, not by distance, so we fetch everything in the area (up to a safety
// limit) and keep the nearest ourselves; otherwise common categories like dentists could
// crowd out rare ones like shelters.
const maxResults = 300;
const maxElements = 3000;

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
  return `[out:json][timeout:20];\n(\n${lines.join("\n")}\n);\nout center tags ${maxElements};`;
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

  // Identical searches made at the same time (re-renders, several open tabs) share one
  // request, which helps stay under the public server's rate limit.
  let request = inFlight.get(query);
  if (!request) {
    request = queryOverpass(query).finally(() => inFlight.delete(query));
    inFlight.set(query, request);
  }
  const places = await request;
  return keepNearestPerCategory(places, center, categories.length ? categories : allCategories);
}

// Keeps the nearest places in each category, splitting maxResults evenly between them.
// A place in several categories is kept if any of its categories still has room.
export function keepNearestPerCategory(
  places: LiveResource[],
  center: Coordinates,
  categories: ResourceCategory[]
): LiveResource[] {
  const perCategory = Math.floor(maxResults / categories.length);
  const counts = new Map<ResourceCategory, number>();
  const kept: LiveResource[] = [];

  const byDistance = places
    .map((place) => ({ place, distance: haversineMiles(center, place.coordinates) }))
    .sort((a, b) => a.distance - b.distance);

  for (const { place } of byDistance) {
    const wanted = place.categories.filter((category) => categories.includes(category));
    if (!wanted.some((category) => (counts.get(category) ?? 0) < perCategory)) continue;
    kept.push(place);
    for (const category of wanted) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return kept;
}

const inFlight = new Map<string, Promise<LiveResource[]>>();

// Public Overpass servers often answer 429 (busy) or 504 (timed out) and recover within a
// second or two, so try each configured server, then the first one again after a pause.
async function queryOverpass(query: string): Promise<LiveResource[]> {
  const attempts = [...overpassUrls, overpassUrls[0]];
  const deadline = Date.now() + totalBudgetMs;
  let lastError: unknown;

  for (let index = 0; index < attempts.length; index++) {
    const url = attempts[index];
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    const remaining = deadline - Date.now();
    if (remaining < minAttemptMs) break;
    try {
      const response = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(Math.min(attemptTimeoutMs, remaining)),
        next: { revalidate: cacheSeconds }
      });
      if (response.ok) {
        const data = (await response.json()) as { elements?: OverpassElement[] };
        return parseOverpassElements(data.elements ?? []);
      }
      lastError = new Error(`Overpass request failed: ${response.status}`);
      // Other 4xx errors mean a bad query; retrying won't help.
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
