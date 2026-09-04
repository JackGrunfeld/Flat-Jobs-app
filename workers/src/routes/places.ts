import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError } from "../types";
import { requireAuth } from "../middleware/auth";

// Proxies Google's Places Autocomplete/Details APIs so the key never ships
// in the app bundle — every call goes through here instead, authenticated
// the same way the rest of the API is. Used by Home Info's address field to
// suggest roads/postcodes as someone types.
const places = new Hono<AppEnv>();
places.use("*", requireAuth);

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

type AutocompletePrediction = {
  description: string;
  place_id: string;
};

type PlacesAutocompleteResponse = {
  status: string;
  predictions?: AutocompletePrediction[];
  error_message?: string;
};

type PlacesDetailsResponse = {
  status: string;
  result?: { formatted_address?: string };
  error_message?: string;
};

// GET /places/autocomplete?input=12+main+st&sessiontoken=...
// The session token groups an autocomplete session's keystrokes with the
// details lookup that finishes it into one Google billing session — the
// client mints a fresh UUID per address field edit and reuses it across
// both calls.
places.get("/autocomplete", async (c) => {
  if (!c.env.GOOGLE_PLACES_API_KEY) throw new HttpError(503, "Address lookup isn't configured yet");

  const input = c.req.query("input")?.trim();
  if (!input) return c.json({ predictions: [] });
  const sessiontoken = c.req.query("sessiontoken") ?? "";

  const url = new URL(`${PLACES_BASE}/autocomplete/json`);
  url.searchParams.set("input", input);
  url.searchParams.set("key", c.env.GOOGLE_PLACES_API_KEY);
  if (sessiontoken) url.searchParams.set("sessiontoken", sessiontoken);
  // Address-only results — a flat's address is never a business/POI lookup.
  url.searchParams.set("types", "address");

  const res = await fetch(url.toString());
  const data = await res.json<PlacesAutocompleteResponse>();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new HttpError(502, data.error_message || `Places lookup failed (${data.status})`);
  }

  return c.json({
    predictions: (data.predictions ?? []).map((p) => ({ description: p.description, placeId: p.place_id })),
  });
});

// GET /places/details?placeId=...&sessiontoken=...
// Fetched once the user actually picks a suggestion — the autocomplete
// response alone doesn't carry the full formatted address.
places.get("/details", async (c) => {
  if (!c.env.GOOGLE_PLACES_API_KEY) throw new HttpError(503, "Address lookup isn't configured yet");

  const placeId = c.req.query("placeId")?.trim();
  if (!placeId) throw new HttpError(400, "placeId is required");
  const sessiontoken = c.req.query("sessiontoken") ?? "";

  const url = new URL(`${PLACES_BASE}/details/json`);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_address");
  url.searchParams.set("key", c.env.GOOGLE_PLACES_API_KEY);
  if (sessiontoken) url.searchParams.set("sessiontoken", sessiontoken);

  const res = await fetch(url.toString());
  const data = await res.json<PlacesDetailsResponse>();
  if (data.status !== "OK") {
    throw new HttpError(502, data.error_message || `Place details failed (${data.status})`);
  }

  return c.json({ address: data.result?.formatted_address ?? null });
});

export default places;
