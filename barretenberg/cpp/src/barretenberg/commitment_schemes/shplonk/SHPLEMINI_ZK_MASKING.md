# Shplemini Masking

This note states a masking lemma for replacing the current full-size random
`gemini_masking_poly` in the Gemini + Shplonk + KZG path of Shplemini.

Let $N$ be the dyadic circuit size and $d = \log_2 N$. Write $E_j(X) = X^j$
for the standard monomial basis of $\mathbb{F}[X]_{<N}$, so a polynomial
$P = \sum_j c_j\, E_j$ is identified with its coefficient vector $(c_0,
\ldots, c_{N-1})$ as stored by the prover.

The proposed replacement is a sparse masking polynomial with a small number of
random entries on a fixed support: $2d$ entries on a **tail-halving** layout.

## Lemma 1 (KZG)

Assume $2d < N$; when $2d \ge N$, the support covers the whole dyadic domain
and the sparse-mask question degenerates to the dense case. Let $e$ be the
maximum end-index of the masked polynomial data. Choose the smallest even
$E \ge e$ with $E \le N$ such that the top pair
$(E-1,E-2)$ is disjoint from every dyadic pair
$(N/2^\ell,\,N/2^\ell-1)$ for $1 \le \ell < d$. Equivalently, if
$B=N/2^\ell$, exclude $E=B$ and $E=B+2$. The **tail-halving support** is

$$
S \;=\; \bigl[\,E - 1,\ E - 2,\ N/2,\ N/2 - 1,\ N/4,\ N/4 - 1,\ \ldots,\ 2,\ 1\,\bigr],
$$

truncated to exactly $2d$ entries. The evenness of $E$ ensures the top pair
$(E-1,E-2)$ falls in a single Gemini first-fold even/odd pair; the disjointness
condition keeps it separate from the dyadic filtration pairs.

Let $M = \sum_{j \in S} c_j\, E_j$ be the dedicated `gemini_masking_poly`
sampled with $|S| = 2d$ independent random coefficients on this support.
Work in the algebraic group model for KZG, with a simulator that knows the
KZG trapdoor $\tau$. Assume the Shplemini Fiat-Shamir challenges avoid the
bad set consisting of:

- denominator-zero events in Shplonk and KZG;
- challenge collisions that make the selected evaluation points coincide;
- vanishing multilinear Lagrange factors $L_b(u_0,\ldots,u_{t-1})$ used by
  the local blocks below.

The rank behaviour splits into two regimes by where the top pair $(E-1,E-2)$
falls. With $K := \mathbb{F}(u_0,\ldots,u_{d-1},r_0,\ldots,r_{d-1},\tau)$ the
rational function field:

- **High tail** ($E > 3N/4$): the top pair sits in the upper quarter and the
  Gemini block has full column rank $2d$ ($\det B \ne 0$ in $K$).
- **Low tail** ($E \le 3N/4$): the Gemini block drops rank by exactly one to
  $2d-1$; the sparse image still contains the dense degree-$<E$ leakage image.

Either way the mask randomises every leakage direction a dense mask on
$\mathbb{F}[X]_{<E}$ could expose, which is what the simulation step needs.

### Proof

Steps 1 and 2 (reduction to the Gemini block and its structural normal form)
are common to both regimes. The rank computation then splits into the
high-tail Step 3A and the low-tail Step 3B. Steps 4 and 5 (Schwartz–Zippel and
simulation) are again common. Numerical/symbolic *exhibitions* supporting the
two regimes are deferred to Appendices A and B.

**1. The Shplemini transcript space and a first rank bound.** In the
algebraic group model for KZG, a commitment $[P]$ is represented by the scalar
$P(\tau)$. The simulator is allowed to know $\tau$. The masking polynomial
$M$ contributes the following scalars to the transcript:

