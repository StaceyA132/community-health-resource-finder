import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { categoryLabels, resources as mockResources, zipCoordinates } from "../../../data/resources";

type Coordinates = { lat: number; lng: number };

const milesRadius = 60;

const haversineMiles = (a: Coordinates, b: Coordinates) => {
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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type DbResource = {
  id: string;
  name: string;
  categories: string[];
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string | null;
  website?: string | null;
  hours: string;
  cost: string;
  eligibility: string;
  lat: number | null;
  lng: number | null;
  verified?: boolean | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const zip = searchParams.get("zip") || "94103";
  const categories = searchParams.get("categories");
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  const lat = latParam ? Number.parseFloat(latParam) : NaN;
  const lng = lngParam ? Number.parseFloat(lngParam) : NaN;

  const userCoords =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng, city: "Your location" }
      : zipCoordinates[zip];

  const selectedCategories = categories?.split(",").filter(Boolean) ?? [];

  // If Supabase is not configured, fall back to mock data.
  if (!supabaseUrl || !supabaseServiceKey) {
    const fallback = applyFilters(mockResources, userCoords, selectedCategories, zip);
    return NextResponse.json(fallback);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let query = supabase.from("resources").select("*");

  if (selectedCategories.length) {
    query = query.overlaps("categories", selectedCategories);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("Supabase error", error);
    const fallback = applyFilters(mockResources, userCoords, selectedCategories, zip);
    return NextResponse.json({ ...fallback, metadata: { ...fallback.metadata, source: "mock" } });
  }

  const normalized = data.map((row: DbResource) => ({
    id: row.id,
    name: row.name,
    categories: row.categories,
    description: row.description,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    hours: row.hours,
    cost: row.cost,
    eligibility: row.eligibility,
    coordinates:
      row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    verified: row.verified ?? undefined
  }));

  const filtered = applyFilters(normalized, userCoords, selectedCategories, zip);

  return NextResponse.json({ ...filtered, metadata: { ...filtered.metadata, source: "supabase" } });
}

function applyFilters(
  resourceList: Array<{
    coordinates: { lat: number; lng: number } | null;
    categories: string[];
    id: string;
    name: string;
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
  }>,
  userCoords: { lat: number; lng: number; city: string } | undefined,
  selectedCategories: string[],
  zip: string
) {
  const filtered = resourceList
    .map((resource) => {
      const withinCategory =
        selectedCategories.length === 0 ||
        selectedCategories.some((cat) => resource.categories.includes(cat));

      const distance =
        userCoords && resource.coordinates
          ? haversineMiles(userCoords, resource.coordinates)
          : null;

      const withinRadius = distance === null ? true : distance <= milesRadius;

      return {
        ...resource,
        distance,
        matches: withinCategory && withinRadius
      };
    })
    .filter((entry) => entry.matches)
    .sort((a, b) => {
      if (a.distance === null) return 0;
      if (b.distance === null) return 0;
      return a.distance - b.distance;
    });

  return {
    zip,
    locationLabel: userCoords?.city ?? "Unknown area",
    availableCategories: categoryLabels,
    results: filtered,
    metadata: {
      radiusMiles: milesRadius,
      matchedCount: filtered.length,
      centered: Boolean(userCoords)
    }
  };
}
