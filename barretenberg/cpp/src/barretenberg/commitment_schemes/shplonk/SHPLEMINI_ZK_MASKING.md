# Shplemini Masking Lemma

This note states the masking lemma for replacing the current full-size random
`gemini_masking_poly` in the Gemini + Shplonk + KZG PCS transcript.

The proposed replacement is a sparse masking polynomial with $2d$ random
entries placed in a tail-halving layout, where $d = \mathrm{virtual\_log\_n}$.

## Lemma

Let $M$ be the dedicated `gemini_masking_poly`; no relation-bearing witness,
precomputed, lookup, permutation, or shiftable column is used for this mask.
Let $M$ be sampled with $2d$ independent random coefficients on the
tail-halving support defined below, where $d = \mathrm{virtual\_log\_n}$.

Assume the Shplemini Fiat-Shamir challenges avoid the usual denominator-zero
bad events and the tail-halving leakage matrix defined below has rank $2d$.
Then the Gemini + Shplonk + KZG part of Shplemini is zero-knowledge for the
messages masked by $M$.

## Proof

The proof has three steps.

**1. Bound the required rank.** Work in the algebraic / AGM model for KZG: a
commitment $[P]$ is replaced by the scalar leakage $P(\tau)$, where $\tau$ is
the KZG trapdoor. The visible masking messages before Shplonk/KZG derivation
are

$$
M(u),\quad M(\tau),\quad M_1(\tau),\,\ldots,\,M_{d-1}(\tau),\quad
M_0(-r_0),\,\ldots,\,M_{d-1}(-r_{d-1}).
$$

This list has $2d + 1$ entries, but the leakage map

$$
\Phi:\ \mathrm{span}(E_j : j \in S)\ \longrightarrow\ \mathbb{F}^{2d+1}
$$

has domain dimension $|S| = 2d$, so $\mathrm{rank}(\Phi) \le 2d$
automatically. The target of the proof is to show this bound is tight.

`Shplonk:Q` and `KZG:W` add no independent rank. Concretely, Shplonk batches
the opening claims at points $z_t$ with challenge $\nu$:

$$
Q(X) \;=\; \sum_{t} \nu^{\,t}\, \frac{P_t(X) - v_t}{X - z_t},
$$

so the $M$-contribution $Q_M(\tau)$ is a linear combination of the
already-listed scalars $M(\tau)$, $M_t(\tau)$, $M_t(-r_t)$, $M(u)$ with
coefficients that depend only on the Shplonk challenges $(\nu, z_t)$ and the
public points. The KZG quotient is

$$
W(X) \;=\; \frac{G(X)}{X - z},\qquad W_M(\tau) \;=\; \frac{G_M(\tau)}{\tau - z},
$$

again a fixed scalar multiple of a linear combination of the same leakages.
Hence the full transcript leakage from $M$ factors through $\Phi$, and showing
$\mathrm{rank}(\Phi) = 2d$ is sufficient.

**2. Show the layout achieves rank $2d$.** Form the $(2d+1) \times 2d$ matrix
$B$ by applying $\Phi$ to each basis entry in the tail-halving support. The
matrix entries are explicit. Let $E_j$ be the stored coefficient basis vector
with a $1$ in position $j$. After $t$ Gemini folds,

$$
\mathrm{fold}_t(E_j) \;=\; \lambda_t(j)\, E_{\lfloor j / 2^t \rfloor},
\qquad
\lambda_t(j) \;=\; \prod_{a=0}^{t-1}
\begin{cases} 1 - u_a & \text{if } \mathrm{bit}_a(j) = 0,\\ u_a & \text{otherwise.}\end{cases}
$$

The column of $B$ for support entry $s$ is therefore

$$
\Bigl(\,\lambda_d(s),\ \tau^s,\ \lambda_1(s)\,\tau^{\lfloor s/2\rfloor},\ \ldots,\
\lambda_{d-1}(s)\,\tau^{\lfloor s/2^{d-1}\rfloor},\
(-r_0)^s,\ \lambda_1(s)\,(-r_1)^{\lfloor s/2\rfloor},\ \ldots,\
\lambda_{d-1}(s)\,(-r_{d-1})^{\lfloor s/2^{d-1}\rfloor}\,\Bigr)^\top.
$$

This is the Gemini matrix whose rank must be $2d$.

