import { NextRequest, NextResponse } from "next/server";
import { categoryLabels, resources, zipCoordinates } from "../../../data/resources";

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const zip = searchParams.get("zip") || "94103";
  const categories = searchParams.get("categories");

  const userCoords = zipCoordinates[zip];
  const selectedCategories = categories?.split(",").filter(Boolean) ?? [];

  const filtered = resources
    .map((resource) => {
      const withinCategory =
        selectedCategories.length === 0 ||
        selectedCategories.some((cat) => resource.categories.includes(cat as any));

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

  return NextResponse.json({
    zip,
    locationLabel: userCoords?.city ?? "Unknown area",
    availableCategories: categoryLabels,
    results: filtered,
    metadata: {
      radiusMiles: milesRadius,
      matchedCount: filtered.length,
      centered: Boolean(userCoords)
    }
  });
}
