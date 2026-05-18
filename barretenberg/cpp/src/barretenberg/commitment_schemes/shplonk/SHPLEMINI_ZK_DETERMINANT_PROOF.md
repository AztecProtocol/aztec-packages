# Shplemini ZK Masking Determinant - Proof Route

This note records a clean proof route for the determinant conjecture in
`SHPLEMINI_ZK_SMALL_CASES.md`. It separates the formal linear-algebra step,
which is standard, from the three local determinant identities that still need a
hand derivation.

The goal is to prove the closed form for the $2d \times 2d$ matrix $B$ obtained from
the Gemini leakage rows

$$
(D_0, M_0(-r_0), D_1, M_1(-r_1), \ldots, D_{d-1}, M_{d-1}(-r_{d-1})).
$$

on the tail-halving support

$$
S = (E-1, E-2, 2^{d-1}, 2^{d-1}-1, \ldots, 2, 1).
$$

Throughout, work over

$$
K = F(u_0,\ldots,u_{d-1}, r_0,\ldots,r_{d-1}, \tau).
$$

For $s \in S$, the fold formula gives

$$
M_t(x)(E_s)
  = L_{s \bmod 2^t}(u_0,\ldots,u_{t-1}) x^{\lfloor s/2^t \rfloor},
$$

and

$$
D_t(E_s)
  = L_{s \bmod 2^t}(u_0,\ldots,u_{t-1})
    \left(\tau^{\lfloor s/2^t \rfloor}
          -(-r_t)^{\lfloor s/2^t \rfloor}\right).
$$

The basic vanishing used everywhere is

$$
D_t(E_s) = 0 \quad\text{if}\quad s < 2^t.
$$

## Statement

Let

$$
A_k^+(X) = u_k + (1-u_k)X,\qquad
A_k^-(X) = u_k - (1-u_k)X.
$$

The conjectured closed form is

$$
\det B_d =
(-1)^d
r_0^2\tau^2
(\tau^{E-4}-r_0^{E-4})
\prod_{k=1}^{d-2}(\tau^2-r_k^2)
(\tau+r_{d-1})
\prod_{k=1}^{d-2} L_0(u_{<k})L_{2^k-1}(u_{<k})
\prod_{k=0}^{d-2} A_k^+(r_k)A_k^-(\tau).
$$

Here $u_{<k}$ means $(u_0, \ldots, u_{k-1})$, and $E$ is the even top-pair
anchor. In the small-case experiments $E=N=2^d$.

## Geometric Divisor Strategy

Let $V_S=\operatorname{span}\{E_s:s\in S\}$ and let $W$ be the $2d$-dimensional
space with coordinates the rows of $B_d$. The matrix $B_d$ is the matrix of a
family of linear maps

$$
\Psi_{u,r,\tau}: V_S \longrightarrow W
$$

over the parameter space

$$
\mathcal P=\operatorname{Spec}
F[u_0,\ldots,u_{d-1}, r_0,\ldots,r_{d-1}, \tau].
$$

Thus $\det B_d$ is a regular function on $\mathcal P$, and its zero locus is
the degeneracy divisor

$$
\mathcal D=\{(u,r,\tau): \operatorname{rank}\Psi_{u,r,\tau}<2d\}.
$$

The conjectured formula is equivalent to a decomposition of this divisor into
explicit hypersurfaces, with multiplicities:

$$
\mathcal D =
2\{r_0=0\}+2\{\tau=0\}
+\{\tau^{E-4}=r_0^{E-4}\}
+\sum_{k=1}^{d-2}\{\tau^2=r_k^2\}
+\{\tau+r_{d-1}=0\}
$$

plus the Lagrange and affine hypersurfaces

$$
\sum_{k=1}^{d-2}
\left(
\{L_0(u_{<k})=0\}
+\{L_{2^k-1}(u_{<k})=0\}
\right)
+\sum_{k=0}^{d-2}
\left(
\{A_k^+(r_k)=0\}
+\{A_k^-(\tau)=0\}
\right).
$$

