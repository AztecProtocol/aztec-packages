# HANDOFF: Cooperative Jacobian EC group operations (BN254 G1)

Continues the WebGPU-MSM cooperative-arithmetic work in `~/localclaudebox/wt-sgmicro`.
Read this whole doc before doing anything. The operator pushed back HARD on several
process mistakes in the prior session — section 1 is non-negotiable.

---

## 1. HARD RULES (operator, emphatic — violating these wasted a whole session)

- **Algorithms are written in PURE, HAND-WRITTEN `.wgsl`. No JavaScript/TypeScript, no
  `.mjs`, no code generators that emit `.wgsl`.** The operator deleted my JS math-validator
  and my `gen_*.mjs` shader generators in anger ("no javascript no typescript",
  "godawful typescript generator files ... FILTHY"). Do NOT write a `.mjs`/`.ts` model of
  the field/EC math. TypeScript is allowed ONLY as the bench/test harness (`coopmul.ts`:
  loads `.wgsl` via `?raw`, validates GPU output against a bigint/noble reference). That's
  it.
- **Validate every step against a reference before moving to the next.** Byte-identical vs
  noble/bigint. The operator rejects unvalidated claims and "slop".
- **Do NOT declare things impossible / "fundamental ceiling" from one attempt.** The operator
  rejected my "dead end" conclusions repeatedly (and was right twice). If you must conclude a
  dead end, back it with multiple distinct builds + a quantified mechanism, not analysis alone.
- Don't `cd`-pollute; bench via `drive-persist.mjs` (warm SRS), not `drive-index.mjs`.

## 2. Environment / how to run

- Worktree: `~/localclaudebox/wt-sgmicro`. Vite port **5251** (serves THIS worktree;
  `lsof -nP -iTCP -sTCP:LISTEN | grep 5251`). Dedicated chromium profile:
  `/Users/zac/localclaudebox/sgmicro-profile` (avoids the shared-profile chromium lock).
- Kernels + bench live in `barretenberg/ts/dev/msm-webgpu/`.
- Validate: `node dev/msm-webgpu/drive-persist.mjs 'http://127.0.0.1:5251/dev/msm-webgpu/index.html?coi=1&autorun=coopmul-validate' /Users/zac/localclaudebox/sgmicro-profile`
- Time: `...autorun=coopmul-time&variant=<v>&groups=<M>&chain_k=16384&reps=5`
  (chain_k=16384 = floor-free; M=64 = starved regime).

## 3. Cooperative montmul — DONE & COMMITTED, this is the per-product engine

Committed on branch `sgmicro-gate`: `e194d5777c` (the 4 kernels + `coopmul.ts`) and
`5bb0e401da` (the `main.ts` autorun wiring, committed alongside an unrelated microbench
harness). `solo_montmul.wgsl` = f8_native-equivalent baseline; `blocked_montmul.wgsl` =
W=1 2-stage deferred-carry (KEEP — the separable schoolbook-product + blocked-REDC that
lazy reduction needs).

**`coop4_montmul.wgsl` (W=4 quad) and `coop2_montmul.wgsl` (W=2 lane-pair)** are the
engines. Both combine two ideas (this is the substance — read the kernel headers):
- **Yuval reduction** on 19 of 20 CIOS steps: reduce by `x0*r_inv` (`r_inv = 2^-13 mod q`,
  baked per-lane as `rl`) instead of the Montgomery quotient — drops the per-iteration
  `N0*(t&MASK)` quotient mul off the serial path; the low-limb carry is a shift `t>>13`.
  The LAST step is the regular quotient reduce, to cap Yuval's ~1-limb value growth
  (result < 4q). The top lane folds `r_inv[19]` into `s18` so **`s19` stays uniformly 0**
  (like f8_native — serial paths ignore it; do NOT reintroduce a live `s19`).
