# Shplemini Sparse Masking

This note proves the KZG masking lemma used to replace the full-size random
`gemini_masking_poly` in the Gemini + Shplonk + KZG path of Shplemini by a
sparse polynomial with only `2d` random coefficients.

We first prove the statement over a rational function field. A concrete
Fiat-Shamir transcript is obtained by specialising the indeterminates; the proof
is valid at every specialisation outside the explicitly defined exceptional
locus.

## Setup

Let

$$
N=2^d,
\qquad d\ge 4,
\qquad 2d<N.
$$

Let $\mathbb F$ be the scalar field and write $E_j(X)=X^j$ for the monomial
basis of $\mathbb F[X]_{<N}$. Let $e$ be the maximum end-index of the masked
polynomial data. Choose the smallest even integer $E$ such that

$$
e\le E\le N,
\qquad
\{E-1,E-2\}\cap\{N/2^\ell,N/2^\ell-1\}=\varnothing
\quad(1\le \ell<d).
$$

Equivalently, if $B=N/2^\ell$ is dyadic, then $E\notin\{B,B+2\}$. In the
main argument we assume

$$
N/2<E\le N.
$$

When $E\le N/2$, the dense polynomial space is smaller and the low-tail
containment argument applies after deleting the unused dense columns. The
saturated case $d=3$ is recorded separately in Appendix B.

Define the tail-halving support

$$
S=[E-1,E-2,N/2,N/2-1,N/4,N/4-1,\ldots,2,1],
$$

truncated to exactly $2d$ entries. The non-exceptional choice of $E$ makes
these entries distinct. The prover samples

$$
M(X)=\sum_{s\in S} c_sX^s,
\qquad c_s\stackrel{\$}{\leftarrow}\mathbb F
$$

with the $c_s$ independent.

Work over

$$
K=\mathbb F(u_0,\ldots,u_{d-1},r_0,\ldots,r_{d-1},\tau),
$$

where the $u_i$ are Gemini folding challenges, the $r_i$ are Gemini opening
points, and $\tau$ is the KZG trapdoor. Shplonk batching challenges and the
final KZG opening point are used only in the reduction from the full transcript
to the Gemini leakage map.

For this support, with

$$
A_k=\{s\in S:\lfloor s/2^k\rfloor\ge 1\},
\qquad
C_k=A_k\setminus A_{k+1}\quad(0\le k\le d-2),
\qquad
C_{d-1}=A_{d-1},
$$

the fresh-column blocks are

$$
C_0=\{1\},
\qquad
C_k=\{2^{k+1}-1,2^k\}\quad(1\le k\le d-2),
\qquad
C_{d-1}=\{E-1,E-2,N/2\}.
$$

Indeed, the dyadic pair \(\{2^{k+1}-1,2^k\}\) is exactly the part of the fixed
halving tail with

$$
2^k\le s<2^{k+1},
$$

so it lies in \(A_k\setminus A_{k+1}\). The column \(1\) is the unique support
point with \(1\le s<2\), giving \(C_0\). Since \(E>N/2\), the top pair
\(E-1,E-2\) lies in \(A_{d-1}\); the non-exceptional condition
\(E\notin\{B,B+2\}\) for dyadic \(B\) ensures it is disjoint from every dyadic
halving pair. Finally \(N/2\in A_{d-1}\), while \(N/2-1\notin A_{d-1}\), so the
only columns surviving to level \(d-1\) are \(E-1,E-2,N/2\).

### Exceptional locus

Let $R_E$ denote the active rank witness:

$$
R_E=
\begin{cases}
\det B_E, & E>3N/4,\\
\Delta_E^{\mathrm{lo}}, & N/2<E\le 3N/4.
\end{cases}
$$

The factorisations of $\det B_E$ and $\Delta_E^{\mathrm{lo}}$ are given in
Sections 7 and 8. The exceptional locus is the zero locus of

$$
\mathcal E_E
=
R_E\cdot\prod_{t=0}^{d-1}(\tau+r_t)\cdot D_{\mathrm{Shplonk/KZG}},
$$

where $D_{\mathrm{Shplonk/KZG}}$ is the product of the Shplonk and KZG
denominators that occur in the transcript reduction: the factors $\tau-z_i$,
$z-z_i$, $\tau-z$, and the pairwise differences needed for the batched
opening points to be distinct.

All Lagrange and affine factors needed for the rank argument already occur as
factors of $R_E$. Thus they are part of the explicit rank-witness zero locus,
not an additional informal bad set. After specialising to a finite field,
Schwartz-Zippel bounds the failure probability by
$\deg(\mathcal E_E)/|\mathbb F|$.

## Implementation note and machine-checked status

The Lean development in `shplemini_lean/` (`ParameterizedFinal.lean` and its
dependencies) machine-checks this note end to end, with three deliberate
strengthenings of the statements as written above:

1. **No exceptional-`E` selection.** The implementation does not choose `E`
   to avoid `\{B, B+2\}`: `tail_halving_support` keeps
   `E = round_up_even(e)` and de-duplicates/tail-fills on collision. The
   machine-checked theorem covers *every* extent with `N/2 < E <= N`,
   collisions included: each support entry above is a member of the
   generated support for every extent (de-dup never removes, fill only
   appends), and the rank witnesses use column sets that are pairwise
   distinct in each regime (below `3N/4` the `N/2` anchor column is the
   one deleted by Section 8, which is the only possible collision there).
   The non-exceptional selection rule is therefore unnecessary; it is kept
   above as the historical derivation.
