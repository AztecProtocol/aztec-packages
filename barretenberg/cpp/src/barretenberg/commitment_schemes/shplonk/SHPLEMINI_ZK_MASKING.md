# Shplemini Masking

This note states a masking lemma for replacing the current full-size random
`gemini_masking_poly` in the Gemini + Shplonk + KZG path of Shplemini. It
also records the analogous IPA support and the remaining proof obligation for
that path.

Let $N$ be the dyadic circuit size and $d = \log_2 N$. Write $E_j(X) = X^j$
for the standard monomial basis of $\mathbb{F}[X]_{<N}$, so a polynomial
$P = \sum_j c_j\, E_j$ is identified with its coefficient vector $(c_0,
\ldots, c_{N-1})$ as stored by the prover.

In both cases the proposed replacement is a sparse masking polynomial with a
small number of random entries on a fixed support: $2d$ entries on a
**tail-halving** layout for KZG, and $4d - 2$ entries on a **dyadic-cut**
layout for IPA (assuming $d \ge 4$; for $d \le 3$ the dyadic-cut indices
already cover all of $[0, N-1]$, so the "sparse" mask degenerates to the
dense one — irrelevant for real flavors, where $d \approx 15$).

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

The proof below shows that the Gemini projection of the tail-halving leakage
matrix has full column rank $2d$. Therefore the Gemini + Shplonk + KZG part
of Shplemini is zero-knowledge.

### Proof

The proof has three steps.

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
space**

$$
\mathcal{T} \;:=\; \mathbb{F}^{\,2d+3}.
$$

The total $M$-leakage is captured by the linear map

$$
\Psi:\ \mathrm{span}(E_j : j \in S)\ \longrightarrow\ \mathcal{T}.
$$

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
most $2d$; the target is to show that this Gemini projection already has full
column rank $2d$.

**2. Show the layout achieves rank $2d$.** By the argument above it suffices
to work with the Gemini projection. In this section write

$$
\mathcal{T}_{\mathrm{Gem}}=\mathbb{F}^{2d+1},\qquad
V=\mathrm{span}\{E_j:j\in S\},
$$

and let

$$
\Psi_{\mathrm{Gem}}:V\longrightarrow\mathcal{T}_{\mathrm{Gem}}
$$

be the Gemini leakage map with coordinates

$$
M(u),\quad M_0(\tau),\ldots,M_{d-1}(\tau),\quad
M_0(-r_0),\ldots,M_{d-1}(-r_{d-1}).
$$

The row $M(u)$ is not needed for the rank lower bound. Let $B$ be the
$2d\times 2d$ matrix obtained from $\Psi_{\mathrm{Gem}}$ by dropping the
$M(u)$ row. It is enough to prove $\det B \ne 0$ in the rational function
field

$$
K \;=\; \mathbb{F}(u_0,\ldots,u_{d-1},\,r_0,\ldots,r_{d-1},\,\tau).
$$

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
$(D_t,M_t(-r_t))$, where

$$
D_t \;:=\; M_t(\tau)-M_t(-r_t).
$$

This is a determinant-preserving row change: the change-of-basis matrix is
block-diagonal with $2\times 2$ blocks $\begin{pmatrix}1 & -1\\0 & 1\end{pmatrix}$
of unit determinant. From the fold formula,

$$
D_t(E_s) \;=\; L_{s\bmod 2^t}(u)\,\bigl(\tau^{q}-(-r_t)^{q}\bigr),\qquad
q=\lfloor s/2^t\rfloor.
$$

The structural observation that drives the rank argument is:

> **(★)** $D_t(E_s) = 0$ whenever $s < 2^t$.

Indeed for $s<2^t$ we have $q=0$ and $\tau^0-(-r_t)^0=0$.

**Pair filtration.** Index the support as adjacent pairs by their larger
monomial:

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

Let $B_{\le m}$ be the submatrix of columns in $V_m$. We show by induction
that $\mathrm{rank}(B_{\le m})=2m$.

**Induction via Schur complements.** Suppose
$\mathrm{rank}(B_{\le m-1})=2(m-1)$. Let $C_{m-1}$ be any full-rank
$2(m-1)\times 2(m-1)$ minor of $B_{\le m-1}$. Augment with the two new
columns of the pair $P\in\{P_{2^m},P_{\mathrm{top}}\}$ and two new rows
$(D_k,M_k(-r_k))$ — with $k=m$ for a dyadic pair and $k=0$ for the top pair
— to form

