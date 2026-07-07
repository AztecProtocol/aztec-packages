# WebGPU Sumcheck — The Algorithm

The **mathematics** of the sumcheck prover we ported to the GPU, the
**design decisions** behind the primitive (non-ZK, Mega-flavor) WebGPU
implementation, and the **optimisations** — landed, designed, and worth
doing next. Companion to [MSM_ALGO.md](MSM_ALGO.md) (read its §3 for
where these protocols sit in the Chonk browser prover).

Unlike the MSM, the GPU sumcheck is a **parked prototype**: the code
lives on `sb/sumcheck-webgpu`, `sb/multipass-sumcheck-opt` and
`sb/skipping-sumcheck-webgpu`, **not** on `sb/integrate-wgpu-msm`. Status,
numbers and the go/no-go verdict: [MSM_IMPL.md](MSM_IMPL.md) §7.9;
detail reports (`DESIGN_REPORT.html`, `OPTIMIZATION_REPORT.md`,
`MEMORY_REPORT.md`) sit on the branches under
`barretenberg/ts/dev/sumcheck-webgpu/`. Claims naming a file, symbol, or
constant are checked against `sb/skipping-sumcheck-webgpu`.

---

## 0. Notation

| Symbol | Meaning |
|---|---|
| $\mathbb{F}_r$ | BN254 scalar field — all sumcheck arithmetic (the MSM's field shaders were $\mathbb{F}_q$). |
| $d,\; n = 2^d$ | Rounds / trace rows. |
| $P_1,\dots,P_N$ | Mega prover polynomials ("entities"), multilinear; $N = 67$. |
| $R_j,\; \alpha_j$ | The $K = 63$ subrelations and their separators. |
| $\vec\beta,\; \mathrm{pow}_\beta$ | Gate challenges and the gate-separator polynomial. |
| $\tilde S^i(X)$ | Round-$i$ univariate: degree $D = 7$, sent as 8 evaluations. |
| $u_i,\; c_i$ | Round challenge; bound pow prefix $c_i = \prod_{k<i}(1-u_k+u_k\beta_k)$. |
| $R$ | Montgomery radix $2^{260}$ (same 20×13-bit limbs as the MSM). |

---

## 1. The mathematics

![The sumcheck protocol as a top-to-bottom flow of algebraic identities: input claim Σ pow_β·F = 0 over the hypercube, then (1) batch the 63 subrelations F = R₀ + Σ α_j R_j, (2) the round univariate with the pow factorisation S̃ⁱ = c_i·((1−X)+Xβ_i)·Tⁱ(X), (3) add-only edge extension of the multilinear columns to 8 points, (4) verifier check S̃(0)+S̃(1)=σ and the Poseidon2 challenge u_i, (5) the fold P[p] ← P[2p] + u(P[2p+1]−P[2p]) — looped × d rounds — ending at the 67 claimed evaluations the PCS consumes. A side callout names the primitive (the emulated 254-bit F_r Montgomery product; no inversion anywhere); right columns give the Mega sizing (N=67, K=63, deg 7, d≈14–17) and the per-round cost (accumulate O(n) at ~1,817 muls/edge, reduce to 345 entries, O(1) batch+hash, O(n) fold, round 0 = half of everything).](diagrams/sumcheck_math_flow.svg)

### 1.1 The claim

Honk's sumcheck proves that the batched Mega relation, weighted by a
random gate separator, vanishes over the whole trace:

$$
\sum_{\vec\ell \in \{0,1\}^d} \mathrm{pow}_\beta(\vec\ell)\cdot F\bigl(P_1(\vec\ell),\dots,P_N(\vec\ell)\bigr) = 0,
\qquad
F = R_0 + \sum_{j\ge 1} \alpha_{j-1} R_j .
$$

$\mathrm{pow}_\beta(X_0,\dots,X_{d-1}) = \prod_k (1 - X_k + X_k\beta_k)$
forces each row to vanish *individually* rather than on average; its
value at row $\ell$ is the subset product $\prod_k \beta_k^{\ell_k}$,
precomputed once as the `beta_products` table (bb sets
$\beta_k = \beta^{2^k}$, making it $\beta^{\ell}$). One rule a port must
preserve: the 6
**linearly dependent** subrelations (the log-derivative lookup
identities, which only hold summed over the trace) enter the batch
*without* the pow factor.

### 1.2 The round univariate

Round $i$ (challenges $u_0,\dots,u_{i-1}$ bound) sends the degree-7
univariate obtained by summing over the remaining variables. Because
$\mathrm{pow}_\beta$ is a product of per-variable factors, it splits
into a bound prefix, a degree-1 factor, and a per-term tail weight —

$$
\mathrm{pow}_\beta(u_0,\dots,u_{i-1},X_i,\vec\ell) \;=\; c_i \cdot \bigl((1{-}X_i) + X_i\beta_i\bigr) \cdot \prod_{k>i}\beta_k^{\ell_k}
$$

— so the heavy $O(2^{d-i})$ sum computes only the tail-weighted part
$T^i$, and the rest is applied once at $O(1)$:

$$
\tilde S^i(X) = c_i \cdot \bigl((1{-}X)+X\beta_i\bigr)\cdot T^i(X),
\qquad
T^i(X) = \sum_{\vec\ell}\Bigl(\prod_{k>i}\beta_k^{\ell_k}\Bigr) F\bigl(\vec P(\dots,X,\vec\ell)\bigr).
$$

The tail weights are the same `beta_products` table read at stride
$2^{i+1}$; $c_{i+1} = c_i(1-u_i+u_i\beta_i)$ is one multiply per round.
The deepest subrelation has degree 6 and the pow factor adds one:
$\deg \tilde S^i = 7$, sent as **8 evaluations**.

### 1.3 Edges and bases

Each $P_j$ is multilinear, so along the round variable it is a line: the
adjacent pair $\bigl(P_j(\dots,0,\vec\ell), P_j(\dots,1,\vec\ell)\bigr)$
— an **edge** — yields all 8 points by add-only steps,
$P_j(\dots,k,\vec\ell) = P_j(\dots,k{-}1,\vec\ell) + \bigl(P_j(\dots,1,\vec\ell)-P_j(\dots,0,\vec\ell)\bigr)$.
Relations are then evaluated on extended edges in two bases (bb's
`USE_SHORT_MONOMIALS` strategy), chosen to minimise field multiplies:

- **Monomial** for degree ≤ 2: Karatsuba-packed $(c_0,c_1,c_2)$ — a
  product of two lines costs 3 multiplies.
- **Lagrange** (evaluations) beyond degree 2: promotion is mul-free
  (degree-1) or a second-difference recurrence (degree-2), and extending
  by one point uses Newton forward differences — adds only.

### 1.4 The fold, and where the work lives

After $u_i$ is drawn, every column halves:

$$
P[p] \;\leftarrow\; P[2p] + u_i\,\bigl(P[2p{+}1] - P[2p]\bigr).
$$

After $d$ rounds each column is one value — exactly the claimed
multilinear evaluations the PCS consumes. The halving makes the work
profile geometric: **round 0 is half of all $O(n)$ work, rounds 0–1
three quarters**, while the last ~9 rounds are dominated by fixed
per-round latency — the fact behind the hybrid split of §2. (Mega's
virtual padding rounds are $O(1)$ and stay on the host.)

![Work profile: a stacked bar of total O(n) field work by round — round 0 = 50%, round 1 = 25%, r2 = 12.5%, the rest noise — above a strip of the 17 per-round row counts (128k halving down to 2) split into a blue GPU-front region (rounds 0–7, ~99.8% of the field work) and an amber WASM-tail region (last T ≈ 9 rounds, flat ~13 ms), with the latency-floor caption: a GPU round costs a full submit+sync no matter how few edges remain.](diagrams/sumcheck_work_profile.svg)

### 1.5 Verifier and Fiat–Shamir

The verifier is $O(1)$ per round — check
$\tilde S^i(0) + \tilde S^i(1) = \sigma_i$, set
$\sigma_{i+1} = \tilde S^i(u_i)$ — plus one final evaluation of the full
batched relation at the claimed point. Challenges come from a
**Poseidon2 transcript** over $\mathbb{F}_r$ ($t = 4$, $R_F = 8$,
$R_P = 56$): $u_i = \mathrm{Poseidon2}(\text{state}_i \Vert \tilde S^i(0),\dots,\tilde S^i(7))$.
This hash is a **serial step on the critical path between rounds** — the
reason a naive GPU port returns to the host every round, and the reason
the single-submission engine puts Poseidon2 on the GPU.

### 1.6 The Mega relation set

The 14 relations in `Relations_` tuple order — subrelation partial
lengths (= degree + 1), and each relation's `skip` condition. Mega
relations have no constant term, so a skipped (all-zero) edge
contributes exactly zero: skipping is a provable no-op.

| # | Relation | Subrel. lengths | Skip when |
|---|---|---|---|
| 0 | Arithmetic | 6, 5 | $q_{\text{arith}} = 0$ |
| 1 | UltraPermutation | 6, 3, 3 | $z_{\text{perm}} - z_{\text{perm}}^{\text{shift}} = 0$ |
| 2 | LogDerivLookup | 5, 5♦, 3 | $q_{\text{lookup}} = 0 \wedge$ read counts $= 0$ |
| 3 | DeltaRangeConstraint | 6 × 4 | $q_{\delta} = 0$ |
| 4 | Elliptic | 6, 6 | $q_{\text{ell}} = 0$ |
| 5 | Memory | 6 × 6 | $q_{\text{mem}} = 0$ |
| 6 | NonNativeField | 6 | $q_{\text{nnf}} = 0$ |
| 7 | EccOpQueue | 3 × 8 | $L_{\text{ecc\_op}} = 0$ |
| 8 | DatabusLookup | (6, 6, 6♦) × 5 | $q_{\text{busread}} = 0 \wedge$ read counts $= 0$ |
| 9–13 | Poseidon2 (ext, init, quad, quad-term, transition) | 7×4, 3×4, 7×4, 7×4, 7×3 | own $q_{\text{pos2}*} = 0$ |

♦ = linearly dependent. Totals: $K = 63$, max partial length 7, batched
length 8. Sumcheck reads $N = 67$ columns — 35 precomputed + 27 witness
+ 5 *shifted* — of which only **62 are physical** in bb's prover: a
shift is the same buffer read at offset +1 ($w_{l,r,o,4}$,
$z_{\text{perm}}$). (The GPU prototype materialises all 67 — §2.)

---

## 2. Design of the primitive port

- **Scope.** The non-ZK Mega prover loop only: no Libra masking or row
  disabling (inert for Mega), no Grumpkin *committed* sumcheck, padding
  on the host. That is exactly the $O(n)$ arithmetic core, with the
  protocol obligations (transcript compatibility, claimed-evaluation
  handoff) still honoured — a drop-in candidate, not a toy. ZK is
  additive later (a masking term pre-batch, univariate $8 \to 9$).
- **Field.** The MSM's `fr_*` shaders were actually $\mathbb{F}_q$;
  `ShaderManager` was made parametric and the kernel family re-rendered
  over $\mathbb{F}_r$ — same 20×13-limb Karatsuba–Yuval Montgomery
  multiply, new packed **8×u32 live form** with native add/sub (only the
  multiply unpacks). Relations are division-free, so there is **no
  inversion anywhere**; the cost model is pure mul/add, and a dense edge
  costs ~1,817 Montgomery products — sumcheck is a field-multiply
  machine.
- **Layout.** Columns are column-major, Montgomery bytes, GPU-resident
  across all rounds; an edge's two values are adjacent, so the
  accumulate gathers stride-2 coalesced. One shared 67-entity set (not
  per-relation copies), used whenever it fits the device's
  storage-binding limit; the 5 shift columns are materialised as their
  own data — collapsing them to +1 views of their base columns is a
  designed, unlanded saving.
- **Two engines.** *Multi-pass* (`gpu_pipeline.ts`): host round loop,
  one ~11 KB accumulator readback per round, the host supplies $u_i$
  (deterministic harness challenges — this path has no Fiat–Shamir of
  its own) — one blocking sync per round. *Single-submission*
  (`single_submit.ts`): all
  $d$ rounds in **one command buffer, one readback**, with on-GPU
  Poseidon2 (bit-identical to bb.js `poseidon2Hash`) so $u_i$ never
  visits the host; hazard tracking orders the chain. The measured trade:
  removing the per-round sync floor costs a serial on-GPU hash — the two
  engines converge, which is itself the finding: orchestration is not
  the lever, the multiply is.
- **Hybrid.** First $d-T$ rounds on the GPU, last $T \approx 9$ on
  threaded WASM (~13 ms flat, handoff 1–3 ms): the GPU keeps ~99.8% of
  the field work and never runs the latency-bound tail.
- **Correctness.** A canonical-bigint CPU reference (small-$n$ full
  diff), the **telescoping oracle**
  $\tilde S^i(0) + \tilde S^i(1) = \tilde S^{i-1}(u_{i-1})$ at any $n$,
  and the purported-value anchor (last univariate at $u_{d-1}$ vs the
  folded point). Skip and fused variants must be bit-identical to the
  dense path.

---

## 3. From math to GPU passes

![One sumcheck round as WebGPU passes: a setup band (upload 67 Montgomery column-major columns; build beta_products by a GPU doubling subset-product scan; fold α-powers and barycentric extension into two constant 8×345 batch matrices), then the shared six-kernel spine — gate_separator_gather (tail weights at stride 2^(i+1)), accumulate (one thread per edge-pair into the 345-slot accumulator), two-level reduce (to exactly 345 Fr), batch (an 8×345 matmul), poseidon2_transcript (squeeze u_i resident, update c), fold (columns halve, ping-pong) — with the multi-pass engine annotated on the left (345-Fr readback per round, host tail + harness-supplied challenge, unfenced fold, d blocking syncs) and single-submission on the right (all d rounds in one command buffer, on-GPU Fiat–Shamir, one readback), and a hybrid band underneath (hand the 2^T-row columns to threaded WASM for the last T ≈ 9 rounds).](diagrams/sumcheck_gpu_round.svg)

Setup, once per prove: upload the 67 columns; build `beta_products` on
the GPU (a doubling subset-product scan, replacing an $O(n\log n)$ host
bigint loop); fold $\alpha$-powers and the barycentric extend-to-8
coefficients into two constant $8 \times 345$ matrices. Then per round:

1. **Gather** — copy the tail weights out of `beta_products` at stride
   $2^{i+1}$; zero arithmetic.
2. **Accumulate** — one thread per edge-pair: extend the edge (§1.3),
   evaluate each subrelation at its own points, scale by the gathered
   weight, write a 345-slot slice ($\sum_g L_g = 345$). One kernel per
   relation, or the fused *uber* kernel (§4.1).
3. **Reduce** — two levels, summing per-edge slices to exactly **345
   field elements** (~11 KB) — the round's entire payload.
4. **Batch** — the 8 evaluations as
   $\tilde S^i(e) = (M^{LI}\mathrm{acc})_e\,(a_e{+}b_e\beta_i)\,c_i + (M^{LD}\mathrm{acc})_e$;
   eight threads.
5. **Transcript** — Poseidon2 absorbs the 8 evaluations, squeezes
   $u_i$, updates $c_{i+1}$, all resident.
6. **Fold** — §1.4 over all 67 columns, ping-ponged buffers.

Multi-pass runs 1–3, reads back, and does 4–5 on the host;
single-submission encodes 1–6 for all rounds into one buffer. Workgroup
size is 64 for gather/accumulate/fold; the reduce runs 128-wide groups,
one thread per accumulator slot. (A size sweep was flat 32–128 —
occupancy is not a lever.)

---

## 4. Optimisations

The full inventory, by status — **landed** means built, validated, and
exercised by the benches (a few are gated, noted inline); **designed**
means specified (and in two cases half-built) on the branches but not
running; **dead end** means measured or proven out, recorded so nobody
re-derives it:

![The optimisation map: three status bands of cards. Landed (green, 12): mono/Lagrange bases, field8 live form, resident columns, two-level reduce, unfenced fold, shared 67-entity columns (185→67), ping-pong fold buffers (252→28 allocations), uber accumulate, constant-matrix batch, parallel poseidon2 (the measured ~27% serial transcript vectorised, expected ~2×), GPU beta_products scan, skip tiers 0/1 + band. Designed but not landed (amber, 6): montgomery_square, tier-2 indirect compaction, kill the 2nd readback, build-once encode, in-place/streamed fold, slot parallelism. Dead ends (red, 5): workgroup-size sweep (flat), row-major transpose, persistent megakernel, fuse all 14 relations, and the wrong claim that squares only matter in Poseidon2.](diagrams/sumcheck_opt_map.svg)

### 4.1 Landed

**Fewer field multiplies** — the algorithmic tier, active inside every
relation kernel: Karatsuba-packed monomials (a product of two lines
costs 3 muls, not 4), add-only Newton extension, degree-aware Lagrange
promotion, and monomial squaring in the Poseidon2 chains. Together
these set the ~1,817-mul dense edge cost; a naive transcription of the
C++ relations is meaningfully worse.

**Data movement and memory** — the goal is that nothing heavy ever
crosses the bus after setup:

- *Resident columns + fused gather*: the witness uploads once and the
  accumulate reads it in place; per round only the 345-Fr accumulator
  (multi-pass) or nothing (single-submission) comes back.
- *Two-level reduce*: workgroups sum edge chunks, a second pass
  collapses the ≤64 partials — exactly 345 field elements (~11 KB)
  per round, not 64 × 345.
- *Shared 67-entity columns*: the dev harness gave each relation its
  own random columns (185 buffers); the real Mega witness is **one**
  67-entity set that every relation slices — 2.76× fewer resident
  columns, and fold traffic drops with it. Selected whenever the shared
  buffer fits the device's storage-binding limit (Metal's 256 MiB caps
  it around $2^{16}$); above that the engines fall back per-relation.
