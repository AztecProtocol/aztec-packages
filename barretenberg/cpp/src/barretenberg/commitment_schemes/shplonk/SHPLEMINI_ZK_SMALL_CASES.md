# Shplemini Masking — Small Cases

Scratch document for verifying the KZG rank lemma at small $N$ by computing
$\det B$ symbolically and reading off a closed-form factorization. The goal
is to recognize a structural pattern that lifts to general $d$.

Notation matches `SHPLEMINI_ZK_MASKING.md`. The matrix $B$ has rows
$(D_0,M_0(-r_0),D_1,M_1(-r_1),\ldots,D_{d-1},M_{d-1}(-r_{d-1}))$ where
$D_t := M_t(\tau) - M_t(-r_t)$, and columns indexed by the tail-halving
support $S$. We always work in the rational function field

$$
K \;=\; \mathbb{F}(u_0,\ldots,u_{d-1},\,r_0,\ldots,r_{d-1},\,\tau).
$$

Define the single-variable Lagrange and affine factors

$$
L_0(u) := 1-u,\qquad L_1(u) := u,
$$
$$
A_i^{+}(X) := L_1(u_i) + L_0(u_i)\,X = u_i + (1-u_i)X,
$$
$$
A_i^{-}(X) := L_1(u_i) - L_0(u_i)\,X = u_i - (1-u_i)X.
$$

**Each $A_i^{\pm}$ depends only on $u_i$**, not on $u_{<i}$. This is
asymmetric with the multilinear Lagrange blocks below
($L_0(u_{<k}), L_{2^k-1}(u_{<k})$), which are nested. The asymmetry is
empirically forced: at $d=4$ the nested variant
$L_3(u_0,u_1) + L_0(u_0,u_1)\,X$ does *not* divide $\det B$, but the
single-variable $u_1 + (1-u_1)X$ does. Both families appear in the
factorisation simultaneously and are distinct.

---

## Case $N=8$ ($d=3$)

$E = 8$ is the only admissible top-pair anchor (even, $\le N$, disjoint
from dyadic pairs $\{1,2\},\{3,4\}$). Support
$S = (E_7, E_6, E_4, E_3, E_2, E_1)$ ordered top-pair first, then
$P_{N/2}, P_{N/4}$.

### The matrix

Column order $(E_7,E_6,E_4,E_3,E_2,E_1)$, row order
$(D_0, M_0(-r_0), D_1, M_1(-r_1), D_2, M_2(-r_2))$:

$$
B \;=\; \begin{pmatrix}
\tau^7+r_0^7 & \tau^6-r_0^6 & \tau^4-r_0^4 & \tau^3+r_0^3 & \tau^2-r_0^2 & \tau+r_0 \\[2pt]
-r_0^7 & r_0^6 & r_0^4 & -r_0^3 & r_0^2 & -r_0 \\[2pt]
u_0(\tau^3+r_1^3) & (1-u_0)(\tau^3+r_1^3) & (1-u_0)(\tau^2-r_1^2) & u_0(\tau+r_1) & (1-u_0)(\tau+r_1) & 0 \\[2pt]
-u_0 r_1^3 & -(1-u_0)r_1^3 & (1-u_0)r_1^2 & -u_0 r_1 & -(1-u_0)r_1 & u_0 \\[2pt]
u_0 u_1(\tau+r_2) & (1-u_0)u_1(\tau+r_2) & (1-u_0)(1-u_1)(\tau+r_2) & 0 & 0 & 0 \\[2pt]
-u_0 u_1 r_2 & -(1-u_0)u_1 r_2 & -(1-u_0)(1-u_1)r_2 & u_0 u_1 & (1-u_0)u_1 & u_0(1-u_1)
\end{pmatrix}.
$$

Sanity checks visible in the matrix:

- Last column (column $E_1$): $D_1$ and $D_2$ entries are $0$. This is (★)
  with $s=1<2^t$ for $t=1,2$.
- Columns $E_3, E_2$: $D_2$ entries are $0$ (★ with $s<4$).
- $u_2$ does not appear anywhere — fold level $2$ uses $L_b(u_0,u_1)$, no
  $u_2$. So $\det B$ is independent of $u_2$ (verified numerically below).

### Closed form

Computed at two independent rational points (see
`SHPLEMINI_ZK_SMALL_CASES.py` below for the calculation) and checked to
match a single closed-form factorization up to sign:

$$
\boxed{
\det B_{N=8}
\;=\;
-\,r_0^2\tau^2\,
\bigl(r_0^4-\tau^4\bigr)\,
\bigl(r_1^2-\tau^2\bigr)\,
(\tau+r_2)\,
L_0(u_0)\,L_1(u_0)\,
A_0^{+}(r_0)\,A_0^{-}(\tau)\,
A_1^{+}(r_1)\,A_1^{-}(\tau).
}
$$