2. **`d >= 3` uniformly.** The formal theorems assume only `d >= 3`; the
   saturated `d = 3, E = 6` case of Appendix B is an instance of the main
   argument (low tail, collision handled per item 1) rather than a separate
   case.
3. **Pointwise conditional form.** Instead of the rational function field
   `K` with specialisation, the Lean theorems are stated over an arbitrary
   field with the factors of `R_E`, the `tau + r_t`, and the Shplonk/KZG
   denominators as explicit non-vanishing hypotheses
   (`StaircaseChallenges`, `GoodChallenges`) — the same exceptional locus,
   point by point. The hypotheses are `decide`-witnessed satisfiable,
   including on the Gemini-specialised locus `r_t = r^(2^t)`. The
   Schwartz–Zippel bound of Section 9 stays on paper, as here.

Correspondence of the main statements (`FINAL_PROOF_STATUS.md` has the full
DAG): the containment theorem is
`productionTailHalvingSparseMasking_of_staircase`; Lemma 4.1 is `midDet_eq`;
Lemmas 6.1–6.3 are `pair_antisym_*`, `casoratian_Xlong`, and
`boundary_functional_cleared` / `elimRow_functional_cleared`; Lemma 7.1 is
`highTail_boundary_det_functional`, and the displayed
`det B~_E = (prod det T_k) det U_E^hi` is `ordSupport_det_identity` (up to
the same column-ordering sign, realised as `parSupport_det_eq_sign_mul_-
ordSupport`); the Section 8 reduced minor is `ordSupportLow_det_identity`
with the hyperplane bridge
`productionTriangularContainment_of_lower_terminal_projected_det`. The raw
`det B_E` display with the restored `tau + r_t` factors is not separately
formalised; the raw-to-triangular relation enters at the span level
(`geminiRowsFin_mem_triangularRowsFin_span`), which is what the containment
consumes.

## Theorem

Let

$$
V_E=\operatorname{span}\{X^s:0\le s<E\},
\qquad
V_S=\operatorname{span}\{X^s:s\in S\}.
$$

For $P\in V_E$, let $P_t$ be the polynomial obtained after $t$ Gemini
folds, and define the Gemini leakage map

$$
G_E:V_E\to K^{2d},
\qquad
G_E(P)=
\bigl(P_0(\tau),P_0(-r_0),\ldots,P_{d-1}(\tau),P_{d-1}(-r_{d-1})\bigr).
$$

Let $G_S=G_E|_{V_S}$. Outside the exceptional locus $\mathcal E_E=0$,

$$
\operatorname{im}G_E\subseteq\operatorname{im}G_S.
$$

More precisely:

$$
\begin{array}{ll}
E>3N/4: & \operatorname{rank}G_S=2d,\text{ hence }\operatorname{im}G_S=K^{2d},\\[2mm]
N/2<E\le 3N/4: & \operatorname{rank}G_S=2d-1,\text{ and }\operatorname{im}G_E\subseteq\operatorname{im}G_S.
\end{array}
$$

The Shplonk and KZG messages are linear functions of these Gemini coordinates
and of the sumcheck value. The sumcheck value is evaluated from the same mask
polynomial after the Gemini coordinates are fixed. Hence the sparse mask induces
the same distribution on every full-transcript mask direction exposed by dense
degree-$<E$ masking.

## Proof

### 1. Reduction to the Gemini block

Let $\mathsf T_E$ be the linear map from a mask polynomial to the mask-dependent
part of the algebraic transcript. In the algebraic group model for KZG, a
commitment $[P]$ is represented by the scalar $P(\tau)$. For the KZG path
considered here, the mask-dependent transcript coordinates are

$$
M(u),\qquad
M_t(\tau),\ M_t(-r_t)\quad(0\le t<d),\qquad
Q_M(\tau),\qquad W_M(\tau).
$$

Here $M_t$ is the $t$-fold Gemini fold of $M$, and $Q_M,W_M$ denote the
mask contributions to the Shplonk quotient commitment and the KZG witness
commitment.

**Lemma 1.1 (Shplonk/KZG rows).**  After the Fiat-Shamir challenges are fixed
and the Shplonk/KZG denominators are nonzero, the coordinates $Q_M(\tau)$ and
$W_M(\tau)$ are $K$-linear combinations of

$$
M(u),\qquad M_t(\tau),\qquad M_t(-r_t)\qquad(0\le t<d).
$$

*Proof.* Shplonk constructs

$$
Q(X)=\sum_i \nu^i\frac{P_i(X)-v_i}{X-z_i}.
$$

Taking the mask-dependent part and evaluating at $X=\tau$ gives a linear
combination of the corresponding mask evaluations, with coefficients determined
by $\nu,\tau,z_i$ and the nonzero denominators $\tau-z_i$. In the Gemini
instance, those mask evaluations are exactly the displayed Gemini openings and
the sumcheck value. The KZG witness coordinate is obtained from the KZG quotient
for opening $Q$ at $z$; after substituting the Shplonk expression, its
mask-dependent numerator is again a linear combination of the same coordinates,
with additional denominators collected in $D_{\mathrm{Shplonk/KZG}}$. $\square$