- *Ping-pong fold buffers*: one full + one half set reused every round
  instead of fresh allocations — 252 → 28 allocations per prove.

**Dispatch and sync** — attacking the per-round fixed costs:

- *Unfenced fold*: the next round's readback covers it — one blocking
  sync per round, not two (multi-pass).
- *Uber accumulate*: the register-light gate relations fuse into one
  occupancy-filling dispatch; the register-heavy trio (databus,
  quad-internal, quad-terminal) stays isolated so it can't drag
  occupancy down; permutation and arithmetic stay standalone. It rides
  the band layout, so it runs under band/realistic profiles (not on
  dense traces); single-submission fuses at any size, multi-pass above
  $2^{14}$ pairs. Bodies are byte-identical to the standalone kernels,
  asserted in the suite.
- *Constant-matrix batch*: $\alpha$-powers and barycentric extension
  fold into the $8 \times 345$ constants at setup; a round reads only
  $\beta_i, c_i$ from VRAM.
- *Parallel Poseidon2*: the serial `@workgroup_size(1)` transcript
  measured at ~27% of single-submission GPU time — more than the
  readbacks it replaced. The deployed default now vectorises the 8 full
  rounds across the $t = 4$ state lanes, expected to roughly halve it
  (the A/B against the serial baseline was never benched). The 56
  partial-round S-boxes are inherently serial: a hard floor.
