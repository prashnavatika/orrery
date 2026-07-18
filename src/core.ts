/** orrery core v0 — deterministic Vedic chart computation. AGPL-3.0.
 * TypeScript port of orrery_core.py (the reference implementation, kept in-repo).
 * Sidereal Lahiri, mean node, whole-sign houses from lagna, Moshier ephemeris.
 * Both implementations are pinned to identical flags; test/golden.test.mjs
 * asserts cross-implementation parity against sample_chart.json (pyswisseph).
 */

export const SCHEMA_VERSION = "0.1.0";

const SEFLG_MOSEPH = 4;
const SEFLG_SPEED = 256;
const SEFLG_SIDEREAL = 64 * 1024;
export const FLG = SEFLG_MOSEPH | SEFLG_SIDEREAL | SEFLG_SPEED;
const SIDM_LAHIRI = 1;

/** Minimal surface of sweph-wasm's SwissEPH the core needs (dependency-injected). */
export interface Sweph {
  swe_set_sid_mode(mode: number, t0: number, ayan_t0: number): void;
  swe_julday(y: number, m: number, d: number, hour: number, gregflag: number): number;
  swe_get_ayanamsa_ut(jd: number): number;
  swe_calc_ut(jd: number, ipl: number, flg: number): number[];
  swe_houses_ex(jd: number, flg: number, lat: number, lon: number, hsys: string): { cusps: number[]; ascmc: number[] };
}

export const SIGNS = ["Mesha","Vrishabha","Mithuna","Karka","Simha","Kanya",
  "Tula","Vrishchika","Dhanu","Makara","Kumbha","Meena"] as const;

export const NAKSHATRAS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra",
  "Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni",
  "Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula",
  "Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha",
  "Purva Bhadrapada","Uttara Bhadrapada","Revati"] as const;

const SE = { SUN: 0, MOON: 1, MERCURY: 2, VENUS: 3, MARS: 4, JUPITER: 5, SATURN: 6, MEAN_NODE: 10 };
export const PLANETS: Array<[string, number]> = [
  ["Su", SE.SUN], ["Mo", SE.MOON], ["Ma", SE.MARS], ["Me", SE.MERCURY],
  ["Ju", SE.JUPITER], ["Ve", SE.VENUS], ["Sa", SE.SATURN], ["Ra", SE.MEAN_NODE],
];

export const DASHA_SEQ: Array<[string, number]> = [
  ["Ke", 7], ["Ve", 20], ["Su", 6], ["Mo", 10], ["Ma", 7], ["Ra", 18],
  ["Ju", 16], ["Sa", 19], ["Me", 17],
];
const DASHA_YEAR_DAYS = 365.25;

const round = (x: number, p: number) => {
  const f = 10 ** p;
  return Math.round(x * f) / f;
};

export interface LonParts {
  lon: number; sign: string; sign_index: number; degree_in_sign: number;
  nakshatra: string; nakshatra_index: number; pada: number;
}

export function lonParts(lonIn: number): LonParts {
  const lon = ((lonIn % 360) + 360) % 360;
  const signI = Math.floor(lon / 30);
  const nakSpan = 360 / 27;
  const nakI = Math.floor(lon / nakSpan);
  const pada = Math.floor((lon % nakSpan) / (nakSpan / 4)) + 1;
  return {
    lon: round(lon, 6), sign: SIGNS[signI], sign_index: signI + 1,
    degree_in_sign: round(lon - signI * 30, 4),
    nakshatra: NAKSHATRAS[nakI], nakshatra_index: nakI + 1, pada,
  };
}

export function navamsaSign(lonIn: number): string {
  const lon = ((lonIn % 360) + 360) % 360;
  const signI = Math.floor(lon / 30);
  const navI = Math.floor((lon % 30) / (30 / 9));
  const start = [signI, (signI + 8) % 12, (signI + 4) % 12][signI % 3];
  return SIGNS[(start + navI) % 12];
}

export interface DashaPeriod { lord: string; start_jd: number; end_jd: number; antardashas?: DashaPeriod[] }

export function vimshottari(moonLonIn: number, jdBirth: number, depthLevels = 2): DashaPeriod[] {
  const moonLon = ((moonLonIn % 360) + 360) % 360; // JS % preserves sign; the Python reference never goes negative
  const nakSpan = 360 / 27;
  const nakI = Math.floor(moonLon / nakSpan);
  const seqI = nakI % 9;
  const fracElapsed = (moonLon % nakSpan) / nakSpan;
  const [, years] = DASHA_SEQ[seqI];
  const balance = years * (1 - fracElapsed);
  const tree: DashaPeriod[] = [];
  let t = jdBirth;
  for (let k = 0; k < 9; k++) {
    const [L, Y] = DASHA_SEQ[(seqI + k) % 9];
    const span = (k === 0 ? balance : Y) * DASHA_YEAR_DAYS;
    const md: DashaPeriod = { lord: L, start_jd: round(t, 4), end_jd: round(t + span, 4) };
    if (depthLevels >= 2) {
      const subs: DashaPeriod[] = [];
      let t2 = t;
      const elapsed = k === 0 ? Y - balance : 0;
      let skip = elapsed * DASHA_YEAR_DAYS;
      const lordI = (seqI + k) % 9;
      for (let m = 0; m < 9; m++) {
        const [SL, SY] = DASHA_SEQ[(lordI + m) % 9];
        const sspan = (SY / 120) * Y * DASHA_YEAR_DAYS;
        if (skip >= sspan) { skip -= sspan; continue; }
        const sStart = t2;
        const sLen = sspan - skip;
        skip = 0;
        subs.push({ lord: SL, start_jd: round(sStart, 4), end_jd: round(sStart + sLen, 4) });
        t2 += sLen;
        if (t2 >= md.end_jd) break;
      }
      md.antardashas = subs;
    }
    tree.push(md);
    t += span;
  }
  return tree;
}

