"""orrery core v0 — deterministic Vedic chart computation. AGPL-3.0.
Reference implementation for the orrery service. Sidereal Lahiri, mean node,
whole-sign houses from lagna. Moshier ephemeris (deterministic, no data files);
swap FLG_MOSEPH -> FLG_SWIEPH + ephe files for arc-second work later.
"""
import swisseph as swe

SCHEMA_VERSION = "0.1.0"
FLG = swe.FLG_MOSEPH | swe.FLG_SIDEREAL | swe.FLG_SPEED
swe.set_sid_mode(swe.SIDM_LAHIRI)

SIGNS = ["Mesha","Vrishabha","Mithuna","Karka","Simha","Kanya",
         "Tula","Vrishchika","Dhanu","Makara","Kumbha","Meena"]
NAKSHATRAS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra",
    "Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni",
    "Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula",
    "Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha",
    "Purva Bhadrapada","Uttara Bhadrapada","Revati"]
PLANETS = [("Su",swe.SUN),("Mo",swe.MOON),("Ma",swe.MARS),("Me",swe.MERCURY),
           ("Ju",swe.JUPITER),("Ve",swe.VENUS),("Sa",swe.SATURN),
           ("Ra",swe.MEAN_NODE)]
# Vimshottari: lord order + years, keyed to nakshatra index % 9 starting Ashwini=Ketu
DASHA_SEQ = [("Ke",7),("Ve",20),("Su",6),("Mo",10),("Ma",7),("Ra",18),
             ("Ju",16),("Sa",19),("Me",17)]
DASHA_YEAR_DAYS = 365.25


def _lon_parts(lon):
    lon %= 360.0
    sign_i = int(lon // 30)
    nak_span = 360.0 / 27.0
    nak_i = int(lon // nak_span)
    pada = int((lon % nak_span) // (nak_span / 4)) + 1
    return {"lon": round(lon, 6), "sign": SIGNS[sign_i], "sign_index": sign_i + 1,
            "degree_in_sign": round(lon - sign_i * 30, 4),
            "nakshatra": NAKSHATRAS[nak_i], "nakshatra_index": nak_i + 1,
            "pada": pada}


def _navamsa_sign(lon):
    # 108 navamsas of 3d20'; movable signs start from self, fixed from 9th, dual from 5th
    sign_i = int(lon % 360 // 30)
    nav_i = int((lon % 30) // (30.0 / 9))
    start = {0: sign_i, 1: (sign_i + 8) % 12, 2: (sign_i + 4) % 12}[sign_i % 3]
    return SIGNS[(start + nav_i) % 12]


def _vimshottari(moon_lon, jd_birth, depth_levels=2):
    nak_span = 360.0 / 27.0
    nak_i = int(moon_lon // nak_span)
    seq_i = nak_i % 9
    frac_elapsed = (moon_lon % nak_span) / nak_span
    lord, years = DASHA_SEQ[seq_i]
    balance = years * (1 - frac_elapsed)
    tree, t = [], jd_birth
    for k in range(9):
        L, Y = DASHA_SEQ[(seq_i + k) % 9]
        span = (balance if k == 0 else Y) * DASHA_YEAR_DAYS
        md = {"lord": L, "start_jd": round(t, 4), "end_jd": round(t + span, 4)}
        if depth_levels >= 2:
            subs, t2 = [], t
            elapsed = (Y - balance) if k == 0 else 0.0
            skip = elapsed * DASHA_YEAR_DAYS
            for m in range(9):
                SL, SY = DASHA_SEQ[(DASHA_SEQ.index((L, Y)) + m) % 9]
                sspan = (SY / 120.0) * Y * DASHA_YEAR_DAYS
                if skip >= sspan:
                    skip -= sspan
                    continue
                s_start = t2
                s_len = sspan - skip
                skip = 0.0
                subs.append({"lord": SL, "start_jd": round(s_start, 4),
                             "end_jd": round(s_start + s_len, 4)})
                t2 += s_len
                if t2 >= md["end_jd"]:
                    break
            md["antardashas"] = subs
        tree.append(md)
        t += span
    return tree


def compute_chart(y, mo, d, hh, mm, tz_offset_hours, lat, lon_geo):
    """tz_offset_hours: historical UTC offset at DOB (resolver's job upstream)."""
    ut = hh + mm / 60.0 - tz_offset_hours
    jd = swe.julday(y, mo, d, ut)
    ayan = swe.get_ayanamsa_ut(jd)

    planets = {}
    for code, pid in PLANETS:
        r = swe.calc_ut(jd, pid, FLG)[0]
        planets[code] = _lon_parts(r[0])
        planets[code]["retrograde"] = r[3] < 0
        planets[code]["navamsa_sign"] = _navamsa_sign(r[0])
    ketu_lon = (planets["Ra"]["lon"] + 180.0) % 360.0
    planets["Ke"] = _lon_parts(ketu_lon)
    planets["Ke"]["retrograde"] = True
    planets["Ke"]["navamsa_sign"] = _navamsa_sign(ketu_lon)

    cusps, ascmc = swe.houses_ex(jd, lat, lon_geo, b"W", FLG)  # whole sign
    asc = _lon_parts(ascmc[0])
    lagna_sign_i = asc["sign_index"]
    for p in planets.values():
        p["house"] = (p["sign_index"] - lagna_sign_i) % 12 + 1

    return {"schema_version": SCHEMA_VERSION,
            "meta": {"ayanamsa": "lahiri", "ayanamsa_value": round(ayan, 6),
                     "node": "mean", "house_system": "whole_sign",
                     "ephemeris": "moshier", "jd_ut": round(jd, 6)},
            "ascendant": asc,
            "planets": planets,
            "vimshottari": _vimshottari(planets["Mo"]["lon"], jd)}


if __name__ == "__main__":
    import json, sys
    print(json.dumps(compute_chart(1994, 11, 14, 6, 42, 5.5, 26.9124, 75.7873),
                     indent=1)[:1200], "...")