- *GPU gate-separator scan*: `beta_products` built on-GPU, removing an
  $O(n\log n)$ serial host-bigint cliff at setup.

**Skip-awareness** — the tier that matches the prover's real trace
shape (~2 of 14 relations active per row, ~⅓ of rows unused). Each
tier changes *which threads run the ~1,817-mul body*:

![Skip-aware dispatch, the same relation five ways over 36 edge-pairs: dense baseline (every cell runs the full body), tier 0 size trim (only the ⌈used/2^i⌉ prefix is dispatched — landed), band dispatch (the trace groups each gate type contiguously — dispatch the start..end range with coalesced reads — landed), tier 1 early-out (every thread launches but exits on a zero selector — landed), and compaction (an index list gathers scattered actives into a dense prefix; landed with a host-built list in the multi-pass engine, while tier 2 — the list built on the GPU plus indirect dispatch — is designed but not landed).](diagrams/sumcheck_skip_tiers.svg)

*Tier 0* trims the dispatch to the rows that can still be nonzero
after $i$ folds; *band dispatch* exploits the execution trace's
contiguous gate blocks (an arithmetic offset, no index buffer, reads
stay coalesced); *Tier 1* is the per-edge early-out on the `skip`
predicate of §1.6 — sound because a zero edge contributes exactly zero.
These three are in both engines. *Compaction* gathers scattered actives
through a host-built index list (multi-pass engine only), applied only
below ~0.2 density because gathered reads cost more per cell. Every
variant is bit-identity-checked against the dense path.

