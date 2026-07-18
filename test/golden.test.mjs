// orrery golden gate — machine-checkable. Ported from test_golden.py, plus a
// deep cross-implementation parity check against sample_chart.json (generated
// by the pyswisseph reference implementation with identical flags).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadSweph } from "./load-sweph.mjs";
import { computeChart, vimshottari, navamsaSign, currentPeriod, lonParts, FLG } from "../src/core.ts";
import { wheelSvg } from "../src/wheel.ts";
import { CHART_SCHEMA } from "../src/schema.ts";

const swe = await loadSweph();
swe.swe_set_sid_mode(1, 0, 0);

test("G1 Lahiri ayanamsa at J2000", () => {
  const ay = swe.swe_get_ayanamsa_ut(swe.swe_julday(2000, 1, 1, 0.0, 1));
  assert.ok(Math.abs(ay - 23.8571) < 0.01, `got ${ay}`);
});

test("G2 Makar Sankranti 2024: Sun crosses sidereal 270", () => {
  const lo = swe.swe_calc_ut(swe.swe_julday(2024, 1, 14, 18.0, 1), 0, FLG)[0];
  const hi = swe.swe_calc_ut(swe.swe_julday(2024, 1, 15, 3.0, 1), 0, FLG)[0];
  assert.ok(lo < 270.0 && 270.0 <= hi, `${lo} -> ${hi}`);
});

test("G3 navamsa mapping spot checks", () => {
  assert.equal(navamsaSign(1.0), "Mesha");
  assert.equal(navamsaSign(359.9), "Meena");
  assert.equal(navamsaSign(30.5), "Makara");
});

test("G4 Vimshottari structure", () => {
  const tree0 = vimshottari(0.0, 2450000.0);
  const totalY = (tree0[8].end_jd - tree0[0].start_jd) / 365.25;
  assert.ok(Math.abs(totalY - 120.0) < 0.01, `total ${totalY}`);
  const md = tree0[1];
  const subSum = md.antardashas.at(-1).end_jd - md.antardashas[0].start_jd;
  assert.ok(Math.abs(subSum - (md.end_jd - md.start_jd)) < 0.5);
  assert.equal(tree0[0].lord, "Ke");
});

test("G5 whole chart internal consistency (Jaipur birth)", () => {
  const c = computeChart(swe, { y: 1994, mo: 11, d: 14, hh: 6, mm: 42, tz_offset_hours: 5.5, lat: 26.9124, lon: 75.7873 });
  assert.equal(c.schema_version, "0.1.0");
  const diff = Math.abs(((((c.planets.Ke.lon - c.planets.Ra.lon) % 360) + 360) % 360) - 180);
  assert.ok(diff < 1e-6, `ketu-rahu ${diff}`);
  for (const p of Object.values(c.planets)) assert.ok(p.house >= 1 && p.house <= 12);
  assert.equal(c.planets.Su.sign, "Tula");
  const c2 = computeChart(swe, { y: 1994, mo: 11, d: 20, hh: 6, mm: 42, tz_offset_hours: 5.5, lat: 26.9124, lon: 75.7873 });
  assert.equal(c2.planets.Su.sign, "Vrishchika");
});

test("G6 cross-implementation parity vs pyswisseph (sample_chart.json, arc-second)", () => {
  const ref = JSON.parse(readFileSync(new URL("../sample_chart.json", import.meta.url)));
  const c = computeChart(swe, { y: 1994, mo: 11, d: 14, hh: 6, mm: 42, tz_offset_hours: 5.5, lat: 26.9124, lon: 75.7873 });
  assert.ok(Math.abs(c.meta.jd_ut - ref.meta.jd_ut) < 1e-6);
  assert.ok(Math.abs(c.meta.ayanamsa_value - ref.meta.ayanamsa_value) < 0.0001, "ayanamsa");
  // every planet: lon to 1 arc-second, and all derived fields exactly equal
  for (const code of Object.keys(ref.planets)) {
    const a = ref.planets[code], b = c.planets[code];
    assert.ok(Math.abs(a.lon - b.lon) * 3600 < 1.0, `${code} lon ${a.lon} vs ${b.lon}`);
    for (const f of ["sign", "sign_index", "nakshatra", "nakshatra_index", "pada", "navamsa_sign", "house", "retrograde"]) {
      assert.deepEqual(b[f], a[f], `${code}.${f}`);
    }
  }
  assert.ok(Math.abs(ref.ascendant.lon - c.ascendant.lon) * 3600 < 1.0, "ascendant");
  // dasha tree: same lords, boundaries within 0.01 day
  assert.equal(c.vimshottari.length, ref.vimshottari.length);
  for (let i = 0; i < ref.vimshottari.length; i++) {
    assert.equal(c.vimshottari[i].lord, ref.vimshottari[i].lord);
    assert.ok(Math.abs(c.vimshottari[i].start_jd - ref.vimshottari[i].start_jd) < 0.01);
    assert.ok(Math.abs(c.vimshottari[i].end_jd - ref.vimshottari[i].end_jd) < 0.01);
  }
});

