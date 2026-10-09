import { describe, expect, it } from "vitest";
import { resources, zipCoordinates } from "../data/resources";
import { RADIUS_MILES, SearchableResource, applyFilters, boundingBox, haversineMiles } from "./geo";

const sf = zipCoordinates["94103"];

describe("haversineMiles", () => {
  it("is zero for the same point", () => {
    expect(haversineMiles(sf, sf)).toBe(0);
  });

  it("measures San Francisco to New York at roughly 2,570 miles", () => {
    expect(haversineMiles(sf, zipCoordinates["10001"])).toBeCloseTo(2570, -1);
  });
});

describe("boundingBox", () => {
  it("contains points at the edge of the radius", () => {
    const box = boundingBox(sf, RADIUS_MILES);
    const north = { lat: sf.lat + RADIUS_MILES / 69.2, lng: sf.lng };
    expect(north.lat).toBeLessThan(box.maxLat);
    expect(haversineMiles(sf, { lat: sf.lat, lng: box.maxLng })).toBeGreaterThanOrEqual(RADIUS_MILES - 0.5);
  });
});

describe("applyFilters", () => {
  it("returns nearby resources sorted by distance", () => {
    const { results, metadata } = applyFilters(resources, sf, [], "94103", "mock");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.city === "San Francisco")).toBe(true);
    const distances = results.map((r) => r.distance as number);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(metadata).toMatchObject({ centered: true, source: "mock", matchedCount: results.length });
  });

  it("filters by category", () => {
    const { results } = applyFilters(resources, sf, ["shelter"], "94103", "mock");
    expect(results.map((r) => r.id)).toEqual(["sf-night-shelter"]);
  });

  it("returns everything, uncentered, for an unknown ZIP", () => {
    const response = applyFilters(resources, undefined, [], "99999", "mock");
    expect(response.results).toHaveLength(resources.length);
    expect(response.metadata.centered).toBe(false);
  });

  it("sorts resources without coordinates last", () => {
    const noCoords: SearchableResource = { ...resources[0], id: "no-coords", coordinates: null };
    const { results } = applyFilters([noCoords, ...resources], sf, [], "94103", "mock");
    expect(results.at(-1)?.id).toBe("no-coords");
    expect(results[0].distance).not.toBeNull();
  });
});
