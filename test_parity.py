"""Cross-implementation parity: pyswisseph reference vs the committed fixture.
Run in CI after test_golden.py — guards sample_chart.json against silent drift,
which the TS G6 test depends on as its reference.
"""
import json
import orrery_core

ref = json.load(open("sample_chart.json"))
fresh = orrery_core.compute_chart(1994, 11, 14, 6, 42, 5.5, 26.9124, 75.7873)

assert fresh["schema_version"] == ref["schema_version"], "schema_version drift"
assert abs(fresh["meta"]["jd_ut"] - ref["meta"]["jd_ut"]) < 1e-6
for code, want in ref["planets"].items():
    got = fresh["planets"][code]
    assert abs(got["lon"] - want["lon"]) * 3600 < 0.5, f"{code} lon drift {got['lon']} vs {want['lon']}"
    for f in ("sign", "house", "nakshatra", "pada", "navamsa_sign", "retrograde"):
        assert got[f] == want[f], f"{code}.{f}: {got[f]} != {want[f]}"
for i, want in enumerate(ref["vimshottari"]):
    got = fresh["vimshottari"][i]
    assert got["lord"] == want["lord"]
    assert abs(got["start_jd"] - want["start_jd"]) < 0.01
print("PARITY OK — sample_chart.json matches pyswisseph reference")
