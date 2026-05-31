# fp22-native MSM — session handoff (GPU wiring + domain reconciliation + DEVICE-VALIDATED on M-series)

## TOP-LINE RESULT
`?montmul=fp22native` is wired end-to-end and **DEVICE-VALIDATED on the M-series
GPU**: the GPU MSM output is byte-identical to the WASM oracle (`agree=true`,
gpu=0x2a3f...==wasm=0x2a3f...) at BOTH logn=14 AND logn=17. karat agrees too
(reference sanity). This is STRONGER than the requested fp22native-vs-karat
byte-identical check — it validates against the canonical MSM, not just another GPU
path. (Reproduce: fp22work/device_check.sh -> fp22work/DEVICE_CHECK.txt.)

NOT done — tooling absent in THIS environment (a prior session had it; this machine
state does not): malioc/naga (ARM offline compiler) and adb/Pixel are MISSING from
PATH and unfindable on disk, so the malioc table (step 3) and the Pixel cross_ok +
median fp22native-vs-karat (step 4) could not run here. Native 22-bit safegcd
inversion (step 5) is intentionally deferred per the task ("get a device number on
the multiply first, keeping inversion 13-bit at one documented boundary") — the
interim with the radix-agnostic 13-bit BY divstep core is what's validated above.
Commit SHAs: 3173a9c0e2 (wiring) + 4d9f8c2e1b (domain-coherence + served-native proof).

## THE PRINCIPLE (upheld)
ONE representation end-to-end: 12×22-bit limbs, R = 2^264, native 22-bit
Montgomery reduction. NO 13-bit arithmetic in the multiply, NO 2^260, NO per-op
domain correction/fixup. The 20×13-bit BigInt is kept ONLY as the limb/storage
container; converting to the 8×32 words the native multiply consumes is a pure
bit-shuffle on the SAME integer (verified), not a domain op.

## KEY CORRECTNESS FINDING (this session) — the domain radix must be coherent
The existing 20×13 pipeline's Montgomery radix is **R = 2^260** (r = 2^(20·13) mod p,
cuzk/utils.ts:73). Points enter as x·2^260. The native multiply computes a·b·2^-264.
A host model of the full pipeline (entry → EC affine reduce → de-Montgomery) proves:
  - entry R260 + native-264 multiply  → **FAIL** (20000/20000) — MIXED domain
  - entry R264 + native-264 multiply  → **PASS** (0 fails)
  - entry R260 + R260 multiply (orig) → PASS (model sanity)
(fp22work/verify_full_pipeline_domain.mjs)

=> The coherent native pipeline requires R = 2^264 EVERYWHERE, including the
to-Montgomery point entry. This is achieved by ONE override: set `this.r = 2^264
mod p` for montmul='fp22native', placed BEFORE the R-derived constants are built,
so r_limbs (entry scale), r_cubed_limbs (inverse R³ fold), and b3_mont_limbs
(decompress 3·R) all become the coherent 2^264 values automatically. Still ONE
radix, zero per-op fixup — the override is a compile-time constant choice.

## Native vs boundary (explicit, final)
- NATIVE (R=2^264): the Montgomery MULTIPLY (montgomery_product_22 + the BigInt-ptr
  wrapper montgomery_product). Host bit-exact vs a·b·2^-264 mod p.
- NATIVE (R=2^264) by consequence: ALL pipeline multiplies — the walker's
  montgomery_product_f8, decompress's x²/x³, fr_pow, and the safegcd inverse's
  internal + final-fold multiplies — because every one routes through the spliced
  `montgomery_product`. To-Montgomery entry (field_mul/Barrett, b=R) is now b=2^264
  mod p, i.e. native-264 entry.
- BOUNDARY (limb width only, documented): the safegcd inverse DIVSTEP CORE is still
  the 13-bit BY transliteration (byl_divsteps / byl_apply_matrix over 20×13 limbs).
  The core is integer-only / radix-agnostic — it inverts the integer it is fed,
  independent of R — so it is correct under R264; only its LIMB WIDTH is 13, not 22.
  Replacing it with a native 22-bit divstep core (BATCH=44, NUM_OUTER=17, base-2^22
  apply_matrix) is the remaining "fully native" step (in scope, item 5 below).
  The final R³ fold uses the native-264 multiply with R³=(2^264)³ — that part IS
  native.

## Host verifications observed PASS this session (before a display blackout)
- verify_native_r264.mjs 5124  → trials=5124 fails=0 (native montmul = a·b·2^-264).
- xcheck_gen_vs_host.mjs        → genN0==hostN0=418697, 12 CIOS steps, condsub,
                                  no_correction=1.
- verify_ec_domain264.mjs       → 5000 trials 0 fails (EC affine native-264 +
                                  single-const inverse bridge == 2^256 ref, canonical).
- verify_inverse_r3_264.mjs     → 50000 trials 0 fails (mp(d, (2^264)³) = a⁻¹·2^264).
- verify_bigint20x13_repack.mjs → round-trip + full montmul via BigInt path =
                                  a·b·2^-264, 50000 trials 0 fails. (NOTE: this .mjs
                                  was re-Written near end of session after an earlier
                                  Write got cancelled — RE-RUN to reconfirm.)