/** Resolve which mahadasha/antardasha a given jd falls in. */
export function currentPeriod(tree: DashaPeriod[], jd: number) {
  for (const md of tree) {
    if (jd >= md.start_jd && jd < md.end_jd) {
      const ad = (md.antardashas ?? []).find((a) => jd >= a.start_jd && jd < a.end_jd) ?? null;
      return { mahadasha: { lord: md.lord, start_jd: md.start_jd, end_jd: md.end_jd },
               antardasha: ad ? { lord: ad.lord, start_jd: ad.start_jd, end_jd: ad.end_jd } : null };
    }
  }
  return null;
}

export interface PlanetEntry extends LonParts { retrograde: boolean; navamsa_sign: string; house: number }

export interface Chart {
  schema_version: string;
  meta: { ayanamsa: string; ayanamsa_value: number; node: string; house_system: string; ephemeris: string; jd_ut: number };
  ascendant: LonParts;
  planets: Record<string, PlanetEntry>;
  vimshottari: DashaPeriod[];
}

export interface BirthInput { y: number; mo: number; d: number; hh: number; mm: number; tz_offset_hours: number; lat: number; lon: number }

/** tz_offset_hours: historical UTC offset at DOB (resolver's job upstream). */
export function computeChart(swe: Sweph, b: BirthInput): Chart {
  swe.swe_set_sid_mode(SIDM_LAHIRI, 0, 0);
  const ut = b.hh + b.mm / 60 - b.tz_offset_hours;
  const jd = swe.swe_julday(b.y, b.mo, b.d, ut, 1);
  const ayan = swe.swe_get_ayanamsa_ut(jd);

  const planets: Record<string, PlanetEntry> = {};
  for (const [code, pid] of PLANETS) {
    const r = swe.swe_calc_ut(jd, pid, FLG);
    planets[code] = {
      ...lonParts(r[0]),
      retrograde: r[3] < 0,
      navamsa_sign: navamsaSign(r[0]),
      house: 0,
    };
  }
  const ketuLon = (planets["Ra"].lon + 180) % 360;
  planets["Ke"] = { ...lonParts(ketuLon), retrograde: true, navamsa_sign: navamsaSign(ketuLon), house: 0 };

  const { ascmc } = swe.swe_houses_ex(jd, FLG & ~SEFLG_SPEED, b.lat, b.lon, "W");
  const asc = lonParts(ascmc[0]);
  const lagnaSignI = asc.sign_index;
  for (const p of Object.values(planets)) {
    p.house = ((((p.sign_index - lagnaSignI) % 12) + 12) % 12) + 1;
  }

  return {
    schema_version: SCHEMA_VERSION,
    meta: {
      ayanamsa: "lahiri", ayanamsa_value: round(ayan, 6), node: "mean",
      house_system: "whole_sign", ephemeris: "moshier", jd_ut: round(jd, 6),
    },
    ascendant: asc,
    planets,
    vimshottari: vimshottari(planets["Mo"].lon, jd),
  };
}

export interface TransitEntry extends LonParts { retrograde: boolean; house_from_natal_lagna: number }

/** Current (or given-jd) sidereal transits, houses counted from the natal lagna. */
export function computeTransits(swe: Sweph, natal: Chart, jdNow: number) {
  swe.swe_set_sid_mode(SIDM_LAHIRI, 0, 0);
  const lagnaSignI = natal.ascendant.sign_index;
  const transits: Record<string, TransitEntry> = {};
  for (const [code, pid] of PLANETS) {
    const r = swe.swe_calc_ut(jdNow, pid, FLG);
    transits[code] = {
      ...lonParts(r[0]),
      retrograde: r[3] < 0,
      house_from_natal_lagna: ((((Math.floor((((r[0] % 360) + 360) % 360) / 30) + 1) - lagnaSignI) % 12 + 12) % 12) + 1,
    };
  }
  const ketuLon = (transits["Ra"].lon + 180) % 360;
  transits["Ke"] = {
    ...lonParts(ketuLon), retrograde: true,
    house_from_natal_lagna: ((((Math.floor(ketuLon / 30) + 1) - lagnaSignI) % 12 + 12) % 12) + 1,
  };
  return {
    schema_version: SCHEMA_VERSION,
    jd_ut: round(jdNow, 6),
    transits,
    dasha_now: currentPeriod(natal.vimshottari, jdNow),
  };
}

/** Civil UTC date/time -> julian day, for /v1/transits "now". */
export function jdFromUtc(swe: Sweph, d: Date): number {
  return swe.swe_julday(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600, 1,
  );
}
