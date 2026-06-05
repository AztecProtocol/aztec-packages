# Cooperative RNS modular arithmetic for the WebGPU MSM — design proposal

Status: research + proposal, numerically validated. Cooperative t=16/w=16 montmul now
**M4-measured ~4× faster than f8 in the thread-starved regime** (§9.1); EC-add lever and
Mali/Adreno phone measurement still open.
Branch: `rns`. Author-of-record: zac-williamson.

---

## 0. TL;DR (the one thing to take away)

The lever is **not** "cooperative Montgomery multiplication" — that is the documented
dead-end (`feedback_no_cooperative_webgpu_montmul`, `coop-montmul-2stage-deadend`):
splitting one schoolbook/CIOS multiply across lanes loses Karatsuba **and** serializes
on inter-lane **carries**, giving a flat 1.9× loss on register-rich GPUs.

The lever is **RNS-native EC point-addition**. In a Residue Number System there are
**no carries between residues**, so the arithmetic spreads across lanes with *zero*
redundant work, and — the real prize — RNS lets you **multiply without reducing** and
amortize the modular reduction across the whole point-addition formula. The newest SOTA
(VROOM, Langowski–He–Devadas, eprint **2026/393**) measures this at **3.34× over `blst`'s
hand-assembly for a G1 point-add, 2.59× mixed-add, 1.60× double** — single-core CPU,
*throughput*, on the base field F_q (exactly the BN254 MSM case). That win is a property
of the **algorithm**, not the hardware.

Two mappings, picked by register budget:

| Target | Mapping | t, w | Cross-lane | Win condition |
|---|---|---|---|---|
| **M-series** (register-rich) | per-thread (SIMD-in-thread) | t=20, w=13 | **none** | residues fit in registers (2.25× CIOS) |
| **Mali/Adreno** (register-bound) | cooperative (1–2 residues/lane) | t=16, w=16 | subgroup shuffles | spreads residues → no spill; shuffle tax < reduction-amortization win |

The cooperative mapping is what makes the algorithmic win *reachable* on mobile, where a
per-thread big-int EC-add spills. Unlike coop-CIOS, cooperative-RNS keeps the ~3×
algorithmic advantage and pays only a **shuffle tax** (no work is duplicated by spreading).

**Validated already (this session, `/tmp/rns_*.py`, BN254 F_q oracle):**
both parameter sets compute `a·b·M⁻¹ mod p` correctly over random inputs; the GPU-faithful
Cox/Kawamura approximate base-extension is 20000/20000 correct at t=16/w=16.

---

## 0.1 Authoring discipline (hard constraint)

**JS/TS computes and validates DATA; it never authors LOGIC.** No TypeScript-generated
shader bodies — no `gen_*` string-concat, no regex transforms, no `.template.wgsl` Mustache
for the kernel logic. This is the `feedback-msm-webgpu-legible-wgsl` rule, made non-negotiable
for this work. The split is clean for RNS because the only per-prime variation is *numbers*:

- **Kernel logic → hand-written pure `.wgsl`**, loaded via vite `?raw` (the wt-sgmicro
  pattern; no inliner, no Mustache). Reviewable line by line. The CRNS step reads as an
  honest loop: `r_j = (Σ_i ξ_i·A[i][j]) + k·c[j]  mod n_j`. The 400-entry matvec is **one
  loop over a data array**, never 400 emitted statements.
- **Constants → committed `rns_constants.wgsl`**, a flat list of `const array<u32,N>(…)` —
  reviewed *as data* (like checked-in test vectors), diffable, and **proven** by a committed
  `rns_params.test.mjs` that recomputes them and asserts byte-equality + the full
  RNS-Montgomery/Cox correctness against the WASM/noble oracle. The WGSL compiler folds the
  `const array` to immediate operands when the matvec is unrolled — so this is also the
  *fastest* option, matching f8_native's baked-in immediates without f8_native's generator.
- **`rns_params.mjs`** (the only JS) does three things and nothing else: pick the basis,
  compute the constants, write+verify `rns_constants.wgsl`. It emits **data**, never a kernel.

The auditable package a reviewer reads: (hand-written `.wgsl` logic) + (committed numeric
`rns_constants.wgsl`) + (committed test that proves the numbers). No mental execution of a
generator is ever required to understand what runs on the GPU.