| scalar | source |
|---|---|
| $M(u)$ | sumcheck output |
| $M(\tau),\, M_1(\tau),\, \ldots,\, M_{d-1}(\tau)$ | Gemini commitments $[M_t]$ ($d$ total) |
| $M_0(-r_0),\, \ldots,\, M_{d-1}(-r_{d-1})$ | Gemini fold openings ($d$ total) |
| $Q_M(\tau)$ | Shplonk commitment $[Q]$ |
| $W_M(\tau)$ | KZG witness commitment $[W]$ |

These $1 + d + d + 1 + 1 = 2d + 3$ scalars live in the **Shplemini transcript
space** $\mathcal{T} := \mathbb{F}^{\,2d+3}$. The total $M$-leakage is captured
by the linear map $\Psi:\ \mathrm{span}(E_j : j \in S)\ \longrightarrow\ \mathcal{T}$.

**Shplonk collapse and the rank bound.** Shplonk batches the opening claims at
points $z_t$ with challenge $\nu$:

$$
Q(X) \;=\; \sum_{t} \nu^{\,t}\, \frac{P_t(X) - v_t}{X - z_t},
$$

so the $M$-contribution $Q_M(\tau)$ is a linear combination of the
Gemini scalars $M(\tau)$, $M_t(\tau)$, $M_t(-r_t)$, and $M(u)$, with
coefficients that depend only on $\nu$ and the public evaluation points. The
positive-point values $M_t(r_t)$ are derivable from the Gemini fold identity,
so they do not add independent $M$-leakage.

The KZG step then opens $Q$ at the Shplonk challenge $z$:

$$
W(X) \;=\; \frac{Q(X)}{X - z},\qquad
W_M(\tau) \;=\; \frac{Q_M(\tau)}{\tau - z}.
$$

The Shplonk claim opened by KZG is the hardcoded zero claim $Q(z)=0$, so the
witness row is only a scalar multiple of $Q_M(\tau)$. Therefore both
`Shplonk:Q` and `KZG:W` lie in the span of the Gemini scalars above, and
$\mathrm{rank}(\Psi)$ equals the rank of its Gemini projection onto
$\mathbb{F}^{2d+1}$. The domain has dimension $|S|=2d$, so the rank is at
most $2d$.

**2. The Gemini block and its normal form.** It suffices to work with the
Gemini projection. Write $\mathcal{T}_{\mathrm{Gem}}=\mathbb{F}^{2d+1}$,
$V=\mathrm{span}\{E_j:j\in S\}$, and let
$\Psi_{\mathrm{Gem}}:V\longrightarrow\mathcal{T}_{\mathrm{Gem}}$ be the Gemini
leakage map with coordinates

$$
M(u),\quad M_0(\tau),\ldots,M_{d-1}(\tau),\quad
M_0(-r_0),\ldots,M_{d-1}(-r_{d-1}).
$$

The row $M(u)$ is not needed for the rank bound. Let $B$ be the $2d\times 2d$
matrix obtained by dropping the $M(u)$ row.

**Fold formula.** The only formula we need is the effect of Gemini folding
on one monomial. After $t$ folds,

$$
\mathrm{fold}_t(E_j) \;=\; L_{j \bmod 2^t}(u_0,\ldots,u_{t-1})\,
E_{\lfloor j / 2^t \rfloor},
\qquad
L_b(u_0,\ldots,u_{t-1}) \;=\; \prod_{a=0}^{t-1}
\begin{cases} 1 - u_a & \text{if } \mathrm{bit}_a(b) = 0,\\ u_a & \text{otherwise.}\end{cases}
$$

Hence the entry of $B$ in row $(t,x)$, where $x\in\{\tau,-r_t\}$, and column
$E_s$ is

$$
B_{(t,x),s}
=L_{s\bmod 2^t}(u_0,\ldots,u_{t-1})\,
x^{\lfloor s/2^t\rfloor}.
$$

**Row basis change.** Replace each pair $(M_t(\tau),M_t(-r_t))$ by
$(D_t,M_t(-r_t))$, where $D_t := M_t(\tau)-M_t(-r_t)$. This is a
determinant-preserving row change: the change-of-basis matrix is
block-diagonal with $2\times 2$ blocks $\begin{pmatrix}1 & -1\\0 & 1\end{pmatrix}$
of unit determinant. From the fold formula,

