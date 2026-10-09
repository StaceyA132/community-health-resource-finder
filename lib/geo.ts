import { Resource, ResourceCategory, categoryLabels } from "../data/resources";

export type Coordinates = { lat: number; lng: number };
export type SearchableResource = Omit<Resource, "coordinates"> & {
  coordinates: Coordinates | null;
  source?: "curated" | "openstreetmap";
};
export type ResourceResult = SearchableResource & { distance: number | null };
export type DataSource = "mock" | "supabase";
// Whether nearby OpenStreetMap places were included: "unavailable" means the lookup failed.
export type LiveDataStatus = "ok" | "unavailable" | "not-requested";
type FilteredResponse = ReturnType<typeof applyFilters>;
export type SearchResponse = FilteredResponse & {
  metadata: FilteredResponse["metadata"] & { liveData: LiveDataStatus };
};

export const RADIUS_MILES = 60;

export const haversineMiles = (a: Coordinates, b: Coordinates) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const haversine =
    sinDLat * sinDLat + sinDLng * sinDLng * Math.cos(lat1) * Math.cos(lat2);

  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(haversine)));
};

// A lat/lng box that contains every point within `miles` of `center`. Used to narrow
// database queries before the exact distance check in applyFilters.
export function boundingBox(center: Coordinates, miles: number) {
  const milesPerDegree = 69;
  const latDelta = miles / milesPerDegree;
  const lngDelta = miles / (milesPerDegree * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta
  };
}

export function applyFilters(
  resourceList: SearchableResource[],
  userCoords: (Coordinates & { city: string }) | undefined,
  selectedCategories: ResourceCategory[],
  zip: string,
  source: DataSource
) {
  const results: ResourceResult[] = resourceList
    .filter(
      (resource) =>
        selectedCategories.length === 0 ||
        selectedCategories.some((category) => resource.categories.includes(category))
    )
    .map((resource) => ({
      ...resource,
      distance:
        userCoords && resource.coordinates ? haversineMiles(userCoords, resource.coordinates) : null
    }))
    .filter((resource) => resource.distance === null || resource.distance <= RADIUS_MILES)
    // Nearest first; resources without a known distance go last.
    .sort((a, b) => {
      if (a.distance === null) return b.distance === null ? 0 : 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

  return {
    zip,
    locationLabel: userCoords?.city ?? "Unknown area",
    availableCategories: categoryLabels,
    results,
    metadata: {
      radiusMiles: RADIUS_MILES,
      matchedCount: results.length,
      centered: Boolean(userCoords),
      source
    }
  };
}
