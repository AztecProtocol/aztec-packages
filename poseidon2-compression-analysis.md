# Poseidon2 internal-round compression: approaches, cost model, app-proving bench

Comparison of four approaches to Poseidon2 internal-round encoding on the Mega circuit, benched against the stock baseline on the 11 pinned CI app-proving flows. Single-run measurements on the remote EC2 bench machine (`HARDWARE_CONCURRENCY=16`), `bb prove --scheme chonk`.

**Branches**

| Column | Branch | PR | Tip | Pinned IVC inputs | Poseidon2 internal rounds |
|---|---|---|---|---|---|
| `56→28` | `claudebox/poseidon2-k2-basic` | [#22671](https://github.com/AztecProtocol/aztec-packages/pull/22671) | `659c0f62c` | `da92548a` | 56 compressed to 28 |
| `56→14` | `si/poseidon2-opt-attempt` | [#22652](https://github.com/AztecProtocol/aztec-packages/pull/22652) | `0f26e6efb` | `d06dbdc6` | 56 compressed to 14 (more aggressive) |
| `mt` | `merge-train/barretenberg` | — | `a97228435` | `286d8dd0` | 56 (stock, baseline) |

Two further variants of the K=4 scheme (described under *Approaches* below) are also benched by CI and referenced here but not included in the tables:

- 7-wire committed-state K=4: branch `claudebox/956a32e9fbd268f2-6`, [PR #22655](https://github.com/AztecProtocol/aztec-packages/pull/22655) (closed — did not improve on the 4-wire K=4)
- Committed-square z-commits, length-$5$/$4$ sumcheck: branch `si/poseidon2-opt-attempt-low-deg`, [PR #22670](https://github.com/AztecProtocol/aztec-packages/pull/22670) (closed)

All four branches are benched automatically by CI on every push. Live historical / per-commit numbers: <https://aztecprotocol.github.io/benchmark-page-data/bench/?branch=prs>. The tables in this document are the single-run remote-machine measurements used for the write-up; the CI dashboard is the source of truth for trend lines and cross-branch comparison over time.

Each branch was benched against **its own** pinned IVC inputs — the three tips pin different captures because the poseidon2 changes move VKs. So this is an "end-to-end proving cost for this branch's circuits" comparison, not an isolated prover A/B on identical inputs.

- Native preset: `clang20-no-avm` (`AVM=0 AVM_TRANSPILER=0 ./bootstrap.sh build_native`)
- WASM preset: `wasm-threads`, executed via `wasmtime` on the remote machine
- Peak memory: `ci3/memusage` (polls RSS every 100 ms)
- Δ columns are `(branch − mt) / mt`; negative = faster/lower than merge-train

## Approaches

### Baseline (`mt` — stock Poseidon2)

Standard Poseidon2 with $t = 4$, S-box $x \mapsto x^5$, $8$ external rounds ($4$ pre- / $4$ post-) and **$56$ internal (partial) rounds**. In the Mega circuit each permutation emits:

- $8$ rows in the `poseidon2_external` block, one per external round. The row's witness holds the full 4-wide state $(s_0, s_1, s_2, s_3)$; the relation applies the S-box to every lane and then the external MDS matrix $M_E$.
- **$56$ rows** in the `poseidon2_internal` block, one per internal round. The row holds the full 4-wide state; the relation enforces $\mathrm{next} = M_I \cdot (u_0, s_1, s_2, s_3)$ where $u_0 = (s_0 + c)^5$ and $M_I$ is the internal diagonal-plus-ones matrix. Only $s_0$ passes through an S-box each round.

Total per permutation: **$8 + 56 = 64$ rows, $8 \cdot 4 + 56 = 88$ S-box invocations**, and $56 \cdot 3 = 168$ linear moves of $(s_1, s_2, s_3)$.

### `56→28` (this branch — double-internal compression)

Observation: in the internal round, only $s_0$ is non-linear. The other three state cells $s_1, s_2, s_3$ are updated linearly by $M_I$, so a sequence of internal rounds can be algebraically collapsed if we only commit to $s_0$.

On the Mega circuit this branch replaces the $56$ single-round internal rows with **$28$ double-internal rows** that store $s_0$ at two consecutive rounds (even round in $w_l$, odd round in $w_r$). The non-S-boxed cells $(s_1, s_2, s_3)$ at row-start are **reconstructed inside the relation** from the first row of $M_I \cdot \mathrm{state} = \mathrm{next\_state}$, which is a single linear equation. The column that previously stored $s_1$ is freed.

The layout is:

- $1$ `poseidon2_transition_entry` row that copy-constrains the end of the external block to the start of the compressed block (forces the first row's $w_r = D_1 \cdot (s_0 + c)^5 + s_1 + s_2 + s_3$).
- $27$ `poseidon2_double_internal` interior rows.
- $1$ `poseidon2_double_internal_terminal` row whose successor is encoded in the standard (4-wide) layout so the external block on the other side can read it back.
- $1$ standard-encoded transition row copy-constrained to the first post-internal external row.

That's **$30$ rows per permutation for the internal block** ($1$ entry $+\ 27$ interior $+\ 1$ terminal $+\ 1$ standard transition), down from $56$. Per-row S-boxes (from the compiled relations):

- `poseidon2_transition_entry`: $1$ S-box
- `poseidon2_double_internal` (interior): **$3$ S-boxes** — $2$ for the current pair ($(w_l + q_l)^5, (w_r + q_r)^5$) and $1$ shift-side ($(w_l^{\mathrm{shift}} + q_o)^5$) so the next-pair's first round constant is already "baked in" at the row boundary
- `poseidon2_double_internal_terminal`: $2$ S-boxes (no shift-side; successor is standard-encoded)

Internal-block S-box total: $1 + 27 \cdot 3 + 2 = \mathbf{84}$ per permutation, vs. baseline's $\mathbf{56}$. Compression costs *more* S-box work but amortises it into fewer, shorter polynomial columns.

### `56→14` (si branch — K=4 "quad" compression)

Same idea taken further: each row stores $s_0$ at **four** consecutive internal rounds ($w_l, w_r, w_o, w_4$), with the row's four selectors carrying the four round constants and a few extra selector fields carrying the next row's first three round constants (used for the shifted-Vandermonde check).

Reconstructing $(s_1, s_2, s_3)$ from the committed $s_0$ values over $4$ rounds requires inverting a $3 \times 3$ Vandermonde system with nodes $(D_2, D_3, D_4)$ (the internal-matrix diagonal, excluding the S-box row). The inverse has $9$ constexpr Lagrange-basis coefficients $\alpha_j^{(k)}$ baked into the relation (see `poseidon2_quad_params.hpp`):

$$
s_j \;=\; \alpha_j^{(1)} \cdot b_1 \;+\; \alpha_j^{(2)} \cdot b_2 \;+\; \alpha_j^{(3)} \cdot b_3, \qquad j = 1, 2, 3
$$

where $b_k$ are linear combinations of the four $s_0$ witnesses, round constants and $D_i$. The shift-side constraints use the *forward* Vandermonde (not Lagrange) so no inversion is needed on the successor side — $4$ subrelations enforce the system row by row.

Row layout per permutation collapses to **$16$ internal-block rows**: $1$ entry $+\ 13$ interior $+\ 1$ terminal $+\ 1$ standard transition, down from $56$. Per-row S-boxes:

- `poseidon2_transition_entry` (K=4 variant): $3$ S-boxes (one per row of the $3 \times 3$ Vandermonde RHS)
- `poseidon2_double_internal` (K=4 interior): **$7$ S-boxes** — $4$ for the current row's $s_0$ at rounds $0..3$, and $3$ more on the shift side to build $b_1^{\mathrm{next}}, b_2^{\mathrm{next}}, b_3^{\mathrm{next}}$ for the forward-Vandermonde check into the next row
- `poseidon2_double_internal_terminal` (K=4): $4$ S-boxes (current row only; successor is standard-encoded so no shift-side Vandermonde needed)

Internal-block S-box total: $3 + 13 \cdot 7 + 4 = \mathbf{98}$ per permutation, vs. `56→28`'s $84$ and baseline's $56$. The subrelation degree is *unchanged* from `56→28` (each S-box lands on a distinct wire, so they don't compose multiplicatively inside a subrelation — everything stays partial-length $7$ including selector and gate separator). The extra work is all horizontal (more S-boxes per row, more Vandermonde algebra), not vertical.

### `56→14` variant A — 7-wire committed state (`claudebox/956a32e9fbd268f2-6`)

Same K=4 layout as above, but instead of *deriving* the non-S-boxed state cells $(s_1, s_2, s_3)$ at row-start via a $3 \times 3$ Vandermonde inversion, they are committed as **three extra witness columns** in the Mega trace:

$$
w_{p2,s_1} \;=\; s_1 \text{ at round } 4i, \qquad w_{p2,s_2} \;=\; s_2 \text{ at round } 4i, \qquad w_{p2,s_3} \;=\; s_3 \text{ at round } 4i.
$$

The relation's $7$ subrelations (up from $4$) now read $s_1, s_2, s_3$ directly from $w_{p2,s_{1..3}}$ and check each of the four $s_0$ outputs plus three $s_j$ outputs against the shifted wires:

$$
\begin{aligned}
A_0, A_1, A_2 &:& D_1 \cdot u_k + \mathrm{sum}_k \;&=\; w_r, w_o, w_4 \quad && (s_0 \text{ at rounds } 1, 2, 3)\\
A_3           &:& D_1 \cdot u_3 + \mathrm{sum}_3 \;&=\; w_l^{\mathrm{shift}} \quad && (s_0 \text{ at round } 4 = \text{next row's } w_l)\\
A_4, A_5, A_6 &:& s_j \text{ at round } 4 \;&=\; w_{p2,s_j}^{\mathrm{shift}} \quad && (s_j \text{ at round } 4 = \text{next row's } s_j\text{-wire})
\end{aligned}
$$

What this buys:

- **No Vandermonde inversion** (saves $63$ muls per interior row).
- **No shift-side Vandermonde** (saves the $3$ shift-side S-boxes $+\ 44$ muls of $b_k^{\mathrm{next}}$ RHS $\approx 107$ muls per interior row).
- Still need the $4$ S-boxes on the current row and the $4$ `step()` recurrence iterations (rewritten to consume the committed $w_{p2,s_\ast}$).

What it costs:

- **$3$ additional committed polynomials** on the Mega trace ($w_{p2,s_1}, w_{p2,s_2}, w_{p2,s_3}$). These add their own MSM/commitment cost and take bytes in the CRS.
- $7$ subrelations instead of $4$ ($3$ extra Acc$\times$Acc output scalings per row, $\approx 21$ muls).

**Empirical result:** this variant did not improve on the 4-wire K=4 (`si/poseidon2-opt-attempt`) in end-to-end app-proving wall time. The trace-width increase offsets the per-row sumcheck savings: the MSMs and commitments for the three extra committed polynomials cost about as much as the Vandermonde inversion work saved per row.

### `56→14` variant B — committed-square S-boxes, degree-$5$ sumcheck (`si/poseidon2-opt-attempt-low-deg`)

Different angle: keep the 4-wire K=4 layout (still reconstruct $(s_1, s_2, s_3)$ via the Vandermonde inversion), but **lower the sumcheck subrelation degree** by committing the S-box *squares* as fresh witnesses.

New committed wires $z_l, z_r, z_o, z_4$ hold the row's four S-box squares:

$$
z_k \;\equiv\; (w_k + c_k)^2.
$$

With $z_k$ already in the trace, the degree-$5$ S-box value can be re-expressed as

$$
u_k \;=\; (w_k + c_k)^5 \;=\; z_k^2 \cdot (w_k + c_k),
$$

which is degree $\mathbf{3}$ in the committed wires $(z_k, w_k)$ rather than degree $5$. Four extra z-check subrelations enforce $z_k = (w_k + c_k)^2$ on every Poseidon2-tagged row (degree $2$). The overall `SUBRELATION_PARTIAL_LENGTHS` drop from $7$ to

$$
\{5, 5, 5, 5, \;\; 4, 4, 4, 4\}
$$

(main subrelations at partial length $5$, z-checks at $4$). **The length-$7$ `Univariate<FF, 7>` gets replaced with `Univariate<FF, 5>` for the main subrelations and `Univariate<FF, 4>` for the z-checks.**

What this buys:

- Every `Accumulator.sqr()` / `Acc` $\times$ `Acc` / `Acc` $\times$ `Fr` previously costing $7$ elementwise muls now costs $\mathbf{5}$ muls (or $4$ for the z-checks). That's a uniform ${\sim}29\%$ shrink on all the Acc-level arithmetic — not just the S-box, but every scaling, Vandermonde RHS term, Lagrange solve product, and recurrence `step()`.
- Shorter per-round sumcheck univariates $\Rightarrow$ fewer evaluations to compute, serialise, and verify per round.

What it costs:

- **$4$ new committed polynomials** ($z_l, z_r, z_o, z_4$) on the Mega trace, plus the $4$ z-check subrelations that fire on every Poseidon2 row (internal *and* external — the z-squares are shared with the external relation in this branch).
- Every place previously doing $(w + c)^2$ inside the relation as degree-$2$ work is now a *commitment* — moving CPU work from sumcheck into the MSM.

### Why neither variant improves: commit cost vs. sumcheck savings

Chonk has no FFTs on the prover side, so the prover's compute budget is dominated by two buckets:

$$
T_{\mathrm{prover}} \;\approx\; C \cdot \mathrm{MSM}(N) \;+\; F_{\mathrm{sum}} \sum_{\tau} N_{\mathrm{active},\tau} \cdot R_{\tau}
$$

where $C$ is the number of committed polynomials on the Mega trace, $N$ the dyadic trace length ($\approx 2^{20}$ for a chonk app circuit), $R_\tau$ the per-row field-mult count of the relation firing on row-type $\tau$, and $F_{\mathrm{sum}} \approx 2$ the geometric factor that falls out of sumcheck summing $N_{\mathrm{active}}/2^k$ edges over $\log_2 N$ rounds.

**Per-commit prover cost on BN254 at $N = 2^{20}$.** Pippenger on $N$ scalars with a 13-bit window does $\sim N / \log N$ bucketed EC additions after amortisation, each $\approx 11$ field muls, giving

$$
\mathrm{MSM}(2^{20}) \;\approx\; 10^6 \text{ EC adds} \;\approx\; 10^7 \text{ field muls per new committed polynomial.}
$$

This cost scales with $N$, not with $N_{\mathrm{active}}$. A polynomial whose support is only the Poseidon2-tagged rows ($N_{\mathrm{active}} \approx N/50$ on an app circuit with $P \approx 10^3$ permutations) still pays the full length-$N$ MSM.

**Break-even inequality.** For an optimisation that adds $\Delta C$ committed polynomials but shrinks per-active-row sumcheck work by $\Delta R$ muls, the net profit is

$$
\Delta T \;=\; F_{\mathrm{sum}} \cdot \Delta R \cdot N_{\mathrm{active}} \;-\; \Delta C \cdot \mathrm{MSM}(N)
     \;\approx\; 2 \cdot \Delta R \cdot N_{\mathrm{active}} \;-\; \Delta C \cdot 10^7,
$$

so it is worth it iff

$$
\Delta R \;>\; \frac{\Delta C \cdot 10^7}{2 \cdot N_{\mathrm{active}}}.
$$

On a chonk app circuit ($N_{\mathrm{active}} \approx 2 \cdot 10^4$) this evaluates to

$$
\boxed{\;\Delta R \;>\; 250 \cdot \Delta C \quad \text{muls per active-row evaluation.}\;}
$$

#### `claudebox/956a32e9fbd268f2-6` (7-wire K=4, committed $s_1, s_2, s_3$)

| Quantity | Value |
|---|---|
| Extra commits $\Delta C$ | $3$ ($w_{p2,s1}, w_{p2,s2}, w_{p2,s3}$) |
| Commit cost | $3 \cdot 10^7$ muls |
| Interior-row mult count (exact, from `accumulate()`) | $\mathbf{268}$ muls $=$ $2$ setup $+$ $84$ S-boxes $+$ $84$ recurrence $+$ $28$ $(s_0 \cdot D_1)$ adds $+$ $70$ subrel outputs |
| Interior-row saving vs. 4-wire K=4 | $461 - 268 = \mathbf{193}$ muls |
| Required $\Delta R$ to break even | $\Delta C \cdot 250 = \mathbf{750}$ muls |

Numerically, with $P \approx 10^3$ permutations:

$$
\begin{aligned}
\text{Savings}    &\;\approx\; 2 \cdot 193 \cdot 13 \cdot P \;\approx\; 5 \cdot 10^6 \text{ muls}\\
\text{Added cost} &\;\approx\; 3 \cdot 10^7 \text{ muls}\\
\Delta T          &\;\approx\; -2.5 \cdot 10^7 \text{ muls}\quad(\approx 6\times\text{ net-negative}).
\end{aligned}
$$

The per-row saving ($193$) lands at roughly **one-quarter of break-even** — no relation-body rewrite that stays inside the K=4 skeleton can rescue the scheme, because what's eliminated (the $3\times 3$ Vandermonde inversion $+$ 3 shift-side S-boxes, $\sim 167$ muls) is smaller than what the commits cost per active row. Matches the empirical observation: the prototype runs within noise of 4-wire K=4.

#### `si/poseidon2-opt-attempt-low-deg` (committed-square z-commits, length-$5$/$4$ sumcheck)

| Quantity | Value |
|---|---|
| Extra commits $\Delta C$ | $4$ ($z_l, z_r, z_o, z_4$) |
| Commit cost | $4 \cdot 10^7$ muls |
| `SUBRELATION_PARTIAL_LENGTHS` | main: $7 \to \mathbf{5}$, z-checks: $- \to \mathbf{4}$ |
| Interior-row mult count (length-$5$, z-squared S-boxes) | $\mathbf{\sim 328}$ muls $=$ $40$ S-boxes $+$ $32$ $b_k$ $+$ $45$ Lagrange solve $+$ $60$ recurrence $+$ $30$ shift-side S-boxes $+$ $32$ $b_k^{\mathrm{next}}$ $+$ $50$ subrel outputs $+$ $32$ z-checks $+$ $7$ misc |
| Interior-row saving vs. 4-wire K=4 at length $7$ | $461 - 328 = \mathbf{\sim 133}$ muls |
| Required $\Delta R$ to break even | $\Delta C \cdot 250 = \mathbf{1000}$ muls |

Numerically:

$$
\begin{aligned}
\text{Savings}    &\;\approx\; 2 \cdot 133 \cdot 13 \cdot P \;\approx\; 3.5 \cdot 10^6 \text{ muls}\\
\text{Added cost} &\;\approx\; 4 \cdot 10^7 \text{ muls}\\
\Delta T          &\;\approx\; -3.7 \cdot 10^7 \text{ muls}\quad(\approx 11\times\text{ net-negative}).
\end{aligned}
$$

Low-deg gets a bigger per-row saving than the 7-wire variant on the 4-to-2 S-box reduction ($3 \cdot 21 \to 3 \cdot 10$ per S-box), but it fails for the same structural reason: $\Delta C \cdot \mathrm{MSM}(N)$ dominates the budget and $\Delta C = 4 > 3$. The `Univariate<FF, 7> → <FF, 5>` shrink is uniform across every Acc-level op (not a localised fix), but it's applied against $N_{\mathrm{active}} \approx N/50$, so the $N / N_{\mathrm{active}}$ factor still sinks it.

#### The structural takeaway

For a Poseidon2-local optimisation to pay for itself at $P \approx 10^3$ permutations on a $2^{20}$-row app circuit, the per-active-row saving must clear $\sim 250 \cdot \Delta C$ muls. Both variants eliminate work in the hundreds of muls per row — roughly half of the cheapest sub-component of the relation body — while paying in tens of millions of muls per added commit. The only escape routes are:

1. **Stay at $\Delta C = 0$.** Rewrite the relation without new commits (what the `56→28` and 4-wire `56→14` branches do). Dollar-for-dollar the best ROI per saved mul.
2. **Raise $N_{\mathrm{active}} / N$.** If Poseidon2 dominated the trace ($N_{\mathrm{active}} \approx N$), break-even would drop from $250 \cdot \Delta C$ to $\sim 10 \cdot \Delta C$ muls/row, and both variants turn into wins. Proving systems where Poseidon2 *is* the trace (pure hash proofs, folding schemes) should re-evaluate these.
3. **Amortise the commits across other heavy relations.** If the same $z_k$ or $w_{p2,s\ast}$ columns get re-used by another relation, $\Delta C \cdot \mathrm{MSM}(N)$ is split — but nothing else on the Mega trace uses $(w + \text{const})^2$ or the internal-matrix state.

### Precise field-mult count per permutation

Each entry below is a full BN254 $\mathrm{Fr}$ multiplication, counted straight from the committed `accumulate()` bodies using this accounting:

- $\mathrm{Acc.sqr()}$ / $\mathrm{Acc} \times \mathrm{Acc}$ / $\mathrm{Acc} \times \mathrm{Fr}$ → **$7$ muls** (elementwise over the length-$7$ Lagrange array)
- $\mathrm{CoeffAcc} \times \mathrm{Fr}$ (scale a degree-$1$ monomial) → **$2$ muls**
- $\mathrm{CoeffAcc} \times \mathrm{CoeffAcc}$ (Karatsuba via the precomputed $a_0 + a_1$) → **$3$ muls**
- $\mathrm{Acc}(\mathrm{CoeffAcc})$ extrapolation → **$0$ muls** (pure adds)

Per-row totals:

| Row kind | Baseline `mt` | `56→28` (K=2) | `56→14` (K=4) |
|---|---:|---:|---:|
| `poseidon2_external` (shared, $8$ rows/perm) | $114$ | $114$ | $114$ |
| `poseidon2_internal` (interior, baseline only) | $\mathbf{55}$ | — | — |
| `poseidon2_transition_entry` ($1$/perm) | — | $\mathbf{40}$ | $\mathbf{140}$ |
| `poseidon2_double_internal` (interior) | — | $\mathbf{154}$ | $\mathbf{461}$ |
| `poseidon2_double_internal_terminal` ($1$/perm) | — | $\mathbf{119}$ | $\mathbf{312}$ |

Breakdown of the interior compressed row — where the compute lives:

| Component (Acc-level) | K=2 interior | K=4 interior |
|---|---:|---:|
| S-boxes on current row | $3 \cdot 21 = 63$ | $4 \cdot 21 = 84$ |
| S-boxes on shift side | $1 \cdot 21 = 21$ | $3 \cdot 21 = 63$ |
| $\mathrm{scaled}\_u_\ast \;=\; u_\ast \cdot q_{\mathrm{by\ scaling}}$ | $3 \cdot 7 = 21$ | — |
| $b_1, b_2, b_3$ Vandermonde RHS | — | $44$ |
| $b_k^{\mathrm{next}}$ on shift side | — | $44$ |
| **$3 \times 3$ Lagrange solve $s_j = \sum_k \alpha_j^{(k)} \cdot b_k$** | — | $\mathbf{9 \cdot 7 = 63}$ |
| **$4$ recurrence `step()`s** (each $3 \times s_k \cdot (D_{k+1} - 1)$) | — | $\mathbf{4 \cdot 21 = 84}$ |
| $\mathrm{out}_0 = u_{\mathrm{last}} \cdot D_1 + T_3$ | — | $7$ |
| Diagonal / linear combos in $v_k^{\mathrm{linear}}$ / $\mathrm{lhs}_k$ | $8$ | $42$ |
| Per-subrelation output scalings | $37$ | $28$ |
| $q_{\mathrm{sel}} \cdot \mathrm{scaling\_factor}$ | $2$ | $2$ |
| Small linear-monomial setup | $2$ | — |
| **Total per interior row** | $\mathbf{154}$ | $\mathbf{461}$ |

Per-permutation totals (Mega, one hash):

| | rows | × muls/row | block total | vs. baseline |
|---|---:|---:|---:|---:|
| **Baseline** |  |  |  |  |
|  external | 8 | 114 | 912 |  |
|  internal | 56 | 55 | 3,080 |  |
|  **sum** | 64 |  | **3,992** | — |
| **`56→28` (K=2)** |  |  |  |  |
|  external | 8 | 114 | 912 |  |
|  transition_entry | 1 | 40 | 40 |  |
|  double_internal interior | 27 | 154 | 4,158 |  |
|  double_internal terminal | 1 | 119 | 119 |  |
|  standard transition | 1 | 0 | 0 |  |
|  **sum** | 38 |  | **5,229** | **+31%** |
| **`56→14` (K=4)** |  |  |  |  |
|  external | 8 | 114 | 912 |  |
|  transition_entry | 1 | 140 | 140 |  |
|  double_internal interior | 13 | 461 | 5,993 |  |
|  double_internal terminal | 1 | 312 | 312 |  |
|  standard transition | 1 | 0 | 0 |  |
|  **sum** | 24 |  | **7,357** | **+84%** |

**Takeaway.** Both compressions *add* sumcheck work — K=2 by ~31%, K=4 by ~84% — because the reconstruction of the non-S-boxed state cells is not free. K=2 needs one Acc×Fr diagonal scaling per subrelation (single linear equation for `s_1`); K=4 needs a full 3×3 Vandermonde inversion (**63 muls**) plus four recurrence iterations (**84 muls**) to materialise `s_1, s_2, s_3` at each compressed row, on top of doubling the S-box count vs K=2. That's why K=4 spends ~40% more muls per permutation than K=2 despite halving the row count — the row-count win doesn't cover the per-row compute growth. In the end-to-end bench, K=2 lands at the inflection point where the trace-length savings still outweigh the extra sumcheck work, and K=4 slips back into mostly trading one cost for another.

## Native

| Flow | 56→28 | 56→14 | mt | Δ 56→28 | Δ 56→14 | 56→28 mem | 56→14 mem | mt mem | Δ 56→28 mem | Δ 56→14 mem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    |  6.93s |  7.18s |  7.43s |  -6.6% |  -3.3% | 299 MB | 295 MB | 307 MB |  -2.6% |  -3.9% |
| deploy_schnorr+sponsored_fpc                                    |  6.55s |  6.68s |  7.25s |  -9.6% |  -8.0% | 300 MB | 299 MB | 309 MB |  -2.9% |  -3.2% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 11.65s | 11.71s | 12.43s |  -6.2% |  -5.7% | 430 MB | 431 MB | 491 MB | -12.4% | -12.2% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    |  7.29s |  7.47s |  7.95s |  -8.3% |  -6.0% | 421 MB | 399 MB | 457 MB |  -7.9% | -12.7% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 16.05s | 16.22s | 16.40s |  -2.1% |  -1.1% | 872 MB | 896 MB | 850 MB |  +2.6% |  +5.4% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                |  6.45s |  6.56s |  6.75s |  -4.4% |  -2.8% | 301 MB | 299 MB | 311 MB |  -3.2% |  -3.9% |
| ecdsar1+transfer_0_recursions+private_fpc                       |  9.05s |  9.27s |  9.76s |  -7.3% |  -5.1% | 383 MB | 370 MB | 426 MB | -10.1% | -13.1% |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     |  5.54s |  5.56s |  5.82s |  -4.8% |  -4.4% | 282 MB | 279 MB | 290 MB |  -2.8% |  -3.8% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 10.20s | 10.36s | 11.01s |  -7.3% |  -5.8% | 416 MB | 397 MB | 488 MB | -14.8% | -18.6% |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     |  6.48s |  6.53s |  6.84s |  -5.3% |  -4.6% | 298 MB | 295 MB | 305 MB |  -2.3% |  -3.3% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    |  6.99s |  6.99s |  7.83s | -10.8% | -10.7% | 396 MB | 370 MB | 455 MB | -13.0% | -18.7% |

## WASM

| Flow | 56→28 | 56→14 | mt | Δ 56→28 | Δ 56→14 | 56→28 mem | 56→14 mem | mt mem | Δ 56→28 mem | Δ 56→14 mem |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deploy_ecdsar1+sponsored_fpc                                    | 24.55s | 25.41s | 25.81s |  -4.9% |  -1.6% | 1100 MB† | 1024 MB† | 1090 MB† |  +0.9% |  -6.1% |
| deploy_schnorr+sponsored_fpc                                    | 18.81s | 19.23s | 20.14s |  -6.6% |  -4.5% |  312 MB |  390 MB |  319 MB |  -2.2% | +22.3% |
| ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc            | 32.92s | 33.60s | 35.41s |  -7.0% |  -5.1% |  439 MB |  527 MB |  510 MB | -13.9% |  +3.3% |
| ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc    | 20.60s | 21.14s | 22.63s |  -9.0% |  -6.6% |  434 MB |  492 MB |  490 MB | -11.4% |  +0.4% |
| ecdsar1+storage_proof_7_layers+sponsored_fpc                    | 49.86s | 50.59s | 51.07s |  -2.4% |  -0.9% |  854 MB |  962 MB |  852 MB |  +0.2% | +12.9% |
| ecdsar1+token_bridge_claim_private+sponsored_fpc                | 18.26s | 18.81s | 19.32s |  -5.5% |  -2.6% |  314 MB |  392 MB |  321 MB |  -2.2% | +22.1% |
| ecdsar1+transfer_0_recursions+private_fpc                       | 26.08s | 26.66s | 27.87s |  -6.4% |  -4.3% |  394 MB |  487 MB |  439 MB | -10.3% | +10.9% |
| ecdsar1+transfer_0_recursions+sponsored_fpc                     | 15.64s | 16.07s | 16.56s |  -5.6% |  -3.0% |  296 MB |  378 MB |  303 MB |  -2.3% | +24.8% |
| ecdsar1+transfer_1_recursions+private_fpc                       | 29.04s | 29.48s | 31.48s |  -7.8% |  -6.4% |  428 MB |  497 MB |  490 MB | -12.7% |  +1.4% |
| ecdsar1+transfer_1_recursions+sponsored_fpc                     | 18.39s | 18.94s | 19.39s |  -5.1% |  -2.3% |  308 MB |  389 MB |  315 MB |  -2.2% | +23.5% |
| schnorr+deploy_tokenContract_with_registration+sponsored_fpc    | 19.71s | 20.16s | 21.58s |  -8.6% |  -6.6% |  434 MB |  492 MB |  488 MB | -11.1% |  +0.8% |

† `deploy_ecdsar1+sponsored_fpc/wasm` peaks at ~1 GB on all three branches while its native counterpart sits at ~300 MB. Every other flow's WASM peak tracks native within ~5%. Because all three branches show the same ~1 GB peak for this one flow, it's an artifact of wasm linear-memory accounting under wasmtime, not a genuine working-set difference.

## Summary

- **Time**: both poseidon2 variants are faster than merge-train on every flow. The milder `56→28` variant is uniformly ahead of the more aggressive `56→14`.
  - Native total: `56→28` **-6.3%**, `56→14` **-5.0%** vs mt
  - WASM total: `56→28` **-6.0%**, `56→14` **-3.8%** vs mt
- **Native memory**: both variants cut peak RSS on the larger flows (10–19% on `amm`, `transfer_1+private_fpc`, `schnorr+deploy_token`); small flows are within noise. Totals look flat because the `storage_proof_7_layers` peak dominates and is slightly higher on both variants than on mt (~+3–5%).
- **WASM memory**: `56→28` reduces peak on the bigger flows the same way as native. `56→14`, by contrast, **increases** WASM peak memory on most flows (+10–25%) — this is wasm-specific (native is fine on the same branch). Worth investigating before taking the more aggressive compression.