Thus the only possible independent mask leakage is contained in the augmented
Gemini map

$$
\widehat G_E(P)=\bigl(P(u),G_E(P)\bigr).
$$

The determinant argument below proves the image statement for $G_E$. The
sumcheck coordinate is not prescribed independently by the simulator: once a
sparse mask $M\in V_S$ has been chosen to realise the required Gemini leakage,
$M(u)$ is the value of that same polynomial. Hence the full transcript is
sampled from the pushforward of the sparse coefficient distribution under
$\widehat G_S$, and Lemma 1.1 shows that Shplonk and KZG add no further rank
condition beyond this augmented Gemini data.

For the rank witnesses below we use the $2d\times |S|$ Gemini matrix $B$,
whose rows are

$$
M_t(\tau),\qquad M_t(-r_t)\qquad(0\le t<d),
$$

and whose columns are the monomials $E_s=X^s$ for $s\in S$.

### 2. Fold formulas and row normalisation

For $s<N$, set

$$
q_t(s)=\left\lfloor\frac{s}{2^t}\right\rfloor,
\qquad
\ell_t(s)=L_{s\bmod 2^t}(u_0,\ldots,u_{t-1}).
$$

The Gemini fold recursion gives, for the monomial $E_s=X^s$,

$$
\operatorname{fold}_t(E_s)=\ell_t(s)E_{q_t(s)},
\qquad
M_t(x)(E_s)=\ell_t(s)x^{q_t(s)}.
$$

Replace each row pair $(M_t(\tau),M_t(-r_t))$ by

$$
D_t=M_t(\tau)-M_t(-r_t),
\qquad
M_t=M_t(-r_t).
$$

This row operation has determinant $1$. Define

$$
\phi_m(\tau,y)=\frac{\tau^m-y^m}{\tau-y}
=\sum_{i=0}^{m-1}\tau^{m-1-i}y^i,
\qquad
\phi_0=0.
$$

We use the following elementary identities. For $a\ge b\ge1$,

$$
\phi_a(\tau,y)\phi_{b-1}(\tau,y)-\phi_b(\tau,y)\phi_{a-1}(\tau,y)
=-(\tau y)^{b-1}\phi_{a-b}(\tau,y).
$$

Indeed, multiply by $(\tau-y)^2$ and use $(\tau-y)\phi_m=\tau^m-y^m$; the
mixed terms cancel and leave
$-(\tau y)^{b-1}(\tau^{a-b}-y^{a-b})$. We also use the recursions

$$
\phi_m(\tau,y)=\tau\phi_{m-1}(\tau,y)+y^{m-1},
\qquad
\phi_m(\tau,y)=y\phi_{m-1}(\tau,y)+\tau^{m-1}.
$$

Then

$$
D_t(E_s)=(\tau+r_t)D_t'(E_s),
\qquad
D_t'(E_s)=\ell_t(s)\phi_{q_t(s)}(\tau,-r_t).
$$

After extracting the factor $\tau+r_t$ from the row $D_t$, set

$$
M_t^{\mathrm{new}}=M_t+r_tD_t'.
$$

**Lemma 2.1 (normalised row values).** For every $t$ and $s$,

$$
M_t^{\mathrm{new}}(E_s)=
\begin{cases}
\ell_t(s), & q_t(s)=0,\\[1mm]
\ell_t(s)\tau r_t\phi_{q_t(s)-1}(\tau,-r_t), & q_t(s)\ge1.
\end{cases}
$$

*Proof.* If $q_t(s)=0$, then $M_t(E_s)=\ell_t(s)$ and $D_t'(E_s)=0$. If
$q_t(s)=m\ge1$, use

$$
\phi_m(\tau,y)=\tau\phi_{m-1}(\tau,y)+y^{m-1}
$$

with $y=-r_t$. Then

$$
(-r_t)^m+r_t\phi_m(\tau,-r_t)
=\tau r_t\phi_{m-1}(\tau,-r_t),
$$

and multiplication by $\ell_t(s)$ gives the formula. $\square$

All row operations in this section are invertible over $K$ away from the
factors $\tau+r_t$, already included in $\mathcal E_E$.

### 3. Reducing to Block-Triangular Form

The following two identities are the filtration step.

**Lemma 3.1 (old-column leakage).** If $j<k$ and $s\in C_j$, then

$$
M_k^{\mathrm{new}}(E_s)
=\prod_{i=j+1}^{k-1}(1-u_i)\,M_{j+1}^{\mathrm{new}}(E_s).
$$

*Proof.* For $s\in C_j$, one has $q_k(s)=q_{j+1}(s)=0$. Lemma 2.1 therefore
reduces both sides to Lagrange factors. The bits $j+1,\ldots,k-1$ of $s$
are all zero, so the multilinear Lagrange recursion gives

$$
\ell_k(s)=\ell_{j+1}(s)\prod_{i=j+1}^{k-1}(1-u_i).
$$

