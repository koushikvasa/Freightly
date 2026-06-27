"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import type { RateOption, Recommendation, Quote } from "@/lib/types";

type Result = {
  options: RateOption[];
  recommendation: Recommendation;
  origin?: { lat: number; lng: number };
  routeLabel: string;
  destState?: string;
  originState?: string;
  billableKg?: number;
};

function parseAddress(s: string) {
  const parts = s.split(",").map((p) => p.trim());
  const street = parts[0] ?? "";
  const city = parts[1] ?? "";
  const rest = (parts[2] ?? "").split(/\s+/).filter(Boolean);
  const state = rest[0] ?? "";
  const zip = rest[1] ?? "";
  return { street, city, state, zip };
}

function etaLabel(days: number | null) {
  if (days == null) return "ETA n/a";
  const d = new Date(Date.now() + days * 86400000);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${days} day${days === 1 ? "" : "s"} · by ${wd}`;
}

function relDot(rel: number) {
  return rel >= 9 ? "g" : rel >= 8 ? "a" : "w";
}

function dropChip(o: RateOption): { cls: string; text: string } | null {
  if (o.dropoffStatus == null) return null;
  const km = o.nearestDropoffKm != null ? `${o.nearestDropoffKm} km` : "";
  if (o.dropoffStatus === "closed") return { cls: "w", text: "drop-off · closed" };
  if (o.dropoffStatus === "closing_soon") {
    const m = o.dropoffClosesInMin ?? 0;
    const t = m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;
    return { cls: "w", text: `drop-off ${km} · closes in ${t}` };
  }
  return { cls: "a", text: `drop-off ${km} · open` };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

let leafletPromise: Promise<any> | null = null;
function ensureLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("no window");
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return leafletPromise;
}

export default function Home() {
  const [from, setFrom] = useState("240 Kent Ave, Brooklyn, NY 11249");
  const [to, setTo] = useState("88 Beacon St, Boston, MA 02108");
  const [length, setLength] = useState("90");
  const [width, setWidth] = useState("60");
  const [height, setHeight] = useState("50");
  const [weight, setWeight] = useState("3.0");
  const [category, setCategory] = useState("General");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  async function loadQuotes() {
    try {
      const res = await fetch("/api/quotes");
      const data = await res.json();
      if (data.quotes) setQuotes(data.quotes);
    } catch {
      /* ignore history load errors */
    }
  }

  useEffect(() => {
    loadQuotes();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const o = parseAddress(from);
    const d = parseAddress(to);
    const w = parseFloat(weight) || 0;
    const L = parseFloat(length) || 0;
    const W = parseFloat(width) || 0;
    const H = parseFloat(height) || 0;

    const shipment = {
      originStreet: o.street,
      originCity: o.city,
      originState: o.state,
      originZip: o.zip,
      destStreet: d.street,
      destCity: d.city,
      destState: d.state,
      destZip: d.zip,
      weightKg: w,
      lengthCm: L,
      widthCm: W,
      heightCm: H,
      category: category.toLowerCase(),
    };

    try {
      const res = await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shipment),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      const volumetric = (L * W * H) / 5000;
      const billableKg = Math.max(w, volumetric);

      setResult({
        options: data.options,
        recommendation: data.recommendation,
        origin: data.origin ?? undefined,
        routeLabel: `${o.zip || o.city} → ${d.zip || d.city}`,
        originState: o.state,
        destState: d.state,
        billableKg,
      });
      loadQuotes();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function openQuote(q: Quote) {
    setError(null);
    setResult({
      options: q.options,
      recommendation: q.recommendation,
      routeLabel: `${q.origin} → ${q.destination}`,
      billableKg: undefined,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Build the map whenever a result with origin coords + drop-offs is shown.
  useEffect(() => {
    const origin = result?.origin;
    const drops =
      result?.options
        .filter((o) => o.dropoffLat != null && o.dropoffLng != null)
        .filter(
          (o, i, arr) => arr.findIndex((x) => x.carrier === o.carrier) === i
        ) ?? [];

    if (!origin || drops.length === 0 || !mapElRef.current) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    let cancelled = false;
    ensureLeaflet().then((L) => {
      if (cancelled || !mapElRef.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(mapElRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
      }).setView([origin.lat, origin.lng], 13);
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        { attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19 }
      ).addTo(map);

      const icon = (cls: string, w = 14, h = 14) =>
        L.divIcon({
          className: "",
          html: `<div class="${cls}"></div>`,
          iconSize: [w, h],
          iconAnchor: [w / 2, h / 2],
        });
      const label = (text: string) =>
        L.divIcon({
          className: "",
          html: `<div class="maplabel">${text}</div>`,
          iconSize: [0, 0],
          iconAnchor: [-10, 8],
        });

      const pts: [number, number][] = [[origin.lat, origin.lng]];

      L.marker([origin.lat, origin.lng], { icon: icon("pin-origin", 18, 18) }).addTo(map);
      L.marker([origin.lat, origin.lng], { icon: label("Your unit"), interactive: false }).addTo(map);

      for (const o of drops) {
        const p: [number, number] = [o.dropoffLat as number, o.dropoffLng as number];
        pts.push(p);
        const cls =
          o.dropoffStatus === "closed"
            ? "pin-drop closed"
            : o.dropoffStatus === "closing_soon"
            ? "pin-drop warn"
            : "pin-drop";
        L.polyline([[origin.lat, origin.lng], p], {
          color: "#17191D",
          weight: 1.5,
          dashArray: "3 5",
          opacity: 0.5,
        }).addTo(map);
        L.marker(p, { icon: icon(cls) }).addTo(map);
        const km = o.nearestDropoffKm != null ? ` · ${o.nearestDropoffKm} km` : "";
        L.marker(p, { icon: label(`${o.carrier}${km}`), interactive: false }).addTo(map);
      }

      map.fitBounds(L.latLngBounds(pts).pad(0.35));
    });

    return () => {
      cancelled = true;
    };
  }, [result]);

  // Find the option backing the recommendation (for ETA / reliability / pickup).
  const recOpt =
    result &&
    (result.options.find(
      (o) =>
        o.carrier === result.recommendation.carrier &&
        o.service === result.recommendation.service
    ) ||
      result.options.find((o) => o.carrier === result.recommendation.carrier) ||
      result.options[0]);

  const recPickupExtra =
    recOpt && recOpt.pickupType === "scheduled" && recOpt.pickupCost > 0
      ? `+ $${recOpt.pickupCost} pickup`
      : null;

  return (
    <>
      <header className="bar">
        <div className="bar-inner">
          <div className="brand">
            <div className="mark" aria-hidden="true" />
            <div className="wordmark">
              <h1>Freightly</h1>
              <span className="kicker">multi-carrier · decided</span>
            </div>
          </div>
          <div className="tag">
            <span className="tag-strong">rates, ranked.</span>
            <span className="tag-sub">the cheapest box that actually ships.</span>
          </div>
        </div>
      </header>

      <main className="wrap">
        {/* form */}
        <form className="ticket" onSubmit={submit} aria-label="New shipment">
          <div className="row two">
            <div className="field">
              <label>From</label>
              <input value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>To</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 14, gridTemplateColumns: "2fr 1fr" }}>
            <div className="field">
              <label>Box · L × W × H (cm) + kg</label>
              <div className="dims">
                <input value={length} onChange={(e) => setLength(e.target.value)} aria-label="length" />
                <input value={width} onChange={(e) => setWidth(e.target.value)} aria-label="width" />
                <input value={height} onChange={(e) => setHeight(e.target.value)} aria-label="height" />
                <input value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="weight kg" />
              </div>
            </div>
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option>General</option>
                <option>Fragile</option>
                <option>Perishable</option>
                <option>High-value</option>
                <option>Oversized</option>
              </select>
            </div>
          </div>

          <button className="go" type="submit" disabled={loading}>
            {loading ? "Getting rates…" : "Get rates"}
          </button>

          {error && <p className="err">{error}</p>}
        </form>

        {/* recommended */}
        {result && recOpt && (
          <>
            <h2 className="sec">Recommended</h2>
            <section className="stamp" aria-label="Recommended carrier">
              <div className="stamp-body">
                <div className="priceblock">
                  <div className="p">${result.recommendation.price.toFixed(2)}</div>
                  {recPickupExtra && <div className="pe">{recPickupExtra}</div>}
                </div>
                <span className="eyebrow">
                  <span className="dot a" aria-hidden="true" />
                  Best value that ships
                </span>
                <div className="car">{result.recommendation.carrier}</div>
                <div className="svc">
                  {result.recommendation.service} · {etaLabel(recOpt.etaDays)}
                </div>
                <p className="why">{result.recommendation.why}</p>
                <div className="meta">
                  {result.billableKg != null && (
                    <span>
                      BILLABLE&nbsp;<b>{result.billableKg.toFixed(1)} KG</b>
                    </span>
                  )}
                  {result.originState && result.destState && (
                    <span>
                      {result.originState}&nbsp;→&nbsp;{result.destState}
                    </span>
                  )}
                  <span>
                    RELIABILITY&nbsp;<b>{recOpt.reliability}</b>
                  </span>
                  <span>
                    ON-TIME&nbsp;<b>{recOpt.onTimePct}%</b>
                  </span>
                </div>
              </div>
              <div className="perf" />
              <div className="barcode" aria-hidden="true" />
            </section>
          </>
        )}

        {/* map */}
        {result?.origin &&
          result.options.some((o) => o.dropoffLat != null) && (
            <>
              <h2 className="sec">Pickup &amp; drop-off</h2>
              <div className="mapcard">
                <div id="map" ref={mapElRef} role="img" aria-label="Map of your unit and carrier drop-off points" />
                <div className="legend">
                  <span><i className="dotk a" />Your unit</span>
                  <span><i className="dotk k" />Drop-off · open</span>
                  <span><i className="dotk w" />closing soon</span>
                  <span><i className="dotk c" />closed</span>
                </div>
              </div>
            </>
          )}

        {/* all options */}
        {result && (
          <>
            <h2 className="sec">All options</h2>
            {result.options.map((o, i) => {
              const drop = dropChip(o);
              const closedClass =
                o.dropoffStatus === "closed" && o.pickupType === "dropoff" ? " closed" : "";
              return (
                <div className={"opt" + closedClass} key={i}>
                  <div className="l">
                    <div className="car">{o.carrier}</div>
                    <div className="svc">{o.service}</div>
                    <div className="chips">
                      <span className="chip">{etaLabel(o.etaDays)}</span>
                      <span className="chip">
                        <span className={"dot " + relDot(o.reliability)} />
                        {o.reliability} · {o.onTimePct}% on-time
                      </span>
                      {o.pickupType === "scheduled" && (
                        <span className="chip">
                          pickup{o.pickupCost > 0 ? ` +$${o.pickupCost}` : ""}
                        </span>
                      )}
                      {drop && (
                        <span className="chip">
                          <span className={"dot " + drop.cls} />
                          {drop.text}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="r">
                    ${o.price.toFixed(2)}
                    <small>{o.etaDays != null ? `${o.etaDays} days` : "ETA n/a"}</small>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* history */}
        <h2 className="sec">Recent quotes</h2>
        {quotes.length === 0 ? (
          <p className="empty">No quotes yet — get rates above.</p>
        ) : (
          quotes.map((q) => (
            <button className="hrow" key={q.id} onClick={() => openQuote(q)}>
              <div className="date">{fmtDate(q.created_at)}</div>
              <div className="route">
                {q.origin} → {q.destination} · {q.weight_kg}kg
              </div>
              <div className="pick">
                <b>{q.recommendation?.carrier ?? "—"}</b>
                <div className="hp">
                  {q.recommendation?.price != null ? `$${Number(q.recommendation.price).toFixed(2)}` : ""}
                </div>
              </div>
            </button>
          ))
        )}
      </main>
    </>
  );
}