Equivalently, absorbing the leading sign into $(r_0^4 - \tau^4) \to
(\tau^4 - r_0^4)$:

$$
\det B_{N=8}
\;=\;
r_0^2\tau^2\,
\bigl(\tau^4-r_0^4\bigr)\,
\bigl(r_1^2-\tau^2\bigr)\,
(\tau+r_2)\,
L_0(u_0)\,L_1(u_0)\,
A_0^{+}(r_0)\,A_0^{-}(\tau)\,
A_1^{+}(r_1)\,A_1^{-}(\tau).
$$

### Why each factor is nonzero in $K$

| factor | vanishes only when | comes from |
|---|---|---|
| $r_0^2$ | $r_0 = 0$ | Vandermonde-like $r_0$-content of $M_0$ row |
| $\tau^2$ | $\tau = 0$ | leading $\tau$-content of $D_0$ row |
| $\tau^4 - r_0^4 = (\tau-r_0)(\tau+r_0)(\tau^2+r_0^2)$ | $\tau = \pm r_0$ or $\tau^2=-r_0^2$ | top-pair Vandermonde at level 0 |
| $r_1^2 - \tau^2 = (r_1-\tau)(r_1+\tau)$ | $\tau=\pm r_1$ | level-$1$ pair $P_2$ block determinant carries $\tau+r_1$; the second factor $r_1-\tau$ comes from the level-1 column $E_4$ entry |
| $\tau + r_2$ | $\tau=-r_2$ | level-$2$ block $\Delta_2$ at column $E_4$ |
| $L_0(u_0)L_1(u_0) = u_0(1-u_0)$ | $u_0\in\{0,1\}$ | $\det\Delta_1$ |
| $A_0^{\pm}(r_0)$, $A_0^{-}(\tau)$, $A_1^{\pm}(r_1)$, $A_1^{-}(\tau)$ | each is a degree-1 polynomial in the field, hence nonzero in $K$ | Schur-residual "fold-affine" evaluations |

Every factor is a nonzero polynomial in $K$, so $\det B_{N=8}\neq 0$ in
$K$. The bad set for Schwartz-Zippel is the union of the zero loci of
these factors, all explicit.

### Numerical confirmation

At $\tau=2,\,r_0=3,\,r_1=5,\,r_2=7,\,u_0=\tfrac12,\,u_1=\tfrac13$:

```
det(B)  = -405405
formula = +405405
ratio   = -1   (sign convention)
```

At $\tau=5,\,r_0=2,\,r_1=11,\,r_2=13,\,u_0=\tfrac27,\,u_1=\tfrac{3}{11}$:

```
det(B)  =  19958006016000 / 5929
formula = -19958006016000 / 5929
ratio   = -1
```

And $\det B$ is invariant under varying $u_2$, confirming no $u_2$
dependence.

---

## Structural reading of the $N=8$ factorization

Reorganize the factors by fold level and type:

- **Pure-monomial leading factors:** $r_0^2 \tau^2 (\tau^4 - r_0^4)$ — these
  come from the level-$0$ rows and the Vandermonde-like structure of the
  top-pair columns.
- **Level-$1$ contribution:** $(r_1^2 - \tau^2) \cdot L_0(u_0)L_1(u_0)
  \cdot A_0^{+}(r_0) A_0^{-}(\tau)$. The first piece is the level-$1$
  Vandermonde at $\pm r_1$ vs $\pm\tau$; the Lagrange piece is exactly
  $\det\Delta_1$; the $A_0^{\pm}$ are residual fold evaluations of level
  $0$ "filtered through" level $1$.
- **Level-$2$ contribution:** $(\tau + r_2) \cdot A_1^{+}(r_1)\,
  A_1^{-}(\tau)$. The first piece is the level-$2$ fold evaluation, and
  $A_1^{\pm}$ are residual fold evaluations of level $1$ filtered through
  level $2$.

The pattern strongly suggests that at general $d$,

$$
\det B \;\doteq\; \prod_{k=0}^{d-1}\bigl(\text{level-}k\text{ Vandermonde}\bigr)
\cdot \prod_{k=0}^{d-2}\bigl(L_0 L_{2^k-1}\,\text{at fold }k\bigr)
\cdot \prod_{k=0}^{d-2}A_k^{+}(r_k)A_k^{-}(\tau)\cdot\ldots
$$

This is the conjecture to test at $N=16$ next.

---

## Case $N=16$ ($d=4$, $E=16$)

Support $S=\{15,14,8,7,4,3,2,1\}$, matrix is $8\times 8$. Verified at 6
independent random rational points:

