/** SVG chart wheels — North-Indian (default) and South-Indian styles.
 * Styling is injectable (stroke/paper/accent/text colors + fonts) so the
 * service stays brand-neutral; consumers pass their own tokens.
 */
import type { Chart } from "./core.ts";
import { SIGNS } from "./core.ts";

export interface WheelStyle {
  size?: number;          // px, square
  stroke?: string;        // line color
  paper?: string;         // background
  text?: string;          // planet/sign text color
  accent?: string;        // lagna + emphasis color
  font?: string;          // font-family
}

const DEFAULTS: Required<WheelStyle> = {
  size: 640, stroke: "#333333", paper: "#ffffff", text: "#111111",
  accent: "#8a6d1f", font: "Georgia, 'Noto Serif', serif",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,30})$/;
const FONT_RE = /^[a-zA-Z0-9 ,'-]{1,80}$/;

/** Reject/normalize user-supplied style tokens — every value lands inside an SVG
 * attribute, so unknown shapes are dropped, never interpolated. */
export function sanitizeStyle(raw: WheelStyle | undefined): WheelStyle {
  if (!raw) return {};
  const out: WheelStyle = {};
  const size = Number(raw.size);
  if (Number.isFinite(size)) out.size = Math.min(2000, Math.max(200, size));
  for (const k of ["stroke", "paper", "text", "accent"] as const) {
    const v = raw[k];
    if (typeof v === "string" && COLOR_RE.test(v)) out[k] = v;
  }
  if (typeof raw.font === "string" && FONT_RE.test(raw.font)) out.font = raw.font;
  return out;
}

/** House occupants map (1..12) from a chart, for rasi or navamsa. */
function occupants(chart: Chart, variant: "rasi" | "navamsa"): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (let h = 1; h <= 12; h++) m.set(h, []);
  const lagnaSignI = variant === "rasi"
    ? chart.ascendant.sign_index
    : SIGNS.indexOf(navAscSign(chart) as (typeof SIGNS)[number]) + 1;
  for (const [code, p] of Object.entries(chart.planets)) {
    const signI = variant === "rasi" ? p.sign_index : SIGNS.indexOf(p.navamsa_sign as (typeof SIGNS)[number]) + 1;
    const house = ((((signI - lagnaSignI) % 12) + 12) % 12) + 1;
    const label = code + (p.retrograde && code !== "Ra" && code !== "Ke" ? "℞" : "");
    m.get(house)!.push(label);
  }
  return m;
}

function navAscSign(chart: Chart): string {
  // navamsa lagna: navamsa sign of the ascendant degree
  const lon = chart.ascendant.lon;
  const signI = Math.floor(lon / 30);
  const navI = Math.floor((lon % 30) / (30 / 9));
  const start = [signI, (signI + 8) % 12, (signI + 4) % 12][signI % 3];
  return SIGNS[(start + navI) % 12];
}

/** Sign number (1..12) occupying each house, given the lagna sign. */
function houseSigns(lagnaSignI: number): number[] {
  return Array.from({ length: 12 }, (_, i) => ((lagnaSignI - 1 + i) % 12) + 1);
}

/** North-Indian style: fixed diamond houses, signs rotate. */
export function wheelSvg(chart: Chart, opts: { variant?: "rasi" | "navamsa"; style?: "north" | "south" } & WheelStyle = {}): string {
  const variant = opts.variant === "navamsa" ? "navamsa" : "rasi";
  const layout = opts.style === "south" ? "south" : "north";
  const s = { ...DEFAULTS, ...sanitizeStyle(opts) };
  return layout === "north" ? north(chart, variant, s) : south(chart, variant, s);
}

