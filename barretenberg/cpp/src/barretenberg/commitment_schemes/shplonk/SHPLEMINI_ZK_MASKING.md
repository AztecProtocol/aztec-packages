# Shplemini Masking

This note states two masking lemmas for replacing the current full-size
random `gemini_masking_poly` in Shplemini: Lemma 1 for the Gemini + Shplonk +
KZG path, Lemma 2 for the Gemini + Shplonk + IPA path.

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
Assume the Shplemini Fiat-Shamir challenges avoid the usual
denominator-zero bad events and the **tail-halving leakage matrix** $\Psi$
defined below has rank $2d$. Then the Gemini + Shplonk + KZG part of
Shplemini is zero-knowledge.

### Proof

The proof has three steps.

**1. The Shplemini transcript space and a first rank bound.** Work in the
algebraic group model for KZG: a commitment $[P]$ is replaced by the scalar $P(\tau)$, where $\tau$ is the KZG trapdoor. The masking polynomial
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
$\mathrm{rank}(\Psi)$ equals the rank of its Gemini-only projection onto
$\mathbb{F}^{2d+1}$. The domain has dimension $|S|=2d$, so the rank is at
most $2d$; the target is to show this bound is tight.

**2. Show the layout achieves rank $2d$.** By the argument above it suffices
to work with the Gemini-only projection of $\Psi$ onto $\mathbb{F}^{2d+1}$.
Let $B$ be the matrix of this map in the basis $\{E_j : j \in S\}$.

The only formula we need is the effect of Gemini folding on one monomial.
After $t$ folds,

$$
\mathrm{fold}_t(E_j) \;=\; L_{j \bmod 2^t}(u_0,\ldots,u_{t-1})\,
E_{\lfloor j / 2^t \rfloor},
\qquad
L_b(u_0,\ldots,u_{t-1}) \;=\; \prod_{a=0}^{t-1}
\begin{cases} 1 - u_a & \text{if } \mathrm{bit}_a(b) = 0,\\ u_a & \text{otherwise.}\end{cases}
$$

Thus the Gemini-only matrix has one column per support monomial and one row
for each selected evaluation of a folded monomial. We prove this matrix has
full column rank by showing that its kernel is zero: if all Gemini transcript
entries vanish for a sparse mask supported on $S$, then all mask coefficients
are zero.

We prove this with the same filtration that Gemini uses. Write the support as
adjacent pairs

$$
P_k = \{2^k,\,2^k - 1\}\quad (1 \le k < d),\qquad
P_d = \{E - 1,\,E - 2\}.
$$

Order these pairs by decreasing value of their larger monomial index. Write
the resulting ordered pairs as

$$
Q_1=\{a_1,a_1-1\},\ Q_2=\{a_2,a_2-1\},\ \ldots,\ Q_d=\{a_d,a_d-1\},
\qquad a_1>a_2>\cdots>a_d.
$$

Define

$$
F_m \;=\; \mathrm{span}\{E_j : j\in Q_1\cup\cdots\cup Q_m\},
\qquad 0\le m\le d,
$$

with $F_0=\{0\}$. We will show by induction on $m$ that the Gemini leakage is
injective on each $F_m$.

The key local fact is that each new quotient $F_m/F_{m-1}$ is detected by two
Gemini evaluations at the fold level assigned to the newly added pair. For
the pair $\{E-1,E-2\}$, we use $M(\tau)$ and $M(-r_0)$. For the dyadic pair
$\{2^k,2^k-1\}$, we use fold level $k$: after dividing the indices by $2^k$
and taking floors, the two monomial indices become $1$ and $0$.

For $k < d$, the pair $P_k = \{2^k,2^k-1\}$ becomes, after $k$ folds,

$$
E_{2^k}\mapsto L_0(u_0,\ldots,u_{k-1}) X,\qquad
E_{2^k-1}\mapsto L_{2^k-1}(u_0,\ldots,u_{k-1}).
$$

If $Q_m=P_k$, then $Q_i=\{a_i,a_i-1\}$ with $i<m$ satisfies
$a_i>2^k$. The contribution from these pairs lies in $F_{m-1}$ and is
quotiented out. Therefore, on the quotient $F_m/F_{m-1}$, the two transcript entries
$M_k(\tau)$ and $M_k(-r_k)$ act on the new pair by the $2\times2$ matrix

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

which is non-zero away from the usual bad events: the Gemini weights are
multilinear Lagrange evaluations, and the opening points are distinct from
$\tau$. Here $L_0$ and $L_{2^k-1}$ are evaluated at
$(u_0,\ldots,u_{k-1})$.

The data-tail pair $P_d=\{E-1,E-2\}$ is handled in the same way before any
fold. On its quotient, the two evaluations $M(\tau)$ and $M(-r_0)$ act by

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

This is again non-zero outside the same denominator-zero and collision bad
events.

For example, when $N=8$ and $E=N$, the support is

$$
\{7,6\}\ \cup\ \{4,3\}\ \cup\ \{2,1\}.
$$

Order the columns as $(7,6\mid4,3\mid2,1)$ and select the rows