**Analytical rank argument.** Index the support as $d$ pairs, ordered by
level. For $k = 1, \ldots, d-1$ let $\mathrm{pair}_k = (2^k,\ 2^k - 1)$, and
let $\mathrm{pair}_d = (E - 1,\ E - 2)$ (the top tail pair, with $E$ even).
The $d$ rows $M(\tau), M_1(\tau), \ldots, M_{d-1}(\tau)$ of $B$ already
suffice for rank $2d$: we exhibit a block-lower-triangular $2d \times 2d$
submatrix formed from these $d$ rows and the $2d$ support columns.

- For $k < d$, consider row $M_{k-1}(\tau)$, whose entry at column $s$ is
  $\lambda_{k-1}(s)\,\tau^{\lfloor s / 2^{k-1}\rfloor}$. For $\mathrm{pair}_k$,

  $$
  \lfloor 2^k / 2^{k-1}\rfloor = 2,\qquad
  \lfloor (2^k - 1) / 2^{k-1}\rfloor = 1.
  $$

  For any smaller pair $k' < k$, every entry $s' < 2^k$ satisfies
  $\lfloor s' / 2^{k-1}\rfloor = 0$. So at row $M_{k-1}(\tau)$, the two
  columns of $\mathrm{pair}_k$ contribute $\tau^2$ and $\tau$ while all
  smaller pairs contribute only $\tau^0$. The $2 \times 2$ block at the
  intersection of row $M_{k-1}(\tau)$ and the two columns of
  $\mathrm{pair}_k$ is, up to a non-zero $\lambda$ factor in
  $(u_0, \ldots, u_{k-1})$,

  $$
  \begin{pmatrix}
  \lambda_{k-1}(2^k)\,\tau^2 & 0 \\
  0 & \lambda_{k-1}(2^k - 1)\,\tau
  \end{pmatrix},
  $$

  after using that the off-diagonal $\tau^0$ entries from smaller pairs sit
  in *other* columns. Each $\lambda_{k-1}$ factor is a non-trivial product of
  $u_a$ and $(1 - u_a)$, non-zero as a polynomial in $u$.

- For $\mathrm{pair}_d = (E - 1,\ E - 2)$, use row $M(\tau)$ itself: its
  entries are $\tau^{E-1}$ and $\tau^{E-2}$, monomials of strictly higher
  degree than anything contributed by smaller pairs (which have
  $s < N/2 \le E/2$). The corresponding $2 \times 2$ block is diagonal in
  $\tau$ with non-zero entries.

Order pairs $k = 1, 2, \ldots, d$. By construction, in the row chosen for
$\mathrm{pair}_k$, all columns of smaller pairs vanish in the relevant
coordinates (they sit at strictly lower $\tau$-degrees). The resulting
$2d \times 2d$ submatrix is block-lower-triangular with $2 \times 2$ diagonal
blocks whose determinants are non-zero monomials in $\tau$ times non-zero
polynomials in $u$. Their product is therefore a non-zero element of
$\mathbb{F}[u_0, \ldots, u_{d-1}, \tau]$, of total degree at most
$2(E - 1) + \sum_{k=0}^{d-1} 2k$.

Hence $\mathrm{rank}(B) = 2d$ over the rational-function field
$\mathbb{F}(u, r, \tau)$, and over $\mathbb{F}$ the bad set of Fiat-Shamir
challenges where rank drops is the zero set of this explicit determinant. By
Schwartz–Zippel the bad-event probability is bounded by $\deg / |\mathbb{F}|$,
which is negligible over the BN254 scalar field. The $r_t$ challenges play no
role in the argument above, so the additional $d$ rows $M_t(-r_t)$ are
redundant for rank — they are used below by the simulator.

**Optional finite-field sanity check.** The script
`shplemini_zk_mask_rank.py` evaluates $B$ at random
$(u, r, \tau) \in \mathbb{F}_{\mathrm{BN254}}^{\,2d+1}$ and confirms full
rank for the supported $d$. Example:

```text
d= 8 halving-tail support size= 16: [(16, 16, 16, 19)]
d=10 halving-tail support size= 20: [(20, 20, 20, 23)]
```

The tuple is (rank of Gemini block, rank after appending `Shplonk:Q` row,
rank after appending `KZG:W` row, total rows in $B$). All three rank values
equal $2d$, confirming that $Q$ and $W$ add no independent rank, as proved in
step 1.