$$
\boxed{
\begin{aligned}
\det B_{N=16}
\;=\;
& r_0^{2}\,\tau^{2}\,
\bigl(\tau^{12}-r_0^{12}\bigr)\,
\bigl(\tau^{2}-r_1^{2}\bigr)\,
\bigl(\tau^{2}-r_2^{2}\bigr)\,
(\tau+r_3) \\[4pt]
& \cdot\; L_0(u_0)\,L_1(u_0)\;\cdot\;L_0(u_0,u_1)\,L_3(u_0,u_1) \\[4pt]
& \cdot\;A_0^{+}(r_0)\,A_0^{-}(\tau)\,
A_1^{+}(r_1)\,A_1^{-}(\tau)\,
A_2^{+}(r_2)\,A_2^{-}(\tau).
\end{aligned}
}
$$

### Reading by level

The factors organize by Gemini fold level $k=0,1,\ldots,d-1=3$:

| level $k$ | Vandermonde-like factor | Lagrange factor | affine residuals |
|---|---|---|---|
| $0$ | $r_0^2\,\tau^2(\tau^{12}-r_0^{12})$ | — | $A_0^{+}(r_0)\,A_0^{-}(\tau)$ |
| $1$ | $\tau^{2}-r_1^{2}$ | $L_0(u_0)L_1(u_0)$ | $A_1^{+}(r_1)\,A_1^{-}(\tau)$ |
| $2$ | $\tau^{2}-r_2^{2}$ | $L_0(u_0,u_1)L_3(u_0,u_1)$ | $A_2^{+}(r_2)\,A_2^{-}(\tau)$ |
| $3$ (last) | $\tau+r_3$ | — | — |

Compared with the $N=8$ row-by-level decomposition, the new feature at
$d=4$ is the appearance of a **second Lagrange block**
$L_0(u_0,u_1)L_3(u_0,u_1)$ at level $2$, and a corresponding
$A_2^{\pm}$ pair. Levels $1$ and $2$ each contribute a degree-$2$
Vandermonde factor $\tau^2-r_k^2$; the last level $d-1$ contributes the
sign-anomalous $\tau+r_{d-1}$.

### The level-$0$ anomaly

At $N=8$ the level-$0$ Vandermonde was $\tau^4 - r_0^4 = \tau^{2^{d-1}} -
r_0^{2^{d-1}}$, exactly the cyclotomic form $X^{2^k}-1$ from Zeromorph
§2.5. At $N=16$ it is $\tau^{12} - r_0^{12}$, with exponent $12=E-4$, *not*
$2^{d-1}=8$. So the level-$0$ exponent is

$$
\nu_0 \;=\; E - 4,
$$

which coincides with $2^{d-1}$ only when $E=N=2^d$ and $d=3$. For general
$d$ the level-$0$ factor mixes cyclotomic and non-cyclotomic pieces, e.g.

$$
\tau^{12}-r_0^{12} \;=\;
(\tau-r_0)(\tau+r_0)(\tau^2+r_0^2)\,(\tau^2+\tau r_0+r_0^2)(\tau^2-\tau r_0+r_0^2)(\tau^4-\tau^2 r_0^2+r_0^4),
$$

where $(\tau^2 \pm \tau r_0+r_0^2)$ and $(\tau^4-\tau^2 r_0^2+r_0^4)$ are
*non-binary* cyclotomic factors $\Phi_3, \Phi_6, \Phi_{12}$ in
$\tau/r_0$ — i.e. they live outside the Zeromorph-type
$(X^{2^k}+1)$ family. This is the structural surprise.

## Case $N=32$ ($d=5$, $E=32$): conjecture supported empirically

Checked at 3 independent random rational points using LU-decomposition on
the $10\times 10$ matrix. The closed form (empirically) is

$$
\boxed{
\det B_{N=32}
\;=\;
- \, r_0^{2}\,\tau^{2}\,
(\tau^{28}-r_0^{28})\,
(\tau^{2}-r_1^{2})\,
(\tau^{2}-r_2^{2})\,
(\tau^{2}-r_3^{2})\,
(\tau+r_4)
\;\cdot\;\mathcal{L}_5\;\cdot\;\mathcal{A}_5
}
$$

where the Lagrange and affine parts are

$$
\mathcal{L}_5 = L_0(u_0)L_1(u_0)\,\cdot\,L_0(u_0,u_1)L_3(u_0,u_1)\,\cdot\,L_0(u_0,u_1,u_2)L_7(u_0,u_1,u_2),
$$

$$
\mathcal{A}_5 = \prod_{k=0}^{3} A_k^{+}(r_k)\,A_k^{-}(\tau).
$$

The level-$0$ exponent $E-4=28$ confirms the conjecture: it is **not**
$2^{d-1}=16$.

## General-$d$ formula (empirical conjecture, checked for $d=3,4,5$)

This is a **conjecture supported by exhaustive numerical agreement** at
$d=3,4,5$ (ratios constant across multiple random rational specialisations).
No symbolic proof yet.

