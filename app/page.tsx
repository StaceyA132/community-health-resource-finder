'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Resource,
  ResourceCategory,
  categoryLabels
} from "../data/resources";

type ApiResult = {
  zip: string;
  locationLabel: string;
  results: Array<Resource & { distance: number | null }>;
  metadata: { radiusMiles: number; matchedCount: number; centered: boolean };
  availableCategories: typeof categoryLabels;
};

const categoryOrder: ResourceCategory[] = [
  "mental-health",
  "emergency-care",
  "womens-health",
  "pharmacy",
  "dental",
  "food",
  "shelter"
];

export default function Home() {
  const [zip, setZip] = useState("94103");
  const [selectedCategories, setSelectedCategories] = useState<ResourceCategory[]>([]);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [results, setResults] = useState<ApiResult["results"]>([]);
  const [locationLabel, setLocationLabel] = useState("");
  const [metadata, setMetadata] = useState<ApiResult["metadata"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCategory = (category: ResourceCategory) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    );
  };

  const fetchResources = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ zip });
      if (selectedCategories.length) {
        params.set("categories", selectedCategories.join(","));
      }
      if (geoCoords) {
        params.set("lat", String(geoCoords.lat));
        params.set("lng", String(geoCoords.lng));
      }

      const response = await fetch(`/api/resources?${params.toString()}`);
      const json = (await response.json()) as ApiResult;

      setResults(json.results);
      setLocationLabel(json.locationLabel);
      setMetadata(json.metadata);
    } catch (err) {
      console.error(err);
      setError("Could not load resources. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const selectedLabel = useMemo(() => {
    if (!selectedCategories.length) return "All categories";
    return selectedCategories.map((c) => categoryLabels[c]).join(", ");
  }, [selectedCategories]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchResources();
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("Geolocation not supported by this browser.");
      return;
    }
    setGeoStatus("Locating...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoCoords({ lat: latitude, lng: longitude });
        setGeoStatus("Location detected.");
        fetchResources();
      },
      (err) => {
        console.error(err);
        setGeoStatus("Could not get location. Check permissions.");
      },
      { timeout: 8000 }
    );
  };

  return (
    <div className="wrapper">
      <div className="hero">
        <span className="badge">Community Health Resource Finder</span>
        <h1>Find free and low-cost health resources near you.</h1>
        <p>
          Enter a zip code to see clinics, counseling, pharmacies, dental care,
          food banks, and shelters. Everything is verified and filterable by
          category.
        </p>
        <div className="pill-row">
          <span className="pill active">Zip-based search</span>
          <span className="pill">Geolocation-ready</span>
          <span className="pill">Verified resources</span>
        </div>
      </div>

      <div className="search-card">
        <form onSubmit={onSubmit} className="input-row">
          <input
            type="text"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="Enter zip code e.g. 94103"
            maxLength={10}
            aria-label="Zip code"
          />
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Searching..." : "Find resources"}
          </button>
        </form>
        <div className="geo-row">
          <button type="button" className="ghost-button" onClick={useMyLocation} disabled={loading}>
            Use my location
          </button>
          <span className="geo-status">{geoStatus ?? "We’ll search near your zip or location."}</span>
        </div>

        <div>
          <div className="pill-row">
            {categoryOrder.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`pill ${selectedCategories.includes(cat) ? "active" : ""}`}
                onClick={() => toggleCategory(cat)}
              >
                {categoryLabels[cat]}
              </button>
            ))}
          </div>
          <p style={{ color: "var(--muted)", margin: "0.6rem 0 0" }}>
            Showing: {selectedLabel} • Radius: {metadata?.radiusMiles ?? 60} miles
          </p>
        </div>
      </div>

      {error && (
        <div className="resource-card" style={{ borderColor: "#f43f5e" }}>
          {error}
        </div>
      )}

      {!error && (
        <div style={{ marginTop: "1.5rem" }}>
          <div className="meta-row" style={{ marginBottom: "0.75rem" }}>
            <strong>{results.length} resources</strong>
            <span>
              {locationLabel} {metadata?.centered ? "" : "(approximate)"} • Zip {zip}
            </span>
          </div>

          <div className="resource-grid">
            {results.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </div>
      )}

      <p className="footer-note">
        Add or edit a listing by updating `data/resources.ts` or connecting a real data
        source later.
      </p>
    </div>
  );
}

function ResourceCard({ resource }: { resource: Resource & { distance: number | null } }) {
  return (
    <article className="resource-card">
      <div className="meta-row">
        {resource.categories.map((cat) => (
          <span key={cat} className="tag">
            {categoryLabels[cat]}
          </span>
        ))}
      </div>
      <h3>{resource.name}</h3>
      <p style={{ margin: "0", color: "var(--muted)" }}>{resource.description}</p>
      <div className="meta-row">
        <span>
          {resource.address}, {resource.city}, {resource.state} {resource.zip}
        </span>
        {resource.distance !== null && (
          <span>{resource.distance.toFixed(1)} mi away</span>
        )}
      </div>
      <div className="meta-row">
        <span className="tag">Hours: {resource.hours}</span>
        <span className="tag">Cost: {resource.cost}</span>
        <span className="tag">Eligibility: {resource.eligibility}</span>
      </div>
      <div className="meta-row">
        {resource.phone && <span>{resource.phone}</span>}
        {resource.website && (
          <a href={resource.website} target="_blank" rel="noreferrer">
            Website
          </a>
        )}
      </div>
    </article>
  );
}
