'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

  const toggleCategory = (category: ResourceCategory) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    );
  };

  // Takes every input explicitly so callbacks (geolocation, chat) never read stale state.
  const loadResources = useCallback(
    async (nextZip: string, nextCategories: ResourceCategory[], coords: Coordinates | null) => {
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

        setResults(json.results);
        setLocationLabel(json.locationLabel);
        setMetadata(json.metadata);
      } catch (err) {
        console.error(err);
        setError("Could not load resources. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const locate = useCallback(
    (nextZip: string, nextCategories: ResourceCategory[]) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setGeoStatus("Geolocation not supported by this browser.");
        return;
      }
      setGeoStatus("Locating...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGeoCoords(coords);
          setGeoStatus("Location detected.");
          loadResources(nextZip, nextCategories, coords);
        },
        (err) => {
          console.error(err);
          setGeoStatus("Could not get location. Check permissions.");
        },
        { timeout: 8000 }
      );
    },
    [loadResources]
  );

  useEffect(() => {
    // Load resources immediately for the default zip, then try to auto-detect location
    // to improve relevance.
    loadResources(defaultZip, [], null);
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      locate(defaultZip, []);
    }
  }, [loadResources, locate]);

  const selectedLabel = useMemo(() => {
    if (!selectedCategories.length) return "All categories";
    return selectedCategories.map((c) => categoryLabels[c]).join(", ");
  }, [selectedCategories]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // A typed zip is an explicit choice, so stop centering on the detected location.
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
          <button type="button" className="ghost-button" onClick={() => locate(zip, selectedCategories)} disabled={loading}>
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