$$
D_t(E_s) \;=\; L_{s\bmod 2^t}(u)\,\bigl(\tau^{q}-(-r_t)^{q}\bigr),\qquad
q=\lfloor s/2^t\rfloor.
$$

The structural observation that drives both regimes is:

> **(★)** $D_t(E_s) = 0$ whenever $s < 2^t$.

Indeed for $s<2^t$ we have $q=0$ and $\tau^0-(-r_t)^0=0$.

**3A. High tail ($E > 3N/4$): full rank $2d$.** Index the support as adjacent
pairs by their larger monomial:

$$
P_{\mathrm{top}}=\{E-1,E-2\},\qquad
P_{2^k}=\{2^k,2^k-1\}\quad(1\le k\le d-1).
$$

Order the pairs by increasing index $P_2,P_4,\ldots,P_{2^{d-1}},P_{\mathrm{top}}$,
let $V_0=\{0\}$, and define

$$
V_m=\mathrm{span}(P_2\cup\cdots\cup P_{2^m})\ \ (1\le m\le d-1),\qquad
V_d=V.
$$

Let $B_{\le m}$ be the submatrix of columns in $V_m$. We show by induction that
$\mathrm{rank}(B_{\le m})=2m$.

**Induction via Schur complements.** Suppose
$\mathrm{rank}(B_{\le m-1})=2(m-1)$. Let $C_{m-1}$ be any full-rank
$2(m-1)\times 2(m-1)$ minor of $B_{\le m-1}$. Augment with the two new
columns of the pair $P\in\{P_{2^m},P_{\mathrm{top}}\}$ and two new rows
$(D_k,M_k(-r_k))$ — with $k=m$ for a dyadic pair and $k=0$ for the top pair
— to form $\begin{pmatrix} C_{m-1} & R \\ L & A \end{pmatrix}$. The pair
contributes rank $2$ modulo $V_{m-1}$ iff the Schur complement

$$
S \;:=\; A \;-\; L\,C_{m-1}^{-1}\,R
$$

has nonzero determinant in $K$. The Schur complement depends only on the
column span $V_{m-1}$, not on the choice of $C_{m-1}$, so $\det S\ne 0$ is
well-defined. The induction step is therefore: **at each pair, verify
$\det S\ne 0$ in $K$.**

**Dyadic step.** For the pair $P_{2^k}=\{2^k,2^k-1\}$ ($1\le k\le d-1$),
the raw local block on rows $(D_k,M_k(-r_k))$ is

$$
A_k \;=\;
\begin{pmatrix}
D_k(E_{2^k}) & D_k(E_{2^k-1})\\
M_k(-r_k)(E_{2^k}) & M_k(-r_k)(E_{2^k-1})
\end{pmatrix}
\;=\;
\begin{pmatrix}L_0(\tau+r_k) & 0\\ -L_0\,r_k & L_{2^k-1}\end{pmatrix},
$$

with $L_0,L_{2^k-1}$ evaluated at $(u_0,\ldots,u_{k-1})$. The zero in the
$(1,2)$ entry is precisely (★).

The Schur complement $S_k$ inherits the upper-triangular shape of $A_k$
through (★): the row $D_k$ vanishes identically on $V_{m-1}$ (every column
index there is strictly below $2^k$), so the first row of $L$ is zero and
the first row of $S_k$ equals the first row of $A_k$. Hence

$$
S_k \;=\;
\begin{pmatrix} L_0(\tau+r_k) & 0 \\ -L_0\,r_k-\alpha_k & L_{2^k-1}-\rho_k \end{pmatrix},
\qquad
\det S_k \;=\; L_0(\tau+r_k)\,\bigl(L_{2^k-1}-\rho_k\bigr),
$$

where $\alpha_k,\rho_k\in K$ are the Schur corrections at the $E_{2^k}$ and
$E_{2^k-1}$ columns. The pair contributes rank $2$ iff
$L_{2^k-1}-\rho_k\ne 0$ in $K$ (the prefactor $L_0(\tau+r_k)$ is a nonzero
polynomial in $K$, vanishing only on an explicit subvariety absorbed into
the bad set).