This suggests a Vandermonde-style proof:

1. Show that $\Psi_{u,r,\tau}$ drops rank on each listed hypersurface. This
   proves that every listed factor divides $\det B_d$.
2. Compare degree or multidegree with the proposed product. This proves there
   are no additional irreducible components.
3. Fix the scalar by a single specialization, or by a leading monomial
   computation. The small cases give the sign $(-1)^d$ for the current row and
   column order.

This is the same proof pattern as the classical Vandermonde determinant: first
find all obvious rank-drop divisors, then compare degree.

## Dyadic-First Quotient

The useful geometric filtration is on the source:

$$
V_{\mathrm{dyadic}}
=
\operatorname{span}\{E_{2^k},E_{2^k-1}:1\le k\le d-1\},
\qquad
V_S=V_{\mathrm{dyadic}}\oplus P_{\mathrm{top}},
$$

where

$$
P_{\mathrm{top}}=\operatorname{span}\{E_{E-1},E_{E-2}\}.
$$

The point is to eliminate the dyadic image first and only then look at the top
pair. Over the generic point, assume the restricted map

$$
\Psi_D:=\Psi\vert_{V_{\mathrm{dyadic}}}:V_{\mathrm{dyadic}}\to W
$$

has rank $2d-2$. Then there is a quotient bundle

$$
Q_D = W / \Psi_D(V_{\mathrm{dyadic}})
$$

of rank $2$, and the top pair induces the residual map

$$
\Psi_{\mathrm{top}/D}: P_{\mathrm{top}}\longrightarrow Q_D.
$$

The determinant section decomposes into the degeneracy divisor of $\Psi_D$
plus the degeneracy divisor of the residual top-pair map. This explains where
the unusual factor should live:

$$
\tau^{E-4}-r_0^{E-4}
\quad\text{belongs to}\quad
\det(\Psi_{\mathrm{top}/D}),
$$

not to a local Gemini fold level. The dyadic image imposes interpolation
constraints; the residual two-dimensional alternant of the top pair is what
produces the exponent $E-4$.

## Divisibility Targets

The proof can now be organized by rank-drop divisors rather than by trying to
guess a perfect target filtration.

### Dyadic Divisors

For $1\le k\le d-2$, prove that $\Psi_D$ drops rank when

$$
\tau^2-r_k^2=0.
$$

Geometrically, $\tau=\pm r_k$ makes the two evaluations at level $k$ collide
after the row change from $(M_k(\tau),M_k(-r_k))$ to
$(D_k,M_k(-r_k))$.

For the final level, prove the boundary rank drop

$$
\tau+r_{d-1}=0.
$$

This should be the terminal version of the same collision, with only the
"plus" branch surviving.

### Lagrange Endpoint Divisors

For $1\le k\le d-2$, prove rank drop along

$$
L_0(u_{<k})=0
\qquad\text{and}\qquad
L_{2^k-1}(u_{<k})=0.
$$

These are endpoint collapses of the folded pair $P_{2^k}$: one of the two
distinguished folded basis vectors loses its coefficient, so the corresponding
two-column contribution cannot have full rank.

### Affine Fold Divisors

For $0\le k\le d-2$, prove rank drop along

$$
A_k^+(r_k)=u_k+(1-u_k)r_k=0,
\qquad
A_k^-(\tau)=u_k-(1-u_k)\tau=0.
$$

These are the residual fold-affine divisors. They should be visible as explicit
column relations between adjacent dyadic levels: at those parameter values, the
level-$k$ fold weight makes the contribution at the next level linearly
dependent on the previous dyadic image.

This is the most important family to write down explicitly. A useful target is
to produce, on each affine hypersurface, a nonzero vector