### 4.2 Designed, not landed

- **`montgomery_square`** — every $x \cdot x$ (S-boxes, monomial
  squares, elliptic $y^2$) pays a full product today; a square drops
  the cross terms (~64 → ~36 partial muls) at sites in 7 of 14
  kernels. The generator is half-built on the branch; estimated
  low-single-digit % overall but cheap, riskless, and the only small
  lever that moves round 0. Stalled only on finishing the shader
  templates.
- **Tier-2 compaction + indirect dispatch** — build the active list
  *on the GPU* and size dispatches with indirect calls, preserving
  single-submission's one-readback property. The design is verified
  including its landmine (the kernel needs the physical pair index for
  loads *and* the pair-keyed separator weight, but the compact slot
  for writes — conflating them corrupts results only on sparse
  traces). Its real niche is scattered sparsity in early rounds;
  selectors dilute toward density 1 as folding proceeds, and
  permutation stays dense regardless.
- **Kill the vestigial second readback** — the final length-1 columns
  can be staged in the same command buffer; purely mechanical.
- **Build-once encode** — every bind group is GPU-data-independent, so
  a fully warmed engine handle per $n$ reduces a prove to upload +
  1 submit + 1 map. This is the production shape (build once, prove
  many); the prototype re-encodes per run.
- **In-place / streamed fold** — write the half-size output into the
  front of the source buffer. True in-place is a GPU data race, so the
  safe floor is the current 1.5× ping-pong — which is exactly the VRAM
  ceiling; this is the lever that buys ~one power of two of scale.