**Top-pair step.** For $P_{\mathrm{top}}$, use the rows $(D_0,M_0(-r_0))$ at
fold level $0$. The raw block is

$$
A_{\mathrm{top}} \;=\;
\begin{pmatrix}
\tau^{E-1}-(-r_0)^{E-1} & \tau^{E-2}-(-r_0)^{E-2}\\
(-r_0)^{E-1} & (-r_0)^{E-2}
\end{pmatrix},
\qquad
\det A_{\mathrm{top}} \;=\; \tau^{E-2}(-r_0)^{E-2}(\tau+r_0).
$$

Here (★) is vacuous at $t=0$, so both rows of $L$ are generically nonzero
and neither row of $S_{\mathrm{top}}=A_{\mathrm{top}}-L\,C_{d-1}^{-1}R$ is
preserved from $A_{\mathrm{top}}$. The pair contributes rank $2$ iff
$\det S_{\mathrm{top}}\ne 0$ in $K$.

**Filtered-minor lemma.**

> *Lemma (FM).* For the tail-halving support $S$ with $E > 3N/4$ and the row
> ordering above, the rational functions
> $$
> L_{2^k-1}(u_0,\ldots,u_{k-1})-\rho_k\quad(1\le k\le d-1)
> \qquad\text{and}\qquad
> \det S_{\mathrm{top}}
> $$
> are all nonzero in $K$.

The Schur-complement induction shows (FM) implies $\mathrm{rank}(B_{\le m})=2m$
at every step. Iterating the Schur factorization yields

$$
\det B \;=\; \det S_{\mathrm{top}}\;\cdot\;\prod_{k=1}^{d-1}
L_0(u_0,\ldots,u_{k-1})\,(\tau+r_k)\,\bigl(L_{2^k-1}(u_0,\ldots,u_{k-1})-\rho_k\bigr).
$$

Each $L_0$ and $(\tau+r_k)$ is a nonzero polynomial in $K$, so $\det B\ne 0$
iff (FM) holds. **Appendix A** gives an explicit closed form for $\det B_E$ as a
product of manifestly nonzero factors, establishing (FM); it is verified
symbolically at $d=4,5$ and numerically for large $d$, and for $E=N$ it is
proved uniformly in $d$ in `SHPLEMINI_ZK_FILTRATION_PROOF.md`. Hence
$\mathrm{rank}(B) = 2d$ in the high-tail regime.

**3B. Low tail ($E \le 3N/4$): rank $2d-1$.** Continue from the $D_t$ normal
form of Step 2. Set $D_k' := D_k/(\tau+r_k)$ and
$M_k^{\mathrm{new}} := M_k(-r_k)+r_kD_k'$, and apply the triangularising row
operation from `SHPLEMINI_ZK_FILTRATION_PROOF.md`: replace $M_k^{\mathrm{new}}$
for $k\ge 1$ by

$$
N_k := M_k^{\mathrm{new}} - u_{k-1}D_{k-1}' - (1-u_{k-1})M_{k-1}^{\mathrm{new}}.
$$

These operations are invertible (the $D_k'$ rescaling is by the nonzero
$(\tau+r_k)$, and the $N_k$ substitution is unit-triangular in the row index),
so they preserve the rank of every column restriction.

**Dense rank upper bound (proved).** Put $m=d-2$, $u=u_m$, $r=r_m$, and
$\ell=\ell_m(s)$. Define

$$
\lambda := -\frac{u(\tau-r)+(1-u)\tau r}{1-u}.
$$

For every monomial $s<3N/4$, the final triangularised rows satisfy

$$
N_{d-1}(s)=\lambda\,D_{d-1}'(s).
$$

This is a direct case check on

$$
q_m(s)=\left\lfloor \frac{s}{2^m}\right\rfloor
\qquad\text{and}\qquad
q_{d-1}(s)=\left\lfloor \frac{s}{2^{d-1}}\right\rfloor.
$$