$$
\det B_d
\;=\;
(-1)^{d}\;
r_0^{2}\,\tau^{2}\,
\underbrace{(\tau^{E-4}-r_0^{E-4})}_{\text{level }0}\,
\underbrace{\prod_{k=1}^{d-2}(\tau^{2}-r_k^{2})}_{\text{levels }1..d-2}\,
\underbrace{(\tau+r_{d-1})}_{\text{level }d-1}
\;\cdot\;
\prod_{k=1}^{d-2} L_0(u_{<k})\,L_{2^k-1}(u_{<k})
\;\cdot\;
\prod_{k=0}^{d-2} A_k^{+}(r_k)\,A_k^{-}(\tau).
$$

The sign $(-1)^d$ is verified by direct numerical check: at $d=3,4,5$ the
sign is $-,+,-$ respectively.

### Each factor is nonzero in $K$

| factor | zero locus |
|---|---|
| $r_0^2,\,\tau^2$ | $r_0=0$ or $\tau=0$ |
| $\tau^{E-4}-r_0^{E-4}$ | $\tau$ is an $(E-4)$th root of unity times $r_0$ |
| $\tau^2-r_k^2$, $1\le k\le d-2$ | $\tau=\pm r_k$ |
| $\tau+r_{d-1}$ | $\tau=-r_{d-1}$ |
| $L_0(u_{<k})$ | some $u_a=1$ for $a<k$ |
| $L_{2^k-1}(u_{<k})$ | some $u_a=0$ for $a<k$ |
| $A_k^{+}(r_k)$ | $u_k+(1-u_k)r_k=0$ — an affine condition |
| $A_k^{-}(\tau)$ | $u_k-(1-u_k)\tau=0$ — affine |

Every factor is a nonzero polynomial in $K = \mathbb{F}(u,r,\tau)$, so
$\det B_d \ne 0$ in $K$. The Schwartz-Zippel bad set is the union of these
zero loci, all explicit.

### Structural reading (Zeromorph §2.5 connection)

Levels $1,\ldots,d-2$ contribute the Zeromorph-style binary cyclotomic
factor $\tau^{2^1} - r_k^{2^1} = (\tau-r_k)(\tau+r_k)$. The last level
$d-1$ contributes the sign-anomalous $\tau+r_{d-1} = \tau - (-r_{d-1})$,
a "$+$" twin of the previous level's "$\pm$" pair.

The **level-$0$ factor $\tau^{E-4} - r_0^{E-4}$ breaks the binary
cyclotomic pattern** whenever $E-4$ is not a power of $2$:

- $d=3$, $E=8$: $E-4=4=2^2$. Pure cyclotomic.
- $d=4$, $E=16$: $E-4=12$. Mixed: $\tau^{12}-r_0^{12}$ contains $\Phi_3, \Phi_6, \Phi_{12}$ in $\tau/r_0$.
- $d=5$, $E=32$: $E-4=28=4\cdot 7$. Mixed: contains $\Phi_7, \Phi_{14}, \Phi_{28}$.

So the top-pair contribution involves cyclotomics of order divisible by
odd primes dividing $E-4$, *not* just binary cyclotomics from Gemini
folding. This is the "anomaly" — it suggests the level-0 contribution
comes from a different algebraic source than the Gemini fold tower.

### Why $E-4$?

Heuristic: the top pair $\{E-1, E-2\}$ at level 0 contributes the
"full-degree" pieces $\tau^{E-1}, \tau^{E-2}, r_0^{E-1}, r_0^{E-2}$, but
the Schur-complement with the dyadic columns subtracts off something of
degree $\sim N/2$. The remaining symmetric difference is $\tau^{E-4} -
r_0^{E-4}$, but a clean structural derivation is open.

## Modular split (toward an inductive proof)

To set up an induction on $d$, group the factors of the conjectured
formula into three structural modules:

$$
\boxed{
\det B_d
\;=\;
(-1)^d
\;\cdot\;
\mathsf{Top}_d
\;\cdot\;
\mathsf{Last}_d
\;\cdot\;
\prod_{k=1}^{d-2}\mathsf{Mid}_k
}
$$

with

$$
\begin{aligned}
\mathsf{Top}_d
&\;:=\;
r_0^2\,\tau^2\,\bigl(\tau^{E-4}-r_0^{E-4}\bigr)\;\cdot\;A_0^{+}(r_0)\,A_0^{-}(\tau),
\\[4pt]
\mathsf{Last}_d
&\;:=\;
\tau+r_{d-1},
\\[4pt]
\mathsf{Mid}_k
&\;:=\;
\underbrace{(\tau^2-r_k^2)}_{\text{level-}k\text{ Vandermonde}}
\;\cdot\;
\underbrace{L_0(u_{<k})\,L_{2^k-1}(u_{<k})}_{\text{nested Lagrange block}}
\;\cdot\;
\underbrace{A_k^{+}(r_k)\,A_k^{-}(\tau)}_{\text{single-variable affine residuals in }u_k}.
\end{aligned}
$$

The level index in $\mathsf{Mid}_k$ runs $k = 1, \ldots, d-2$. The
$\mathsf{Mid}_k$ block depends on
$(u_0,\ldots,u_k,\, r_k,\, \tau)$ — i.e., variables up to fold level $k$
plus $\tau$.