This is the desired identity. $\square$

**Lemma 3.2 (adjacent block).** If $k\ge1$ and $s\in C_{k-1}$, then

$$
M_k^{\mathrm{new}}(E_s)=u_{k-1}D_{k-1}'(E_s).
$$

*Proof.* For $s\in C_{k-1}$,

$$
q_{k-1}(s)=1,
\qquad
q_k(s)=0,
\qquad
\operatorname{bit}_{k-1}(s)=1.
$$

Thus $D_{k-1}'(E_s)=\ell_{k-1}(s)\phi_1(\tau,-r_{k-1})=\ell_{k-1}(s)$, while
Lemma 2.1 gives $M_k^{\mathrm{new}}(E_s)=\ell_k(s)=u_{k-1}\ell_{k-1}(s)$.
$\square$

For $k\ge1$, define

$$
N_k=M_k^{\mathrm{new}}-u_{k-1}D_{k-1}'-(1-u_{k-1})M_{k-1}^{\mathrm{new}}.
$$

The transformation from the rows
$(D_0',M_0^{\mathrm{new}},\ldots,D_{d-1}',M_{d-1}^{\mathrm{new}})$ to

$$
(D_0',M_0^{\mathrm{new}},D_1',N_1,\ldots,D_{d-1}',N_{d-1})
$$

is unit-triangular in the row index. Lemmas 3.1 and 3.2 imply

$$
D_k'|_{C_0\sqcup\cdots\sqcup C_{k-1}}=0,
\qquad
N_k|_{C_0\sqcup\cdots\sqcup C_{k-1}}=0.
$$

Therefore, with columns ordered $C_0|C_1|\cdots|C_{d-1}$, the transformed
matrix is block-lower-triangular. Its diagonal blocks are

$$
T_k=\begin{pmatrix}D_k'(E_s)\\ N_k(E_s)\end{pmatrix}_{s\in C_k}.
$$

The block $T_0$ has size $2\times1$, the middle blocks $T_k$ for
$1\le k\le d-2$ have size $2\times2$, and the boundary block
$T_{d-1}$ has size $2\times3$.

### 4. Middle determinants

For $1\le k\le d-2$, put $m=k-1$. The middle block has columns

$$
C_k=\{2^{k+1}-1,2^k\}.
$$

Define

$$
A_m^+(r_m)=u_m+(1-u_m)r_m,
\qquad
A_m^-(\tau)=u_m-(1-u_m)\tau.
$$

**Lemma 4.1 (middle block determinant).** For every $1\le k\le d-2$,

$$
\det T_k
=
- L_0(u_{<m})L_{2^m-1}(u_{<m})
(\tau-r_m)A_m^+(r_m)A_m^-(\tau).
$$

*Proof.* Let

$$
u=u_m,
\qquad r=r_m,
\qquad L_-=L_0(u_{<m}),
\qquad L_+=L_{2^m-1}(u_{<m}).
$$

On the two columns of $C_k$ one has $q_k=1$. Hence
$M_k^{\mathrm{new}}=0$ and $D_k'=\ell_k$ there, so the $D_k'$ row is

$$
\bigl(uL_+,(1-u)L_-\bigr).
$$

Since $M_k^{\mathrm{new}}=0$ on $C_k$,

$$
N_k=-uD_m'-(1-u)M_m^{\mathrm{new}}
$$

on this block. The level-$m$ quotients of the two columns $2^{k+1}-1$ and
$2^k$ are $3$ and $2$. Using

$$
\phi_2(\tau,-r)=\tau-r,
\qquad
\phi_3(\tau,-r)=\tau^2-\tau r+r^2,
$$

Lemma 2.1 gives

$$
N_k(2^{k+1}-1)
=-L_+\bigl(u(\tau^2-\tau r+r^2)+(1-u)\tau r(\tau-r)\bigr),
$$

$$
N_k(2^k)
=-L_-\bigl(u(\tau-r)+(1-u)\tau r\bigr).
$$

Therefore

$$
\begin{aligned}
\det T_k
&=L_+L_-\Bigl((1-u)\bigl(u(\tau^2-\tau r+r^2)+(1-u)\tau r(\tau-r)\bigr)\\
&\hspace{5.5em}-u\bigl(u(\tau-r)+(1-u)\tau r\bigr)\Bigr)\\
&=-L_+L_-(\tau-r)\bigl(u+(1-u)r\bigr)\bigl(u-(1-u)\tau\bigr).
\end{aligned}
$$

Substituting back $m=k-1$ gives the claimed formula. The computation depends
only on the fixed middle columns $2^{k+1}-1$ and $2^k$, not on the top pair
$E-1,E-2$. $\square$

### 5. Boundary preparation

The first fresh block is $C_0=\{1\}$. Since

$$
D_0'(E_1)=\phi_1(\tau,-r_0)=1
$$

and every row except $D_0'$ vanishes on $C_0$ after the block-triangular reduction, the
Schur complement at this pivot deletes the row $D_0'$ and the column $1$.

The row $M_0^{\mathrm{new}}$ remains unpaired. For each middle block
$C_k$, $1\le k\le d-2$, Lemma 4.1 and the condition $R_E\ne0$ imply that
$T_k$ is invertible. Therefore there are unique $\alpha_k,\beta_k\in K$
such that

$$
M_0^{\mathrm{new}}|_{C_k}
=\alpha_kD_k'|_{C_k}+\beta_kN_k|_{C_k}.
$$

Replace $M_0^{\mathrm{new}}$ successively by

$$
M_0^{\mathrm{new}}-\alpha_kD_k'-\beta_kN_k
\qquad(1\le k\le d-2),
$$

in increasing $k$. Since $D_k'$ and $N_k$ vanish on
$C_0\sqcup\cdots\sqcup C_{k-1}$, later eliminations do not change earlier
blocks. Let the resulting row be $M_{0,\mathrm{elim}}^{\mathrm{new}}$.

After this operation the determinant, or the relevant reduced minor in the
low-tail case, is the product of the middle determinants and a boundary
determinant supported on $C_{d-1}$.

### 6. The $\rho$-anti-symmetry

Let

$$
c_+=E-1,
\qquad
c_-=E-2,
\qquad
h=2^{d-2},
\qquad
\rho=c_+\bmod h.
$$

Since $E$ is even, $\rho$ is odd. Set

$$
W_+=L_\rho(u_{<d-2}),
\qquad
W_-=L_{\rho-1}(u_{<d-2}).
$$

Thus $W_+=u_0H$ and $W_-=(1-u_0)H$ for the common higher-bit factor
$H$.

**Lemma 6.1 (anti-symmetric vanishing).** Let $R$ be one of the rows
$D_k'$, $M_k^{\mathrm{new}}$ with $k\ge1$, or $N_k$ with $k\ge2$. Then

$$
W_-R(c_+)-W_+R(c_-)=0.
$$

*Proof.* Fix $k\ge1$. Since $c_+$ and $c_-$ are consecutive integers with
$c_+$ odd, their binary expansions differ only in bit $0$ below level $k$.
Therefore

$$
q_k(c_+)=q_k(c_-),
$$

and there is a polynomial factor $Y_k$ independent of the bit-0 choice such that

$$
D_k'(c_+)=u_0H_kY_k,
\qquad
D_k'(c_-)=(1-u_0)H_kY_k,
$$

where $H_k$ contains the common bits $1,\ldots,k-1$. The same factorisation
holds for $M_k^{\mathrm{new}}$, because its value is also
$\ell_k(s)$ times a function only of $q_k(s)$. Multiplying by
$W_-=(1-u_0)H$ and $W_+=u_0H$ gives equal products.

For $N_k$ with $k\ge2$, use

$$
N_k=M_k^{\mathrm{new}}-u_{k-1}D_{k-1}'-(1-u_{k-1})M_{k-1}^{\mathrm{new}}.
$$

Each row on the right has the same anti-symmetry property just proved, so their
linear combination does too. $\square$

The row $N_1$ is exceptional because it contains level-0 rows. Define

$$
X_m=(1-u_0)\phi_m(\tau,-r_0)-u_0\phi_{m-1}(\tau,-r_0).
$$

**Lemma 6.2 (Casoratian).** For every even $E\ge4$,

$$
X_2X_{E-1}-X_3X_{E-2}
=\tau r_0\phi_{E-4}(\tau,-r_0)A_0^+(r_0)A_0^-(\tau).
$$

*Proof.* In this proof all $\phi$'s are evaluated at $(\tau,-r_0)$. Expanding
bilinearly in $u_0$ and $1-u_0$ gives

$$
\begin{aligned}
X_2X_{E-1}-X_3X_{E-2}
&=(1-u_0)^2(\phi_2\phi_{E-1}-\phi_3\phi_{E-2})\\
&\quad+u_0(1-u_0)(\phi_3\phi_{E-3}-\phi_{E-1})\\
&\quad+u_0^2(\phi_{E-2}-\phi_2\phi_{E-3}).
\end{aligned}
$$

The identity for $\phi$ gives

$$
\phi_2\phi_{E-1}-\phi_3\phi_{E-2}=-\tau^2r_0^2\phi_{E-4},
\qquad
\phi_{E-2}-\phi_2\phi_{E-3}=\tau r_0\phi_{E-4}.
$$

For the middle bracket, use the recursions
$\phi_{E-1}=\tau\phi_{E-2}+r_0^{E-2}$ and
$\phi_{E-2}=\tau\phi_{E-3}-r_0^{E-3}$, valid because $E$ is even, together with

$$
\tau r_0\phi_{E-5}-\phi_{E-3}=-\phi_2\phi_{E-4},
$$

to obtain

$$
\phi_3\phi_{E-3}-\phi_{E-1}=-\tau r_0\phi_2\phi_{E-4}.
$$

Substitution yields

$$
X_2X_{E-1}-X_3X_{E-2}
=\tau r_0\phi_{E-4}\bigl[u_0^2-u_0(1-u_0)\phi_2-(1-u_0)^2\tau r_0\bigr].
$$

Since $\phi_2=\tau-r_0$, the bracket is

$$
\bigl(u_0+(1-u_0)r_0\bigr)\bigl(u_0-(1-u_0)\tau\bigr)
=A_0^+(r_0)A_0^-(\tau).
$$

This proves the identity. $\square$

**Lemma 6.3 (boundary functional).** For $d\ge4$,

$$
\Delta_\rho
:=W_-M_{0,\mathrm{elim}}^{\mathrm{new}}(c_+)
-W_+M_{0,\mathrm{elim}}^{\mathrm{new}}(c_-)
=W_+r_0^2\tau^2
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}.
$$