Only the following three cases occur for $s<3N/4$:

| range of $s$ | $q_m(s)$ | $\mathrm{bit}_m(s)$ | $q_{d-1}(s)$ | values |
|---|---:|---:|---:|---|
| $s<N/4$ | $0$ | $0$ | $0$ | $D_{d-1}'=0$, $N_{d-1}=(1-u)\ell-(1-u)\ell=0$ |
| $N/4\le s<N/2$ | $1$ | $1$ | $0$ | $D_{d-1}'=0$, $N_{d-1}=u\ell-u\ell=0$ |
| $N/2\le s<3N/4$ | $2$ | $0$ | $1$ | $D_{d-1}'=(1-u)\ell$, $N_{d-1}=-\ell[u(\tau-r)+(1-u)\tau r]$ |

In the first two ranges both sides vanish. In the third range the displayed
values give $N_{d-1}(s)=\lambda D_{d-1}'(s)$. Thus, if $E\le3N/4$, the identity
holds on every dense monomial $s\in\{0,\ldots,E-1\}$.

For contrast, the next range $3N/4\le s<N$ has $q_m(s)=3$ and
$\mathrm{bit}_m(s)=1$. There $N_{d-1}$ contains a $\phi_3(\tau,-r)$ contribution
from $D_m'$, so the same scalar multiple of $D_{d-1}'$ cannot match. This degree
mismatch is the exact source of the $E\le3N/4$ threshold.

Therefore, for $E\le3N/4$, the transformed $2d\times E$ dense Gemini matrix has
two proportional rows. Since the row operations above are invertible over $K$,
the original dense Gemini image obeys

$$
\mathrm{rank}\bigl(\Psi_{\mathrm{Gem}}|_{\mathbb F[X]_{<E}}\bigr)\;\le\;2d-1
\qquad(E\le 3N/4).
$$

**Sparse rank lower bound (conjectural).** The matching lower bound — that the
crafted sparse support already realises rank $2d-1$ — holds iff the
proportionality above is the *only* generic relation among the transformed
rows. This is verified at $d=3,4,5$ by the reduced-minor computation in
**Appendix B** but not yet proved uniformly in $d$. Granting it, the sparse
image is the full hyperplane cut out by the row relation above. Since the dense
image lies in that same hyperplane by the proved upper bound, we get the
containment

$$
\mathrm{Im}(\Psi_{\mathrm{Gem}}|_{\mathbb F[X]_{<E}})
\subseteq
\mathrm{Im}(\Psi_{\mathrm{Gem}}|_{\mathrm{span}(E_j:j\in S)}).
$$

The dense rank equals $2d-1$ for $E$ in $(N/2,\,3N/4]$, dropping further only at
the small endpoint $E\approx N/2$ where the dense polynomial space is itself too
short — harmless for zero-knowledge, since a smaller leakage space needs less
masking.

**4. Schwartz–Zippel.** Write $r^\ast$ for the rank witness of the active
regime: $\det B$ (high tail) or the reduced rank-$(2d-1)$ minor of Appendix B
(low tail). After specializing the Fiat-Shamir challenges in $\mathbb{F}$, rank
can drop only on the zero locus of $r^\ast$. The bad set in the lemma statement
is the union of this zero locus with the previously listed Shplonk/KZG
denominator events, Fiat-Shamir collisions, and vanishing-Lagrange events. Its
measure over BN254 is bounded by $\deg(r^\ast)/|\mathbb{F}_{\mathrm{BN254}}|$,
negligible for the $d\approx 15$ used in real flavors.

**5. Simulate.** Let $r$ be the realised rank ($2d$ in the high tail, $2d-1$ in
the low tail). The random coefficients on $S$ induce a uniform mask over the
$r$-dimensional sparse image $\mathrm{Im}(\Psi_{\mathrm{Gem}})$, which contains
the dense degree-$<E$ leakage image. A simulator with access to $\tau$ samples a
uniform point in the sparse image, solves the corresponding full-rank linear
system for the sparse coefficients, and derives consistent `Shplonk:Q` and
`KZG:W` from the same masked Gemini data. Therefore the verifier sees a
transcript distributed independently of the unmasked witness contribution,
except with negligible probability from the bad set defined above.