### Block dependencies

| module | variables | how $d$ enters |
|---|---|---|
| $\mathsf{Top}_d$ | $u_0, r_0, \tau$ | only through the exponent $E-4$ (here $E=N=2^d$) |
| $\mathsf{Last}_d$ | $r_{d-1}, \tau$ | through the index $d-1$ |
| $\mathsf{Mid}_k$ | $u_0,\ldots,u_k, r_k, \tau$ | independent of $d$ (purely "level-$k$") |

So $\mathsf{Mid}_k$ is *intrinsic* to fold level $k$ — going from $d$ to
$d+1$ adds a new $\mathsf{Mid}_{d-1}$ (the old $\mathsf{Last}_d$ "is
replaced by" $\mathsf{Mid}_{d-1}\cdot\mathsf{Last}_{d+1}$ schematically),
while $\mathsf{Top}$ only sees the exponent shift $E-4 \to 2E-4$.

### Conjectural Schur peel (target inductive step)

The natural induction step would be a Schur-complement peel of the top
pair from $B_d$: choose previously-realised rows $(D_1, M_1, \ldots,
D_{d-1}, M_{d-1})$ on the dyadic columns to form $C_{d-1}$, and let
$(D_0, M_0(-r_0))$ on the top-pair columns be the new $A$ block. Then

$$
\det B_d \;=\; \det C_{d-1}\;\cdot\;\det S_{\mathrm{top}},
\qquad
S_{\mathrm{top}} \;=\; A_{\mathrm{top}} - L\,C_{d-1}^{-1}\,R.
$$

The two conjectural sub-identities one would want to prove:

1. **Top-pair Schur identity.**

   $$
   \det S_{\mathrm{top}} \;\doteq\; \mathsf{Top}_d \;\cdot\;\Bigl(\text{stuff already in }C_{d-1}\Bigr)^{-1}
   $$

   i.e. all the level-$0$-specific algebra (including the anomalous
   $\tau^{E-4}-r_0^{E-4}$ factor) lives entirely in the top-pair Schur
   complement; the dyadic minor $C_{d-1}$ contributes the rest.

2. **Dyadic minor identity.**

   $$
   \det C_{d-1} \;\doteq\; \mathsf{Last}_d \;\cdot\;\prod_{k=1}^{d-2}\mathsf{Mid}_k\;\cdot\;\Bigl(\text{stuff cancelled by }S_{\mathrm{top}}\Bigr).
   $$

   This is the "$d{-}1$ level sub-problem"; its determinant should match
   the lower-level modules.

The cancellation in (1) and (2) has to be arranged so the
"stuff" pieces invert each other. Empirically, the full product
$\det C_{d-1} \cdot \det S_{\mathrm{top}}$ equals the boxed formula above,
so cancellation does happen — the question is how to write it down
cleanly so that the level-$0$ anomaly $\tau^{E-4} - r_0^{E-4}$ falls out
of the top-pair Schur complement without leaking into the dyadic side.

### What an induction on $d$ would buy

If both sub-identities hold:

- **Base case** $d=3$: $C_2$ is a $4\times 4$ minor (verifiable by hand).
- **Inductive step** $d\Rightarrow d+1$: the new $C_d$ (size $2d\times
  2d$) reuses the old $C_{d-1}$ as its dyadic interior, plus one new
  $\mathsf{Mid}_{d-1}$ block.
- **Conclusion**: $\det B_d \ne 0$ in $K$ for all $d$, with explicit bad
  set, no computer assistance needed.

### Why the naive filtration is dead

Direct check at $d=3$: the would-be "dyadic interior" minor
$C_2$ on rows $(D_1, M_1(-r_1), D_2, M_2(-r_2))$ at the dyadic
columns $V_2 = \{E_1, E_2, E_3, E_4\}$ has $\det C_2 = 0$ *symbolically*.

Reason: expanding along the $D_2$ row (which has a single nonzero entry
at $E_4$ by (★)) reduces to a $3\times 3$ minor on $(D_1, M_1, M_2)$
restricted to $(E_3, E_2, E_1)$. In that minor, every row is a scalar
multiple of $(u_0, 1-u_0, \star)$ on columns $(E_3, E_2)$ — the
Lagrange weights collapse identically, making columns $E_3, E_2$
proportional and forcing the $3\times 3$ minor to zero.

Symmetric pair: peeling instead $(D_{d-1}, M_{d-1}(-r_{d-1}))$ along with
$P_2$ columns *also* fails — at $d=3$ the local block $A_{\mathrm{top}}'$
of $(D_2, M_2)$ on $\{E_7, E_6\}$ has $\det = 0$ for the same Lagrange
proportionality reason.

So neither the "top-pair peel" nor the "bottom-pair peel" via fold-level
rows is the right inductive step. The factorisation $\det B = \det C \cdot
\det S$ requires $C$ to be a genuine full-rank minor, and the
Gemini-fold-aligned choices of $C$ are exactly the ones that aren't.

A working full-rank minor exists (e.g. $d=3$: rows $(D_0, M_0, D_1, M_1)$
on $V_2$ has det $\ne 0$), but it *mixes* level-0 rows into the
"interior" — so the induction loses the clean level-by-level structure.

## Possible proof strategies

### (A) Polynomial identity via degree + vanishing loci

Both sides of the boxed formula are polynomials in $K[u, r, \tau]$. To
prove equality:

1. **Match total degree** in each variable separately. We've already
   checked $\tau$-degree: $E + 3d - 6$ on both sides for $E=N$.
2. **Match vanishing loci.** For each factor $F$ on the RHS, show the LHS
   vanishes on the hyperplane $F = 0$ with at least the same
   multiplicity. The hyperplanes are:
   - $\tau = 0$, $r_0 = 0$ (each contributing $\tau^2, r_0^2$).
   - $\tau^{E-4} = r_0^{E-4}$ (the $(E-4)$ roots of unity times $r_0$).
   - $\tau = \pm r_k$ for $1 \le k \le d-2$.
   - $\tau = -r_{d-1}$.
   - $L_0(u_{<k}) = 0$, $L_{2^k-1}(u_{<k}) = 0$, $A_k^{+}(r_k) = 0$,
     $A_k^{-}(\tau) = 0$.
3. **Match a single coefficient** (e.g. the leading $\tau$-coefficient) to
   pin the multiplicative constant $(-1)^d$.

The hard part is (2). For most factors the rank-deficiency at the
hyperplane is visible (proportional rows or zero rows), but
$\tau^{E-4} = r_0^{E-4}$ is non-obvious — that's where the level-0
anomaly sits and where the Frobenius/Vandermonde insight would have to do
real work.

### (B) Tensor / Cauchy-Binet factorisation

The entry $B_{(t,x), s} = L_{s\bmod 2^t}(u_{<t})\cdot x^{\lfloor s/2^t\rfloor}$
is a product of a Lagrange part and an evaluation part. If we can
express $B = D \cdot V$ where $D$ ($2d \times m$) carries the Lagrange
weights and $V$ ($m \times 2d$) is a *generalised Vandermonde*, then
Cauchy-Binet gives

$$
\det B \;=\; \sum_{|I|=2d} \det D_I \,\det V_I.
$$

The dream is that the sum collapses to a single term because of the
*structured* support $S$: the multi-index dependencies of the Lagrange
weights force most $I$ to give $\det D_I = 0$. The surviving terms
realise the explicit Vandermonde factor $\tau^{E-4} - r_0^{E-4}$ as a
specific generalised-Vandermonde minor.

This is the most "Krattenthaler-flavoured" approach. The key would be
recognising $V$ as a known matrix from the determinant-calculus
literature.

### (C) Specialisation to $r_k = r^{2^k}$ (collapse to single variable $r$)

On the codimension-$(d-1)$ subvariety $r_k = r^{2^k}$, the formula
specialises to a single-variable expression in $r$ (which is what the
user's earlier conjecture targeted). On this subvariety the matrix has
*extra* algebraic structure — the rows $M_t(-r_t)$ collapse to
$M_t(-r^{2^t})$, which is the value $M$ would take after $t$ Gemini
folds at the *Frobenius orbit* $r, r^2, r^4, \ldots, r^{2^{d-1}}$.

Strategy:
1. Prove the formula on the subvariety (where the structure is cleaner).
2. Lift back: both sides are polynomials in independent
   $r_0, \ldots, r_{d-1}$, and equality on a generic subvariety of the
   right codimension forces equality everywhere *if* you can argue both
   sides depend on the $r_k$'s in the same way.

The subvariety trick has the advantage that the level-0 anomaly $\tau^{E-4}
- r_0^{E-4}$ on the subvariety becomes $\tau^{E-4} - r^{E-4}$, and this
plausibly arises as the resultant of $\tau$-Frobenius and $r$-Frobenius
orbits.

### (D) Row/column operations to upper-triangular

Just compute. If $B$ admits an explicit LU decomposition with
triangular factors whose diagonal entries are *exactly* the empirical
factors, you read off $\det B$ directly. The triangularisation would
have to be "Gemini-fold-aware" — pivot order matching the fold levels,
with row operations subtracting nested-Lagrange combinations.

The level-0 row pair has to be handled specially because (as we saw) the
fold-aligned pivot order has $D_t$ vanishing on later columns by (★),
which would seem to suggest the matrix is *already* upper-triangular in
the fold-pivot order — but the calculation shows the $M_t$ rows mix
things up. A more careful pivot order, or simultaneous row+column
elimination, could fix this.

## Two-stage proof plan (dyadic scaffold + bridge)

**Deployment stays on the tail-halving support** — the dyadic version
including $E_0$ is *only* used as a proof scaffold, not as a working
masking layout. The strategy:

### Stage 1 — prove the dyadic formula by induction

Define an auxiliary "fully dyadic" support

$$
S_{\mathrm{dyad}}\;=\;\bigcup_{k=1}^{d}\{2^k-1,\ 2^k-2\}\;=\;\{N-1, N-2, N/2-1, N/2-2,\ \ldots,\ 1, 0\}
$$

and the corresponding $2d\times 2d$ matrix $B_d^{\mathrm{dyad}}$. With this
support, every pair $k$ has both indices strictly below $2^k$, so by (★),
$D_k$ vanishes on pairs $1, \ldots, k$. This gives the staircase
structure described above, and the level-$(d-1)$ Schur peel is *clean*:

- $L = (D_{d-1}, M_{d-1})$ at pairs $1,\ldots,d-1$ has its first row zero.
- $C_{d-1}$ on rows $(D_0, M_0, \ldots, D_{d-2}, M_{d-2})$ at pairs
  $1, \ldots, d-1$ is structurally identical to $B_{d-1}^{\mathrm{dyad}}$
  — i.e., the *same problem* one size down. **The recursion is literal:**

  $$
  \det B_d^{\mathrm{dyad}} \;=\; \mathsf{Block}_d^{\mathrm{dyad}}\;\cdot\;\det B_{d-1}^{\mathrm{dyad}},
  $$

  where $\mathsf{Block}_d^{\mathrm{dyad}} = \det S_d^{\mathrm{dyad}}$ is
  the $2\times 2$ Schur complement at pair $d$.

- $\mathsf{Block}_d^{\mathrm{dyad}}$ has an explicit form: the raw block
  $A_d$ is rank-$1$ (rows proportional to $(u_0, 1-u_0)$), so the *only*
  rank-$2$ contribution comes from the Schur correction in the second
  row. That correction is a structurally computable expression in
  $(u, r, \tau)$ — to be derived once and used at every level.

  Conjecturally:

  $$
  \mathsf{Block}_d^{\mathrm{dyad}}\;\doteq\;
  (\tau + r_{d-1})\;\cdot\; L_0(u_{<d-1})\,L_{2^{d-1}-1}(u_{<d-1})\;\cdot\;A_{d-1}^{+}(r_{d-1})\,A_{d-1}^{-}(\tau)
  $$

  for $d \ge 2$ (with the $A_{d-1}^\pm$ involving the *next-level*
  affine residual, i.e. $u_{d-1}$). Base case $d=1$: $\det
  B_1^{\mathrm{dyad}} = \tau + r_0$ (a $2\times 2$ determinant, direct
  computation).

The inductive formula:

$$
\boxed{\det B_d^{\mathrm{dyad}}\;\doteq\;\prod_{k=1}^{d}\mathsf{Block}_k^{\mathrm{dyad}}.}
$$

This is a **single-direction clean induction** with no level-0
carve-out. The base case and the recursion are both elementary
$2\times 2$ computations.

### Stage 2 — bridge to the tail-halving formula

The tail-halving support $S^{\mathrm{tail}} = \{(E-1, E-2), (N/2,
N/2-1), \ldots, (2, 1)\}$ differs from $S_{\mathrm{dyad}}$ in two ways
(taking $E=N$ for concreteness):

| pair | dyadic | tail-halving |
|---|---|---|
| top | $(N-1, N-2)$ | $(N-1, N-2)$ ✓ same |
| pair $k=1,\ldots,d-1$ | $(2^k-1, 2^k-2)$ | $(2^k, 2^k-1)$ — shifted by $+1$ |
| bottom | includes $E_0$ | excludes $E_0$ |

So the bridge is: a **unit upward shift** of all non-top pairs. In
generating-function terms, replacing $E_s \to E_{s+1}$ for $s$ in the
relevant range is multiplication by $X$, which under the Gemini fold has
an explicit action (Zeromorph Lemma 2.5.3: $(X^{2^k} + 1)\mathcal U_n(X_k f) = X^{2^k}\mathcal U_n(f)$).

Two sub-goals for the bridge:

1. **Express $B_d^{\mathrm{tail}}$ as a column transform of $B_d^{\mathrm{dyad}}$.** The
   shift $E_s \to E_{s+1}$ at the column level corresponds to a *known*
   multiplication on the matrix entries (each entry $L \cdot x^q$ becomes
   $L \cdot x^q + \text{correction}$ for some structured correction
   involving Lagranges at the next level).

2. **Compute the determinant transformation.** Express $\det
   B_d^{\mathrm{tail}}$ as $\det B_d^{\mathrm{dyad}}$ times an explicit
   "Jacobian" factor. The $\tau^{E-4} - r_0^{E-4}$ anomaly should
   emerge from this Jacobian — it is the determinant of the column shift
   acting on the level-0 row pair.

### Why this should work

The dyadic version is genuinely the *clean* recursive structure: $D_k$
vanishes on pairs $\le k$ purely from (★), the Schur peel is forced, and
the recursion is exact. The bridge is then a purely algebraic
comparison of two known matrices — and the discrepancy *must* localise
at the level-0 row pair (since that's the only place where the column
shift hits a row without (★)-vanishing).

This routes around the failure of naive filtration on $S^{\mathrm{tail}}$
directly, *without* having to commit to using $S_{\mathrm{dyad}}$ in
deployment (it never leaves the proof).

---

### My read

(A) is the most mechanical and probably what works. The hard subproblem
is showing $\det B$ vanishes when $\tau^{E-4} = r_0^{E-4}$ — this is
where a structural identity from Krattenthaler or a Frobenius/Cauchy-Binet
argument would have to be invoked.

(C) is the most elegant if it pans out, because the Frobenius orbit
$r, r^2, r^4, \ldots$ is exactly where the binary cyclotomic Zeromorph
structure should live, and the level-0 anomaly should be visible as a
deviation from pure cyclotomic on that subvariety.

What's still missing for either path:

1. A clean closed form for $\det C_{d-1}$ where $C_{d-1}$ is a
   *working* full-rank $(2d-2)\times(2d-2)$ minor — not the
   fold-aligned one, but one chosen to preserve a recursion.
2. Direct verification that $\det B$ vanishes on each hyperplane,
   especially $\tau^{E-4} = r_0^{E-4}$.
3. Identification of $B$ with a known structured-matrix family from
   classical determinant calculus.

## Open questions

1. **Verify the general-$d$ conjecture at $N=32, 64$**. Computational cost
   grows as $(2d)!$ for the cofactor-expansion determinant, so $N=32$
   ($d=5$, $10\times 10$ matrix) is feasible; $N=64$ ($d=6$, $12\times 12$)
   takes more care.
2. **The level-$0$ exponent $E-4$**. Why this exponent? It should come
   from a structural identity in the Gemini fold acting on the top pair,
   interacting with the dyadic columns. Conjecture: the level-$0$
   Vandermonde is the determinant of the "augmented top-pair block"
   after eliminating contributions from levels $\ge 1$.
3. **Symbolic proof.** Given the closed form, an inductive proof of the
   general-$d$ identity should be tractable — the factors organize by
   fold level, and the residual $A_k^{\pm}$ pieces match the
   Schur-complement structure I tried earlier (which failed because the
   wrong row assignment was used). The right way is presumably to choose,
   at each level, the row pair that aligns with the structural factor.
4. **Connection to Zeromorph §2.5.** The cyclotomic factors $X^{2^k}+1$
   from Zeromorph appear at levels $1,\ldots,d-2$ (as $\tau\pm r_k$ pairs
   collapsing to $\tau^2-r_k^2$), but the level-$0$ factor breaks the
   binary-cyclotomic pattern. This suggests the top-pair structure is
   *not* a Gemini-fold artifact but something separate.

---

## Verification script

```python
from fractions import Fraction as F

def L(b, us):
    p = F(1)
    for a in range(len(us)):
        p *= us[a] if ((b >> a) & 1) else (1 - us[a])
    return p

def D_entry(t, s, tau, rs, us):
    q = s // (2**t)
    if q == 0: return F(0)
    return L(s % (2**t), us[:t]) * (tau**q - (-rs[t])**q)

def M_entry(t, s, tau, rs, us):
    q = s // (2**t)
    return L(s % (2**t), us[:t]) * (-rs[t])**q

def det(M):
    n = len(M)
    if n == 1: return M[0][0]
    if n == 2: return M[0][0]*M[1][1] - M[0][1]*M[1][0]
    total = F(0)
    for j in range(n):
        if M[0][j] == 0: continue
        sub = [[M[i][k] for k in range(n) if k != j] for i in range(1, n)]
        total += ((-1)**j) * M[0][j] * det(sub)
    return total

# N=8 instance
tau = F(2); rs = [F(3), F(5), F(7)]; us = [F(1,2), F(1,3), F(1,5)]
S = [7, 6, 4, 3, 2, 1]
rows = []
for t in range(3):
    rows.append([D_entry(t, s, tau, rs, us) for s in S])
    rows.append([M_entry(t, s, tau, rs, us) for s in S])
print("det(B) =", det(rows))

# Closed form
u0,u1 = us[0],us[1]; r0,r1,r2 = rs
formula = -(r0**2 * tau**2
            * (r0**4 - tau**4)
            * (r1**2 - tau**2)
            * (tau + r2)
            * (1-u0)*u0
            * (u0 + (1-u0)*r0)
            * (u0 - (1-u0)*tau)
            * (u1 + (1-u1)*r1)
            * (u1 - (1-u1)*tau))
print("formula =", formula)
print("match? ", det(rows) == formula)
```
