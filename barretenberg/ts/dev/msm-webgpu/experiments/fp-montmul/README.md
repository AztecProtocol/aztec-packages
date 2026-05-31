# FP (floating-point) Montgomery-multiply experiments — BROKEN, UNWIRED

Experimental floating-point base-field multiply for the MSM walker, targeting
the Mali-G715 FMA/SFU pipes (the integer 32-bit multiply issues to BOTH the A
and SFU pipes on Valhall; routing the multiply to the FP/FMA pipe was the
hypothesis for relieving the multiply bottleneck).

**Status: does NOT work on-device. Committed as-is for a future fix, NOT wired
into the shader pipeline.**

## The failure mode (the thing to fix)

`fp_dropin_montmul.wgsl` (FP-B13 drop-in) is **host bit-exact** vs `x·y·R⁻¹ mod p`
(`fp_dropin_validate.mjs`, 100000+16 edge cases, fails=0) and naga-validates
clean — but the on-device cross-check **DISAGREES** on the Pixel 9a (0 agree,
all reps). The error-free-transform (EFT / two-product) splitting that the FP
multiply relies on is broken by Tint/Mali's FP contraction (it fuses the
mul+add the EFT depends on staying separate). The host JS mirror and the
device disagree precisely because the device contracts where the algorithm
assumes IEEE round-to-nearest at each step.

So: the math is right; the device's FP contraction breaks it. A correct
version must defeat contraction (e.g. force separate rounding / block FMA
fusion on the critical EFT ops) without losing the FP-pipe win.

## Files

- `fp_dropin_montmul.wgsl` — the FP-B13 `fn montgomery_product` drop-in (the lead).
- `fp_dropin_harness16.wgsl`, `fp_mulonly_*.wgsl` — standalone mul harnesses.
- `fp_largelimb_B{16,18,20,22}.wgsl`, `gen_fp_largelimb.mjs` — larger-limb FP variants.
- `fp_mul_B8_{fma,muladd,batch}.wgsl`, `gen_fp_mul*.mjs` — B8 multiply forms.
- `fp_*_validate.mjs`, `fp_wgsl_mirror.mjs` — host bit-exactness checkers + JS mirror.
- `gen_fp_dropin.mjs`, `rebench_gen_fp_dropin.mjs` — drop-in generators.

The integer drop-in path these were meant to slot into is the same one the
`cios_unrolled` variant uses: brace-match-replace `fn montgomery_product` in
the karat scaffold (see `ShaderManager.renderCiosUnrolledMont`). A future FP
fix would add an analogous `montmul='fp_b13'` variant once the EFT-under-Tint
correctness is solved.
