# UNCOMMITTED work-in-progress: the get_r_entry / 2^524 constant-split fix (lead b)

STATUS: written to the working tree but NOT committed and NOT verified (a tool-output
blackout prevented reading tsc/device results at end of session). The last COMMITTED
state is HEAD 788232194e (honest: host-correct + wired + served; on-device DISAGREES).

## What these uncommitted edits do (the fix for lead (b) in HANDOFF_fp22native.md)
The on-device disagreement is caused by conflating two different R-constants behind a
single get_r(): the Barrett to-Montgomery ENTRY scale (needs 2^524 mod p for fp22native,
because Barrett reduces at the 260-bit limb width) vs the Montgomery-ONE identity used by
fr_pow in decompress (needs 2^264 mod p). These edits split them:

1. wgsl/cuzk/convert_points_only.template.wgsl
   - added `fn get_r_entry()` returning {{{ r_entry_limbs }}}
   - changed the entry `field_mul(&x,&get_r())` -> `field_mul(&x,&get_r_entry())`
   - get_r() (unchanged) stays the Montgomery-1 = r_limbs.
2. wgsl/cuzk/decompress_g1_bn254.template.wgsl
   - same: added get_r_entry(), entry field_mul uses get_r_entry(); get_r() stays Mont-1.
3. cuzk/shader_manager.ts
   - r_limbs reverted to gen_r_limbs(this.r)  (this.r = 2^264 mod p for fp22native).
   - NEW field r_entry_limbs = gen_r_limbs(2^524 mod p) for fp22native, else = this.r.
   - r_entry_limbs passed into the convert + decompress render contexts (inserted after
     each `r_limbs: this.r_limbs,` line via a regex — VERIFY it didn't land in unintended
     render contexts; extra mustache keys are harmless but check it compiles).

## MUST DO before trusting / committing these edits
1. `cd ~/localclaudebox/wt-fp22n/barretenberg/ts && npx tsc --noEmit -p tsconfig.json`
   (the r_entry_limbs field uses `!:` definite-assignment; ensure no TS error).
2. Regenerate WGSL: `node src/msm_webgpu/scripts/inline-wgsl.mjs` then grep
   wgsl/_generated/shaders.ts for `get_r_entry` (must be present in convert+decompress).
3. Confirm NO duplicate `fn get_r_entry` and NO leftover bare `field_mul(&x,&get_r())`
   entry call in convert/decompress.
4. Run `bash ~/localclaudebox/wt-fp22n/fp22work/device_check.sh` and read DEVICE_CHECK.txt.
   EXPECT: fp22native now AGREES with the WASM oracle at logn=14 AND 17. If it does,
   commit. If it STILL disagrees, the remaining suspect is lead (a) — Tint contracting the
   11-bit-split f32 mul+add into a single-rounding FMA, breaking the floor-renorm exactness.
   Test that with an isolated single-montmul GPU readback vs the host montmul (see HANDOFF
   lead (a)); if it's FMA, the native multiply needs an integer mulhilo_22 path on Apple.

## If these edits are broken / you want the clean committed baseline
`git checkout -- barretenberg/ts/src/msm_webgpu/` resets to HEAD 788232194e (the honest,
compiling, documented state). Nothing of value is lost — the analysis is all in
HANDOFF_fp22native.md.