- **Slot parallelism** — fan the 8 evaluation points across lanes when
  edge-parallelism starves. Measured *not* to beat the flat WASM tail
  on wall-clock; kept because it would let single-submission own the
  tail and drop the WASM dependency entirely.

### 4.3 Dead ends (recorded — don't re-derive)

- **Workgroup-size sweep**: flat 32–128 on Apple Silicon, degrading
  past 192. Occupancy is not a lever.
- **Row-major transpose**: makes the per-column cross-thread stride
  scattered (column-major is already coalesced), and round 0 is
  ALU-bound anyway.
- **Whole-protocol persistent megakernel**: WebGPU has no portable
  cross-workgroup barrier — a round boundary must be a dispatch
  boundary.
- **Fusing all 14 relations**: the ~11 KB live accumulator state per
  thread collapses occupancy; fuse only within a register class (hence
  the uber/heavy split).
- **"Squares only matter in Poseidon2"**: wrong — square sites are in
  7 kernels, and the saving is ~25–35% *at those sites*, not 40%
  globally.

### 4.4 The ceiling

Two structural facts bound everything above. **The emulated multiply is
the roofline**: every landed optimisation reduces how *many* Montgomery
products run, none changes what *one costs* on a GPU without wide
integer multiply–add — the review recorded in
[MSM_IMPL.md](MSM_IMPL.md) §7.9 put it at roughly an order of magnitude
(est. ~14×) below the GPU's own integer-ALU roofline. The identified
escape is the MSM's mobile lever ([MSM_IMPL.md](MSM_IMPL.md) §7.12): an
**f32-FMA multiply in radix $2^{264}$**, at the cost of re-rendering
the whole field stack. And **the honest baseline skips**: against
dense equal work the GPU wins at scale (parity ~$2^{15}$, >3× at
$2^{18}$ hybrid), but against the *skip-aware* WASM prover there is
**no crossover at any $n$** — a data-parallel machine cannot skip as
cheaply as a branchy CPU.