*Proof.* Write $W_+=u_0H$ and $W_-=(1-u_0)H$. It suffices to compute the
normalised functional

$$
\Delta'=(1-u_0)M_{0,\mathrm{elim}}^{\mathrm{new}}(c_+)
-u_0M_{0,\mathrm{elim}}^{\mathrm{new}}(c_-),
$$

since $\Delta_\rho=H\Delta'$ and $H u_0=W_+$.

Substitute

$$
M_{0,\mathrm{elim}}^{\mathrm{new}}
=M_0^{\mathrm{new}}-\sum_{k=1}^{d-2}(\alpha_kD_k'+\beta_kN_k).
$$

By Lemma 6.1, every eliminated row except $N_1$ vanishes under $\Delta'$. Thus

$$
\Delta'
=\bigl[(1-u_0)M_0^{\mathrm{new}}(c_+)-u_0M_0^{\mathrm{new}}(c_-)\bigr]
-\beta_1\bigl[(1-u_0)N_1(c_+)-u_0N_1(c_-)\bigr].
$$

Because $M_0^{\mathrm{new}}(E_s)=\tau r_0\phi_{s-1}(\tau,-r_0)$ for $s\ge1$,

$$
(1-u_0)M_0^{\mathrm{new}}(c_+)-u_0M_0^{\mathrm{new}}(c_-)=\tau r_0X_{E-2}.
$$

For $N_1=M_1^{\mathrm{new}}-u_0D_0'-(1-u_0)M_0^{\mathrm{new}}$, the
$M_1^{\mathrm{new}}$ contribution cancels under $\Delta'$ by Lemma 6.1, leaving

$$
(1-u_0)N_1(c_+)-u_0N_1(c_-)
=-u_0X_{E-1}-(1-u_0)\tau r_0X_{E-2}.
$$

It remains to compute $\beta_1$, the coefficient used to eliminate
$M_0^{\mathrm{new}}$ on $C_1=\{3,2\}$. Cramer's rule against the block $T_1$
gives

$$
\beta_1
=\frac{D_1'(3)M_0^{\mathrm{new}}(2)-D_1'(2)M_0^{\mathrm{new}}(3)}{\det T_1}
=\frac{u_0\tau r_0-(1-u_0)\tau r_0\phi_2}{\det T_1}.
$$

Since $u_0-(1-u_0)\phi_2=-X_2$ and Lemma 4.1 gives

$$
\det T_1=-(\tau-r_0)A_0^+(r_0)A_0^-(\tau),
$$

we have

$$
\beta_1=\frac{\tau r_0X_2}{(\tau-r_0)A_0^+(r_0)A_0^-(\tau)}.
$$

Let $D_0=(\tau-r_0)A_0^+(r_0)A_0^-(\tau)$. Combining the preceding displays and
multiplying by $D_0$ gives

$$
\Delta'D_0
=\tau r_0X_{E-2}D_0
+\tau r_0X_2\bigl[u_0X_{E-1}+(1-u_0)\tau r_0X_{E-2}\bigr].
$$

A direct expansion from the definitions gives

$$
D_0+(1-u_0)\tau r_0X_2=-u_0X_3.
$$

Therefore

$$
\Delta'D_0
=u_0\tau r_0\bigl(X_2X_{E-1}-X_3X_{E-2}\bigr).
$$

By Lemma 6.2,

$$
\Delta'D_0
=u_0\tau^2r_0^2\phi_{E-4}(\tau,-r_0)A_0^+(r_0)A_0^-(\tau).
$$

Dividing by $D_0$ and using $E-4$ even gives

$$
\Delta'=u_0r_0^2\tau^2\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}.
$$

Multiplying by $H$ yields the claimed formula because $Hu_0=W_+$. $\square$

### 7. High-tail rank

Assume

$$
E>3N/4.
$$

After the eliminations of Section 5, the remaining boundary columns are
$\{c_+,c_-,N/2\}$, and the remaining boundary rows are

$$
M_{0,\mathrm{elim}}^{\mathrm{new}},
\qquad
D_{d-1}',
\qquad
N_{d-1}.
$$

Let $U_E^{\mathrm{hi}}$ be this $3\times3$ boundary matrix.

**Lemma 7.1 (high-tail boundary determinant).** Up to the fixed sign determined
by the column ordering,

$$
\det U_E^{\mathrm{hi}}
=
\pm r_0^2\tau^2
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}
(\tau-r_{d-2})A_{d-2}^+(r_{d-2})A_{d-2}^-(\tau)
L_0(u_{<d-2})L_\rho(u_{<d-2}).
$$

