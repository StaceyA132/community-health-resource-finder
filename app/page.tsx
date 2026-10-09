'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type Coordinates = { lat: number; lng: number };

type ChatMessage = { role: "assistant" | "user"; text: string };
type ChatReply = {
  message: string;
  categories: ResourceCategory[];
  zip?: string;
  emergency: boolean;
};

const defaultZip = "94103";

// Only refetch once the user has moved this far, so GPS jitter doesn't spam the API.
const refetchDistanceMiles = 0.1;

const milesBetween = (a: Coordinates, b: Coordinates) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
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
  const [zip, setZip] = useState(defaultZip);
  const [selectedCategories, setSelectedCategories] = useState<ResourceCategory[]>([]);
  const [geoCoords, setGeoCoords] = useState<Coordinates | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [results, setResults] = useState<ApiResult["results"]>([]);
  const [locationLabel, setLocationLabel] = useState("");
  const [metadata, setMetadata] = useState<ApiResult["metadata"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hi! I can help you find verified community resources. What are you looking for?" }
  ]);

  const [tracking, setTracking] = useState(false);

  // Live location updates arrive in a long-lived callback, so it reads the latest
  // search inputs from refs rather than from the render it was created in.
  const zipRef = useRef(zip);
  const categoriesRef = useRef(selectedCategories);
  const coordsRef = useRef<Coordinates | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  zipRef.current = zip;
  categoriesRef.current = selectedCategories;
  coordsRef.current = geoCoords;

  // Takes every input explicitly so callbacks (geolocation, chat) never read stale state.
  const loadResources = useCallback(
    async (nextZip: string, nextCategories: ResourceCategory[], coords: Coordinates | null) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ zip: nextZip });
        if (nextCategories.length) {
          params.set("categories", nextCategories.join(","));
        }
        if (coords) {
          params.set("lat", String(coords.lat));
          params.set("lng", String(coords.lng));
        }

        const response = await fetch(`/api/resources?${params.toString()}`);
        if (!response.ok) throw new Error(`Resource request failed: ${response.status}`);
        const json = (await response.json()) as ApiResult;
        // Live updates can overlap; only the newest request may update the list.
        if (requestId !== requestIdRef.current) return;

        setResults(json.results);
        setLocationLabel(json.locationLabel);
        setMetadata(json.metadata);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        setError("Could not load resources. Please try again.");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    []
  );

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("Geolocation not supported by this browser.");
      return;
    }
    if (watchIdRef.current !== null) return;

    setTracking(true);
    setGeoStatus("Locating...");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const previous = coordsRef.current;
        const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        setGeoStatus(`Live location on · updated ${time}`);
        if (previous && milesBetween(previous, coords) < refetchDistanceMiles) return;

        coordsRef.current = coords;
        setGeoCoords(coords);
        loadResources(zipRef.current, categoriesRef.current, coords);
      },
      (err) => {
        console.error(err);
        if (err.code === err.PERMISSION_DENIED) {
          if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setTracking(false);
          setGeoStatus("Location permission denied. Search by zip instead.");
        } else {
          setGeoStatus("Can’t get your location right now. Still trying…");
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  }, [loadResources]);

  useEffect(() => {
    // Show the default zip right away, then follow the user's live location if they allow it.
    loadResources(defaultZip, [], null);
    startTracking();
    return stopTracking;
  }, [loadResources, startTracking, stopTracking]);

  const toggleCategory = (category: ResourceCategory) => {
    const next = selectedCategories.includes(category)
      ? selectedCategories.filter((c) => c !== category)
      : [...selectedCategories, category];
    setSelectedCategories(next);
    loadResources(zip, next, geoCoords);
  };

  const selectedLabel = useMemo(() => {
    if (!selectedCategories.length) return "All categories";
    return selectedCategories.map((c) => categoryLabels[c]).join(", ");
  }, [selectedCategories]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // A typed zip is an explicit choice, so stop following the user's location.
    stopTracking();
    setGeoCoords(null);
    setGeoStatus(null);
    loadResources(zip, selectedCategories, null);
  };

  const sendChatMessage = async (preset?: string) => {
    const message = (preset ?? chatInput).trim();
    if (!message || chatLoading) return;

    setChatMessages((current) => [...current, { role: "user", text: message }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, zip })
      });
      if (!response.ok) throw new Error("Chat request failed");
      const reply = (await response.json()) as ChatReply;
      setChatMessages((current) => [...current, { role: "assistant", text: reply.message }]);
      const nextZip = reply.zip ?? zip;
      const nextCategories = reply.categories.length ? reply.categories : selectedCategories;
      // Asking about a different zip means searching there, not around the detected location.
      const coords = nextZip === zip ? geoCoords : null;
      if (nextZip !== zip) {
        stopTracking();
        setZip(nextZip);
        setGeoCoords(null);
        setGeoStatus(null);
      }
      setSelectedCategories(nextCategories);
      await loadResources(nextZip, nextCategories, coords);
    } catch (err) {
      console.error(err);
      setChatMessages((current) => [...current, { role: "assistant", text: "I’m having trouble connecting right now. Try using the resource filters above." }]);
    } finally {
      setChatLoading(false);
    }
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
          <span className="pill">Live location</span>
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
          <button type="button" className="ghost-button" onClick={() => {
              if (!tracking) return startTracking();
              stopTracking();
              setGeoStatus("Live location off. Showing results near your last location.");
            }}
          >
            {tracking ? "Stop live location" : "Use my live location"}
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

      <button className="chat-launcher" type="button" onClick={() => setChatOpen((open) => !open)} aria-expanded={chatOpen}>
        {chatOpen ? "Close helper" : "Chat with a resource helper"}
      </button>

      {chatOpen && (
        <aside className="chat-panel" aria-label="Resource helper chat">
          <div className="chat-heading">
            <div><strong>Resource helper</strong><span>Not medical advice</span></div>
            <button type="button" className="chat-close" onClick={() => setChatOpen(false)} aria-label="Close chat">×</button>
          </div>
          <div className="chat-messages" aria-live="polite">
            {chatMessages.map((chat, index) => <p key={index} className={`chat-message ${chat.role}`}>{chat.text}</p>)}
            {chatLoading && <p className="chat-message assistant">Finding the best filters…</p>}
          </div>
          <div className="chat-suggestions">
            {["I need affordable dental care", "Where can I get food today?", "I need a safe place to sleep"].map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => sendChatMessage(suggestion)}>{suggestion}</button>
            ))}
          </div>
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); sendChatMessage(); }}>
            <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about community resources" aria-label="Chat message" maxLength={750} />
            <button type="submit" className="primary-button" disabled={chatLoading}>Send</button>
          </form>
        </aside>
      )}
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