**3. Simulate.** Since $\mathrm{rank}(B) = 2d$, the random coefficients on
$S$ induce a uniform mask over the $2d$-dimensional leakage subspace
$\mathrm{image}(\Phi)$. A simulator with access to $\tau$ samples a uniform
$y \in \mathrm{image}(\Phi)$, solves $B\,c = y$ (uniquely, since $B$ has full
column rank $2d$), and derives consistent `Shplonk:Q` and `KZG:W` from the
same masked Gemini data. Therefore the verifier sees a transcript distributed
independently of the unmasked witness contribution, except with negligible
probability from bad challenge events.

## Layout and implementation

Use a sparse masking polynomial with fixed support:

$$
K = 2d \quad (d = \mathrm{virtual\_log\_n}),\qquad
S = \{ s_0, s_1, \ldots, s_{K-1} \},\qquad
M(X) = \sum_{j \in S} c_j\, E_j(X).
$$

Use the tail-halving support:

$$
N = 2^d,\qquad
e = \mathrm{max\_end\_index}\ \text{of the masked polynomial data},\qquad
E = \min\bigl(N,\ \mathrm{round\_up}(e, 2)\bigr),
$$

$$
S = \bigl[\,E - 1,\ E - 2,\ N/2,\ N/2 - 1,\ N/4,\ N/4 - 1,\ \ldots,\ 2,\ 1\,\bigr],
$$

truncated or deterministically tail-filled to exactly $2d$ entries. In code:

```text
E = min(N, round_up(e, 2))
add(E - 1)
add(E - 2)
for level = 1 .. d - 1:
    base = N >> level
    add(base)
    add(base - 1)
fill from E - 1 downward until len(S) = 2d, skipping duplicates
```

The intuition is that these entries sit on different paths of the Gemini
folding tree. Pairing each chosen position with its neighbor gives the fold at
that level both an even and odd component, rather than letting later folds see
only constants or repeated low-degree fragments.

The rounding is important: Gemini's first fold groups $(0,1)$, $(2,3)$,
$\ldots$ as even/odd pairs. If $e$ is odd, the entries $e - 1$ and $e - 2$ are
not in the same first-fold pair. Rounding to even makes $(E - 2, E - 1)$ one
pair. This keeps the masking extent close to the existing maximum extent
instead of always forcing $\mathrm{end\_index}() = N$.

The polynomial should retain virtual size $n$:

```text
start = min(S)
length = max(S) - min(S) + 1
Polynomial masking_poly(length, n, start)
```

where `start`, `length`, and the populated entries are determined by the
selected support. This simple representation has $\mathrm{end\_index}() = E$,
because the top pair is $E - 1,\ E - 2$. That cost is acceptable as a first
implementation: it is one masking polynomial among many committed
polynomials, and Pippenger commitment time depends mainly on the number of
non-zero scalars rather than the virtual size.

The final proof should have the same transcript shape as today. Only the
internal representation of the masking polynomial changes from full random to
sparse random.

## IPA variant

The IPA setting has a different leakage model from KZG. There is no scalar
trapdoor $\tau$. Instead, view every IPA group message algebraically, in the
basis consisting of the CRS generators and the IPA auxiliary generator $U$.

For the dyadic case $N = 2^d$, use the support

$$
S_{\mathrm{ipa}} \;=\; \{N - 4,\ N - 3,\ N - 2,\ N - 1\}
\,\cup\, \bigcup_{q=1}^{d-1} \{2^q - 2,\ 2^q - 1,\ 2^q,\ 2^q + 1\},
$$

with entries outside $[0, N-1]$ and duplicates removed. This is the "four
adjacent entries around every dyadic cut" layout.

### Lemma

Let $M = \sum_{s \in S_{\mathrm{ipa}}} c_s\, E_s$ be the dedicated Gemini
masking polynomial, with the $c_s$ sampled independently and uniformly.
Assume:

1. $N = 2^d$;
2. Fiat-Shamir challenges avoid the usual denominator-zero bad events;
3. the CRS generators and the IPA auxiliary generator are algebraically
   independent for the rank argument.

Then the Gemini + Shplonk + IPA transcript is zero-knowledge for the messages
masked by $M$, except on a proper algebraic bad set of Fiat-Shamir challenges.