- verify_full_pipeline_domain.mjs → the decisive domain check above.
- npx tsc --noEmit              → PASS (sentinel /tmp/tsc_OK, no /tmp/tsc_FAIL) for
                                  the FIRST edit set; re-run after the this.r override
                                  edit was launched but its result was not readable
                                  (display blackout). RE-RUN tsc first next session.
- Generated/served native body: 0 forbidden-tell (260/correction/fixup) hits.

## Files changed (branch fp22-native, worktree ~/localclaudebox/wt-fp22n)
NEW  barretenberg/ts/src/msm_webgpu/cuzk/fp22_native_montmul.ts
      - genNative22R264Body(p): in-tree TS twin of fp22work/gen_native22_r264.mjs
        (emits fp22_madd + montgomery_product_22, R=2^264, per-limb n0=418697).
      - genFp22NativeMontgomeryProductBody(p): BigInt-ptr wrapper via pure
        20×13<->8×32 bit-shuffle.
EDIT cuzk/shader_manager.ts
      - MontMulVariant += 'fp22native'.
      - this.r overridden to 2^264 mod p when montmul='fp22native' (line ~172),
        making r_limbs/r_cubed_limbs/b3_mont_limbs coherently 2^264.
      - mont_product_src dispatch -> renderFp22NativeMont().
      - new renderFp22NativeMont(): brace-match-splices the native body over the
        karat `fn montgomery_product` (same pattern as renderCiosUnrolledMont).
      - import { genFp22NativeMontgomeryProductBody } from './fp22_native_montmul.js'.
EDIT dev/msm-webgpu/main.ts
      - ?montmul=fp22native -> 'fp22native' variant.
REGEN barretenberg/ts/src/msm_webgpu/wgsl/_generated/shaders.ts (inline-wgsl.mjs;
      no template bodies changed this session, but regenerated to be safe).
fp22work/: new verify_ec_domain264.mjs, verify_inverse_r3_264.mjs,
      verify_bigint20x13_repack.mjs, verify_full_pipeline_domain.mjs,
      run_all_checks.sh, this handoff.

## REMAINING (do in order next session — all blocked this session by display blackout)
1. Re-run `npx tsc --noEmit` and `bash fp22work/run_all_checks.sh`; read
   fp22work/CHECKS_SUMMARY.txt (it asserts SERVED_NATIVE=true via the real
   ShaderManager, all host PASS, tsc PASS). GO/NO-GO gate.
2. PROVE the native body is SERVED at runtime: render with ShaderManager(…,
   'fp22native') and grep mont_product_src for montgomery_product_22( and
   FP22_N0_22=418697u, and assert NO 260/correction/fixup. (run_all_checks.sh step
   [3] does exactly this with tsx.)
3. Local M-series GPU byte-identical (THE gate):
   PROFILE=$(bash ~/localclaudebox/phonetests/warm-profile.sh /tmp/fp22n-profile)
   cd ~/localclaudebox/wt-fp22n/barretenberg/ts && \
     MSM_WEBGPU_RESULTS_FILE=~/localclaudebox/phonetests/fastbench_results_5233.jsonl \
     yarn dev:msm-webgpu --host 127.0.0.1 --port 5233 --strictPort &
   drive-persist.mjs <index-url>?montmul=fp22native vs ?montmul=karat at FIXED
   ?scalar_seed=N, logn=14 AND 17 → X-coord byte-identical. The host model proves
   the math; this confirms the f32 11-bit-split path is exact under the Apple Tint
   frontend (it was host-validated with Math.fround, i.e. true FP32).
4. malioc chain16 (16 DEPENDENT): native-22 montmul vs b13 (64regs/24B/A51.25) and
   b15 (24B/37.19). Report work-regs/occupancy/SPILL/A/FMA/SFU/LS.
5. PIXEL bench (serial flock, foreground, do NOT "I'll wait"):
   bash ~/localclaudebox/phonetests/phone-bench.sh 5233 fp22native
   bash ~/localclaudebox/phonetests/phone-bench.sh 5233 karat
   cross_ok MUST be true before trusting timing; report median fp22native vs karat.
6. Native 22-bit safegcd inversion (replace the 13-bit BY divstep core):
   BATCH=44=2·22, NUM_OUTER=ceil(735/44)=17, apply_matrix base-2^22, final ×R³
   native. This removes the last 13-bit limb arithmetic from the pipeline.

## Display-blackout note
Mid/late session the harness stopped rendering tool stdout AND file Reads (returns
empty), while Writes/Edits still succeeded (confirmed by their success messages) and
sleeps returned. All results above marked "observed PASS" were seen BEFORE the
blackout. Device steps (3-5) REQUIRE reading cross_ok / byte-identical output, so
they were NOT run — reporting them blind would violate the no-unverified-results
rule. run_all_checks.sh + CHECKS_SUMMARY.txt exist on disk to make resumption a
single read.
