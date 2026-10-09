import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceCategory } from "../data/resources";
import { LiveResource, fetchLiveResources, keepNearestPerCategory } from "./liveResources";

const pharmacy = {
  elements: [{ type: "node", id: 1, lat: 47.61, lon: -122.33, tags: { name: "Corner Pharmacy", amenity: "pharmacy" } }]
};
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Each test uses its own location so the shared in-flight map never carries over.
let lat = 40;
const nextCenter = () => ({ lat: (lat += 1), lng: -100 });

describe("fetchLiveResources", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries after a busy (429) response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(429)).mockResolvedValueOnce(reply(200, pharmacy));
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchLiveResources(nextCenter(), ["pharmacy"]);
    await vi.runAllTimersAsync();

    expect((await result).map((r) => r.name)).toEqual(["Corner Pharmacy"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry fails too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(504)));

    const result = fetchLiveResources(nextCenter(), ["pharmacy"]);
    const assertion = expect(result).rejects.toThrow("504");
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("does not retry a bad query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLiveResources(nextCenter(), ["pharmacy"])).rejects.toThrow("400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one request between identical searches made at the same time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, pharmacy));
    vi.stubGlobal("fetch", fetchMock);

    const center = nextCenter();
    const [a, b] = await Promise.all([
      fetchLiveResources(center, ["pharmacy"]),
      fetchLiveResources(center, ["pharmacy"])
    ]);

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("keepNearestPerCategory", () => {
  const center = { lat: 47.6, lng: -122.3 };
  // Places spread north of the center; a higher index means farther away.
  const place = (id: string, index: number, categories: ResourceCategory[]): LiveResource => ({
    id,
    name: id,
    categories,
    description: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    hours: "",
    cost: "",
    eligibility: "",
    coordinates: { lat: center.lat + index * 0.001, lng: center.lng },
    source: "openstreetmap"
  });

  it("keeps rare categories when a common one has hundreds of places", () => {
    const dentists = Array.from({ length: 500 }, (_, i) => place(`dentist-${i}`, i, ["dental"]));
    const shelters = [place("shelter-far", 900, ["shelter"]), place("shelter-near", 600, ["shelter"])];
    const kept = keepNearestPerCategory([...dentists, ...shelters], center, ["dental", "shelter"]);

    expect(kept.filter((p) => p.categories.includes("dental"))).toHaveLength(150);
    expect(kept.filter((p) => p.categories.includes("shelter")).map((p) => p.id)).toEqual(["shelter-near", "shelter-far"]);
  });

  it("keeps the nearest places, not the first ones returned", () => {
    const dentists = Array.from({ length: 400 }, (_, i) => place(`dentist-${i}`, 400 - i, ["dental"]));
    const kept = keepNearestPerCategory(dentists, center, ["dental"]);

    expect(kept).toHaveLength(300);
    expect(kept[0].id).toBe("dentist-399");
    expect(kept.some((p) => p.id === "dentist-0")).toBe(false);
  });

  it("counts a place in several categories toward each of them", () => {
    const both = place("clinic", 0, ["dental", "pharmacy"]);
    const pharmacies = Array.from({ length: 200 }, (_, i) => place(`pharmacy-${i}`, i + 1, ["pharmacy"]));
    const kept = keepNearestPerCategory([both, ...pharmacies], center, ["dental", "pharmacy"]);

    expect(kept[0].id).toBe("clinic");
    expect(kept.filter((p) => p.categories.includes("pharmacy"))).toHaveLength(150);
  });
});