*Proof.* Write

$$
u=u_{d-2},
\qquad r=r_{d-2},
\qquad L_0=L_0(u_{<d-2}).
$$

On the boundary columns $c_+,c_-,N/2$, the row $D_{d-1}'$ is

$$
\bigl(uW_+,\ uW_-,\ (1-u)L_0\bigr),
$$

because $q_{d-1}=1$ on all three columns. The row $N_{d-1}$ is obtained from

$$
N_{d-1}=M_{d-1}^{\mathrm{new}}-uD_{d-2}'-(1-u)M_{d-2}^{\mathrm{new}},
$$

and $M_{d-1}^{\mathrm{new}}=0$ on these columns. For the top pair,
$q_{d-2}=3$; for $N/2$, $q_{d-2}=2$. Thus

$$
N_{d-1}|_{\{c_+,c_-,N/2\}}
=\bigl(W_+Y,\ W_-Y,\ L_0Z\bigr),
$$

where

$$
Y=-u\phi_3(\tau,-r)-(1-u)\tau r\phi_2(\tau,-r),
\qquad
Z=-u\phi_2(\tau,-r)-(1-u)\tau r.
$$

The cofactor of the $N/2$ entry in the first row is zero, since the two top-pair
columns of the lower $2\times3$ block are proportional to $(W_+,W_-)$. The
other two cofactors are