- **Split-carry skew normalise**: leftover cross-lane carries are split `lo(13b)/hi` and
  pushed one limb up in ONE shuffle, no re-cascade (coop4 collapses what was 3 sequential
  cross-lane rounds into 1). Output is **1-bit-redundant: every limb ≤ 2^14, value in
  [0, 2p), NOT canonical** — and is itself a valid montmul input. So chained montmuls need
  NO canonicalisation between them. **THIS closure is what the EC lazy reduction (§6) builds
  on** — both operands of an EC-op montmul are prior skewed outputs, validated safe.

**Validated** byte-exact vs a bigint Montgomery reference (`coopmul.ts`): solo/coop2/coop4/
blocked 128/128 at K=1,3; a K=257 one-operand chain; a K=129 BOTH-operand squaring chain
(the EC case — limbs provably stay ≤2^14). Run: `drive-persist.mjs '...autorun=coopmul-validate'`.

**Perf (M-series, vs solo = f8_native):**
- Starved (M=64, threads idle — the EC *narrow* DAG-level case): coop2 **1.55×**, coop4 **1.99×**.
- Saturated per-thread cost (≈65536 threads, GPU full — the EC *wide*-level case): coop2
  **1.05× slower**, coop4 **1.17× slower**. Cooperation is nearly free per-thread, so use
  coopN at any DAG level that would otherwise leave threads idle (§7).

**DEAD ENDS — do NOT re-attempt** (memory: `coop-montmul-2stage-deadend.md`): cooperative
blocked / fused-blocked-CIOS / replicate-multiplier montmul (built 3 ways, ALL = solo speed).

Pattern: coop2 = subgroup lane-PAIR (`role=sgid&1`, partner via `subgroupShuffleXor(.,1u)`,
10/9 split); coop4 = quad (`quad_bcast` = 2 butterfly shuffles, 5/5/5/5 split). ZERO control
divergence — role differences are `select(...)` only.

**NEXT AGENT: the montmul prerequisite is done. Start at §4 (the EC group ops), using
coop4/coop2 as the per-product engine and the skewed-[0,2p) output as the lazy-reduction
representation.**

## 4. THE TASK

Build **cooperative Jacobian EC group ops** (unconditional — no x1==x2 / collision checks; the
operator guarantees no collisions): **add (J+J→J), mixed-add (J+affine→J), double (J→J)** for
BN254 G1 (short Weierstrass, **a=0**, b=3). Two optimizations the operator wants:
1. **Deferred/lazy modular reduction** over sequences of product-sums ("slothful reduction",
   M. Scott, ePrint 2017/437; also "Casting out Primes" 2022/1470).
2. **Independent products** scheduled across threads (DAG-level parallelism).
Built ON TOP of the coop montmul (≥2 threads per product), holistically allocating threads.
**Scope now: T=2 and T=4. T=8 dropped for now** (would need coop8; revisit later).

There are currently NO Jacobian EC ops in the codebase — only affine batch-adds in
`cuzk/ba_*`. These are new.

## 5. Chosen EFD formulas (a=0) — verbatim, transcribe carefully

Page: https://www.hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html

**double = `dbl-2009-alnr` (1M+7S)** — width-3 DAG; Z3 is a lazy product-sum:
```
A=X1^2  B=Y1^2  ZZ=Z1^2  C=B^2
D=2*((X1+B)^2-A-C)   E=3*A   F=E^2
X3=F-2*D
Y3=E*(D-X3)-8*C
Z3=(Y1+Z1)^2-B-ZZ
```
(alternative `dbl-2009-l` 2M+5S: same but Z3=2*Y1*Z1, no ZZ.)