$$
c_k E_{2^k}+c'_k E_{2^k-1}
+ \sum_{j<k}(c_j E_{2^j}+c'_jE_{2^j-1})
$$

whose image under $\Psi$ is zero. Such a relation proves the corresponding
factor divides the dyadic determinant or the residual top determinant.

### Top-Pair Divisors

For the residual map $P_{\mathrm{top}}\to Q_D$, prove rank drop along

$$
r_0=0,\qquad \tau=0,\qquad \tau^{E-4}-r_0^{E-4}=0,
\qquad A_0^+(r_0)=0,\qquad A_0^-(\tau)=0.
$$

The root-of-unity component

$$
\tau^{E-4}=r_0^{E-4}
$$

is the lacunary Vandermonde piece: after quotienting by the dyadic image, the
top monomials $E_{E-1}$ and $E_{E-2}$ become dependent when $\tau/r_0$ is an
$(E-4)$th root of unity.

## Degree Comparison

After all divisibilities are proved, compare degrees. The proposed product has
total degree in $\tau$ equal to

$$
2+(E-4)+2(d-2)+1+(d-1)=E+3d-6,
$$

where the terms come from $\tau^2$, the top lacunary factor, the
middle-level factors $\tau^2-r_k^2$, the last factor $\tau+r_{d-1}$, and the
affine factors $A_k^-(\tau)$.

A matching upper bound on $\deg_\tau \det B_d$ should follow directly from the
row degrees:

$$
\deg_\tau D_t(E_s)\le \left\lfloor s/2^t\right\rfloor,
\qquad
\deg_\tau M_t(-r_t)(E_s)=0.
$$

The required degree bound is sharper than the naive sum of maximum row degrees,
so it should be proved after the dyadic-first quotient: bound the degree of
the dyadic Plucker coordinate and the residual top-pair determinant separately.
Once the degree matches the product, divisibility forces equality up to a
scalar.

## Nonvanishing Consequence

Every displayed factor is a nonzero polynomial in $K$:

- $r_0$, $\tau$, $\tau^{E-4}-r_0^{E-4}$;
- $\tau^2-r_k^2$ for $1 \le k \le d-2$;
- $\tau+r_{d-1}$;
- the Lagrange monomials $L_0(u_{<k})$ and $L_{2^k-1}(u_{<k})$;
- the affine residuals $A_k^+(r_k)$ and $A_k^-(\tau)$.

Therefore the determinant is nonzero in $K$. After Fiat-Shamir
specialization, rank can drop only on the union of these explicit zero loci
and the existing Shplonk/KZG denominator bad sets.

## Relevant Math Vocabulary

The top-pair identity is likely a special case of one of the following
standard determinant phenomena:

- generalized Vandermonde or alternant determinants;
- Schur-polynomial factorizations of lacunary Vandermonde determinants;
- resultants or subresultants of sparse monomial systems;
- determinants of filtered linear maps via Schur complements.

The factor $\tau^{E-4}-r_0^{E-4}$ is the diagnostic signal: it is not a
Gemini binary-cyclotomic factor. It is the residual alternant left after the
dyadic interpolation constraints have been eliminated.

## What Remains To Turn This Into A Full Proof

1. Write explicit kernel or image-dependence relations on the dyadic collision
   divisors $\tau^2-r_k^2$ and $\tau+r_{d-1}$.
2. Write endpoint relations for
   $L_0(u_{<k})=0$ and $L_{2^k-1}(u_{<k})=0$.
3. Write adjacent-level relations for the affine divisors
   $A_k^+(r_k)=0$ and $A_k^-(\tau)=0$.
4. In the quotient $W/\Psi(V_{\mathrm{dyadic}})$, write the top-pair
   dependence responsible for $\tau^{E-4}-r_0^{E-4}$.
5. Prove the degree or multidegree bound showing that these divisors exhaust
   $\det B_d$.

Once these rank-drop relations and the degree bound are established, the
Vandermonde-style divisor proof gives the general determinant formula.