$$
\begin{aligned}
C_+&=uW_-L_0Z-(1-u)L_0W_-Y,\\
C_-&=(1-u)L_0W_+Y-uW_+L_0Z.
\end{aligned}
$$

Using $\phi_2(\tau,-r)=\tau-r$ and
$\phi_3(\tau,-r)=\tau^2-\tau r+r^2$, the common bracket satisfies

$$
u Z-(1-u)Y
=-(\tau-r)\bigl(u+(1-u)r\bigr)\bigl(u-(1-u)\tau\bigr).
$$

Hence the signed cofactor vector is, up to the fixed column-ordering sign,

$$
(\tau-r_{d-2})A_{d-2}^+(r_{d-2})A_{d-2}^-(\tau)
L_0(u_{<d-2})(W_-,-W_+,0).
$$

Expanding $\det U_E^{\mathrm{hi}}$ along the first row therefore applies the
functional $(a,b,c)\mapsto W_-a-W_+b$ to
$M_{0,\mathrm{elim}}^{\mathrm{new}}$ on the top pair. Lemma 6.3 evaluates this
functional as $\Delta_\rho$, giving the displayed formula. $\square$

The transformed determinant is

$$
\det \widetilde B_E
=\left(\prod_{k=1}^{d-2}\det T_k\right)\det U_E^{\mathrm{hi}}.
$$

By Lemmas 4.1 and 7.1 this is a nonzero element of $K$ outside
$R_E=0$. Restoring the extracted row factors $\tau+r_t$,

$$
\det B_E
=\pm r_0^2\tau^2(\tau^{E-4}-r_0^{E-4})
\prod_{k=1}^{d-2}(\tau^2-r_k^2)(\tau+r_{d-1})
\prod_{k=0}^{d-2}A_k^+(r_k)A_k^-(\tau)
\mathcal L_E^{\mathrm{hi}},
$$

where

$$
\mathcal L_E^{\mathrm{hi}}
=\left(\prod_{k=1}^{d-3}L_0(u_{<k})L_{2^k-1}(u_{<k})\right)
L_0(u_{<d-2})L_\rho(u_{<d-2}).
$$

Thus $\det B_E\ne0$ outside the exceptional locus, so
$\operatorname{rank}G_S=2d$.

### 8. Low-tail rank and dense containment

Assume

$$
N/2<E\le 3N/4.
$$

Put $m=d-2$, $u=u_m$, $r=r_m$, and

$$
\lambda=-\frac{u(\tau-r)+(1-u)\tau r}{1-u}.
$$

**Lemma 8.1 (dense hyperplane).** For every monomial $E_s$ with
$s<3N/4$, the final triangularised rows satisfy

$$
N_{d-1}(E_s)=\lambda D_{d-1}'(E_s).
$$

*Proof.* There are three ranges.

$$
\begin{array}{c|c|c|c|c}
\text{range of }s & q_m(s) & \operatorname{bit}_m(s) & q_{d-1}(s) & \text{result}\\
\hline
s<N/4 & 0 & 0 & 0 & \text{both rows vanish}\\
N/4\le s<N/2 & 1 & 1 & 0 & \text{both rows vanish}\\
N/2\le s<3N/4 & 2 & 0 & 1 & N_{d-1}=\lambda D_{d-1}'
\end{array}
$$

Each entry follows by substituting the listed $q$-values into Lemma 2.1 and
the definition of $N_{d-1}$. $\square$

Therefore $\operatorname{im}G_E$ lies in the hyperplane

$$
H_E=\ker\bigl(N_{d-1}-\lambda D_{d-1}'\bigr).
$$

For the sparse support, delete the redundant row $N_{d-1}$ and the boundary
column $N/2$. The remaining boundary columns are $\{c_+,c_-\}$, and the
remaining boundary rows are $M_{0,\mathrm{elim}}^{\mathrm{new}}$ and
$D_{d-1}'$. On these columns,

$$
D_{d-1}'=(1-u_{d-2})(W_+,W_-).
$$

Hence, by Lemma 6.3,

$$
\det U_E^{\mathrm{lo}}
=(1-u_{d-2})\Delta_\rho
=(1-u_{d-2})L_\rho(u_{<d-2})r_0^2\tau^2
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}.
$$

