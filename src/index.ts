/** orrery HTTP service — deterministic Vedic chart computation. AGPL-3.0.
 * POST /v1/chart    {dob:"YYYY-MM-DD", tob:"HH:MM", tz:number(hours), lat, lon, ayanamsa:"lahiri"}
 * POST /v1/dasha    same input -> vimshottari tree + current period
 * POST /v1/transits same input (+ optional at:"ISO-8601") -> transits vs natal
 * POST /v1/wheel.svg same input (+ variant:"rasi"|"navamsa", style:"north"|"south", tokens?) -> SVG
 * GET  /v1/schema   frozen chart JSON Schema
 * GET  /v1/health
 */
import { computeChart, computeTransits, currentPeriod, jdFromUtc, SCHEMA_VERSION, type BirthInput } from "./core.ts";
import { CHART_SCHEMA } from "./schema.ts";
import { wheelSvg, type WheelStyle } from "./wheel.ts";
import { getSweph } from "./sweph.ts";

interface ChartRequest {
  dob: string; tob: string; tz: number; lat: number; lon: number;
  ayanamsa?: string; at?: string;
  variant?: "rasi" | "navamsa"; style?: "north" | "south"; tokens?: WheelStyle;
}

class BadRequest extends Error {}

function parseBirth(body: unknown): { birth: BirthInput; req: ChartRequest } {
  if (typeof body !== "object" || body === null) throw new BadRequest("JSON object body required");
  const r = body as Record<string, unknown>;
  const dob = String(r.dob ?? "");
  const tob = String(r.tob ?? "");
  const mDob = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  const mTob = /^(\d{2}):(\d{2})$/.exec(tob);
  if (!mDob) throw new BadRequest("dob must be YYYY-MM-DD");
  if (!mTob) throw new BadRequest("tob must be HH:MM (24h)");
  const tz = Number(r.tz), lat = Number(r.lat), lon = Number(r.lon);
  if (!Number.isFinite(tz) || tz < -14 || tz > 14) throw new BadRequest("tz must be UTC offset hours (-14..14)");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new BadRequest("lat out of range");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new BadRequest("lon out of range");
  if (r.ayanamsa !== undefined && r.ayanamsa !== "lahiri") throw new BadRequest("only ayanamsa=lahiri is supported");
  const [y, mo, d] = [Number(mDob[1]), Number(mDob[2]), Number(mDob[3])];
  const [hh, mm] = [Number(mTob[1]), Number(mTob[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new BadRequest("dob out of range");
  if (hh > 23 || mm > 59) throw new BadRequest("tob out of range");
  if (y < 1200 || y > 2400) throw new BadRequest("dob year out of supported range (1200-2400)");
  return { birth: { y, mo, d, hh, mm, tz_offset_hours: tz, lat, lon }, req: r as unknown as ChartRequest };
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "x-orrery-schema": SCHEMA_VERSION,
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" } });
    }
    if (request.method === "GET" && path === "/v1/health") {
      const swe = await getSweph();
      const ay = swe.swe_get_ayanamsa_ut(swe.swe_julday(2000, 1, 1, 0, 1));
      return json({ ok: Math.abs(ay - 23.8571) < 0.01, schema_version: SCHEMA_VERSION, ayanamsa_j2000: ay });
    }
    if (request.method === "GET" && path === "/v1/schema") return json(CHART_SCHEMA);

    if (request.method !== "POST") return json({ error: "not found" }, 404);

    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }

    try {
      const { birth, req } = parseBirth(body);
      const swe = await getSweph();
      const chart = computeChart(swe, birth);

      switch (path) {
        case "/v1/chart":
          return json(chart);
        case "/v1/dasha":
          return json({
            schema_version: SCHEMA_VERSION,
            vimshottari: chart.vimshottari,
            current: currentPeriod(chart.vimshottari, jdFromUtc(swe, new Date())),
          });
        case "/v1/transits": {
          const at = req.at ? new Date(req.at) : new Date();
          if (Number.isNaN(at.getTime())) return json({ error: "at must be ISO-8601" }, 400);
          return json(computeTransits(swe, chart, jdFromUtc(swe, at)));
        }
        case "/v1/wheel.svg": {
          const svg = wheelSvg(chart, { variant: req.variant ?? "rasi", style: req.style ?? "north", ...(req.tokens ?? {}) });
          return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "access-control-allow-origin": "*" } });
        }
        default:
          return json({ error: "not found" }, 404);
      }
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400);
      console.error("orrery error", e);
      return json({ error: "internal" }, 500);
    }
  },
};
