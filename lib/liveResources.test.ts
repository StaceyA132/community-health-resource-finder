import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLiveResources } from "./liveResources";

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
