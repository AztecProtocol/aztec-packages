# `element_impl` support for the IPA SRS fold

The IPA prover folds its SRS once per reduction round. Two facts make that fold cheap, and together
they are why `batch_two_round_fold` exists:

- Production IPA challenges are short, $u < 2^{127}$, so a fold multiplies the SRS by a $127$-bit
  scalar rather than the $254$-bit inverse $u^{-1}$ — no GLV split is needed
  (see [Single sequence vs GLV split](#single-sequence-vs-glv-split)).
- Two consecutive rounds fuse into one shared doubling chain, making the fold step $\approx 2\times$
  cheaper than two sequential folds (the doubling count drops $\approx 3\times$; the additions do
  not, so the overall factor is smaller — see [Sharing one scan](#sharing-one-scan-offset-grids)).

`batch_two_round_fold` (`element_impl.hpp`) realises both. This note specifies its mechanism, cost
model, and structure; it covers group arithmetic only — for the IPA protocol itself see the `IPA`
class documentation in `ipa.hpp`.

## Notation

| symbol | meaning | bound / value |
|---|---|---|
| $u$ | a raw IPA round challenge | $u < 2^{127}$ |
| $u_1, u_2$ | the two challenges fused in one call (`u1`, `u2`) | each $< 2^{127}$ |
| $G_{\mathrm{lo}}, G_{\mathrm{hi}}$ | lower/upper halves of the round's SRS | — |
| $G', G''$ | SRS after one / two folds | — |
| $t$ | output points per call = quarter length (`t = points.size()/4`) | $\geq 0$ |
| $P^{(0)}, \ldots, P^{(3)}$ | the four length-$t$ quarters of the input SRS | — |
| $\phi$ | the GLV endomorphism, $\phi(x, y) = (\beta x, y)$ | $\beta^3 = 1$ |
| $k_1, k_2$ | GLV half-scalars of $u_1 u_2$ (`K1`, `K2`) | $\approx$ half-width |
| $w$ | window width in bits | $4$ |
| $b$ | scalar bit length | $\leq 127$ |
| $s_j$ | term $j$ — one scalar multiplication (`FoldOp.term`) | $j \in \{0,1,2,3\}$ |

## Composing two folds (the fused fold)

A single fold is $G' = u\,G_{\mathrm{lo}} + G_{\mathrm{hi}}$. Composing two folds with challenges
$u_1, u_2$, where $4t$ is the pre-fold length:

$$
H = u_1 G_{\mathrm{lo}} + G_{\mathrm{hi}} \quad(\text{length } 2t), \qquad
G'' = u_2 H_{\mathrm{lo}} + H_{\mathrm{hi}} \quad(\text{length } t).
$$

Substituting and indexing the four length-$t$ quarters $P^{(0)},\ldots,P^{(3)}$ of $G$:

$$
G''_i = (u_1 u_2)\,P^{(0)}_i + u_1 P^{(1)}_i + u_2 P^{(2)}_i + P^{(3)}_i.
$$

`batch_two_round_fold` evaluates this combination without materialising the length-$2t$ intermediate
$H$, folding both rounds in a single doubling chain over the $t$ output points;
[§Sharing one scan](#sharing-one-scan-offset-grids) derives that chain and its cost.

## Cost model

The fold is a batch of multi-scalar point combinations in affine coordinates: one combination per
output index $i$, with the scalars shared across all indices.

Affine coordinates are applicable because the operands are SRS points — fixed, independent
generators, none at infinity — so the operands of each addition are in generic position and the
exceptional cases of the affine group law do not generically arise (the rare schedule-dependent
exceptions are handled separately; see [The `safe` flags](#the-safe-flags)). Given that, affine is
the cheaper choice because of Montgomery's batch-inversion identity [3]: the only inversion in the
affine group law is the slope denominator, and over a batch of $N$ independent additions the $N$
inversions are replaced by one inversion and $\approx 3N$ multiplications.

Define a **pass** as one traversal of a batch of $n$ points that consumes a single batched
inversion; its cost is $\Theta(n)$ field multiplications. The batched primitives cost:

- `batch_affine_double_impl`: $A_i \leftarrow 2 A_i$ — one pass,
- `batch_affine_add_impl`: $A_i \leftarrow A_i + B_i$ — one pass,
- `batch_affine_combined_double_add_impl`: $A_i \leftarrow 2 A_i + B_i$ — two passes.

The combined primitive uses two batched inversions: phase 1 inverts $(x_2 - x_1)$ for the chord
$A + B$, then phase 2 inverts $(x_3 - x_1)$, which depends on phase 1's output and so cannot be
merged into it. It costs the same two passes as a separate double then add; the gain is in
multiplications, since it reuses the intermediate and never materialises the doubled point's
$y$-coordinate.

The fold scalars are evaluated by **windowed scalar multiplication**. Plain double-and-add adds a
multiple of $B$ per set bit; a width-$w$ window instead consumes $w$ bits at a time, adding one
precomputed multiple $d \cdot B$ per window — $\approx b/w$ additions over a $b$-bit scalar instead
of $\approx b$. The price is a per-base table of multiples, built once and reused across all $t$
points.

**Booth (signed-digit) recoding** [1] is what makes that window cheap here. It re-expresses the
scalar so each window's digit is *signed*, $d \in [-2^{w-1}, 2^{w-1}]$ — one digit per window, no
carry between windows. Two payoffs matter for this fold:

- The table holds only the positive multiples $[B, 2B, \ldots, 2^{w-1}B]$ ($8$ entries for $w = 4$),
  half what an unsigned recoding needs: a negative digit reuses the same entry with $y$ negated,
  which is free in affine. Halving a table that is built once per base and reused over $t$ points is
  a real saving.
- One signed digit per window, at a single bit position with no inter-window carry, is
  exactly what lets several scalars' windows occupy disjoint offset grids and interleave into one
  doubling chain (see [Sharing one scan](#sharing-one-scan-offset-grids)).

Unrolled to individual bits, the evaluation doubles the accumulator once per bit as it descends
from the top — $\approx b$ doublings for a $b$-bit scalar — and at each window's bit position adds
that window's $d \cdot B$ — $\approx b/w$ additions. Call this the **double-and-add
scan**.

Two consequences:

- The doubling count equals the bit length and is independent of the number of nonzero digits; the
  doublings are sequential and cannot be batched away, and are the dominant cost of a single fold.
  All quantities below are pass counts, i.e. field-operation counts, so the ratios are
  machine-independent.
- A nonzero digit's addition is fused with its position's doubling by the combined $2A + B$
  primitive — cheaper in multiplications than a separate double then add, though it still costs that
  step's two passes.

A short scalar's scan has fewer additions ([Single sequence vs GLV split](#single-sequence-vs-glv-split));
sharing one scan across two folds cuts the total doubling count
([Sharing one scan](#sharing-one-scan-offset-grids)).

## Single sequence vs GLV split

A scalar below $2^{127}$ needs no GLV split — it is a single Booth sequence with $\approx$ half the
additions of a full-width split [2] — so the raw challenges $u_1, u_2$ stay unsplit and only their
full-width product $u_1 u_2$ is GLV-split into half-width $k_1, k_2$ (data-dependent, but the
challenges are public).

## Sharing one scan: offset grids

This section writes $G''_i$ as one summation and reads its cost off the result. The product
$u_1 u_2$ is full-width with probability $1 - O(2^{-127})$ and is GLV-split into signed half-width
scalars $k_1, k_2$ (the [single-sequence section](#single-sequence-vs-glv-split)). With $\phi$ acting
as $\lambda$, the reduction gives $(u_1 u_2)P^{(0)} = k_1 P^{(0)} - k_2\,\phi(P^{(0)})$; the leading
minus is a property of the GLV decomposition, not a digit's most-significant bit. The summation below
writes that term as $+k_2\,\phi(P^{(0)})$ and carries the minus as term 2's sign — the `^ (term == 2)`
flip in `signed_delta`. (In code $k_1, k_2$ are `endo_scalars.first`, `.second`; the challenges
$u_1, u_2$ are `u1_conv`, `u2_conv`.) The four-term
combination expands into five scalar–point products — the four terms $s_0,\dots,s_3$ plus the trivial $P^{(3)}$
(scalar $1$, added once at the end, outside the scan):

$$
G''_i
  = (u_1u_2)P^{(0)}_i + u_1 P^{(1)}_i + u_2 P^{(2)}_i + P^{(3)}_i
  = \underbrace{k_1 P^{(0)}_i}_{s_0}
  + \underbrace{u_1 P^{(1)}_i}_{s_1}
  + \underbrace{k_2\,\phi(P^{(0)})_i}_{s_2}
  + \underbrace{u_2 P^{(2)}_i}_{s_3}
  + P^{(3)}_i .
$$

The four terms' scalars, bases, and grid offsets:

| term | scalar | base | grid offset |
|---|---|---|---|
| 0 | $k_1$ of $u_1 u_2$ | $P^{(0)}$ | 0 |
| 1 | $u_1$ | $P^{(1)}$ | 1 |
| 2 | $k_2$ of $u_1 u_2$ (with the GLV sign) | $\phi(P^{(0)})$ | 2 |
| 3 | $u_2$ | $P^{(2)}$ | 3 |

Each scalar is a width-$w$ signed-Booth expansion ($w = 4$, digits $d_m \in \{-8,\dots,8\}$). Term $0$
($k_1$) uses the **aligned grid**: $32$ windows, window $m$ at bit position $4m$,

$$
k_1 = \sum_{m=0}^{31} d^{(0)}_m\, 2^{4m},
\qquad \text{window } m \text{ covers bits } [4m,\,4m+4).
$$

Terms $1,2,3$ ($u_1$, $k_2$, $u_2$) use **offset grids**: a short bottom window of $j$ bits at
position $0$, then $32$ full $4$-bit windows shifted up by $j$ — $33$ windows in all
(`OFFSET_NUM_WINDOWS`). The bottom window $\beta_j$ recodes the low $j$ bits; full window $m$ occupies
position $4(m-1)+j$:

$$
\begin{aligned}
u_1 &= \beta_1 + \sum_{m=1}^{32} d^{(1)}_m\, 2^{\,4m-3}, & \beta_1 &\text{ over bits } [0,1),\\
k_2 &= \beta_2 + \sum_{m=1}^{32} d^{(2)}_m\, 2^{\,4m-2}, & \beta_2 &\text{ over bits } [0,2),\\
u_2 &= \beta_3 + \sum_{m=1}^{32} d^{(3)}_m\, 2^{\,4m-1}, & \beta_3 &\text{ over bits } [0,3).
\end{aligned}
$$

The $j$-bit bottom window occupies bits $[0,j)$, so term $j$'s remaining windows start at bit $j$ and
occupy positions $p \equiv j \pmod 4$. The position of window $m$ of term $j$ is therefore

$$
p^{(j)}_m =
\begin{cases}
4m, & j = 0 \ (m = 0,\dots,31),\\
0, & m = 0 \ (\text{the bottom window, } j \ge 1),\\
4(m-1)+j, & m = 1,\dots,32 \ (j \ge 1),
\end{cases}
$$

In `batch_two_round_fold` these are the loop variables: bit position $p$ is `pos`, term $j$ is
`term = pos % 4`, window index $m$ is `window`, and `digit_at(term, window)` returns $d^{(j)}_m$; the loop
inverts $p^{(j)}_m$ to recover `window` from `pos`.

and the four terms tile the bit axis by residue (one window per position for $p = 1,\dots,127$;
position $0$ shared by four — term $0$'s lowest window and the three bottom windows):

$$
\begin{array}{c|ccccccccc}
\text{bit}    & 127 & 126 & 125 & 124 & \cdots & 3   & 2   & 1   & 0 \\
\hline
\text{term} & s_3 & s_2 & s_1 & s_0 & \cdots & s_3 & s_2 & s_1 & s_0 + \beta_{1,2,3} \\
\end{array}
$$

(`make_offset_booth_slice_params` encodes these shifted boundaries, so the inner loop reads each
position's digit without address arithmetic.) Multiplying each expansion by its base $B_j$ and summing
gives the output as one double sum,

$$
G''_i = P^{(3)}_i + \sum_{j=0}^{3} \sum_m 2^{\,p^{(j)}_m}\, d^{(j)}_m B_{j,i}.
$$

Group the double sum by position. The windows at position $p$ are
$W(p) = \{(j, m) : p^{(j)}_m = p\}$ — a single window for $p = 1,\dots,127$, and the four lowest windows
$\{(0,0),(1,0),(2,0),(3,0)\}$ at $p = 0$. Write $\delta_{p,i}$ for the point they contribute:

$$
\delta_{p,i} = \sum_{(j,m)\,\in\,W(p)} d^{(j)}_m\, B_{j,i}
\qquad (\mathcal{O} \text{ when those digits vanish}).
$$

For $p \ge 1$ exactly one window occupies $p$ (one term per position, $t = p \bmod 4$), so the sum has a
single term $d^{(t)}_m B_{t,i}$ — the add the schedule applies there; only $p = 0$ collects several.

Every window $(j, m)$ has a unique position $p^{(j)}_m$, so the $\sum_{j}\sum_{m}$ regroups by position as
$\sum_{p}\sum_{(j,m)\in W(p)}$ with $2^{p}$ factored out — the term sum $\sum_j$ moves into $\delta_{p,i}$,
it is not dropped:

$$
G''_i = P^{(3)}_i + \sum_{p=0}^{127} 2^{p}\,\delta_{p,i},
$$

which Horner evaluates from the top bit down as one doubling chain [4]:

$$
G''_i = P^{(3)}_i + \Big(\big(\cdots(2\,\delta_{127,i} + \delta_{126,i})\cdots\big)\cdot 2 + \delta_{1,i}\Big)\cdot 2 + \delta_{0,i}.
$$

### Cost of the fused chain

The chain has **one doubling per bit position** ($\approx 127$) and **one addition per nonzero
digit**, each addition fused into its position's doubling by the combined $2A + B$ primitive (an
affine formula that fails in exceptional position; flagged per op in
[The `safe` flags](#the-safe-flags)). The saving is the doubling count: four independent per-term
scans cost $\sum_j b_j$ doublings, the shared ladder $\{2^p\}$ one $\max_j b_j \approx 127$.

In passes (see [Cost model](#cost-model)), evaluating the two folds sequentially runs a $2t$-scan then a $t$-scan,

$$
\underbrace{(\approx 126 + 32 + 7)}_{\text{dbl + add + table}} \cdot 2t \;+\; (\approx 165)\cdot t
\;\approx\; 495\,t,
$$

and materialises the length-$2t$ intermediate $H$. The fused chain shares one doubling ladder
($\approx 127$ doublings instead of the sequential $\approx 378\,t$), but carries all four terms'
additions ($\approx 120$ per output point, each its own pass), plus three lookup tables and the
constant tail — $\approx 270\,t$, so the fold step is $\approx 2\times$ cheaper. The doubling count
alone drops $\approx 3\times$; the additions do not shrink, which is why the overall factor is
smaller. Across `ipa_open` the gain is smaller still: deferring the first fold turns each pair's
second-round $L/R$ into two-term MSMs against the un-folded SRS, adding $\approx 56\,t$ of MSM work
per pair while removing the $\approx 318\,t$ intermediate fold — a strict net reduction.

## Inside `batch_two_round_fold`

The schedule depends only on $u_1, u_2$, not on the points, so the routine splits in two: phase 1
generates the operation schedule once from the scalars; phase 2 applies that single schedule to the
whole length-$t$ batch, where the batched-affine amortisation — one inversion per pass over all $t$
accumulators — applies.

### Phase 1 — schedule generation (scalars only)

**Digit sequences.** The four scalar terms become signed-Booth digit arrays on the offset grids
of the table above. Term 0 uses $4$-bit windows at $0,4,\ldots,124$; terms 1, 2, 3 each have
a bottom window of $1$, $2$, $3$ bits followed by $4$-bit windows at offsets $1, 2, 3$. The union is
one window position per bit from $1$ to $127$.

**Operation list.** Evaluating the [Horner chain](#sharing-one-scan-offset-grids) position by position
*is* the schedule: each step contributes that position's doubling and, where the digit is nonzero, its
add $\delta B_t$ ($\delta = d^{(t)}_m$, the active term's signed digit). The schedule records this as a
vector of `FoldOp`s. The exception analysis ([The `safe` flags](#the-safe-flags)) shadows the same steps
in the accumulator's integer coordinates $c$, where $A = \sum_j c_j B_j$ — so each op has a curve update
and a coordinate update:

| op | accumulator $A$ | coordinates $c$ |
|---|---|---|
| `SEED` | $A \leftarrow \delta B_t$ (first nonzero digit) | $c_t \leftarrow \delta$ |
| `DBL` | $A \leftarrow 2A$ (zero-digit position) | $c \leftarrow 2c$ |
| `COMBINED` | $A \leftarrow 2A + \delta B_t$ | $c \leftarrow 2c$, then $c_t \leftarrow c_t + \delta$ |
| `ADD` | $A \leftarrow A + \delta B_t$ (position $0$ only) | $c_t \leftarrow c_t + \delta$ |

**Schedule (rigorous).** Generation keeps a flag `initialised` (is the accumulator $\neq \mathcal{O}$?)
and the coordinates $c$, and processes positions $p = 127, \dots, 0$. For $p \ge 1$ at most one window
occupies $p$; let $\delta = d^{(t)}_m$ be its signed digit.

- **Uninitialised.** Zero positions emit nothing (there is no accumulator to double); the first nonzero
  digit emits `SEED` ($c_t \leftarrow \delta$) and sets `initialised`.
- **Initialised, $p \ge 1$.** A nonzero digit emits `COMBINED`; a zero digit emits `DBL`.
- **Position $0$.** It carries the four bottom windows. The first nonzero one consumes the pending
  doubling as `COMBINED`; each further nonzero one is `ADD`; if all four are zero, a trailing `DBL`
  realises the doubling into position $0$.
- **Return to $\mathcal{O}$.** After any `COMBINED`/`ADD`, if $c = 0$ (`all_zero`) the accumulator is the
  identity: `initialised` is cleared, and the next nonzero digit re-`SEED`s.

Each op's effect is the table above; the same pass sets its `safe` flag from $c$
([The `safe` flags](#the-safe-flags)).

### Phase 2 — execution (over the point batch)

**Lookup tables.** Each Booth digit has magnitude in $\{0,\ldots,8\}$ and a sign. The executor
builds $[B, 2B, \ldots, 8B]$ for each multiplied base $P^{(0)}, P^{(1)}, P^{(2)}$. Term 2 reuses
$P^{(0)}$'s table and applies $\phi$ in place ($x \mapsto \beta x$, with the sign convention on $y$).
`fill_to_add` materialises the signed entry an op needs into a scratch vector for the current chunk.

**Applying the schedule.** The operation list from phase 1 runs for every chunk of output points,
so its per-op decisions, computed once, are amortised over the batch.

## The `safe` flags

Each `COMBINED` ($2A + B$) and `ADD` ($A + B$) step of the
[doubling chain](#sharing-one-scan-offset-grids) runs on the batched-affine primitives, which share one
inversion across the batch, so they require generic position and fail on an $x$-coordinate collision —
two summands with equal $x$, which zeroes the difference the shared inversion divides by. One schedule
drives every point in the batch, so whether an op hits such a case depends only on $u_1, u_2$ and is
decided once, during schedule generation.

### Exceptional configurations

Phase 1 already carries the schedule's running accumulator $A$ as integer coordinates
$c = (c_0,\dots,c_3) \in \mathbb{Z}^4$ (`coeff`) over the four independent bases $B_j$, with
$A = \sum_j c_j B_j$; each op adds a digit $\delta = d^{(t)}_m \in [-8, 8]$ (`signed_delta`) to one base
$B_t$ (the [schedule's updates](#phase-1--schedule-generation-scalars-only)). Because the $B_j$ are
independent, a collision is an exact condition on $c$ — a single nonzero $c_t$ at $\pm\delta$, plus the
vertical case for `COMBINED`:

$$
\texttt{ADD}\;(A \mapsto A + \delta B_t):\quad A = \pm\,\delta B_t
\iff |c_t| = |\delta| \ \wedge\ c_j = 0\ (j \neq t),
$$

$$
\texttt{COMBINED}\;(A \mapsto 2A + \delta B_t):\quad \delta B_t = \pm A \ \text{ or }\ 2A + \delta B_t = \mathcal{O}
\iff \big(|c_t| = |\delta| \ \text{ or }\ 2c_t = -\delta\big)\ \wedge\ c_j = 0\ (j \neq t).
$$

These are the `others_zero(t)` and magnitude checks behind `FoldOp.safe`.

### Clamping the simulation

Every condition above needs $|c_t| \le 8$, so the flag only reads whether a coordinate is $0$ or lies in
the window $|c| \le 8$; any larger value is equivalent to it. Unclamped, $c$ would grow to the scalar size
$\sim 2^{127}$ and overflow `int64`, so the simulation clamps it to $\pm 2^{40}$
(`std::clamp(coeff, -CAP, CAP)`). This is sound: a clamp fires only once $|c| \ge 2^{40}$, and from there
the coordinate never returns to the window — each later step doubles it or adds $\le 8$, and
$2^{40} \gg 8$ — so the clamped stand-in *and* the true value it replaces are both "large, nonzero" at
every later step, giving identical verdicts. Any cap well above the window ($8$) and below `int64`
($2^{63}$) works.

### Execution

`FoldOp.safe = false` uses the batched-affine primitive and `safe = true` evaluates that
op per point in projective `element` arithmetic. The classification is conservative and fail-closed: a
false positive only pays the projective path, while a false negative cannot return a wrong point — the
shared $x$-coordinate zeroes a factor of the batch-inversion product, which triggers `throw_or_abort`.

## Use in IPA

`ipa.hpp` runs `log_poly_length` reduction rounds, consuming them in pairs where possible. For a
pair:

1. Run the first round's transcript work and fold the witness vectors $a, b$, but defer the SRS
   fold.
2. Compute the second round's $L$ and $R$ against the pre-fold SRS by expanding the deferred fold
   linearly over the four SRS quarters.
3. Fold both rounds' SRS at once with `batch_two_round_fold`. Its $u < 2^{127}$ precondition holds
   for every transcript challenge (`split_challenge` produces 127-bit limbs) and is asserted, not
   branched on.

With an odd round count a single round cannot pair. Production `CONST_ECCVM_LOG_N = 15`, so every
proof is seven fused pairs followed by one lone final round; at that point only one SRS point
remains, so it is folded directly ($G_0 \leftarrow u\,G_0 + G_1$) without any batch routine.

The transcript message order and proof shape are identical regardless of pairing; only the group
arithmetic that produces the folded SRS differs.

## Tests

Coverage is in `ecc/groups/affine_element.test.cpp`:

- `batch_two_round_fold` against direct per-point projective arithmetic (random and small $t$);
- `batch_two_round_fold` against two sequential production folds;
- small-scalar sweeps exercising the `safe`-op conditions at the exception-firing magnitudes.

## References

1. A. D. Booth. *A signed binary multiplication technique.* Quarterly Journal of Mechanics and
   Applied Mathematics 4(2):236–240, 1951.
2. R. P. Gallant, R. J. Lambert, S. A. Vanstone. *Faster point multiplication on elliptic curves
   with efficient endomorphisms.* CRYPTO 2001, LNCS 2139, pp. 190–200.
3. P. L. Montgomery. *Speeding the Pollard and elliptic curve methods of factorization.*
   Mathematics of Computation 48(177):243–264, 1987. (Batch-inversion / "Montgomery's trick".)
4. E. G. Straus. *Addition chains of vectors (problem 5125).* American Mathematical Monthly
   71(7):806–808, 1964. (Shared-doubling multi-scalar multiplication.)
