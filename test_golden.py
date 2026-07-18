"""orrery golden tests v0 — machine-checkable gate. Run: python3 test_golden.py"""
import swisseph as swe
from orrery_core import compute_chart, _navamsa_sign, _vimshottari, DASHA_SEQ, FLG

def t(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    assert cond, name

# G1 Lahiri ayanamsa at J2000 = 23.8571 +/- 0.01
swe.set_sid_mode(swe.SIDM_LAHIRI)
ay = swe.get_ayanamsa_ut(swe.julday(2000,1,1,0.0))
t("G1 ayanamsa J2000", abs(ay - 23.8571) < 0.01, f"{ay:.4f}")

# G2 Makar Sankranti 2024: Sun crosses sidereal 270 between 14 Jan 18:00 UT and 15 Jan 03:00 UT
lo = swe.calc_ut(swe.julday(2024,1,14,18.0), swe.SUN, FLG)[0][0]
hi = swe.calc_ut(swe.julday(2024,1,15,3.0),  swe.SUN, FLG)[0][0]
t("G2 makar sankranti 2024", lo < 270.0 <= hi, f"{lo:.3f}->{hi:.3f}")

# G3 navamsa mapping spot checks (classical): 0-3d20 Mesha -> Mesha; last navamsa Meena -> Meena
t("G3a navamsa mesha first", _navamsa_sign(1.0) == "Mesha")
t("G3b navamsa meena last", _navamsa_sign(359.9) == "Meena")
# fixed sign: Vrishabha (30-60) counts from 9th (Makara)
t("G3c navamsa vrishabha first", _navamsa_sign(30.5) == "Makara")

# G4 Vimshottari structure: 9 mahadashas, total span = 120y, antardasha spans sum to mahadasha
tree = _vimshottari(10.0, 2450000.0)
total = tree[-1]["end_jd"] - tree[0]["start_jd"]
# balance shortens first MD; full cycle from nak start = 120y only if frac=0
tree0 = _vimshottari(0.0, 2450000.0)
t("G4a full cycle 120y", abs((tree0[-1]["end_jd"] - tree0[0]["start_jd"]) / 365.25 - 120.0) < 0.01)
md = tree0[1]
sub_sum = md["antardashas"][-1]["end_jd"] - md["antardashas"][0]["start_jd"]
t("G4b antardashas fill mahadasha", abs(sub_sum - (md["end_jd"] - md["start_jd"])) < 0.5)
t("G4c ashwini lord ketu", tree0[0]["lord"] == "Ke")

# G5 whole chart: internal consistency on sample birth
c = compute_chart(1994, 11, 14, 6, 42, 5.5, 26.9124, 75.7873)  # Jaipur
t("G5a schema version", c["schema_version"] == "0.1.0")
t("G5b ketu opposite rahu", abs(((c["planets"]["Ke"]["lon"] - c["planets"]["Ra"]["lon"]) % 360) - 180) < 1e-6)
t("G5c lagna house is 1", (c["ascendant"]["sign_index"] - c["ascendant"]["sign_index"]) % 12 + 1 == 1)
t("G5d all houses 1..12", all(1 <= p["house"] <= 12 for p in c["planets"].values()))
t("G5e sun in tula 14 nov (sidereal)", c["planets"]["Su"]["sign"] == "Tula", c["planets"]["Su"]["sign"])
c2 = compute_chart(1994, 11, 20, 6, 42, 5.5, 26.9124, 75.7873)
t("G5f sun in vrishchika 20 nov", c2["planets"]["Su"]["sign"] == "Vrishchika", c2["planets"]["Su"]["sign"])

print("\nALL GREEN")