**add = `add-2001-b` (12M+4S)** — MOST lazy-amenable (explicit diffs-of-products at the
intermediate level); width-4 DAG:
```
ZZ1=Z1^2  ZZZ1=Z1*ZZ1  ZZ2=Z2^2  ZZZ2=Z2*ZZ2
A=X1*ZZ2  B=X2*ZZ1-A          # B = X2*ZZ1 - X1*ZZ2  (diff of 2 products)
c=Y1*ZZZ2 d=Y2*ZZZ1-c         # d = Y2*ZZZ1 - Y1*ZZZ2 (diff of 2 products)
e=B^2  f=B*e  g=A*e  h=Z1*Z2
f2g=2*g+f
X3=d^2-f2g                    # = d^2 - 2g - f
Z3=B*h
Y3=d*(g-X3)-c*f
```
(alternative `add-2007-bl` 11M+5S: H/I/J/V chain, X3=r^2-J-2V, Y3=r(V-X3)-2*S1*J,
Z3=((Z1+Z2)^2-Z1Z1-Z2Z2)*H — simpler, width-4, fewer lazy sites.)

**mixed-add = `madd-2007-bl` (7M+4S)** — Z2=1; width-3 DAG:
```
Z1Z1=Z1^2  U2=X2*Z1Z1  S2=Y2*Z1*Z1Z1
H=U2-X1  HH=H^2  I=4*HH  J=H*I  r=2*(S2-Y1)  V=X1*I
X3=r^2-J-2*V
Y3=r*(V-X3)-2*Y1*J
Z3=(Z1+H)^2-Z1Z1-HH
```

## 6. Lazy reduction — the rule + the LOAD-BEARING constraint

- Keep each product UN-REDUCED in the R² domain: a 40×13-bit (~520-bit) schoolbook product,
  NO Montgomery REDC. R²-domain products are additive, so a whole coordinate sum-of-products
  accumulates in 40 limbs and you REDC **once**.
- Headroom (R=2^260, p≈2^254): REDC valid for T < p·R = 2^514; each product < (2p)² < 2^510;
  so ~16 products can accumulate before reduction. Every EC coord has ≤4 → fits trivially.
  Subtractions: add a `c·p·R` bias before REDC to stay non-negative (work out c per coord).