---

## 1. Why this is genuinely different from the cooperative-montmul dead-end

The memories that (correctly) close cooperative Montgomery multiplication:

- `feedback_no_cooperative_webgpu_montmul`: W-lane CIOS is 1.9× slower on M4 because
  (1) a subgroup does sg/W multiplies instead of sg, (2) lost Karatsuba (~1.78× more ALU),
  (3) Yuval's inner-j writes need a per-outer-iter cross-lane carry resolution.
- `coop-montmul-2stage-deadend`: the 2-stage/blocked variant's bulk is *off* the critical
  path, so splitting it doesn't shorten the spine.

Every one of those failure modes is about **splitting a single positional (carry-coupled)
multiply**. RNS is a different number representation:

| Failure mode (coop-CIOS) | RNS status |
|---|---|
| Lost Karatsuba | **void** — RNS multiply is elementwise; nothing to lose |
| Per-iter inter-lane **carry** resolution | **void** — residues are independent, no carries between them |
| sg/W fewer multiplies for same per-lane work | **void** — per-lane work drops by ~t too; subgroup throughput governed by *total work*, which RNS does **not** inflate (no redundant cross-lane work except the CRNS matvec, the `t²` term that is the algorithm's only quadratic cost) |
| Bulk off critical path | **void** — the only cross-lane step (CRNS base change) *is* the on-path reduction |

So the standing "never propose cooperative montmul on M4" memory does **not** apply here,
for two independent reasons: (a) this proposal's M-series mapping is **not cooperative**
(it's a better *per-thread* algorithm — no subgroup ops at all), and (b) the cooperative
mapping is for the *register-bound mobile* regime that the memory itself explicitly
carves out as open. I am not re-litigating coop-CIOS; this is a different representation
with a different cost structure, and the pitch is the **EC-add**, not the isolated multiply.

---

## 2. State of the art (the research deliverable)

RNS Montgomery has a 30-year lineage; the bleeding edge for *commodity SIMD/GPU* (not
ASIC/FPGA) is the MIT line, and the current frontier is **VROOM (2026)**.

**Foundations**
- **Posch & Posch 1995** [Modulo reduction in RNS] — the two-base RNS Montgomery and the
  base-change (CRNS) primitive everything else builds on.
- **Kawamura, Koike, Sano, Shimbo 2000** — the **Cox–Rower** architecture: the
  *approximate* base extension via a fixed-point "rank" estimate (the `k = ⌊Σ ξ_i/m_i⌋`
  Cox unit). This is the base-extension every fast software/GPU implementation uses
  (exact CRT would require reconstructing the full integer — the very thing RNS avoids).
- **Bajard–Imbert, Shenoy–Kumaresan, Bajard–Plantard** — base-extension variants
  (extra-modulus exact, redundant-modulus, conversions).

**Commodity-SIMD frontier (the relevant line)**
- **Langowski & Devadas, eprint 2025/1068** ("Efficient Modular Multiplication Using
  Vector Instructions") — *the PDF in this directory.* Unifies prior CRNS variants;
  **Opt Mont** reduces to 2 CRNS + 3 elementwise (2t²+16t mults). Maps to AVX512-IFMA
  (~4× over FLINT at ≥960 bits) **and to a single GPU vector core**: one residue per thread,
  CRNS = broadcast rounds, "overparallelization" (TPI=2t) to halve the matvec critical path.
  Beats CGBN (NVIDIA's cooperative big-num) by up to 4×. **This is the GPU mapping blueprint.**
- **VROOM — Langowski, He & Devadas, eprint 2026/393** — *the successor; the current SOTA.*
  Three things that matter for us (detail in §4–§5):
  1. **Algorithm 2: 2t²+13t mults** — fewer than Opt Mont, by *absorbing every constant
     multiply (p, M⁻¹, −p⁻¹) into the CRNS matrix*. A full modmul = **1 elementwise product
     + 2 CRNS**, nothing else.
  2. **The sum-of-products / lazy-reduction framework**: a sum of k products costs
     `t²+(12.5+k)t` in RNS vs `(k+1)t²` schoolbook — reductions amortize. Applied to
     **EC point-addition in projective + unified (Renes) coordinates**: G1-add **3.34×**,
     mixed-add **2.59×**, double **1.60×** over `blst` (Table 13). *This is the MSM lever.*
  3. A **compile-time Bounds⟨lo,hi⟩ framework** proving no RNS overflow under **adversarial**
     inputs (random testing cannot catch RNS overflow — §10; speaks directly to the
     "PRODUCTION DATA IS STRUCTURED" hard rule).

**GPU RNS-ECC prior art (context, weaker than the above)**
- **Antão, Bajard, Sousa 2012** — RNS EC point-mul on GPU; assigns threads to moduli.
  First of its kind, pre-dates modern subgroup ops.
- **Ji et al., MICRO 2024** — compiler-like framework for big-int mult on GPUs; **1.42×
  over CGBN**, but *conventional Montgomery* (not RNS).
- **gECC, ACM TACO 2025** — batched EC on GPU; conventional Montgomery.
- VROOM §7 on GPUs: "GPUs suffer from high communication overhead, which adds significant
  latency" — i.e. the open problem on GPU is *exactly the cross-lane CRNS cost* this
  proposal engineers around with subgroup shuffles. **No one has published a WebGPU
  subgroup-cooperative RNS EC-add.** This is novel ground.

**Bottom line:** VROOM is the algorithm; 2025/1068 is the GPU mapping; the WebGPU-subgroup
realization with the rotation/butterfly CRNS and the w=16/Mali-16 alignment (§6–§7) is ours.

Sources: eprint 2025/1068 (local PDF), eprint 2026/393, Kawamura 2000, Posch&Posch 1995,
Antão 2012, Ji et al. MICRO 2024, gECC TACO 2025.

---

## 3. The number representation

BN254 base field `p = 0x30644e72…cfd47` (254-bit, F_q — point coordinates; the existing
`montgomery_product_f8` operates here).

Pick **two** coprime bases, each a product of t word-size moduli:
`M = ∏ m_i`, `N = ∏ n_j`, `gcd(M,N)=gcd(M,p)=gcd(N,p)=1`, moduli pseudo-Mersenne `2^w − z`.

A field element `x` lives **simultaneously in both bases** as the concatenated
`RNS_MN(x) = (x mod m_0 … x mod m_{t-1} ‖ x mod n_0 … x mod n_{t-1})`. In the *cooperative*
mapping each **lane owns one modulus index i** and holds `(x mod m_i, x mod n_i)` — ~2
small words. That is the structural register relief: a 254-bit number is shredded across
t lanes, each holding 1/t of it, **with no carry coupling**.

VROOM's Montgomery form additionally folds `M⁻¹` into the N-residues
(`a'_N = a_N·M⁻¹`), so the post-multiply by `M⁻¹` is free — see §4.

---

## 4. Core modmul: VROOM Algorithm 2 (the inner primitive)

```
Require: a, b in RNS_MN form, redundant Bounds⟨0,3p⟩;  M>9p, N>6p
  1. q_M  = a_M ⊙ b_M               (mod m_i)      -- elementwise, base M, t muls
  2. r_N  = a_N ⊙ b_N  +  CRNS^{M·(-p⁻¹)}_{N·(p·M⁻²)}( q_M )   (mod n_j)
  3. r_M  = CRNS^{N·M}_{M·1}( r_N )
  return RNS_MN(r_M, r_N)
```

- `⊙` is elementwise modular multiply — **embarrassingly parallel, no cross-lane traffic.**
- `CRNS^{M·y}_{N·z}(x) = (Σ_i ξ_i·A_{i,j}) + k·c_j  (mod n_j)` is the **base change** M→N with
  pre-mult by y and post-mult by z **baked into the constant matrix `A` and vector `c`**.
  This is the only cross-lane step. It is the Cox/Kawamura approximate extension:
  - `ξ_i = x_i · (M/m_i)⁻¹ mod m_i`   (CRT digit — folded into the representation)
  - `A_{i,j} = ((ICRT_i · y) mod M)·z mod n_j`,  `ICRT_i = (M/m_i)·((M/m_i)⁻¹ mod m_i)`
  - `f_i = ⌈2^u · ((ICRT_i·y) mod M)/M⌉`,  `c_j = (−M·z) mod n_j`   (VROOM Table 5)
  - **rank** `k = ⌊(Σ_i ξ_i·f_i) / 2^u⌋`, fixed-point precision `u = w + ⌈log₂ t⌉`.
- Cost (VROOM Table 6): U + 3M + 2R + 2C = **2t²+13t** single-word mults. The `2C = 2(t²+4t)`
  is the two matvecs — the whole quadratic cost, and the only cross-lane work.

**Validated:** `/tmp/rns_final.py` confirms steps 1–3 produce `a·b·M⁻¹ mod p` for random
a,b at both parameter sets; `/tmp/rns_cox.py` confirms the *approximate* rank-`k` extension
(the on-device path, not exact CRT) is correct 20000/20000 at t=16/w=16, u=16.

**Correctness landmine (cost me a wrong first reference, worth a code comment):** `s = a·b`
is computed **elementwise in BOTH bases** (`s_N = a_N⊙b_N`). You must **never** reconstruct
`a·b` from base-M residues — `a·b < p²` exceeds M, so `(a·b) mod M` loses information.
This is the whole reason two bases exist.

---

## 5. The MSM lever: RNS-native EC point-addition (where the throughput win lives)

A montmul in isolation is `2t²+13t` vs schoolbook `2t²+2t` — RNS is *worse* per multiply
(the `13t` linear term). **Do not deploy isolated RNS montmul** — that reproduces the
coop-montmul throughput loss.

The win is the **sum of products**. RNS computes `a·b + c·d + …` (k products) in
`t²+(12.5+k)t` because it does all products elementwise (linear) and **reduces once**, vs
schoolbook `(k+1)t²` (reduce every product). EC point-addition is *built* from
sums-of-products. So:

1. Use **projective** coordinates and **strongly-unified** (Renes-Costello-Batina) add
   formulas — add == double, no special-casing (RNS comparisons are expensive). This also
   kills the off-curve-association hazard noted in `msm-bench-pairtree-offcurve-association`
   because there is no branchy special case.
2. Express each output coordinate as one fused RNS sum-of-products and **reduce only ~9
   times for the whole G1-add** (VROOM: G1-add 9 reductions, mixed-add 8, double 7) —
   instead of a CIOS reduction *inside every one of the ~16 multiplies*.
3. **Keep the bucket accumulator point in RNS_MN form across the entire walker.** No
   convert-in / convert-out per add. Convert to affine/radix **once** at the very end
   (VROOM Appendix F; pairs with `msm-webgpu-cpu-reduce-tail` — the CPU tail can do the
   final RNS→radix + inversion).

Net: VROOM measures **3.34× (add) / 2.59× (mixed) / 1.60× (double)** fewer field-arith ops
than `blst` for the *whole* EC operation. That is the number that would move the
montmul-bound 21 ms `stream_walker`, the 6 ms reduce, and the variable `walker_combine` —
**not** a montmul microbench. (GPU realization ≠ CPU; treat 3.34× as the ceiling and
measure — §11. Doubling's 1.60× is the conservative anchor for the walker's add-chains.)

> Caveat to state plainly: G1 is the base field F_q (no extension field), so we get the
> *EC-formula* amortization (Table 13), **not** the larger F_q^k field-extension
> amortization (Table 1, up to 2.75×) that drives VROOM's pairing numbers. The MSM is a
> pure-F_q workload; 1.6–3.3× per EC-op is the relevant, measured band.

---

## 6. The two GPU mappings

### 6a. M-series (register-rich): per-thread SIMD-in-thread RNS — **no subgroup ops**

Each GPU thread holds the whole point in RNS_MN and does the whole EC-add itself; the CRNS
matvec is a **local `t×t` loop** reading the constant matrix from a `uniform`/`storage`
buffer (cached). **Zero shuffles, zero subgroup dependency.** This is just a *better
per-thread EC-add algorithm* — it sidesteps the coop-montmul memory entirely.

- **t=20, w=13** — reuses the proven 13-bit single-`u32`-product arithmetic from
  `mont_pro_product_f8_native` (13-bit limbs keep every product < 2³², no `mulhi`/`mulhi`
  emulation). Validated: M/p = **76.5**, N/p = **56.9**, both > VROOM's 9p/6p ⇒
  **fully-redundant form, zero conditional corrections** (the expensive part in RNS).
- Register question: an RNS point is ~2.25× the residue storage of a CIOS point (2 bases).
  M-series has the budget (~255 regs/thread headroom per the 2025/1068 GPU note), but
  whether the EC-add's accumulators spill at 2.25× **must be measured, not asserted**
  (this is exactly the failure mode the handoff warns about — register pressure invalidates
  static reasoning). Mitigation: pack 2×13-bit residues per u32; mixed-add (one affine
  operand) cuts a coordinate.
- If it fits: the 1.6–3.3× reduction-amortization is a **direct throughput win on M2/M4**,
  no cooperation, no subgroup tax. If it spills: fall to 6b.

### 6b. Mali / Adreno (register-bound): cooperative across-lane RNS

t lanes cooperate on one EC-add, **1–2 residues per lane** → the 254-bit number never
materializes in any single thread → **structural fix for the spill** that
`adreno-walker-spill-was-montmul-bigint-roundtrips` identifies as the killer (382→124 ms
came from de-spilling montmul; this removes the big-int from registers entirely).

- **t=16, w=16** — `2¹⁶−z` moduli; 16×16→32-bit products fit `u32` (the WebGPU 16-bit-limb
  ceiling the gnark/HackMD note also lands on). t=16 **divides Mali's 16-wide subgroup
  exactly** (1 EC-add per subgroup = max relief) and Apple's 32 (2/subgroup) and Adreno's
  64 (4/subgroup). M/p = 5.2 ⇒ moderately-redundant; needs a conditional correction at
  reduction (VROOM §5.1.1, branchless via `select`/min) — acceptable, and the only place
  t=16 is tighter than the M-series t=20.
- The elementwise steps (all the EC-formula multiplies) are **fully local** — every lane
  busy, no traffic. Only the ~9 CRNS reductions cross lanes (§7).
- This is the regime the operator reopened cooperative work for, and the structural reason
  it wins here where coop-CIOS lost: **spreading RNS residues duplicates no work** (no
  Karatsuba loss, no carries), so cooperative-RNS keeps the ~3× algorithmic EC-add win
  minus only the shuffle tax — vs coop-CIOS which *lost* the algorithmic efficiency and
  *then* paid shuffles.

---

## 7. The cross-lane CRNS primitive (the engineering crux on mobile)

`CRNS` output residue `r_j = Σ_i ξ_i·A_{i,j} + k·c_j (mod n_j)`. Lane j needs **all** ξ_i.
Two schemes, picked by register budget — **both Mali-safe** per
`feedback_no_cooperative_webgpu_montmul`'s W=4 lesson (use only `subgroupShuffleXor` with a
**uniform** mask and `subgroupShuffleDown/Up` with a **fixed** delta; **never**
`subgroupShuffle(arbitrary index)` — Mali emulates it as a ~6× gather):

1. **Ring rotation (Mali-primary, register-lean):** rotate ξ around the t lanes with
   `subgroupShuffleDown(·,1)`; each step every lane does one `madd` with the matching
   constant `A` (read from a per-lane constant array indexed by rotation step). Carries
   **one residue + one wide accumulator**. Cost: **t shuffles + t madds** per CRNS. For the
   rank `k`, accumulate `Σ ξ_i·f_i` in the same rotation. Best when registers are the
   binding constraint.
2. **Butterfly all-gather (Apple/register-rich):** `⌈log₂ t⌉` stages of
   `subgroupShuffleXor(mask=1,2,4,…)` leave every lane holding the full ξ vector
   (within-block since masks < block size and blocks are aligned); then a fully-local
   `t`-term matvec. Cost: **log₂t shuffles** but a transient `t`-residue register spike.
   For t=16: **4 shuffles** vs rotation's 16. The rank `k` falls out of the same gather.

The rank `k` all-reduce is the same `log₂t` butterfly and lands `k` replicated in every
lane (no separate broadcast). **Per EC-add: ~9 reductions × 2 CRNS = ~18 CRNS.** That is
the shuffle budget to beat — the entire bet is **(18 CRNS of shuffles) < (the reduction
work CIOS does that RNS skips)**. The shuffle-vs-IMAD cost is already measured in
`wt-sgmicro`: Mali `s_bcast≈1.84`, `s_shuffle≈1.3`; Apple `≈0.75/0.98` — all well under the
crossover. Reuse that harness to pin the per-CRNS cost before committing.

---

## 8. Concrete, validated parameters (drop-in)

**M-series, t=20, w=13** (base M moduli as `2¹³ − z`, validated coprime & correct):
```
z_M = [1,2,3,13,19,21,25,31,33,39,43,45,49,55,61,69,73,75,81,91]
m_i = 8191,8190,8189,8179,8173,8171,8167,8161,8159,8153,8149,8147,8143,8137,8131,8123,8119,8117,8111,8101
N: next 20 coprime 2¹³−z after M.  M/p=76.5  N/p=56.9  (M>9p, N>6p ✓ fully-redundant)
u (rank precision) = w + ⌈log₂ t⌉ = 13 + 5 = 18 bits
```
**Mali, t=16, w=16** (`2¹⁶ − z`, validated coprime, correct on exact *and* Cox extension):
```
z_M = [1,2,3,5,15,17,27,39,45,47,53,57,59,63,77,83]
z_N = [87,89,99,105,113,117,123,125,129,143,147,155,165,167,173,179]
M/p=5.24  N/p=5.12  (moderately redundant; one branchless conditional correction/reduce)
u = 16 + 4 = 20 bits
```
Constants per base (precompute once, host-side, emit as WGSL `const` arrays / storage
buffers): `M/m_i`, `(M/m_i)⁻¹ mod m_i`, `ICRT_i`, the CRNS matrices `A^{M→N}`, `A^{N→M}`
(with p, −p⁻¹, M⁻¹ absorbed), the rank weights `f_i`, the correction vectors `c_j`. Sample
verified value: `ICRT_0 mod {n_0..n_3} = [3950,4672,3965,664]` for the t=20 base.

The constants are computed + verified by `dev/msm-webgpu/rns_params.mjs` (promoted from
`/tmp/rns_*.py`), which writes the committed **data** file `rns_constants.wgsl` (flat
`const array<u32,N>(…)`). All kernel logic that consumes them is hand-written `.wgsl` (§0.1).

---

## 9. Honest performance model & regime predictions

Per-EC-op field-arith, RNS vs CIOS (work, not wall):

| | isolated montmul | G1 double | G1 mixed-add | G1 add |
|---|---|---|---|---|
| RNS / schoolbook (VROOM) | 2t²+13t / 2t²+2t (**worse**) | **0.63×** (1.60×) | **0.39×** (2.59×) | **0.30×** (3.34×) |

- **M-series, per-thread (6a):** if residues fit → expect a **net throughput gain on
  add-heavy chains** (walker, combine), bounded below by the 1.60× double and above by the
  3.34× add; **no** subgroup tax. Risk = spill at 2.25× residue storage → measure first.
- **Mali/Adreno, cooperative (6b):** algorithmic win (as above) **minus the shuffle tax**
  (~18 CRNS × shuffle-cost) **plus** the elimination of spill traffic (the dominant mobile
  cost today). Predicted **net win in the very regime coop-CIOS lost**, because no work is
  duplicated by spreading. Saturated-desktop cooperative will still lose to per-thread
  (sg/t fewer ops/subgroup) → **deploy 6a on desktop, 6b on mobile**, size-adaptively, the
  same crossover discipline as `feedback_no_cooperative_webgpu_montmul`.
- **Isolated montmul microbench will look bad** (`2t²+13t`). That is expected and is *not*
  the deploy target — bench the **EC-add / the walker**, never the montmul alone. (Stating
  this loudly because it's the exact trap that would make this look like coop-montmul redux.)

**MEASURED (2026-06-04, Apple M4 Pro / Metal-3, dependent chain, K=262144, both
byte-identical to their oracles on-device):** production **f8 CIOS = 1.05 ns/mul**;
per-thread **RNS isolated modmul = 3.53 ns/mul → 3.34× slower**. This is the predicted
worst case (full 2-CRNS reduction per single multiply) and the mirror image of VROOM's
3.34× *faster* G1-add — the reduction cost is real and must be amortized at the EC-add
level to win. Harness: `dev/msm-webgpu/{rns_params,rns_gpu_test,modmul_bench}.mjs`.
**Decisive open measurement: the RNS EC point-add with lazy reduction** (≈9 reductions
shared across ≈16 multiplies) vs an f8-based EC-add — that is the real go/no-go, not this.

### 9.1 MEASURED: cooperative t=16/w=16 montmul, THREAD-STARVED regime (2026-06-04, M4 Pro)

The isolated-montmul-looks-bad caveat above is a *saturated-throughput* statement. In the
**thread-starved** regime — the MSM bucket-reduction tail, where only a handful of modmuls
are live and a solo-thread kernel leaves the GPU almost idle — the cooperative mapping wins
outright, because it spends **16× the threads** on the same work and fills the machine. The
kernel (`src/msm_webgpu/wgsl/rns/rns_field_coop16.wgsl`, 16 lanes/modmul, an Apple subgroup
runs two) measures, cooled, min-over-60, dependent chain, byte-identical to the oracle:

| M (live modmuls) | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 |
|---|---|---|---|---|---|---|---|---|
| coop16 / f8 | 0.26× | 0.26× | **0.25×** | **0.25×** | 0.26× | 0.34× | 0.57× | 1.00× |

So **~4× faster than production f8 CIOS for M ≤ 128**, crossing over (losing to f8) only
near M≈1024 — i.e. once f8 itself saturates the GPU. Deploy size-adaptively: coop16 in the
starved tail, f8/per-thread when saturated.

Optimization passes that landed (each measured on M4 Pro, byte-identical, vs the prior best):

1. **Select-free butterfly all-gather** — replace the dynamic-index `subgroupShuffle(dig,gb+j)`
   (slow even on Apple, contrary to my prior assumption) with 15 fixed-mask `subgroupShuffleXor`
   leaving lane r holding `g[k]=digit(r^k)`; the XOR permutation is **baked into committed
   constants** (`CRNS_*_PERM`), so zero reorder selects. 0.55→0.30× at M=128.
2. **Cooperative rank** — the CRT rank `k=Σ digit_j·W_j` is one scalar shared by all lanes; a
   4-deep `subgroupShuffleXor` butterfly-reduce of `digit·W_self` (1 mul/lane) replaces the
   16-mul-per-lane dot product computed redundantly on every lane. Pushed the crossover 320→900.
3. **Fold-p ext1** — fold `(P mod n)` into ext1's matrix/correction so it emits `qp=qN·p`
   directly, deleting the `qp=montred(qN·P_MOD_N_R)` reduce from the spine. 0.27→0.25×.
4. **red17 = 1 conditional subtract, no fold** — `qp+sN < 2n`, proven analytically.

Reduction counts are proven **minimal & canonical** (sound foldUB-over-range, not sampling)
by `foldBoundsOk16` in `rns_params.mjs`, enforced at constant-generation and by the committed
test. Neutral/rejected (re-tested properly, per the "your impl is garbage until refined"
discipline): vec4-packed gather (Metal lowers to scalars), balanced add-tree (compiler already
reassociates), eta-spine shortening (trades spine for an extra montred), workgroup size
32/64/128 (identical; 256 regresses). Folding `PRE_M` into an input was **rejected as
benchmark-gaming** — it only amortizes when the operand is reused (this chain), not for the
varying operands of a real EC op.

This validates the 6b prediction on Apple; **Mali/Adreno phone measurement is still the
arbiter** (the kernel uses only fixed-mask shuffles, the Mali-cheap kind). And it remains a
*building block* — the EC-add reduction-amortization (§5) is the real MSM lever.

---

## 10. Adversarial safety — the Bounds framework (ties to the #1 hard rule)

RNS overflow (a redundant value exceeding `c·p` and wrapping mod M) **cannot be caught by
random testing** — random inputs cluster near the mean; a structured/adversarial
distribution (profiles **D/E**: 100% in [0,16), giant buckets, long add-chains into one
accumulator) can drive a bound past the wrap point. VROOM §4.1 solves this with
compile-time `Bounds⟨lo,hi⟩` propagated through every add/mul; `M>k·9p` is sized to the
**worst-case chain length**, asserted at compile time.

Concretely for the walker: the longest single-bucket add-chain (profile E) sets the
redundancy budget. Port VROOM's bounds-tracking into `rns_gen.mjs` so the chosen t (20 vs
needing 21+) is *proven* against the max chain depth — **before** trusting any profile-A
uniform-random green. This is the formal version of the operator's "test D/E before
celebrating" rule.

---

## 11. Validation plan (matches the existing harness; skeptical, measured)

Red/green, byte-identical, device-measured — no static-analysis perf claims.

1. **Params + oracle (host, data only):** `rns_params.mjs` computes the basis/constants,
   writes+verifies `rns_constants.wgsl`, and runs a JS RNS-Montgomery oracle asserting a
   match to WASM `montgomery_product` and noble across 10⁵ random + edge (0,1,p−1) +
   **profile D/E adversarial chains**. (Done in Python; port to JS. Emits no shader logic.)
2. **Single RNS modmul WGSL** (per-thread, t=20/w=13 first — no subgroup risk): validate
   byte-identical to `?montmul=karat` at fixed `?scalar_seed`, logn=14 **and** 17 (a wrong
   montmul corrupts the whole field element → identical output ⇒ correct), per
   `warm-profile.sh` COW-clone + `drive-persist.mjs`.
3. **RNS EC point-add WGSL** (projective + Renes unified): byte-identical full-MSM X-coord
   vs the karat baseline, **all five profiles A–E** at logn=17. This is the real gate.
4. **Bench the EC-add / walker, not the montmul.** All-profile `drive-persist` loop from
   CLAUDE.md; compare against the f8_native walker on the *same* M2 back-to-back.
5. **Mobile:** wire t=16/w=16 cooperative path; CRNS shuffle cost via the `wt-sgmicro`
   microbench first (pin `s_shuffle` on a cooled Pixel/Mali-G715), then the serial-flock
   `phone-bench.sh` for the end-to-end EC-add. Adreno 830 (S25) is the register-relief
   acid test vs `s25-adreno-constraints`.
6. **Regen discipline:** every `.template.wgsl` edit → `inline-wgsl.mjs` before bench
   (hard rule #6 — three documented crashes from skipping it).

**Kill criteria (decide fast, don't grind):**
- 6a spills on M-series and the spilled version is slower than f8 walker → drop 6a, keep 6b.
- 6b's ~18-CRNS shuffle tax exceeds the reduction-amortization on Mali (microbench says so
  before the full build) → cooperative-RNS is dead for EC-add; **do not** retry with more
  lanes (that's the coop-CIOS W-sweep mistake).
- Either path fails a single profile-D/E byte-identical check → bounds bug, fix or abort.

---

## 12. Build order (smallest validated step first)

1. `rns_params.mjs` + JS oracle + bounds-checker → committed `rns_constants.wgsl` (data) +
   `rns_params.test.mjs` (host-only; cheap; proves params and the numbers).  ← start
2. Per-thread t=20/w=13 **modmul** in hand-written `.wgsl` (`?raw`), byte-identical gate
   (step 2 above). No EC yet. Consumes `rns_constants.wgsl`; no generated logic.
3. Per-thread RNS **G1 double + add** (Renes projective), byte-identical all-profile.
4. Bench the per-thread RNS walker on M2 vs f8. Decide 6a viability.
5. Only if mobile is the target: cooperative t=16/w=16 CRNS (rotation scheme), microbench
   the shuffle, then end-to-end on Mali/Adreno.

Each step is independently validatable and independently killable. Do **not** build the
cooperative shuffle path before the per-thread RNS EC-add is byte-identical green — the
algorithm correctness and the mapping are separable, and conflating them is how RNS
implementations get lost.

---

## Appendix: files & repro

- Paper (Opt Mont, GPU mapping): `./rnsmul.pdf` (eprint 2025/1068).
- VROOM (SOTA, Alg 2, EC Table 13, Bounds): `/tmp/vroom.pdf` (eprint 2026/393) — re-download
  `curl -A Mozilla … https://eprint.iacr.org/2026/393.pdf` (eprint 403s WebFetch; curl works).
- Numeric validation: `/tmp/rns_final.py` (both bases correct), `/tmp/rns_cox.py`
  (Cox approx extension 20000/20000 @ t16w16), `/tmp/rns_ref2.py` (the two-base reference
  with the s-in-both-bases landmine fixed). Promote into `dev/msm-webgpu/`.
- Production montmul to match for I/O + the 13-bit-product trick:
  `…/wgsl/montgomery/mont_pro_product_f8_native.template.wgsl`.