## Appendix A — High-tail closed form and (FM)

$\det B$ is a polynomial in $u_0,\ldots,u_{d-1},r_0,\ldots,r_{d-1},\tau$: the
row basis change clears no denominator and the rest is a determinant of
polynomial entries. (FM) is equivalent to $\det B\ne 0$ in $K$.

**Explicit closed form (conjecture, verified symbolically at $d=4,5$).** Set
$h := 2^{d-2}$ and $\rho := (E-1)\bmod h$. For even disjoint $E$ with
$3N/4 < E \le N$,

$$
\det B_E
=
\epsilon_E\,
r_0^2\tau^2\,(\tau^{E-4}-r_0^{E-4})
\prod_{k=1}^{d-2}(\tau^2-r_k^2)\,
(\tau+r_{d-1})\,
\mathcal A\,
\mathcal L_E^{\mathrm{hi}},
$$

where $\epsilon_E\in\{\pm1\}$ is a column-ordering sign,

$$
\mathcal A
=
\prod_{k=0}^{d-2}A_k^+(r_k)\,A_k^-(\tau),
\qquad
\mathcal L_E^{\mathrm{hi}}
=
\Bigl(\prod_{k=1}^{d-3} L_0(u_{<k})\,L_{2^k-1}(u_{<k})\Bigr)\,
L_0(u_{<d-2})\,L_{\rho}(u_{<d-2}),
$$

and $A_k^+(r_k) = u_k+(1-u_k)r_k$, $A_k^-(\tau)=u_k-(1-u_k)\tau$,
$L_b(u_{<k}) := L_b(u_0,\ldots,u_{k-1})$. Every factor is a nonzero polynomial
in $K$, so $\det B_E\ne 0$, establishing (FM). For $E=N$ we have
$\rho = 2^{d-2}-1$, recovering the dyadic formula of
`SHPLEMINI_ZK_FILTRATION_PROOF.md`.

The only $E$-dependence (beyond the cyclotomic exponent $E-4$) is the final
Lagrange index $\rho$: the top pair $(E-1,E-2)$ lands on multilinear-Lagrange
weight $L_\rho(u_{<d-2})$ instead of $L_{2^{d-2}-1}$. Verified by exact
computation (`SHPLEMINI_ZK_FILTRATION_VERIFY.py`): the ratio
$\det B_E / (\text{formula})$ is the constant $\epsilon_E$ at $d=4$
($E=14,16$, $\epsilon=+1$) and $d=5$ ($E=28,30,32$, $\epsilon=-1$).

**Numerical cross-check for large $d$.** The script `shplemini_zk_mask_rank.py`
evaluates the Gemini block at a sampled
$(u,r,\tau)\in\mathbb{F}_{\mathrm{BN254}}^{\,2d+1}$ and finds rank $2d$:

```text
d= 8 halving-tail support size= 16: [(16, 16, 16, 19)]
d=10 halving-tail support size= 20: [(20, 20, 20, 23)]
```

The first tuple entry equals $2d$, witnessing $\det B\ne 0$ at the sampled
point and therefore in $K$.

For the extreme endpoint $E=N$, `SHPLEMINI_ZK_FILTRATION_PROOF.md` gives a
fully symbolic, uniform-in-$d$ proof of the closed form above.

## Appendix B — Low-tail reduced-minor closed form

In the low-tail regime the final row pair collapses ($N_{d-1}=\lambda D_{d-1}'$,
Step 3B), so the raw block has rank $2d-1$. A rank witness is obtained from a
**fixed elimination**: delete the redundant row $N_{d-1}$ and the column
$N/2 = 2^{d-1}$. Call the resulting $(2d-1)\times(2d-1)$ determinant
$\Delta_E^{\mathrm{lo}}$.

