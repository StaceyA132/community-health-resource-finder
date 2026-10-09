'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ZIP,
  ResourceCategory,
  categoryLabels,
  resourceCategories
} from "../data/resources";
import type { ChatReply } from "../lib/chat";
import { Coordinates, ResourceResult, SearchResponse, haversineMiles } from "../lib/geo";
import { isSafeWebUrl, telHref } from "../lib/url";

type ChatMessage = { role: "assistant" | "user"; text: string; emergency?: boolean };

const zipPattern = /^\d{5}$/;

// Only refetch once the user has moved this far, so GPS jitter doesn't spam the API.
const refetchDistanceMiles = 0.1;

async function requestResources(
  zip: string,
  categories: ResourceCategory[],
  coords: Coordinates | null
): Promise<SearchResponse> {
  const params = new URLSearchParams({ zip });
  if (categories.length) params.set("categories", categories.join(","));
  if (coords) {
    params.set("lat", String(coords.lat));
    params.set("lng", String(coords.lng));
  }
  const response = await fetch(`/api/resources?${params.toString()}`);
  if (!response.ok) throw new Error(`Resource request failed: ${response.status}`);
  return (await response.json()) as SearchResponse;
}

export default function Home() {
  // `zip` is the ZIP results are shown for; `zipInput` is what's typed in the box, so a
  // half-typed ZIP never reaches category toggles or live location updates.
  const [zip, setZip] = useState(DEFAULT_ZIP);
  const [zipInput, setZipInput] = useState(DEFAULT_ZIP);
  const [zipError, setZipError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<ResourceCategory[]>([]);
  const [geoCoords, setGeoCoords] = useState<Coordinates | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [results, setResults] = useState<ResourceResult[] | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [metadata, setMetadata] = useState<SearchResponse["metadata"] | null>(null);
  // True from the start: results for the default ZIP load as soon as the page mounts.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hi! I can help you find community resources. What are you looking for?" }
  ]);

  const [tracking, setTracking] = useState(false);

  // Live location updates arrive in a long-lived callback, so it reads the latest
  // search inputs from refs rather than from the render it was created in.
  const zipRef = useRef(zip);
  const categoriesRef = useRef(selectedCategories);
  const coordsRef = useRef<Coordinates | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    zipRef.current = zip;
    categoriesRef.current = selectedCategories;
    coordsRef.current = geoCoords;
  }, [zip, selectedCategories, geoCoords]);

  // Takes every input explicitly so callbacks (geolocation, chat) never read stale state.
  // State is only set once the response arrives; loadResources also shows loading right away.
  const fetchResults = useCallback(
    (nextZip: string, nextCategories: ResourceCategory[], coords: Coordinates | null) => {
      const requestId = ++requestIdRef.current;
      // Live updates can overlap; only the newest request may update the list.
      const isLatest = () => requestId === requestIdRef.current;
      return requestResources(nextZip, nextCategories, coords)
        .then((json) => {
          if (!isLatest()) return;
          setResults(json.results);
          setLocationLabel(json.locationLabel);
          setMetadata(json.metadata);
        })
        .catch((err) => {
          if (!isLatest()) return;
          console.error(err);
          setError("Could not load resources. Please try again.");
        })
        .finally(() => {
          if (isLatest()) setLoading(false);
        });
    },
    []
  );

  const loadResources = useCallback(
    (nextZip: string, nextCategories: ResourceCategory[], coords: Coordinates | null) => {
      setLoading(true);
      setError(null);
      return fetchResults(nextZip, nextCategories, coords);
    },
    [fetchResults]
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
        if (previous && haversineMiles(previous, coords) < refetchDistanceMiles) return;

        coordsRef.current = coords;
        setGeoCoords(coords);
        loadResources(zipRef.current, categoriesRef.current, coords);
      },
      (err) => {
        // Declining location is a normal choice, not an error, so only log other failures.
        if (err.code === err.PERMISSION_DENIED) {
          if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setTracking(false);
          setGeoStatus("Location permission denied. Search by zip instead.");
        } else {
          console.warn("Location unavailable", err.message);
          setGeoStatus("Can’t get your location right now. Still trying…");
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  }, [loadResources]);

  useEffect(() => {
    // Show the default zip right away, then follow the user's live location if they allow it.
    fetchResults(DEFAULT_ZIP, [], null);
    // Subscribing to location updates is what this effect is for; startTracking also sets
    // the "Locating..." status right away, which costs one extra render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startTracking();
    return stopTracking;
  }, [fetchResults, startTracking, stopTracking]);

  useEffect(() => {
    // Scroll so the top of the newest message shows; long replies like the crisis
    // message would otherwise start out of view.
    const container = chatMessagesRef.current;
    const newest = container?.lastElementChild as HTMLElement | null | undefined;
    if (container && newest) container.scrollTop = newest.offsetTop - 16;
  }, [chatMessages, chatLoading, chatOpen]);

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
    const nextZip = zipInput.trim();
    if (!zipPattern.test(nextZip)) {
      setZipError("Enter a 5-digit ZIP code.");
      return;
    }
    setZipError(null);
    // A typed zip is an explicit choice, so stop following the user's location.
    stopTracking();
    setZip(nextZip);
    setGeoCoords(null);
    setGeoStatus(null);
    loadResources(nextZip, selectedCategories, null);
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
      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: reply.message, emergency: reply.emergency }
      ]);
      const nextZip = reply.zip ?? zip;
      const nextCategories = reply.categories.length ? reply.categories : selectedCategories;
      // Asking about a different zip means searching there, not around the detected location.
      const coords = nextZip === zip ? geoCoords : null;
      if (nextZip !== zip) {
        stopTracking();
        setZip(nextZip);
        setZipInput(nextZip);
        setZipError(null);
        setGeoCoords(null);
        setGeoStatus(null);
      }
      setSelectedCategories(nextCategories);
      // The search shows its own progress and errors, so the chat doesn't wait for it.
      loadResources(nextZip, nextCategories, coords);
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
          Enter a zip code or share your location to see clinics, counseling,
          pharmacies, dental care, food banks, and shelters anywhere in the US,
          filterable by category.
        </p>
        <div className="pill-row">
          <span className="pill active">Zip-based search</span>
          <span className="pill">Live location</span>
          <span className="pill">Nationwide listings</span>
        </div>
      </div>

      <div className="search-card">
        <form onSubmit={onSubmit} className="input-row">
          <input
            type="text"
            inputMode="numeric"
            value={zipInput}
            onChange={(e) => setZipInput(e.target.value)}
            placeholder="Enter zip code e.g. 94103"
            maxLength={5}
            aria-label="Zip code"
            aria-invalid={Boolean(zipError)}
            aria-describedby={zipError ? "zip-error" : undefined}
          />
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Searching..." : "Find resources"}
          </button>
        </form>
        {zipError && <p id="zip-error" className="field-error">{zipError}</p>}
        {loading && (
          <p className="loading-note" role="status">
            Searching nearby listings. This can take up to 30 seconds.
          </p>
        )}
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
            {resourceCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`pill ${selectedCategories.includes(cat) ? "active" : ""}`}
                aria-pressed={selectedCategories.includes(cat)}
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
        <div className="resource-card" role="alert" style={{ borderColor: "#f43f5e" }}>
          {error}
        </div>
      )}

      {!error && results && (
        <div style={{ marginTop: "1.5rem" }}>
          {metadata?.source === "mock" && (
            <p className="notice">
              Listings not marked “From OpenStreetMap” are sample data for demonstration.
              Some names and phone numbers are made up, so don’t rely on them for care.
            </p>
          )}
          {!metadata?.centered && (
            <p className="notice">
              We couldn’t find a location for ZIP {zip}, so results aren’t limited to your
              area or sorted by distance. Try “Use my live location” instead.
            </p>
          )}
          {metadata?.liveData === "unavailable" && (
            <p className="notice notice-action">
              <span>
                Nearby listings from OpenStreetMap are temporarily unavailable, so some places
                may be missing.
              </span>
              <button
                type="button"
                className="ghost-button"
                onClick={() => loadResources(zip, selectedCategories, geoCoords)}
                disabled={loading}
              >
                Try again
              </button>
            </p>
          )}
          <div className="meta-row" style={{ marginBottom: "0.75rem" }}>
            <strong>{results.length} resources</strong>
            <span>
              {geoCoords
                ? "Near your current location"
                : `${locationLabel}${metadata?.centered ? "" : " (approximate)"} • ZIP ${zip}`}
            </span>
          </div>

          {results.length === 0 && (
            <p className="notice">
              {selectedCategories.length
                ? "No resources matched. Try removing a category filter."
                : "No resources found near here yet."}
            </p>
          )}
          <div className="resource-grid">
            {results.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </div>
      )}

      <p className="footer-note">
        Listings marked “From OpenStreetMap” come from a free community map and may be out of
        date, so call ahead to confirm hours, cost, and eligibility. Map data ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
        . In an emergency, call 911. For a mental-health crisis, call or text 988.
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
          <div className="chat-messages" aria-live="polite" ref={chatMessagesRef}>
            {chatMessages.map((chat, index) => (
              <p key={index} className={`chat-message ${chat.role}${chat.emergency ? " emergency" : ""}`}>
                {chat.text}
              </p>
            ))}
            {chatLoading && <p className="chat-message assistant">Finding the best filters…</p>}
          </div>
          <p className="chat-privacy">
            Messages may be processed by an AI service. Please don’t share your name or
            personal health details.
          </p>
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

function ResourceCard({ resource }: { resource: ResourceResult }) {
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
      {resource.source === "openstreetmap" && (
        <span
          className="tag"
          style={{ alignSelf: "flex-start" }}
          title="Community-edited listing. Call ahead to confirm details."
        >
          From OpenStreetMap
        </span>
      )}
      <p style={{ margin: "0", color: "var(--muted)" }}>{resource.description}</p>
      <div className="meta-row">
        <span>
          {[resource.address, resource.city, [resource.state, resource.zip].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ")}
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
        {resource.phone && <a href={telHref(resource.phone)}>{resource.phone}</a>}
        {resource.website && isSafeWebUrl(resource.website) && (
          <a href={resource.website} target="_blank" rel="noopener noreferrer">
            Website
          </a>
        )}
      </div>
    </article>
  );
}
