'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ZIP,
  ResourceCategory,
  categoryLabels,
  resourceCategories
} from "../data/resources";
import type { ChatReply } from "../lib/chat";
import type { Coordinates, ResourceResult, SearchResponse } from "../lib/geo";
import { isSafeWebUrl, telHref } from "../lib/url";

type Search = { zip: string; categories: ResourceCategory[]; coords: Coordinates | null };
type ChatMessage = { role: "assistant" | "user"; text: string; emergency?: boolean };

const zipPattern = /^\d{5}$/;

function getCurrentCoords(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { timeout: 8000 }
    );
  });
}

export default function Home() {
  const [zipInput, setZipInput] = useState(DEFAULT_ZIP);
  const [zipError, setZipError] = useState<string | null>(null);
  // The search that results are shown for. Changing it triggers a fetch.
  const [search, setSearch] = useState<Search>({ zip: DEFAULT_ZIP, categories: [], coords: null });
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hi! I can help you find community resources. What are you looking for?" }
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ zip: search.zip });
    if (search.categories.length) params.set("categories", search.categories.join(","));
    if (search.coords) {
      params.set("lat", String(search.coords.lat));
      params.set("lng", String(search.coords.lng));
    }

    setLoading(true);
    setError(null);
    fetch(`/api/resources?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Resource request failed: ${res.status}`);
        setResponse((await res.json()) as SearchResponse);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setError("Could not load resources. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    // A newer search cancels this one, so slow responses can't overwrite newer results.
    return () => controller.abort();
  }, [search]);

  const findMyLocation = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("Geolocation not supported by this browser.");
      return;
    }
    setGeoStatus("Locating...");
    try {
      const coords = await getCurrentCoords();
      setSearch((current) => ({ ...current, coords }));
      setGeoStatus("Using your current location.");
    } catch (err) {
      console.error(err);
      setGeoStatus("Could not get location. Check permissions.");
    }
  }, []);

  useEffect(() => {
    // Results load for the default ZIP right away; this narrows them once location is known.
    findMyLocation();
  }, [findMyLocation]);

  const toggleCategory = (category: ResourceCategory) => {
    setSearch((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((c) => c !== category)
        : [...current.categories, category]
    }));
  };

  const selectedLabel = useMemo(() => {
    if (!search.categories.length) return "All categories";
    return search.categories.map((c) => categoryLabels[c]).join(", ");
  }, [search.categories]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const zip = zipInput.trim();
    if (!zipPattern.test(zip)) {
      setZipError("Enter a 5-digit ZIP code.");
      return;
    }
    setZipError(null);
    // A newly entered ZIP replaces the detected location.
    if (zip !== search.zip) setGeoStatus(null);
    setSearch((current) => ({ ...current, zip, coords: zip === current.zip ? current.coords : null }));
  };

  const sendChatMessage = async (preset?: string) => {
    const message = (preset ?? chatInput).trim();
    if (!message || chatLoading) return;

    setChatMessages((current) => [...current, { role: "user", text: message }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, zip: search.zip })
      });
      if (!res.ok) throw new Error("Chat request failed");
      const reply = (await res.json()) as ChatReply;
      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: reply.message, emergency: reply.emergency }
      ]);

      const newZip = reply.zip && reply.zip !== search.zip ? reply.zip : null;
      if (newZip || reply.categories.length) {
        setSearch((current) => ({
          zip: newZip ?? current.zip,
          categories: reply.categories.length ? reply.categories : current.categories,
          // A ZIP named in chat replaces the detected location.
          coords: newZip ? null : current.coords
        }));
      }
      if (newZip) {
        setZipInput(newZip);
        setGeoStatus(null);
      }
    } catch (err) {
      console.error(err);
      setChatMessages((current) => [...current, { role: "assistant", text: "I’m having trouble connecting right now. Try using the resource filters above." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const results = response?.results ?? [];
  const metadata = response?.metadata;

  let locationSummary = `ZIP ${search.zip}`;
  if (search.coords) locationSummary = "Near your current location";
  else if (metadata?.centered) locationSummary = `${response?.locationLabel} • ZIP ${search.zip}`;

  return (
    <div className="wrapper">
      <div className="hero">
        <span className="badge">Community Health Resource Finder</span>
        <h1>Find free and low-cost health resources near you.</h1>
        <p>
          Enter a ZIP code to see clinics, counseling, pharmacies, dental care,
          food banks, and shelters. Filter by what you need, and call ahead to
          confirm hours and eligibility.
        </p>
        <div className="pill-row">
          <span className="pill active">ZIP-based search</span>
          <span className="pill">Geolocation-ready</span>
          <span className="pill">Free &amp; low-cost</span>
        </div>
      </div>

      <div className="search-card">
        <form onSubmit={onSubmit} className="input-row">
          <input
            type="text"
            inputMode="numeric"
            value={zipInput}
            onChange={(e) => setZipInput(e.target.value)}
            placeholder="Enter ZIP code e.g. 94103"
            maxLength={5}
            aria-label="ZIP code"
            aria-invalid={Boolean(zipError)}
            aria-describedby={zipError ? "zip-error" : undefined}
          />
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Searching..." : "Find resources"}
          </button>
        </form>
        {zipError && <p id="zip-error" className="field-error">{zipError}</p>}
        <div className="geo-row">
          <button type="button" className="ghost-button" onClick={findMyLocation} disabled={loading}>
            Use my location
          </button>
          <span className="geo-status">{geoStatus ?? "We’ll search near your ZIP or location."}</span>
        </div>

        <div>
          <div className="pill-row">
            {resourceCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`pill ${search.categories.includes(cat) ? "active" : ""}`}
                aria-pressed={search.categories.includes(cat)}
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

      {!error && response && (
        <div style={{ marginTop: "1.5rem" }}>
          {metadata?.source === "mock" && (
            <p className="notice">
              These are sample listings for demonstration. Some names and phone numbers are
              made up, so don’t rely on them for care.
            </p>
          )}
          {!metadata?.centered && (
            <p className="notice">
              We don’t have location data for ZIP {search.zip} yet, so results aren’t limited
              to your area or sorted by distance. Try “Use my location” instead.
            </p>
          )}
          <div className="meta-row" style={{ marginBottom: "0.75rem" }}>
            <strong>{results.length} resources</strong>
            <span>{locationSummary}</span>
          </div>

          {results.length === 0 && (
            <p className="notice">No resources matched. Try removing a category filter.</p>
          )}
          <div className="resource-grid">
            {results.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </div>
      )}

      <p className="footer-note">
        Listings can change. Call ahead to confirm hours, cost, and eligibility. In an
        emergency, call 911. For a mental-health crisis, call or text 988.
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
