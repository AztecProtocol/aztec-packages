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
\Psi:V\longrightarrow\mathcal{T}_{\mathrm{Gem}}
$$

be the Gemini leakage map with coordinates

$$
M(u),\quad M_0(\tau),\ldots,M_{d-1}(\tau),\quad
M_0(-r_0),\ldots,M_{d-1}(-r_{d-1}).
$$

We prove that $\Psi$ has rank $2d$. The only formula we need is the effect of
Gemini folding on one monomial. After $t$ folds,

$$
\mathrm{fold}_t(E_j) \;=\; L_{j \bmod 2^t}(u_0,\ldots,u_{t-1})\,
E_{\lfloor j / 2^t \rfloor},
\qquad
L_b(u_0,\ldots,u_{t-1}) \;=\; \prod_{a=0}^{t-1}
\begin{cases} 1 - u_a & \text{if } \mathrm{bit}_a(b) = 0,\\ u_a & \text{otherwise.}\end{cases}
$$

Write the support as adjacent pairs indexed by their larger monomial index:

$$
A=\{E-1,\ 2^{d-1},\ 2^{d-2},\ \ldots,\ 2\},\qquad
P_a=\{a,a-1\}\quad(a\in A).
$$

Order $A$ as $a_1>a_2>\cdots>a_d$, and define the filtration

$$
V_m=\mathrm{span}\{E_{a_i},E_{a_i-1}:1\le i\le m\},
\qquad 0\le m\le d,
$$

with $V_0=\{0\}$. Let $\Psi_m$ be the restriction of $\Psi$ to $V_m$. We show
by induction that $\Psi_m$ has rank $2m$.

The quotient $V_m/V_{m-1}$ is the two-dimensional span of the newest pair
$P_{a_m}$. It is enough to show that the induced map

$$
\overline{\Psi}_m:\ V_m/V_{m-1}\longrightarrow
\mathcal{T}_{\mathrm{Gem}}/\Psi(V_{m-1})
$$

has rank $2$.

First consider a dyadic pair $P_{2^k}=\{2^k,2^k-1\}$ with $1\le k<d$. After
$k$ folds,

$$
E_{2^k}\mapsto L_0(u_0,\ldots,u_{k-1}) X,\qquad
E_{2^k-1}\mapsto L_{2^k-1}(u_0,\ldots,u_{k-1}).
$$

After quotienting the target by $\Psi(V_{m-1})$, the two coordinates
$M_k(\tau)$ and $M_k(-r_k)$ give the matrix

$$
\begin{pmatrix}
L_0\tau & L_{2^k-1}\\
(-r_k)\,L_0 & L_{2^k-1}
\end{pmatrix}.
$$

Its determinant is

$$
L_0 L_{2^k-1}\,(\tau+r_k),
$$

which is non-zero outside the bad set defined in the lemma statement. Here
$L_0$ and $L_{2^k-1}$ are evaluated at
$(u_0,\ldots,u_{k-1})$.

For the top pair $P_{E-1}=\{E-1,E-2\}$, no Gemini fold is needed. After
the same target quotient, the two coordinates $M(\tau)$ and $M(-r_0)$ give
the matrix

$$
\begin{pmatrix}
\tau^{E-1} & \tau^{E-2}\\
(-r_0)^{E-1} & (-r_0)^{E-2}
\end{pmatrix},
$$

whose determinant is

$$
\tau^{E-2}(-r_0)^{E-2}(\tau+r_0).
$$

This is again non-zero outside the bad set defined in the lemma statement.

Thus each quotient $V_m/V_{m-1}$ contributes rank $2$. Since
$\dim(V_m/V_{m-1})=2$, the induction gives
$\mathrm{rank}(\Psi_m)=2m$ for all $m$, and in particular
$\mathrm{rank}(\Psi)=2d$.

Equivalently, the Gemini projection has full column rank $2d$ over
$\mathbb{F}(u_0,\ldots,u_{d-1},r,\tau)$. After specializing the challenges in
$\mathbb{F}$, rank can drop only on the zero locus of the product of the
local determinants above, so the bad set has Schwartz-Zippel probability
negligible over BN254. This proves the required rank statement.

**Optional finite-field sanity check.** The script
`shplemini_zk_mask_rank.py` evaluates the full Gemini + Shplonk + KZG leakage
matrix at random
$(u, r, \tau) \in \mathbb{F}_{\mathrm{BN254}}^{\,2d+1}$ and confirms full
rank for the supported $d$. Example:

```text
d= 8 halving-tail support size= 16: [(16, 16, 16, 19)]
d=10 halving-tail support size= 20: [(20, 20, 20, 23)]
```

The tuple is (rank of Gemini block, rank after appending `Shplonk:Q` row,
rank after appending `KZG:W` row, total rows in the sampled full matrix). The
first rank already equals $2d$, so the later rows cannot increase the rank;
the sampled values confirm that the implementation matches this argument.

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
