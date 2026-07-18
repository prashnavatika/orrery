# orrery

Deterministic Vedic (sidereal) chart-computation service. Swiss Ephemeris underneath; Lahiri ayanamsa; whole-sign houses.

Computes: planetary positions (incl. Rahu/Ketu, mean node), nakshatra + pada, navamsa, and the Vimshottari mahadasha/antardasha tree. Transits and SVG chart wheels are planned.

**Status:** v0 core + golden gate. HTTP service is next:

- `POST /v1/chart` — `{dob, tob, tz, lat, lon, ayanamsa}` → chart JSON
- `POST /v1/dasha` — Vimshottari tree with current period resolved
- `POST /v1/transits` — current transits vs natal
- `POST /v1/wheel.svg` — rasi + navamsa chart images (North-Indian style default, South toggle)
- `GET /v1/schema` — the frozen chart JSON Schema

Geocoding and timezone resolution are deliberately out of scope: the service takes resolved lat/lon/tz only.

## Run the golden gate

```sh
uv run --with pyswisseph python test_golden.py
```

Every check must print `PASS`. Ephemeris flags are pinned to `FLG_MOSEPH` for determinism (no external ephe files required; `FLG_SWIEPH` silently falls back to Moshier when ephe files are absent, so we pin the fallback explicitly).

## License

AGPL-3.0 (see LICENSE). The chart JSON schema is published as a JSON Schema document — a data format any consumer may use.
