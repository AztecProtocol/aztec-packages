# cycle_group / biggroup: Point at Infinity Handling Audit

## Summary

Two boundary cases lacked explicit handling for infinity points. Both issues are now fixed with native assertions.

---

## Issue 1: Public Input Propagation [FIXED]

**Affected code:**
- `cycle_group::set_public()` / `reconstruct_from_public()` (`cycle_group.hpp:199-218`)
- `biggroup::set_public()` / `reconstruct_from_public()` (`biggroup.hpp:56-79`)

**Problem:**
- `set_public()` only serializes x,y coordinates - the `_is_infinity` flag is NOT included
- `reconstruct_from_public()` hardcodes `is_infinity = false` and validates on-curve

**Fix applied:**
Added native assertion in `set_public()` to prevent infinity from being set as public:
```cpp
BB_ASSERT(!_is_infinity.get_value(), "cycle_group::set_public does not support point at infinity");
```

This provides a clear error message if someone attempts to propagate infinity through public inputs, rather than the confusing "point not on curve" error from the on-curve check.

---

## Issue 2: Transcript Serialization [FIXED]

**Affected code:**
- `StdlibCodec::serialize_to_fields()` (`field_conversion.hpp:251-263`)

**Observation:**
- Native `FrCodec::serialize_to_fields()` explicitly checks `is_point_at_infinity()` and outputs (0,0)
- Stdlib `StdlibCodec::serialize_to_fields()` was outputting raw coords without checking infinity

**Fix applied:**
Added native assertion to prevent infinity from being serialized:
```cpp
BB_ASSERT(!val.is_point_at_infinity().get_value(),
          "StdlibCodec::serialize_to_fields does not support point at infinity");
```

This explicitly documents that infinity is not expected in this code path. Points serialized in recursive verification should originate from the native prover (via `receive_from_prover`) which already enforces (0,0) for infinity.

---

## Risk Assessment

| Issue | Status | Risk |
|-------|--------|------|
| Public inputs | Fixed | Native assert catches misuse |
| Serialization | Fixed | Native assert catches misuse |