- **CONSTRAINT:** any value feeding a MULTIPLY must be back in 20-limb R-domain form first
  (i.e. the 40-limb R² lazy accumulation must be REDC'd). It does NOT need to be canonically
  reduced to [0, p): a montmul leaves its result in **[0, 2p)** with no conditional subtract,
  and a value in [0, 2p) — including the 1-bit-redundant limb-skewed form (every limb ≤ 2^14,
  i.e. coop4skew's split-carry output) — is a valid multiply input. Validated: the coop4skew
  chain at K=257 stays byte-exact vs the canonical reference, so the skewed ≤2^14 limbs never
  overflow the next montmul's u32 accumulator (worst-case peak ≈ 2.3e9 < 2^32). The montmul
  also keeps the value < 2p < R, so the top limb (s19) carry is always 0 — no wrap handling.
  So ONLY products that feed sums-only can defer the REDC. Dual-use products (feed both a sum
  and a mul) get REDC'd anyway. Net win ≈ 3–5 reductions/op: the output coords X3,Y3,Z3 (always
  product-sums → 1 REDC each) + genuinely single-use intermediates (dbl's `C=B²` feeds only
  D and Y3; madd's `J,V` feed only X3,Y3; add-2001-b's `e,f` and the `B`,`d` diffs where the
  products are single-use). Identify per-formula which products are sums-only.
- PRIMITIVES TO REUSE (don't reinvent): `blocked_montmul.wgsl` stage-1 = schoolbook 20×20→40
  product (un-reduced); stage-2 = deferred-carry blocked REDC 40→20. Also
  `montgomery_product_f32_unreduced` (in `src/.../montgomery/mont_pro_product_f32_22_sos3uv3.template.wgsl`),
  `conditional_reduce`, `get_p`, `fr_add`, `fr_sub`, `fr_reduce` (in `src/.../field/`,
  `src/.../montgomery/`). Field rep = 20×13-bit (f8 native, the production montmul). N0=905,
  Np4=[905,1075,185,1039], P limbs [7495,999,1462,280,5058,1350,455,4653,362,3260,5655,770,
  7016,2082,1761,5125,305,5015,6419,96].

## 7. Holistic thread allocation: T = (independent products) × (threads/product)

The two parallelism axes MULTIPLY. Allocation rule: at each DAG level of width P with T
threads, fill all T → give each product k=T/P cooperating lanes (coop montmul). Wide level →
k≈1 (solo/coop2, high efficiency, threads already busy). NARROW level (P<T) → high-k coop —
the idle threads pile onto each product. The width-1 critical-path squarings (`r²`,`F=E²`,
`d²`) are exactly where all T threads should cooperate instead of T-1 sitting idle. THIS is
where the coop montmul earns its keep inside the EC op.

Modeled wall (add-2001-b, widths [3,4,3,2,1,3], solo-montmul units, lower=faster):
| T | allocation sketch | total | speedup | vs DAG-parallel-only |
|---|---|---|---|---|
| 1 | solo everything | 16.0 | 1.0× | — |
| 2 | solo pairs; width-1 → coop2 | ~9.7 | 1.65× | ≈ same |
| 4 | width-2 → coop2×2; width-1 → coop4 | ~5.3 | 3.0× | +12% (vs 2.67×) |

The coop-montmul layer's gain GROWS with T (more idle threads at narrow levels to recover).
dbl ([3,3,1]) and madd ([1,2,3,2,1,3]) have many width-1 levels → especially coop-hungry.
Implementation: invoke coop2/coop4 as sub-routines per DAG level with CONTIGUOUS lane
sub-group partitioning; sync between levels (SIMT lockstep within a subgroup; sub-group
reconfiguration = different shuffle masks per level). No control divergence (select-based).

## 8. BUILD SEQUENCE (validate each step before the next)

1. **W=1 ops** `ec_dbl.wgsl`/`ec_add.wgsl`/`ec_madd.wgsl` in `dev/msm-webgpu/`, full montmul
   (reuse blocked or f8), straight transcription of the section-5 formulas. Build an EC
   validation harness (TS, like `coopmul.ts`): feed random Jacobian points, compute reference
   via noble (`@noble/curves` bn254) — convert noble affine→Jacobian, run GPU op, compare
   projectively (X3/Z3², Y3/Z3³) since Jacobian reps aren't unique. Validate byte/point-identical.
2. **Lazy reduction**: replace each coordinate's sum-of-products with un-reduced-product
   accumulate (R², 40-limb) + one REDC, per section 6. Keep single-use products un-reduced.
   Re-validate. (This is the operator's optimization #1.)
3. **Holistic coop** (T=4 first, then revisit): partition the T threads per DAG level into the
   level's independent products, each computed by a coop2/coop4 sub-routine; sync between
   levels. Validate + time vs the W=1 op. (Optimization #2 + building on coop montmul.)

## 9. Open questions / decisions deferred
- T=8 dropped now; if revisited, BUILD+MEASURE coop8 in the EC context (montmuls there are
  NOT chained, unlike the chain benchmark where coop8 plateaued — may behave better).
- add-2001-b vs add-2007-bl: 2001-b has 4 lazy sites but several are dual-use; 2007-bl is
  simpler. Pick during step 2 based on actual reduction count.
- Exact subtraction bias (c·p·R) per coordinate for the lazy sums — derive when implementing.
- Whether to reuse the f8/blocked montmul or write a dedicated EC-tuned field-mul.

## 10. Reference: bench wiring
`coopmul.ts` exports `runCoopValidate()` + `runMontmulTiming()`; `main.ts` autoruns
`coopmul-validate` / `coopmul-time`. Add EC autoruns analogously (`ec-validate`, `ec-time`).
`drive-persist.mjs` waits for `state=done|error` in the `#log` element.