$$
\begin{pmatrix} C_{m-1} & R \\ L & A \end{pmatrix}.
$$

The pair contributes rank $2$ modulo $V_{m-1}$ iff the Schur complement

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

> *Lemma (FM).* For the tail-halving support $S$ and the row ordering above,
> the rational functions
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
iff (FM) holds.

**Proof of (FM) by exhibition.** $\det B$ is a polynomial in
$u_0,\ldots,u_{d-1}, r_0,\ldots,r_{d-1}, \tau$ — the row basis change clears
no denominator and the rest is a determinant of polynomial entries. A
single specialization where the value is nonzero suffices, deterministically,
to prove $\det B\ne 0$ as a polynomial; by the factorization above this is
equivalent to (FM). The script `shplemini_zk_mask_rank.py` evaluates the
Gemini block at a sampled
$(u,r,\tau)\in\mathbb{F}_{\mathrm{BN254}}^{\,2d+1}$ for each supported $d$
and finds rank $2d$, i.e. $\det B(u,r,\tau)\ne 0$. Example output:

```text
d= 8 halving-tail support size= 16: [(16, 16, 16, 19)]
d=10 halving-tail support size= 20: [(20, 20, 20, 23)]
```

The tuple is (rank of Gemini block, rank after appending `Shplonk:Q` row,
rank after appending `KZG:W` row, total rows in the sampled full matrix);
the first entry equals $2d$, witnessing $\det B\ne 0$ at the sampled point
and therefore $\det B\ne 0$ in $K$. This proves (FM).

**Schwartz-Zippel.** After specializing the Fiat-Shamir challenges in
$\mathbb{F}$, rank can drop only on the zero locus of $\det B$. The bad set
in the lemma statement is the union of this zero locus with the previously
listed Shplonk/KZG denominator events, Fiat-Shamir collisions, and
vanishing-Lagrange events. Its measure over BN254 is bounded by
$\deg(\det B)/|\mathbb{F}_{\mathrm{BN254}}|$, which is negligible for the
$d\approx 15$ used in real flavors.

**3. Simulate.** Since $\mathrm{rank}(B) = 2d$, the random coefficients on
$S$ induce a uniform mask over the $2d$-dimensional leakage subspace
$\mathrm{image}(\Psi)$. A simulator with access to $\tau$ samples a uniform
$y \in \mathrm{image}(\Psi)$, solves $B\,c = y$ (uniquely, since $B$ has full
column rank $2d$), and derives consistent `Shplonk:Q` and `KZG:W` from the
same masked Gemini data. Therefore the verifier sees a transcript distributed
independently of the unmasked witness contribution, except with negligible
probability from the bad set defined above.

## Lemma 2 (IPA)

For IPA, assume the opened polynomial has the full dyadic size $N=2^d$ and
$d\ge4$. Work in the algebraic group model for IPA: every group message is
represented by its coefficients in the independent basis
$\{G_0,\ldots,G_{N-1},U\}$ of CRS generators and the IPA auxiliary generator.

The support is shifted by one relative to the IPA cut coordinates because
Shplonk maps a monomial $X^s$ to a quotient with leading term $X^{s-1}$.
Define the terminal block

$$
B_3=\{1,2,3,4,5,6,7,8\},
$$

and, for $4\le m\le d$,

$$
B_m=\{2^{m-1}+1,\ 2^{m-1}+2,\ 2^m-2,\ 2^m-1\}.
$$

Use

$$
S_{\mathrm{ipa}}=B_3\cup B_4\cup\cdots\cup B_d,
$$

and let $V=\mathrm{span}\{E_s:s\in S_{\mathrm{ipa}}\}$.

Assume the Fiat-Shamir challenges avoid the bad set consisting of Shplonk
denominator-zero events, zero IPA round challenges, and the vanishing of the
finite determinants described below. Then the Gemini + Shplonk + IPA
transcript is zero-knowledge.

### Proof

The proof follows the same three-part structure as the KZG proof.

