import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_ZIP,
  isResourceCategory,
  resources as mockResources,
  zipCoordinates
} from "../../../data/resources";
import { RADIUS_MILES, SearchableResource, applyFilters, boundingBox } from "../../../lib/geo";

const supabaseUrl = process.env.SUPABASE_URL;
// The anon key respects Row Level Security. The service-role key bypasses it, so it is
// only kept as a fallback for existing setups; the verified filter below applies either way.
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    : null;

const MAX_ROWS = 500;

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
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const zip = searchParams.get("zip")?.trim() || DEFAULT_ZIP;
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "ZIP code must be 5 digits." }, { status: 400 });
  }

  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const lat = latParam ? Number.parseFloat(latParam) : NaN;
  const lng = lngParam ? Number.parseFloat(lngParam) : NaN;
  const hasCoords = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const userCoords = hasCoords ? { lat, lng, city: "Your location" } : zipCoordinates[zip];

  const selectedCategories =
    searchParams.get("categories")?.split(",").filter(isResourceCategory) ?? [];

  // If Supabase is not configured, fall back to mock data.
  if (!supabase) {
    return NextResponse.json(applyFilters(mockResources, userCoords, selectedCategories, zip, "mock"));
  }

  let query = supabase.from("resources").select("*").eq("verified", true).limit(MAX_ROWS);

  if (selectedCategories.length) {
    query = query.overlaps("categories", selectedCategories);
  }

  if (userCoords) {
    // Keep rows without coordinates (they can't be ruled out) plus rows inside the search box.
    const box = boundingBox(userCoords, RADIUS_MILES);
    query = query.or(
      `lat.is.null,lng.is.null,and(lat.gte.${box.minLat},lat.lte.${box.maxLat},lng.gte.${box.minLng},lng.lte.${box.maxLng})`
    );
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("Supabase error", error);
    return NextResponse.json(applyFilters(mockResources, userCoords, selectedCategories, zip, "mock"));
  }

  const normalized: SearchableResource[] = (data as DbResource[]).map((row) => ({
    id: row.id,
    name: row.name,
    categories: row.categories.filter(isResourceCategory),
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
    coordinates: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null
  }));

  return NextResponse.json(applyFilters(normalized, userCoords, selectedCategories, zip, "supabase"));
}
