# Shplemini Sparse Masking

This note proves that the Gemini + Shplonk + KZG path of Shplemini is
zero-knowledge when the prover's polynomials are masked with a random
`gemini_masking_poly` carrying only $2d$ random coefficients ($d=\log_2 N$).

This note is a proof sketch. The body (§1–§8) states the theorem and the
reduction path and explains why each step holds; the heavy linear-algebra
identities are proven in the Lean development `shplemini_lean/`, currently staged
in private PR
[#138](https://github.com/AztecProtocol/aztec-packages-private/pull/138). §9 maps
each statement to its Lean lemma.

## 1. Setup

Let $N=2^d$ with $d\ge 3$. Write $\mathbb F[X]_{<N}$ for the polynomials of
degree $<N$, with monomial basis $\{X^s:0\le s<N\}$. Let $e$ be the maximum
end-index of the masked data and

$$
E=\min\bigl(N,\,2\lceil e/2\rceil\bigr)
$$

for its value rounded up to even. $N$ is the dyadic circuit size, the least power of
two bigger or equal than $e$, so $e>N/2$ and hence $N/2<E\le N$. We call the interval $(N/2, N]$ the masking domain. The argument splits it at $3N/4$, the *high tail* is $3N/4<E\le N$, the *low tail* is $N/2<E\le3N/4$. In the first case, the pair $\{E-1,E-2\}$ lies in the top quarter of $[0,N)$, while in the latter it lies in the third quarter.

**The mask.** The prover samples $M(X)=\sum_{s\in S}c_sX^s$ with the $c_s$ i.i.d.
uniform, on the *tail-halving support*

$$
S=[E-1,\,E-2,\;N/2,\,N/2-1,\;N/4,\,N/4-1,\;\ldots,\;2,\,1]
$$

The set $S$ is formed of $2d$ distinct indices except when $E=N/2+2$. In this case, $E - 2 = N/2$. To maintain the invariant $|S| = 2d$, the generator
`sparse_masking_poly.hpp::tail_halving_support` drops the duplicate and
appends the next unused index $N/2 - 2$. Small circuits ($d<4$) use a dense mask instead
(`SPARSE_MASKING_MIN_LOG_N`). The proof covers all $d\ge3$.

**Notation.** For $0\le j<2^t$ the multilinear Lagrange polynomial is

$$
L_j(u_{<t})=\prod_{i=0}^{t-1}\Bigl(\operatorname{bit}_i(j)\,u_i+\bigl(1-\operatorname{bit}_i(j)\bigr)(1-u_i)\Bigr),\qquad u_{<t}:=(u_0,\ldots,u_{t-1}),
$$

with $\operatorname{bit}_i(j)$ the $i$-th bit of $j$. Below is a table of the symbols frequently used in the rest of the document

| symbol | meaning |
|---|---|
| $u_0,\ldots,u_{d-1}$ | sumcheck challenges |
| $r$, $\ r_t=r^{2^t}$ | Gemini evaluation challenge; fold points |
| $\tau,\ z,\ \nu$ | KZG trapdoor; Shplonk/KZG opening point; Shplonk batching challenge |
| $q_t(s)=\lfloor s/2^t\rfloor$ | fold level of $X^s$ |
| $\ell_t(s)=L_{s\bmod 2^t}(u_{<t})$ | Lagrange factor at $X^s$ |
| $\phi_m(\tau,y)=(\tau^m-y^m)/(\tau-y)$, $\ \phi_0=0$ | folding polynomial |
| $A_m^+(r)=u_m+(1-u_m)r$, $\ A_m^-(\tau)=u_m-(1-u_m)\tau$ | affine factors |
| $L$, $G$ (§2) | leakage map; Gemini map in $\mathbb F^{2d}$, with $G_E,G_S$ on dense/sparse masks |
| $D_t',\,M_t^{\mathrm{new}},\,N_k$ (§4) | normalised rows |
| $C_k,\,T_k$ (§4), $\ B$ (§5) | column blocks; diagonal fibers; boundary block |

## 2. The leakage map and the masking theorem

A mask $M$ reaches the verifier only through the *leakage map* $L$, its tuple of
mask-dependent transcript coordinates

$$
L(M)=\bigl(M(u),\ M_t(\tau),\ M_t(r_t),\ M_t(-r_t)\ (0\le t<d),\ Q_M(\tau),\ W_M(\tau)\bigr)
$$

Here "transcript" means the algebraic verifier view in the AGM: it includes the
commitment scalars at the SRS trapdoor $\tau$, not only Fiat-Shamir messages.
The coordinates are the Gemini folds $M_t$ evaluated at the trapdoor $\tau$ (the
AGM commitment scalar) and at $\pm r_t$, the sumcheck value $M(u)$, and the mask
parts $Q_M,W_M$ of the Shplonk quotient and the KZG opening proof. $L$ is linear
in $M$, so its fibers are cosets of $\ker L$ of equal size; hence for a uniformly
random mask in a subspace $V$ the leakage is uniformly distributed on the image
$L(V)$, independent of the data it masks.

Write $\mathscr{T} \subset \mathbb{F}^{3d + 3}$ for the space of valid looking transcripts, i.e. transcripts that match the structure of a transcript produced by a prover-verifier interaction. As shown in Step 1 of §3, entries of $\mathscr{T}$ are completely determined by the $2d$ Gemini coordinates $M_t(\tau),M_t(-r_t)$, so $L$ adds nothing beyond the *Gemini map*

$$
G(M)=\bigl(M_0(\tau),M_0(-r_0),\ldots,M_{d-1}(\tau),M_{d-1}(-r_{d-1})\bigr)\in \mathbb F^{2d}.
$$

Write $\mathscr{T}^{Gemini}$ for the space of valid looking transcripts inside $\mathbb{F}^{2d}$.

For an index set $T$, write $G_T$ for $G$ restricted to $\operatorname{span}\{X^s:s\in T\}$. Write $G_E$ for the dense mask restriction to $\mathbb F[X]_{<E}$, and $G_S$ for the sparse mask restriction to the support $S$. The dense mask hides perfectly: if the data contribution is $P\in
\mathbb F[X]_{<E}$ and the dense mask $M$ is uniform in $\mathbb F[X]_{<E}$, then
$L(P+M)=L(P)+L(M)$ is uniform on the affine translate $L(P)+\operatorname{im}L(\mathbb F[X]_{<E}) = L(P) + \mathscr{T}$. Thus the dense leakage distribution is independent of $P$.

The sparse mask is hiding whenever $\operatorname{im}G_S\supseteq\operatorname{im}G_E$: then every. Indeed, in this case the image of $G_S$ equals the space of valid looking transcripts $\mathscr{T}^{Gemini}$ (indeed $\mathscr{T}^{Gemini} = im(G_E) \subset im(G_S) \subset \mathscr{T}^{Gemini}$), and therefore the uniform distrubution on $F[X]_S$ is pushed forward to the uniform distribution $\mathscr{T}^{Gemini}$.

> **Theorem (sparse masking).** Under the locus hypotheses of §7, $\operatorname{im}G_E\subseteq\operatorname{im}G_S$.

Consequently, a sparse mask of the described shape is sufficient to achieve
statistical HVZK in Shplemini via the simulator of §8.

## 3. Reduction path

Throughout, *rows* are the $2d$ Gemini coordinates $M_t(\tau),M_t(-r_t)$ — the
rows of a matrix whose columns are the monomials $c_s \tau^s$, $c_s (-r_t)^s$. Then $\operatorname{im}G_T$
is the span of the columns over $s\in T$, and the containment is a rank statement
about this matrix.

**Strategy.** Both images lie in $\mathbb F^{2d}$. For $3N/4<E\le N$, the sparse
image is all of $\mathbb F^{2d}$, certified by a $2d\times2d$ determinant. For
$N/2<E\le3N/4$, both images lie in the hyperplane
$H_c=\{N_{d-1}=cD_{d-1}'\}$, where
$c=N_{d-1}(N/2)/D_{d-1}'(N/2)$, and the sparse image is the full hyperplane,
certified by a $(2d-1)$ minor. In both cases the dense image lies in the sparse
image. The determinant and minor are computed in §4–§6.

The proof consists of three major reduction steps:

**Step 1 — transcript reduction (full leakage ⊆ Gemini span).** Each non-Gemini
coordinate is a fixed combination of the $2d$ Gemini rows $M_t(\tau),M_t(-r_t)$,
so none affects the rank of the image:

- *Shplonk/KZG.* $Q(X)=\sum_i\nu^i\frac{P_i(X)-v_i}{X-z_i}$, so $Q_M(\tau)$ is a
  fixed combination of the opened rows with coefficients $\nu^i/(\tau-z_i)$. The
  KZG witness $W_M(\tau)$ is $\tfrac1{\tau-z}\bigl(Q\text{ at }\tau-Q\text{ at }z\bigr)$.
- *Positive openings.* Each fold is opened at both $\pm r_t$. The verifier sends
  $M_t(-r_t)$ and *reconstructs* $M_t(r_t)$ from the negative evaluations and the
  sumcheck value through

  $$
  M_t(r_t)=\frac{2r_tM_{t+1}(r_{t+1})-M_t(-r_t)\bigl(r_t(1-u_t)-u_t\bigr)}{r_t(1-u_t)+u_t},
  $$

  the reconstruction denominator being $A_t^+(r_t)$ (this mirrors the verifier's
  `compute_fold_pos_evaluations`).
- *Sumcheck value.* $M(u)$ is itself in the span of the last-fold rows:
  $$
  \begin{aligned}
  (\tau+r_{d-1})M(u)
  &=\bigl(u_{d-1}+r_{d-1}(1-u_{d-1})\bigr)
    \bigl(M_{d-1}(\tau)-M_{d-1}(-r_{d-1})\bigr)\\
  &\quad+(\tau+r_{d-1})(1-u_{d-1})M_{d-1}(-r_{d-1}).
  \end{aligned}
  $$

**Step 2 — reduce to block-triangular form.** Row operations (§4), invertible off
the exceptional locus, carry the $2d$ Gemini rows to the rows $D_t',N_k$. Ordering
the columns by block then makes the matrix block-triangular — the *staircase*.

**Step 3 — containment from the staircase.** The diagonal blocks of the
staircase determine the rank (§5). For $3N/4<E\le N$ the full determinant
is nonzero; for $N/2<E\le3N/4$ a projected minor is nonzero and the dense image
satisfies the same row relation as the sparse image:

$$
\begin{array}{ll}
3N/4<E\le N: & \operatorname{im}G_S=\mathbb F^{2d};\\
N/2<E\le3N/4: & \operatorname{im}G_E\subseteq H_c=\operatorname{im}G_S.
\end{array}
$$

## 4. Row normalisation and the staircase

The $t$-th Gemini fold sends $X^s$ to $\ell_t(s)X^{q_t(s)}$. In particular, $M_t(X) = \sum_{s \in S} \ell_t(s) c_s X^{q_t(s)}$.
We replace the rows $M_t(\tau), M_t(-r_t)$ with:
$$
\left(
\begin{array}{cc}
1 & -1\\
0 & 1
\end{array}
\right)
\left(
\begin{array}{c}
M_t(\tau)\\
M_t(-r_t)
\end{array}
\right) =
\left(
\begin{array}{c}
D_t := M_t(\tau) - M_t(-r_t)\\
M_t := M_t(-r_t)
\end{array}
\right)
$$

Then, we write

$$
D_t(X^s)=(\tau+r_t)\,D_t'(X^s),\qquad D_t'(X^s)=\ell_t(s)\,\phi_{q_t(s)}(\tau,-r_t),
$$

and apply a final transformation (which we can do when $\tau \neq - r_t$)
$$
\left(
\begin{array}{cc}
(\tau + r_t)^{-1} & 0\\
r_t & 1
\end{array}
\right)
\left(
\begin{array}{c}
(\tau + r_t) \, D_t'\\
M_t
\end{array}
\right) =
\left(
\begin{array}{c}
D_t' \\
M_t^{new} := M_t + r_t D'_t
\end{array}
\right)
$$

One can prove that the $s$-th part of $M_t^{\mathrm{new}}$, $s \in S$ is

$$
\begin{cases}
\ell_t(s), & q_t(s)=0,\\[1mm]
\ell_t(s)\tau r_t\phi_{q_t(s)-1}(\tau,-r_t), & q_t(s)\ge1.
\end{cases}
$$

**Column blocks.** With $A_k=\{s\in S:q_k(s)\ge1\}$, $C_k=A_k\setminus A_{k+1}$
($C_{d-1}=A_{d-1}$), the support splits into the column blocks

$$
C_0=\{1\},\qquad C_k=\{2^{k+1}-1,\,2^k\}\ (1\le k\le d-2),\qquad C_{d-1}=\{E-1,\,E-2,\,N/2\}.
$$

Order the columns $C_0\mid C_1\mid\cdots\mid C_{d-1}$. For
$1\le k\le d-1$, replace the row $M_k^{\mathrm{new}}$ by

$$
N_k=M_k^{\mathrm{new}}-u_{k-1}D_{k-1}'-(1-u_{k-1})M_{k-1}^{\mathrm{new}}.
$$

The resulting row order is

$$
D_0',\,M_0^{\mathrm{new}},\,D_1',\,N_1,\ldots,D_{d-1}',\,N_{d-1}.
$$

The row $M_0^{\mathrm{new}}$ is not paired with an $N_0$ row; it is carried to the boundary block after the middle blocks are eliminated (§5).

The paired rows vanish on earlier column blocks,

$$
D_k'|_{C_0\cup\cdots\cup C_{k-1}}=0,\qquad
N_k|_{C_0\cup\cdots\cup C_{k-1}}=0,
$$

so the matrix is block-triangular, with diagonal fibers $T_k=\binom{D_k'}{N_k}$ on $C_k$ of sizes $2\times1$, $2\times2$, and a $2\times3$ boundary.

**Note:** The value at index $(1, 1)$ is not comprised in the above block decomposition because it will be turned to $0$ in §5.

## 5. Fiber determinants

The first block is $C_0=\{1\}$. Since $D_0'(X^1)=1$, Schur-eliminating the
$C_0$ pivot removes row $D_0'$ and column $1$. This contributes the determinant
factor $1$.

For each middle block, invertibility of $T_k$ lets $M_0^{\mathrm{new}}$ be cleared
on $C_k$. The residual row is supported only on the boundary columns
$C_{d-1}$, so it joins the terminal rows $D_{d-1}'$ and $N_{d-1}$ in the boundary
block $B$. After these eliminations the square block matrix has determinant

$$
\det\begin{pmatrix}
1 & * & \cdots & * & *\\
0 & T_1 & \cdots & * & *\\
\vdots & & \ddots & & \vdots\\
0 & 0 & \cdots & T_{d-2} & *\\
0 & 0 & \cdots & 0 & B
\end{pmatrix}
=\prod_{k=1}^{d-2}\det T_k\cdot\det B.
$$

**Middle blocks** ($1\le k\le d-2$, $m=k-1$):

$$
\det T_k=-L_0(u_{<m})\,L_{2^m-1}(u_{<m})\,(\tau-r_m)\,A_m^+(r_m)\,A_m^-(\tau).
$$

**Boundary block $B$.** This is the only $E$-dependent block — through the top
pair $\{E-1,E-2\}$ — and is where the two tails differ in rank. Form the top-pair
functional $R\mapsto \ell_{d-2}(E-1)\,R(E-1)-\ell_{d-2}(E-2)\,R(E-2)$. The rows
$D_{d-1}',N_{d-1}$ are anti-symmetric on the top pair and drop out of it. A
Casoratian identity then evaluates the surviving $M_0^{\mathrm{new}}$ row,
denominator-cleared, to $u_0\tau^2 r_0^2\,\phi_{E-4}(\tau,-r_0)\,A_0^+(r_0)\,A_0^-(\tau)$;
with the cofactor of $D_{d-1}',N_{d-1}$ on the $N/2$ column this gives

$$
\det B=(\tau-r_{d-2})\,A_{d-2}^+(r_{d-2})\,A_{d-2}^-(\tau)\,\ell_{d-2}(N/2)\,
\bigl(\ell_{d-2}(E-1)+\ell_{d-2}(E-2)\bigr)\cdot
u_0\tau^2 r_0^2\,\phi_{E-4}(\tau,-r_0)\,A_0^+(r_0)\,A_0^-(\tau).
$$

In the high tail this is the $3\times3$ boundary determinant. In the low tail the
full boundary determinant vanishes; the rank statement uses the corresponding
projected $2\times2$ boundary minor. The nonzero conditions in §7 are precisely
the factors appearing in the middle blocks and the relevant boundary block.

## 6. Low tail

In the low tail the full $2d$ determinant vanishes — the terminal rows become
proportional (the $3N/4$ rank-drop) — so the rank comes from the projected
$(2d-1)$ minor, which has the same product form as §5.

## 7. Exceptional locus

Specialising the identities of §3–§6 to a concrete transcript requires finitely
many polynomials in $\tau,z,u,r$ to be nonzero. The *exceptional locus* is the union
of their zero sets, with two sources.

**Zeros of the staircase determinant (§5).** It is nonzero iff all of

$$
\begin{aligned}
&u_0\ne0,\ \tau\ne0,\ r_0\ne0,\ 1-u_{d-2}\ne0,\\
&A_0^+(r_0)\ne0,\ A_0^-(\tau)\ne0,\ A_{d-2}^+(r_{d-2})\ne0,\ A_{d-2}^-(\tau)\ne0,\\
&\tau-r_{d-2}\ne0,\quad \phi_{E-4}(\tau,-r_0)\ne0,\quad \det T_k\ne0\ (1\le k\le d-2),\\
&\ell_{d-2}(N/2)\ne0,\quad D_{d-1}'(N/2)\ne0,\quad
\ell_{d-2}(E-1)+\ell_{d-2}(E-2)\ne0.
\end{aligned}
$$

**Step-1 denominators.** The transcript reduction additionally inverts the Shplonk
and KZG denominators $\tau\pm r_t$, $z\pm r_t$, $\tau-z$, and the
positive-reconstruction factors $A_t^+(r_t)$ ($0\le t<d$); each must be nonzero.

## 8. Simulation

The sparse-masked protocol is honest-verifier zero-knowledge up to statistical
distance $O(|\mathrm{srs}|)/|\mathcal C|$, where $\mathcal C$ is the
evaluation-challenge space. The simulator $S$ reproduces the verifier's view
$\operatorname{View}_V[P\leftrightarrow V]$ on the complement of the exceptional
locus.

By §2 the masked Gemini leakage is uniform on $\operatorname{im}G_S$, independent of
the data $P$. The simulator $S$ reproduces it: holding $\tau$, it samples a mask $M$
with uniform coefficients, takes $p=G_S(M)$, forms the commitments from $p$, and
reconstructs $M(u),Q_M(\tau),W_M(\tau)$ and the positive openings $M_t(r_t)$ as the
Step-1 combinations of $p$. Then $p$ is distributed as the real masked leakage, so
the views match.

$\operatorname{View}_V[P\leftrightarrow V]$ is defined only where the
denominators $\tau-z$, $z\pm r_t$, and $A_t^+(r_t)$ are nonzero. There $S$
matches it except on the determinant/minor zero locus: $\tau-r_m$,
$A_m^-(\tau)$, $\phi_{E-4}(\tau,-r_0)$, a middle-block Lagrange factor from
$\det T_k$, or a boundary Lagrange factor from $\det B$ vanishes. Here $0\le t<d$ and
$0\le m\le d-2$. These polynomials have total degree $O(N)=O(|\mathrm{srs}|)$,
so Schwartz–Zippel bounds the statistical distance between the verifier's and
simulator's views by $O(|\mathrm{srs}|)/|\mathcal C|$.

> **Remark.** This simulator argument is not codified in Lean.

## 9. Map to the Lean development

**Conventions.** The development works over an arbitrary field $\mathbb F$,
conditioned on an explicit list of non-vanishing hypotheses on the transcript
challenges and the SRS trapdoor $\tau$ (the *exceptional locus*, §7). Identities
are written in denominator-cleared form, so a variable enters the locus exactly
when a proof step needs it nonzero. The simulator argument of §8 is not codified in
Lean.

The locus of §7 is packaged as two hypotheses: `StaircaseChallenges` (the
determinant factors) and `GoodChallenges` (the Step-1 denominators).
`GoodChallenges` leaves the opening points universally quantified — fixing only the
protocol-level $\tau+r_{d-1}\ne0$ and $\tau-z\ne0$ — so the masking theorem is
generic in them; instantiating with the Gemini points $\pm r_t$
(`gemini.hpp`/`shplonk.hpp`) recovers the concrete denominators of §7. Both
hypotheses are satisfiable by `decide` over $\mathbb Z/101$ at $d=4$ in both tails
(including on $r_t=r^{2^t}$), so no condition vanishes identically.

Each statement of the body maps to the Lean lemmas below
(`shplemini_lean/ShpleminiLean/`). `FINAL_PROOF_STATUS.md` is the full dependency
DAG. This table is keyed by section.

| Body | Lean |
|---|---|
| Scalar / Lagrange / fold defs (§1) | `ScalarAlgebra.lean::{phi, ell, q, Aplus, Aminus}` |
| Support model + inclusion (§1, §3) | `ProductionSupport.lean`; `ParameterizedInclusion.lean` |
| Sparse masking theorem (§2) | `ParameterizedFinal.lean::productionTailHalvingSparseMasking_of_staircase` |
| Containment definition (§2) | `EndToEndMasking.lean::SparseMaskingContainment` |
| Step 1 — transcript reduction (§3) | `ShpleminiCollapse.lean::{shplonkQRow_mem_span, shplonkGRow_mem_span, kzgWRow_mem_span, kzgWRow_cleared, geminiFoldPosFromNext_mem, geminiFoldPosRows_mem, fullEvalRow_in_last_fold_span}` |
| Step 2 — reduce to block-triangular form (§3) | `EndToEndMasking.lean::geminiRowsFin_mem_triangularRowsFin_span`; `ParameterizedFinal.lean::productionGeminiContainment_of_triangular` |
| Step 3 — containment from the staircase (§3) | `ParameterizedFinal.lean::productionTriangularContainment_of_staircase`; `TriangularContainment.lean::productionTriangularContainment_of_lower_terminal_projected_det` |
| Row normalisation (§4) | `ScalarAlgebra.lean::{Drow, Mrow, Mnew, Dp}`, `stepA_row_factor`, `stepB_row_formula{_zero}` |
| Block-triangular staircase (§4) | `ParameterizedStaircase.lean::stair_blockTriangular`; `ParameterizedElimination.lean::{elimRow, elimRow_vanishes_mid, elimRow_one}` |
| Middle determinant (§5) | `ParameterizedElimination.lean::midDet`; `ParameterizedFinal.lean::midDet_eq` |
| Boundary block (§5) | `ParameterizedBoundary.lean::{pair_antisym_{Dp,Mnew,Nrow}, casoratian_Xlong, boundary_functional_cleared, highTail_boundary_det_functional}`; `ParameterizedElimination.lean::elimRow_functional_cleared`; `ParameterizedLowTail.lean::lowTail_boundary_det2_functional` |
| Staircase nonsingular (§5) | `ParameterizedStaircase.lean::{stair_det_ne_zero, stairLow_det_ne_zero}`; `ParameterizedAssembly.lean::{triColsMatrix_det_elim, lowColsMatrix_det_elim}` |
| Determinant, low tail, ordering (§5–§6) | `ParameterizedFinal.lean::{ordSupport_det_identity, ordSupportLow_det_identity}`, `parSupport_det_eq_sign_mul_ordSupport`; `RawBMatrix.lean::rawBDescending_det_final_closed_form`; `ParameterizedE.lean::parameterized_E6_closed_form_counterexample` |
| Locus hypotheses (§7) | `ParameterizedFinal.lean::StaircaseChallenges`; `EndToEndMasking.lean::GoodChallenges` |
| Finite-rank bridge | `EndToEndMasking.lean::sparseMaskingContainment_of_union_finrank_eq` |