### 4.5 Worth doing next

- The **f32-FMA field stack** (shared with the MSM) — the only lever
  aimed at the multiply itself.
- **GPU-resident proving** — the strategic case: with the witness
  already on the GPU for the MSM commitments, upload is free and a
  slower-than-CPU sumcheck still *frees the CPU entirely*. The
  single-submission engine (resident transcript, claimed evaluations
  produced where a resident PCS would consume them) was built as that
  pipeline's sumcheck stage.
- **ZK (Libra)** — additive (§2 Scope).
- **ECCVM / translator sumchecks** — same round structure; the ECCVM's
  82% block-skip profile is the strongest skip-dispatch case in the
  system.

---

## 5. Verdict

Sumcheck is ~8–10% of a Chonk prove, 100% CPU in production, and
Chonk's traces are small ($n \le 2^{17}$) with a ~80%-sequential prove
around them — so even a free sumcheck moves e2e by single-digit
percent, and the skip-aware CPU baseline never loses to the GPU on
equal work. **NO-GO standalone; conditional GO** as the sumcheck stage
of a GPU-resident prover — see [MSM_IMPL.md](MSM_IMPL.md) §7.9.

---

*Diagrams are SVG (dark-mode, self-contained; equations typeset with
MathJax) generated by
[diagrams/gen_sumcheck_diagrams.mjs](diagrams/gen_sumcheck_diagrams.mjs)
(math-flow, gpu-round, work-profile, opt-map, skip-tiers).*