$$
M_0(\tau), M_0(-r_0)\ \mid\ M_2(\tau), M_2(-r_2)\ \mid\
M_1(\tau), M_1(-r_1).
$$

The literal selected matrix is not already triangular: for example,
$M_2(\tau)$ also sees the $(7,6)$ columns. But once the first block is known
to be invertible, we may quotient by the span it detects; equivalently,
Gaussian elimination using that block gives the schematic form

$$
\begin{pmatrix}
A_{7,6} & * & *\\
0       & A_{4,3} & *\\
0       & 0       & A_{2,1}
\end{pmatrix},
$$

where

$$
A_{7,6} =
\begin{pmatrix}
\tau^7 & \tau^6\\
(-r_0)^7 & (-r_0)^6
\end{pmatrix},
\qquad
A_{4,3} =
\begin{pmatrix}
L_0(u_0,u_1)\tau & L_3(u_0,u_1)\\
(-r_2)\,L_0(u_0,u_1) & L_3(u_0,u_1)
\end{pmatrix},
$$

and

$$
A_{2,1} =
\begin{pmatrix}
L_0(u_0)\tau & L_1(u_0)\\
(-r_1)\,L_0(u_0) & L_1(u_0)
\end{pmatrix}.
$$

The diagonal blocks are exactly the local $2\times2$ systems above. This
example is the whole argument: larger $d$ just inserts more dyadic blocks
between the data-tail block and the final low-degree block.

Now suppose an element of $F_m$ has zero Gemini leakage. Looking at the two
rows assigned to the newest pair, modulo the already-injective subspace
$F_{m-1}$, forces the two coefficients in that pair to be zero. The element
therefore lies in $F_{m-1}$, and the induction hypothesis forces it to be
zero. Peeling one adjacent pair at a time proves injectivity on
$\mathrm{span}(E_j : j \in S)$.

Equivalently, $B$ has full column rank $2d$ over
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
probability from bad challenge events.

## Lemma 2 (IPA)

The IPA setting has a different leakage model from KZG: there is no scalar
trapdoor $\tau$. Instead, view every IPA group message algebraically in the
basis $\{G_0, \ldots, G_{N-1}, U\}$ of CRS generators and the IPA auxiliary
generator.

Use the "four adjacent entries around every dyadic cut" support

$$
S_{\mathrm{ipa}} \;=\; \{N - 4,\ N - 3,\ N - 2,\ N - 1\}
\,\cup\, \bigcup_{q=1}^{d-1} \{2^q - 2,\ 2^q - 1,\ 2^q,\ 2^q + 1\},
$$

with entries outside $[0, N-1]$ and duplicates removed.

Let $M = \sum_{s \in S_{\mathrm{ipa}}} c_s\, E_s$ be the dedicated Gemini
masking polynomial, with the $c_s$ sampled independently and uniformly.
Assume:

1. Fiat-Shamir challenges avoid the usual denominator-zero bad events;
2. the CRS generators and the IPA auxiliary generator are algebraically
   independent for the rank argument.

Then the Gemini + Shplonk + IPA transcript is zero-knowledge, except on a
proper algebraic bad set of Fiat-Shamir challenges.

### Proof

All transcript entries contributed by $M$ are linear in the coefficients
$(c_s)_{s \in S_{\mathrm{ipa}}}$ once the challenges are fixed. It is
therefore enough to show that the linear leakage map has rank
$|S_{\mathrm{ipa}}|$.

The Gemini part is explicit. For a basis vector $E_j$, after $t$ Gemini folds,

$$
\mathrm{fold}_t(E_j) \;=\; L_{j \bmod 2^t}(u_0,\ldots,u_{t-1})\,
E_{\lfloor j / 2^t\rfloor},\qquad
L_b(u_0,\ldots,u_{t-1}) \;=\; \prod_{a=0}^{t-1}
\begin{cases} 1 - u_a & \text{if } \mathrm{bit}_a(b) = 0,\\ u_a & \text{otherwise.}\end{cases}
$$

**Shplonk batching preserves the sparse degrees.** Shplonk batches the Gemini
opening claims at points $z_t \in \{r,\ -r_0,\ \ldots,\ -r_{d-1}\}$ with
challenge $\nu$:

$$
A(X) \;=\; \sum_{t} \nu^{\,t}\, \frac{M_t(X) - M_t(z_t)}{X - z_t}.
$$

As a function of the mask coefficients, the coefficient vector of
$A\in\mathbb{F}[X]_{<N}$ is linear. The important point is that Shplonk does
not merge the sparse support directions before IPA begins.

For $s>0$, isolate the summand using $M_0=M$. The identity

$$
\frac{X^s - z^s}{X-z} = \sum_{i=0}^{s-1} z^{\,s-1-i}X^i
$$