Multiplying by the middle block determinants gives a nonzero
$(2d-1)\times(2d-1)$ reduced minor. Thus $\operatorname{rank}G_S=2d-1$.
The functional $N_{d-1}-\lambda D_{d-1}'$ is nonzero as a functional on the
transformed row-coordinate space, since the coefficient of the row
$N_{d-1}$ is $1$. Hence $H_E$ has dimension $2d-1$. Since $G_S$ also satisfies
the row relation of Lemma 8.1, its $(2d-1)$-dimensional image is the full
hyperplane $H_E$. Consequently

$$
\operatorname{im}G_E\subseteq H_E=\operatorname{im}G_S.
$$

The reduced-minor witness is, up to the fixed ordering sign,

$$
\Delta_E^{\mathrm{lo}}
=\pm (r_0\tau)^2(\tau-r_0)
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}
\prod_{k=1}^{d-3}(\tau-r_k)
\prod_{k=0}^{d-3}A_k^+(r_k)A_k^-(\tau)
\mathcal L_E^{\mathrm{lo}},
$$

where

$$
\mathcal L_E^{\mathrm{lo}}
=(1-u_{d-2})L_\rho(u_{<d-2})
\left(\prod_{k=1}^{d-3}L_0(u_{<k})L_{2^k-1}(u_{<k})\right).
$$

For the degenerate padded case $d=3$, direct symbolic computation gives the
same statement with the saturated power $(r_0\tau)^2$ removed; see Appendix B.

### 9. Specialisation and simulation

The high-tail proof gives $R_E=\det B_E\ne0$. The low-tail proof gives a
nonzero reduced minor $R_E=\Delta_E^{\mathrm{lo}}$. Therefore, over the
rational function field $K$, the claimed rank and image statements hold.

After Fiat-Shamir specialisation over a concrete finite field, failure can occur
only when $\mathcal E_E=0$. Schwartz-Zippel gives

$$
\Pr[\mathcal E_E=0]\le \frac{\deg\mathcal E_E}{|\mathbb F|}
$$

for uniformly random independent challenges; in the Fiat-Shamir setting this is
the usual algebraic bad-event bound under the random-oracle heuristic.

Outside the exceptional locus, over the concrete field, the coefficient vector
$(c_s)_{s\in S}$ is uniform in $\mathbb F^{|S|}$, so its image under $G_S$
is uniform on $\operatorname{im}G_S$. In the high-tail case this image is all
of $\mathbb F^{2d}$. In the low-tail case it is the hyperplane $H_E$, which
contains $\operatorname{im}G_E$. A simulator that knows $\tau$ may sample the
required point in $\operatorname{im}G_S$, solve a rank-witnessed linear system
for sparse coefficients (with one free coefficient in the low-tail case), and
then compute all remaining transcript coordinates, including $M(u)$,
$Q_M(\tau)$, and $W_M(\tau)$, from that same sparse polynomial. Lemma 1.1
shows that Shplonk and KZG introduce no additional mask direction beyond these
computed coordinates.

## Appendix A: verification hooks

`SHPLEMINI_ZK_FILTRATION_VERIFY.py` contains exact symbolic and rational checks
for the formulas used above. These checks are regression tests for the algebraic
identities; the proof obligations are the lemmas stated in the main text.

- `verify_high_tail_rho()` checks the high-tail determinant formula at
  `d=4`, `E=14,16`, and `d=5`, `E=28,30,32`.
- `verify_low_tail_rho()` checks the low-tail reduced-minor formula at
  `d=4`, `E=12`, and `d=5`, `E=20,22,24`.
- `verify_boundary_port_decomposition()` divides out the middle block product
  and checks only the high/low boundary factors. The boundary ratio is `1` in
  all tested cases.
- `verify_dense_rank_bound()` checks the final-row relation on every monomial
  at `d=3,4` and numerically verifies low-tail dense ranks.

The endpoint $E=N$ is included in the same argument: then
$\rho=N-1\bmod 2^{d-2}=2^{d-2}-1$, so the $\rho$-anti-symmetry reduces to the
usual top-pair anti-symmetry.

## Appendix B: degenerate d=3 low-tail case

For `d=3`, `N=8`, `E=6`, the support is the padded set
`S=[5,4,3,2,1,0]`. Delete the redundant row `N_2`. All six reduced `5 x 5`
minors factor against

$$
G=(\tau-r_0)A_0^+(r_0)A_0^-(\tau):
$$

| deleted column `s` | reduced minor, up to sign |
|---|---|
| `5` | `(1-u_0)(1-u_1)G` |
| `4=N/2` | `u_0(1-u_1)G` |
| `3` | `(tau^2+r_0^2)(1-u_0)(1-u_1)G` |
| `2` | `(tau^2+r_0^2)u_0(1-u_1)G` |
| `1` | `r_0^2 tau^2(1-u_0)(1-u_1)G` |
| `0` | `r_0^2 tau^2 u_0(1-u_1)G` |

The canonical deletion of column `N/2=4` gives the reduced minor required for
rank `2d-1=5`.