function north(chart: Chart, variant: "rasi" | "navamsa", s: Required<WheelStyle>): string {
  const W = s.size, H = s.size, cx = W / 2, cy = H / 2;
  const occ = occupants(chart, variant);
  const lagnaSignI = variant === "rasi"
    ? chart.ascendant.sign_index
    : SIGNS.indexOf(navAscSign(chart) as (typeof SIGNS)[number]) + 1;
  const signs = houseSigns(lagnaSignI);

  // Fixed North-Indian house label anchors (house 1 top-center diamond, then anticlockwise)
  const P: Array<[number, number]> = [
    [cx, cy - H * 0.25],          // 1
    [cx - W * 0.25, cy - H * 0.4], // 2
    [cx - W * 0.4, cy - H * 0.25], // 3
    [cx - W * 0.25, cy],           // 4
    [cx - W * 0.4, cy + H * 0.25], // 5
    [cx - W * 0.25, cy + H * 0.4], // 6
    [cx, cy + H * 0.25],           // 7
    [cx + W * 0.25, cy + H * 0.4], // 8
    [cx + W * 0.4, cy + H * 0.25], // 9
    [cx + W * 0.25, cy],           // 10
    [cx + W * 0.4, cy - H * 0.25], // 11
    [cx + W * 0.25, cy - H * 0.4], // 12
  ];

  const cells = P.map(([x, y], i) => {
    const h = i + 1;
    const sign = signs[i];
    const bodies = occ.get(h)!;
    const bodyText = bodies.length
      ? `<text x="${x}" y="${y + 16}" text-anchor="middle" font-size="${s.size * 0.028}" fill="${s.text}">${esc(bodies.join(" "))}</text>`
      : "";
    const em = h === 1 ? ` font-weight="bold" fill="${s.accent}"` : ` fill="${s.text}"`;
    return `<text x="${x}" y="${y - 4}" text-anchor="middle" font-size="${s.size * 0.024}"${em}>${sign}</text>${bodyText}`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${esc(s.font)}">
  <rect width="${W}" height="${H}" fill="${s.paper}"/>
  <g stroke="${s.stroke}" stroke-width="${Math.max(1, s.size / 320)}" fill="none">
    <rect x="${W * 0.05}" y="${H * 0.05}" width="${W * 0.9}" height="${H * 0.9}"/>
    <path d="M${W * 0.05} ${H * 0.05} L${W * 0.95} ${H * 0.95} M${W * 0.95} ${H * 0.05} L${W * 0.05} ${H * 0.95}"/>
    <path d="M${cx} ${H * 0.05} L${W * 0.05} ${cy} L${cx} ${H * 0.95} L${W * 0.95} ${cy} Z"/>
  </g>
  ${cells}
  <text x="${cx}" y="${H * 0.985}" text-anchor="middle" font-size="${s.size * 0.02}" fill="${s.text}" opacity="0.6">${variant === "rasi" ? "Rasi (D1)" : "Navamsa (D9)"}</text>
</svg>`;
}

function south(chart: Chart, variant: "rasi" | "navamsa", s: Required<WheelStyle>): string {
  const W = s.size, H = s.size;
  const occ = occupants(chart, variant);
  const lagnaSignI = variant === "rasi"
    ? chart.ascendant.sign_index
    : SIGNS.indexOf(navAscSign(chart) as (typeof SIGNS)[number]) + 1;
  // South-Indian: fixed sign grid (Meena top-left, clockwise), houses counted from lagna
  const GRID: Array<[number, number]> = [
    [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1], [0, 0],
  ]; // index = sign_index-1 (Mesha..Meena) mapped: Mesha at [1,0]
  const cell = W / 4;
  const boxes: string[] = [];
  for (let signI = 1; signI <= 12; signI++) {
    const [gx, gy] = GRID[signI - 1];
    const x = gx * cell, y = gy * cell;
    const house = ((((signI - lagnaSignI) % 12) + 12) % 12) + 1;
    const bodies: string[] = [];
    for (const [code, p] of Object.entries(chart.planets)) {
      const sI = variant === "rasi" ? p.sign_index : SIGNS.indexOf(p.navamsa_sign as (typeof SIGNS)[number]) + 1;
      if (sI === signI) bodies.push(code + (p.retrograde && code !== "Ra" && code !== "Ke" ? "℞" : ""));
    }
    const isLagna = signI === lagnaSignI;
    boxes.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="none" stroke="${s.stroke}" stroke-width="${Math.max(1, s.size / 320)}"/>
  <text x="${x + 6}" y="${y + 16}" font-size="${s.size * 0.022}" fill="${isLagna ? s.accent : s.text}" ${isLagna ? 'font-weight="bold"' : ""}>${SIGNS[signI - 1]}${isLagna ? " ⬥" : ""}</text>
  <text x="${x + cell / 2}" y="${y + cell / 2 + 6}" text-anchor="middle" font-size="${s.size * 0.028}" fill="${s.text}">${esc(bodies.join(" "))}</text>
  <text x="${x + cell - 10}" y="${y + cell - 8}" text-anchor="end" font-size="${s.size * 0.018}" fill="${s.text}" opacity="0.5">${house}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${esc(s.font)}">
  <rect width="${W}" height="${H}" fill="${s.paper}"/>
  ${boxes.join("\n  ")}
  <text x="${W / 2}" y="${H / 2 - 6}" text-anchor="middle" font-size="${s.size * 0.026}" fill="${s.text}" opacity="0.7">${variant === "rasi" ? "Rasi (D1)" : "Navamsa (D9)"}</text>
</svg>`;
}