**1. Transcript projection.** Define a projected transcript space
$\mathcal{T}_{\mathrm{IPA}\circ\mathrm{Gem}}$ as follows. For each
$4\le m\le d$, keep from the IPA round at length $2^m$ the four
CRS-generator coordinates in the $R$ message corresponding to the positions
listed in $C_m$ below. For the terminal block $B_3$, keep the constant-size
set of IPA transcript coordinates used by the terminal minor. Let

$$
\Psi_{\mathrm{IPA}\circ\mathrm{Gem}}:V\to
\mathcal{T}_{\mathrm{IPA}\circ\mathrm{Gem}}
$$

be the composed leakage map from the mask coefficients through Gemini,
Shplonk, and the IPA transcript, followed by this projection. Full rank of
this projection implies full rank of the actual transcript leakage.

**2. Rank of the composed map.** We show that
$\Psi_{\mathrm{IPA}\circ\mathrm{Gem}}$ has rank $|S_{\mathrm{ipa}}|$.

The Shplonk part of the composed map is triangular in the monomial basis. For
$s>0$,

$$
\frac{X^s-z^s}{X-z}=\sum_{i=0}^{s-1}z^{s-1-i}X^i,
$$

so the column of $E_s$ has leading coefficient $1$ in IPA coordinate $s-1$.
Lower-degree terms only affect later pieces of the filtration below.

Order the blocks by decreasing $m$ and define

$$
V_m=\mathrm{span}(B_d\cup B_{d-1}\cup\cdots\cup B_m)
\qquad(4\le m\le d),
$$

with $V_3=V$ and $V_{d+1}=\{0\}$. For $m\ge4$, the quotient
$V_m/V_{m+1}$ is spanned by the four exponents in $B_m$. Their Shplonk
leading coordinates are

$$
C_m=B_m-1=\{2^{m-1},\ 2^{m-1}+1,\ 2^m-3,\ 2^m-2\}.
$$

Consider the IPA round that splits a vector of length $2^m$. Modulo
$V_{m+1}$, all earlier blocks have already been removed from both source and
target. The coordinates in $C_m$ lie in the upper half. The $R$ message
contains

$$
R=\langle a_{\mathrm{high}},G_{\mathrm{low}}\rangle
  +\langle a_{\mathrm{high}},b_{\mathrm{low}}\rangle U.
$$

Thus the four leading coordinates in $C_m$ appear in four distinct
CRS-generator coordinates of $R$. Previous IPA folds multiply them by products
of non-zero round challenges. After quotienting the target by
$\Psi_{\mathrm{IPA}\circ\mathrm{Gem}}(V_{m+1})$, the lower-degree Shplonk
terms from higher blocks are gone. Therefore, on the quotient, the local
matrix is the product of:

1. a triangular Shplonk block with diagonal entries $1$; and
2. a diagonal or permutation-diagonal IPA block with non-zero entries.

Hence the induced map

$$
V_m/V_{m+1}\longrightarrow
\mathcal{T}_{\mathrm{IPA}\circ\mathrm{Gem}}/
\Psi_{\mathrm{IPA}\circ\mathrm{Gem}}(V_{m+1})
$$

has rank $4$.

The terminal quotient $V_3/V_4$ is the constant-size block $B_3$. On this
quotient, Shplonk maps $E_1,\ldots,E_8$ triangularly onto IPA coordinates
$0,\ldots,7$ with diagonal entries $1$. The length-$8$ IPA transcript has a
fixed $8\times8$ minor on CRS-generator coordinates whose determinant is a
non-zero polynomial in the IPA round challenges. This proves that the
terminal quotient has rank $8$ outside the zero locus of that determinant.

Summing the quotient ranks gives

$$
\mathrm{rank}(\Psi_{\mathrm{IPA}\circ\mathrm{Gem}})=|S_{\mathrm{ipa}}|
$$

outside the algebraic bad set where a Shplonk denominator, an IPA challenge,
or one of the selected determinant factors vanishes.

**3. Simulate.** The random coefficients on $S_{\mathrm{ipa}}$ induce a
uniform mask over $\mathrm{image}(\Psi_{\mathrm{IPA}\circ\mathrm{Gem}})$. A
simulator samples a uniform point in this image, solves the full-rank linear
system for the sparse coefficients, and derives the remaining Gemini,
Shplonk, and IPA transcript entries consistently from those coefficients. The
projected transcript, and therefore the full transcript, is distributed
independently of the unmasked witness contribution except on the bad set.