**Explicit closed form (conjecture, verified symbolically at $d=3,4,5$).** With
$h := 2^{d-2}$, $\rho := (E-1)\bmod h$, and
$R_E(\tau,r_0) := (\tau^{E-4}-r_0^{E-4})/(\tau^2-r_0^2)$, for even disjoint $E$
with $N/2 < E \le 3N/4$,

$$
\Delta_E^{\mathrm{lo}}
=
\eta_E\,
(r_0\tau)^{\alpha_d}\,
(\tau-r_0)\,
R_E(\tau,r_0)\,
\prod_{k=1}^{d-3}(\tau-r_k)\,
\prod_{k=0}^{d-3}A_k^+(r_k)\,A_k^-(\tau)\,
\mathcal L_E^{\mathrm{lo}},
$$

where $\eta_E\in\{\pm1\}$ is a column-ordering sign,

$$
\alpha_d =
\begin{cases} 0 & d=3,\\ 2 & d\ge 4, \end{cases}
\qquad
\mathcal L_E^{\mathrm{lo}}
=
(1-u_{d-2})\,L_{\rho}(u_{<d-2})\,
\Bigl(\prod_{k=1}^{d-3} L_0(u_{<k})\,L_{2^k-1}(u_{<k})\Bigr).
$$

The $(r_0\tau)$-power **saturates** at $\alpha_d = 2$ for $d\ge 4$: the reduced
determinant deletes the collapsed top row, so only the fixed level-$0$ boundary
anomaly contributes the leading $r_0^2\tau^2$; deeper levels contribute through
the local $(\tau-r_k)$ and Lagrange factors, not extra $r_0\tau$ powers. ($d=3$
is degenerate — the support needs a zero-column pad — so $\alpha_3 = 0$.)

**Verification (`SHPLEMINI_ZK_FILTRATION_VERIFY.py`).** The ratio
$\Delta_E^{\mathrm{lo}}/(\text{formula})$ is a constant $\eta_E$:

| $d$ | valid low-tail $E$ | $\rho$ | $\eta_E$ |
|---|---|---|---|
| $3$ | $6$ (degenerate, padded support) | $1$ | $-1$ |
| $4$ | $12$ | $3$ | $+1$ |
| $5$ | $20,22,24$ | $3,5,7$ | $-1$ |

The valid low-tail range excludes $E = B$ and $E = B+2$ for every dyadic
$B = N/2^\ell$ (the disjointness condition of Lemma 1). At $d=4$ this excludes
$E=8$ and $E=10$, so $E=12$ is the first valid case; the apparent rank drop at
$E=10$ is an artifact of the excluded, colliding support, not a formula signal.

**Worked case $d=3$, $E=6$** (degenerate, $S=[5,4,3,2,1,0]$). All six reduced
$5\times5$ minors (delete the $N_2$ row and one column) factor against the
common core $G := (\tau-r_0)\,A_0^+(r_0)\,A_0^-(\tau)$:

  | deleted column $s$ | reduced minor (up to sign) |
  |---|---|
  | $5$ | $(1-u_0)(1-u_1)\,G$ |
  | $4 = N/2$ | $u_0(1-u_1)\,G$ |
  | $3$ | $(\tau^2+r_0^2)(1-u_0)(1-u_1)\,G$ |
  | $2$ | $(\tau^2+r_0^2)\,u_0(1-u_1)\,G$ |
  | $1$ | $r_0^2\tau^2(1-u_0)(1-u_1)\,G$ |
  | $0$ | $r_0^2\tau^2\,u_0(1-u_1)\,G$ |

The canonical choice (delete column $N/2 = 4$) gives $u_0(1-u_1)\,G$, matching
the formula with $\alpha_3=0$, $\rho=1$ ($L_\rho(u_{<1}) = L_1(u_0) = u_0$),
$R_E = 1$. The other deletions only change the residual, distributing the same
level-$0$ anomaly fragments ($\tau^2+r_0^2$, $r_0^2\tau^2$) seen in the
high-tail $\det U_d$ of `SHPLEMINI_ZK_FILTRATION_PROOF.md` across the
deleted-column choice.