### Proof

All transcript entries contributed by $M$ are linear in the coefficients
$(c_s)_{s \in S_{\mathrm{ipa}}}$ once the challenges are fixed. It is
therefore enough to show that the linear leakage map has rank
$|S_{\mathrm{ipa}}|$.

The Gemini part is explicit. For a basis vector $E_j$, after $t$ Gemini folds,

$$
\mathrm{fold}_t(E_j) \;=\; \lambda_t(j)\, E_{\lfloor j / 2^t\rfloor},\qquad
\lambda_t(j) \;=\; \prod_{a=0}^{t-1}
\begin{cases} 1 - u_a & \text{if } \mathrm{bit}_a(j) = 0,\\ u_a & \text{otherwise.}\end{cases}
$$

**Shplonk batching is full-rank on the coefficient side.** Shplonk batches
the Gemini opening claims at points $z_t \in \{r,\ -r_0,\ \ldots,\ -r_{d-1}\}$
with challenge $\nu$:

$$
A(X) \;=\; \sum_{t} \nu^{\,t}\, \frac{M_t(X) - M_t(z_t)}{X - z_t}.
$$

After IPA folding, the prover opens $A(X)$ at a single point. As a function
of $c$, the coefficient vector of $A \in \mathbb{F}[X]_{< N}$ is a linear map
$\Psi: \mathbb{F}^{S_{\mathrm{ipa}}} \to \mathbb{F}^N$.

Isolate the $t = 0$ summand, which uses $M_0 = M$ directly. The identity
$\frac{X^s - z_0^s}{X - z_0} = \sum_{k=0}^{s-1} z_0^{\,s-1-k}\, X^k$ shows
that the $E_s$-column of $\Psi$ has coefficient $\nu^0 \cdot 1 = 1$ at
degree $X^{s-1}$, and any other column $E_{s'}$ with $s' < s$ contributes
$0$ at $X^{s-1}$ (since $s'-1 < s-1$). Higher-$t$ summands use folded
polynomials $M_t$ of degree $< N/2^t$, so they contribute only to
$X^{k}$ for $k < N/2^t - 1 \le N/2 - 1 < s - 1$ once $s \ge N/2$, and more
generally cannot raise the top-degree column entry above $X^{s-1}$.

Order $S_{\mathrm{ipa}}$ by decreasing $s$ and read the rows $X^{s-1}$ for
$s \in S_{\mathrm{ipa}}$. The induced $|S_{\mathrm{ipa}}| \times
|S_{\mathrm{ipa}}|$ submatrix of $\Psi$ is upper-triangular with diagonal
$1$, hence has full rank $|S_{\mathrm{ipa}}|$ identically — no Shplonk
challenge specialization can drop it. In particular, the four support
entries around every dyadic cut remain linearly independent before IPA
starts, and the Shplonk step contributes no bad events to the ZK error.

Now write the IPA folding map. If the current vector has length $2^m$, one
IPA round splits it as

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

Consider the dyadic cut at $2^q$. The four support entries
$2^q - 2$, $2^q - 1$, $2^q$, $2^q + 1$ are the last two entries on one side
of that cut and the first two entries on the other side. At the IPA round
whose split separates this cut, the first two entries contribute to $L$ in
two distinct $G_{\mathrm{high}}$ coordinates, and the second two entries
contribute to $R$ in two distinct $G_{\mathrm{low}}$ coordinates. These four
coordinates are algebraically independent of all later IPA messages and of
the $U$ coordinates.

Order the dyadic cuts from the largest split to the smallest split, and for
each cut select the four generator coordinates just described. A support
entry chosen for a larger cut is already isolated before smaller-cut
coordinates are examined. A support entry chosen for a smaller cut has not
yet contributed to the selected coordinates of the larger cuts. The selected
submatrix is therefore block triangular, with one full-rank $4 \times 4$
block for each dyadic cut, up to the duplicate/removal effects at the
boundary of $[0, N-1]$. The top tail block $\{N - 4, N - 3, N - 2, N - 1\}$
is handled the same way at the outermost IPA split.

Thus the IPA leakage matrix has rank $|S_{\mathrm{ipa}}|$ over the field of
rational functions in the challenges. Specializing the challenges only lowers
rank on the zero set of a non-zero determinant minor. The masking
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