shows that the $E_s$ column has a non-zero coefficient at degree $X^{s-1}$,
while every $E_{s'}$ with $s'<s$ has zero coefficient there. Folded summands
$M_t$ have degree at most $\lfloor s/2^t\rfloor$, so they never create a
higher-degree term than the one coming from $M_0$. Thus, after ordering
non-zero support entries by decreasing $s$, the selected coefficient rows
$X^{s-1}$ form a triangular matrix with non-zero diagonal. The possible
$s=0$ entry is handled by the separate scalar $M(u)$, whose coefficient is
$L_0(u_0,\ldots,u_{d-1})$.

So Shplonk carries the support coefficients into the IPA opening vector with
full rank, outside the usual algebraic bad set. More specifically, it is
triangular for the decreasing-degree filtration: on each associated graded
piece, the image of $E_s$ has a non-zero leading coordinate at $X^{s-1}$.
The remaining question is whether the IPA transcript exposes a full-rank set
of linear functionals on those leading coordinates for the chosen dyadic-cut
support.

**IPA cuts give a block-triangular leakage matrix.** If the current IPA vector
has length $2^m$, one IPA round splits it as

$$
a = (a_{\mathrm{low}},\ a_{\mathrm{high}}),
$$

$$
L = \langle a_{\mathrm{low}},\ G_{\mathrm{high}}\rangle
    + \langle a_{\mathrm{low}},\ b_{\mathrm{high}}\rangle\, U,
\qquad
R = \langle a_{\mathrm{high}},\ G_{\mathrm{low}}\rangle
    + \langle a_{\mathrm{high}},\ b_{\mathrm{low}}\rangle\, U,
$$

$$
a' = a_{\mathrm{low}} + \rho\, a_{\mathrm{high}}.
$$

After $t$ IPA folds, a basis vector $E_j$ maps to

$$
\mathrm{ipa}_t(E_j) \;=\; \mu_t(j)\, E_{\,j \bmod 2^{d-t}},
$$

where $\mu_t(j)$ is the product of the IPA round challenges selected by the
high bits of $j$.

Use the filtration by IPA split size. At the cut $2^q$, the four support
entries

$$
2^q-2,\quad 2^q-1,\quad 2^q,\quad 2^q+1
$$

are the last two coordinates below the cut and the first two coordinates
above it. In the IPA round whose split separates this cut, the two lower-side
entries appear in two distinct coordinates of the $L$ message, and the two
upper-side entries appear in two distinct coordinates of the $R$ message. In
the algebraic group model these are four independent CRS-generator
coordinates. On the associated graded piece for this cut, the leakage block is
diagonal up to non-zero IPA challenge factors.

Order cuts from the largest split to the smallest split. Larger-cut support
entries are peeled before smaller cuts are inspected; smaller-cut entries have
not yet reached the selected generator coordinates of larger cuts. Therefore
the selected IPA leakage matrix is block triangular, with one full-rank
$4\times4$ block for each dyadic cut, after removing duplicates and
out-of-range entries at the boundary. The top-tail block
$\{N-4,N-3,N-2,N-1\}$ is the outermost split block.

For a concrete picture, take $N=16$. Ignoring duplicate boundary entries, the
support is organized as

$$
\{12,13,14,15\}\ \mid\ \{6,7,8,9\}\ \mid\ \{2,3,4,5\}\ \mid\ \{0,1\}.
$$

The selected IPA generator coordinates can be ordered so the matrix has the
schematic form

$$
\begin{pmatrix}
B_{12..15} & * & * & *\\
0          & B_{6..9} & * & *\\
0          & 0        & B_{2..5} & *\\
0          & 0        & 0        & B_{0,1}
\end{pmatrix}.
$$

The first three diagonal blocks are the four independent generator
coordinates exposed at the corresponding split. The last block has size
$2\times2$ because the cut near zero loses the out-of-range entries $-1$ and
$-2$.

Composing with the Shplonk map keeps this block-triangular form on the
associated graded pieces: Shplonk only adds lower-degree terms, and those live
in later blocks of the filtration. The diagonal blocks are multiplied by the
non-zero Shplonk leading coefficients, so they remain full rank.

Thus the IPA leakage matrix has rank $|S_{\mathrm{ipa}}|$ over the field of
rational functions in the challenges. Specializing the challenges can lower
rank only on the zero set of a non-zero determinant minor. The masking
coefficients therefore induce a uniform mask over the full independent
leakage subspace. A simulator samples that leakage, solves the full-rank
linear system for the $c_s$, and derives the Gemini, Shplonk, and IPA
messages from the same masked opening vector. This gives the claimed
zero-knowledge statement.

## Checks before implementation

Before replacing the full random polynomial, add tests that:

1. Build the matrix $B$ for many random samples of $(u, r, \tau)$ and verify
   rank $2d$ for the selected fixed support.
2. Prove and verify ordinary Shplemini tests with the sparse mask.
3. Tamper independently with:
   - `Gemini:masking_poly_comm`,
   - one `Gemini:FOLD_i`,
   - one `Gemini:a_i`,
   - `Shplonk:Q`,
   - `KZG:W`,

   and verify rejection.
4. Include at least one ZK flavor with `RepeatedCommitmentsData`, since the
   verifier offsets assume the masking commitment is the first unshifted PCS
   entity after `Shplonk:Q`.