test("G7 current-period resolution lands inside the tree", () => {
  const c = computeChart(swe, { y: 1994, mo: 11, d: 14, hh: 6, mm: 42, tz_offset_hours: 5.5, lat: 26.9124, lon: 75.7873 });
  const mid = c.vimshottari[3].start_jd + 10;
  const cur = currentPeriod(c.vimshottari, mid);
  assert.equal(cur.mahadasha.lord, c.vimshottari[3].lord);
  assert.ok(cur.antardasha !== null);
});

test("G8 wheel SVG renders both styles and variants", () => {
  const c = computeChart(swe, { y: 1994, mo: 11, d: 14, hh: 6, mm: 42, tz_offset_hours: 5.5, lat: 26.9124, lon: 75.7873 });
  for (const style of ["north", "south"]) {
    for (const variant of ["rasi", "navamsa"]) {
      const svg = wheelSvg(c, { style, variant });
      assert.ok(svg.startsWith("<svg"), "svg root");
      // north style shows rashi NUMBERS in the diamonds (traditional); south shows names
      if (style === "south") assert.ok(svg.includes(c.ascendant.sign), "lagna sign name present (south)");
      else assert.ok(svg.includes(`>${c.ascendant.sign_index}</text>`), "lagna rashi number present (north)");
      assert.ok(svg.includes("Su"), "sun placed");
    }
  }
});

test("G9 schema doc sanity", () => {
  assert.equal(CHART_SCHEMA.properties.schema_version.const, "0.1.0");
  const c = computeChart(swe, { y: 1994, mo: 11, d: 14, hh: 6, mm: 42, tz_offset_hours: 5.5, lat: 26.9124, lon: 75.7873 });
  for (const k of CHART_SCHEMA.required) assert.ok(k in c, `chart missing ${k}`);
  for (const k of CHART_SCHEMA.properties.planets.required) assert.ok(k in c.planets, `planets missing ${k}`);
});

test("G10 lonParts boundary safety", () => {
  assert.equal(lonParts(360.0).lon, 0);
  assert.equal(lonParts(-0.5).sign, "Meena");
  assert.equal(lonParts(29.9999).sign, "Mesha");
  assert.equal(lonParts(30.0001).sign, "Vrishabha");
});

test("G11 wheel token injection is neutralized", async () => {
  const { sanitizeStyle } = await import("../src/wheel.ts");
  const c = computeChart(swe, { y: 1994, mo: 11, d: 14, hh: 6, mm: 42, tz_offset_hours: 5.5, lat: 26.9124, lon: 75.7873 });
  const evil = { stroke: '"/><script>alert(1)</script>', font: '";</style><script>x</script>', paper: "javascript:alert(1)", size: 99999 };
  const clean = sanitizeStyle(evil);
  assert.equal(clean.stroke, undefined, "evil stroke dropped");
  assert.equal(clean.font, undefined, "evil font dropped");
  assert.equal(clean.paper, undefined, "evil paper dropped");
  assert.equal(clean.size, 2000, "size clamped");
  const svg = wheelSvg(c, { tokens: undefined, ...evil });
  assert.ok(!svg.includes("<script"), "no script element");
  assert.ok(svg.includes('stroke="#333333"'), "default stroke used");
  // legit tokens still work
  const themed = wheelSvg(c, { stroke: "#D4A94E", paper: "#221A3E" });
  assert.ok(themed.includes('stroke="#D4A94E"'));
  // unknown enums fall back to rasi/north deterministically
  const fallback = wheelSvg(c, { variant: "evil", style: "weird" });
  assert.ok(fallback.includes("Rasi (D1)"), "unknown variant -> rasi");
});
