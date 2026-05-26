# Shplemini Sparse Masking

This note proves the KZG masking lemma used to replace the full-size random
`gemini_masking_poly` in the Gemini + Shplonk + KZG path of Shplemini by a
sparse polynomial with only `2d` random coefficients.

Let `N = 2^d` be the dyadic circuit size. Write `E_j(X)=X^j` for the monomial
basis of `F[X]_{<N}`. Let `e` be the maximum end-index of the masked polynomial
data. Choose the smallest even `E >= e`, `E <= N`, such that the top pair
`(E-1,E-2)` is disjoint from every dyadic pair
`(N/2^ell, N/2^ell-1)` for `1 <= ell < d`; equivalently, exclude
`E=B` and `E=B+2` for every dyadic `B=N/2^ell`. Define the tail-halving support

$$
S = [E-1,E-2,N/2,N/2-1,N/4,N/4-1,\ldots,2,1],
$$

truncated to exactly `2d` entries. The prover samples

$$
M(X)=\sum_{s\in S} c_s X^s
$$

with independent uniform coefficients `c_s`.

Assume `2d < N`; when `2d >= N`, this support covers the relevant domain and
the sparse-mask question degenerates to dense masking. Work over the rational
function field

$$
K=\mathbb F(u_0,\ldots,u_{d-1},r_0,\ldots,r_{d-1},\tau).
$$

The proof excludes the usual algebraic bad set: Shplonk/KZG denominator zeros,
Fiat-Shamir challenge collisions, the rank-witness zero loci below, and the
explicit Lagrange/factor zero loci appearing in the formulas. Over BN254 this
bad set has negligible probability by Schwartz-Zippel.

## Theorem

For the support `S` above, outside the bad set, the sparse masking polynomial
randomises every transcript direction that dense degree-`<E` masking can expose
in the Gemini + Shplonk + KZG transcript.

More concretely, after projecting the Shplemini transcript to its Gemini leakage
coordinates:

- if `E > 3N/4`, the sparse Gemini block has rank `2d`;
- if `E <= 3N/4`, the sparse Gemini block has rank `2d-1`, and the dense
  degree-`<E` image lies in the same rank-`2d-1` hyperplane.

The Shplonk and KZG messages add no independent `M`-leakage beyond these Gemini
coordinates, so the same masking statement holds for the full KZG transcript.

## Proof

### 1. Reduction to the Gemini block

In the algebraic group model for KZG, a commitment `[P]` is represented by the
scalar `P(tau)`. The mask contributes the following transcript scalars:

| scalar | source |
|---|---|
| `M(u)` | sumcheck output |
| `M(tau), M_1(tau), ..., M_{d-1}(tau)` | Gemini commitments |
| `M_0(-r_0), ..., M_{d-1}(-r_{d-1})` | Gemini fold openings |
| `Q_M(tau)` | Shplonk commitment |
| `W_M(tau)` | KZG witness commitment |

Shplonk forms

$$
Q(X)=\sum_i \nu^i\frac{P_i(X)-v_i}{X-z_i}.
$$

Therefore `Q_M(tau)` is a linear combination of the Gemini scalars
`M_i(tau)`, `M_i(-r_i)`, and the sumcheck scalar `M(u)`, with coefficients fixed
by the transcript challenges. KZG then opens `Q` at `z`, so

$$
W_M(\tau)=\frac{Q_M(\tau)}{\tau-z}.
$$

Thus the Shplonk and KZG rows lie in the span of the Gemini rows. It is enough
to prove the rank/image statement for the Gemini leakage map. After the simulator
solves for sparse coefficients, `M(u)` is evaluated from those same coefficients,
so the sumcheck scalar is sampled consistently with the Gemini data.

For the rank witnesses below we drop the `M(u)` row and use the `2d x |S|`
Gemini block `B` with rows

$$
M_t(\tau),\ M_t(-r_t)\qquad(0\le t<d).
$$

### 2. Fold formulas and row normalisation

For a monomial `E_s=X^s`, after `t` Gemini folds,

$$
\operatorname{fold}_t(E_s)=
\ell_t(s)E_{q_t(s)},
\qquad
q_t(s)=\left\lfloor\frac{s}{2^t}\right\rfloor,
\qquad
\ell_t(s)=L_{s\bmod 2^t}(u_0,\ldots,u_{t-1}).
$$

So

$$
M_t(x)(E_s)=\ell_t(s)x^{q_t(s)}.
$$

Replace each row pair `(M_t(tau), M_t(-r_t))` by

$$
D_t:=M_t(\tau)-M_t(-r_t),\qquad M_t:=M_t(-r_t).
$$

This is determinant-preserving. Define

$$
\phi_m(\tau,y)=\frac{\tau^m-y^m}{\tau-y}=\sum_{i=0}^{m-1}\tau^{m-1-i}y^i,
\qquad \phi_0=0.
$$

Then

$$
D_t(E_s)=(\tau+r_t)D_t'(E_s),
\qquad
D_t'(E_s)=\ell_t(s)\phi_{q_t(s)}(\tau,-r_t).
$$

Also set

$$
M_t^{\mathrm{new}}:=M_t+r_tD_t'.
$$

By the recursion for `phi`,

$$
M_t^{\mathrm{new}}(E_s)=
\begin{cases}
\ell_t(s), & q_t(s)=0,\\
\ell_t(s)\tau r_t\phi_{q_t(s)-1}(\tau,-r_t), & q_t(s)\ge1.
\end{cases}
$$

All row operations above are invertible over `K` away from the explicit factors
`tau+r_t`.

### 3. Triangularisation

Let

$$
A_k=\{s\in S:q_k(s)\ge1\},
\qquad
C_k=A_k\setminus A_{k+1}\quad(0\le k\le d-2),
\qquad
C_{d-1}=A_{d-1}.
$$

For non-exceptional even `E`, these fresh blocks are

$$
C_0=\{1\},\qquad
C_k=\{2^{k+1}-1,2^k\}\ (1\le k\le d-2),
\qquad
C_{d-1}=\{E-1,E-2,N/2\}.
$$

The following two identities are the core of the filtration proof.

First, for `j<k` and `s in C_j`,

$$
M_k^{\mathrm{new}}(E_s)
=\prod_{i=j+1}^{k-1}(1-u_i)\,M_{j+1}^{\mathrm{new}}(E_s).
$$

Indeed, both sides are the `q=0` case above, and the Lagrange factors differ
only by the zero bits `j+1,...,k-1`.

Second, for `k>=1` and `s in C_{k-1}`,

$$
M_k^{\mathrm{new}}(E_s)=u_{k-1}D_{k-1}'(E_s).
$$

Here `q_{k-1}(s)=1`, `q_k(s)=0`, and the `(k-1)`-st bit of `s` is `1`.

Define, for `k>=1`,

$$
N_k:=M_k^{\mathrm{new}}-u_{k-1}D_{k-1}'-(1-u_{k-1})M_{k-1}^{\mathrm{new}}.
$$

This is unit-triangular in the row index. The two identities above imply that
both `D_k'` and `N_k` vanish on `C_0 \sqcup ... \sqcup C_{k-1}`. Therefore, with
rows ordered

$$
(D_0',M_0^{\mathrm{new}},D_1',N_1,\ldots,D_{d-1}',N_{d-1})
$$

and columns ordered `C_0 | C_1 | ... | C_{d-1}`, the transformed matrix is
block-lower-triangular with diagonal blocks

$$
T_k=\begin{pmatrix}D_k'(E_s)\\ N_k(E_s)\end{pmatrix}_{s\in C_k}.
$$

The block `T_0` has size `2 x 1`, the middle blocks `T_k` for
`1 <= k <= d-2` have size `2 x 2`, and the boundary block `T_{d-1}` has size
`2 x 3`.

### 4. Middle determinants

For every `1 <= k <= d-2`, put `m=k-1`. A direct `2 x 2` computation on
`C_k={2^{k+1}-1,2^k}` gives

$$
\boxed{
\det T_k
=
- L_0(u_{<m})L_{2^m-1}(u_{<m})
(\tau-r_m)A_m^+(r_m)A_m^-(\tau)
}
$$

where

$$
A_m^+(r_m)=u_m+(1-u_m)r_m,
\qquad
A_m^-(\tau)=u_m-(1-u_m)\tau.
$$

These are exactly the middle-block determinants proved in
`SHPLEMINI_ZK_FILTRATION_PROOF.md`; they do not depend on the exact value of the
top pair.

### 5. Boundary preparation

Pivot on the entry `D_0'(E_1)=1` in `C_0`. Every other row vanishes on `C_0`, so
this Schur step only deletes row `D_0'` and column `1`.

The remaining floating row `M_0^{new}` can be eliminated from the middle blocks
`C_1,...,C_{d-2}` using the invertible blocks `T_k`: solve on each `C_k`

$$
M_0^{\mathrm{new}}|_{C_k}=\alpha_kD_k'|_{C_k}+\beta_kN_k|_{C_k},
$$

then replace `M_0^{new}` by
`M_0^{new}-\alpha_kD_k'-\beta_kN_k`, in increasing `k`. The triangular support
ensures that later eliminations do not undo earlier ones. Denote the final
floating row by `M_{0,elim}^{new}`.

After this step, the determinant factors as the product of the middle block
determinants times a boundary determinant.

### 6. The rho anti-symmetry

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

Since `E` is even, `rho` is odd. Define

$$
W_+=L_\rho(u_{<d-2}),
\qquad
W_-=L_{\rho-1}(u_{<d-2}).
$$

Thus `W_+=u_0H` and `W_-=(1-u_0)H` for a common higher-bit factor `H`.
For any row `R` among `D_k'`, `M_k^{new}` with `k>=1`, and among `N_k` with
`k>=2`, the top-pair values satisfy

$$
W_-R(c_+)-W_+R(c_-)=0.
$$

The reason is that `q_k(c_+)=q_k(c_-)`; the only difference between the two
Lagrange factors is the bit-0 factor, which is exactly cancelled by
`W_-` and `W_+`. The row `N_1` is the single exception because it contains the
level-0 rows.

Now set

$$
X_m=(1-u_0)\phi_m(\tau,-r_0)-u_0\phi_{m-1}(\tau,-r_0).
$$

The Casoratian identity from `SHPLEMINI_ZK_FILTRATION_PROOF.md` is

$$
X_2X_{E-1}-X_3X_{E-2}
=\tau r_0\phi_{E-4}(\tau,-r_0)A_0^+(r_0)A_0^-(\tau).
$$

It holds for every even `E>=4`; its proof is three applications of

$$
\phi_a\phi_{b-1}-\phi_b\phi_{a-1}=-(\tau y)^{b-1}\phi_{a-b}(\tau,y).
$$

The same calculation as the dyadic boundary proof, with the
`(1-u_0,-u_0)` functional multiplied by `H`, gives

$$
\boxed{
\Delta_\rho
:=W_-M_{0,\mathrm{elim}}^{\mathrm{new}}(c_+)
-W_+M_{0,\mathrm{elim}}^{\mathrm{new}}(c_-)
=W_+r_0^2\tau^2
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}
}
\qquad(d\ge4).
$$

All higher eliminated rows vanish under the rho-anti-symmetric functional; the
only surviving pieces are the original `M_0^{new}` row and the `N_1` correction,
and the displayed Casoratian evaluates them.

### 7. High-tail rank

Assume `E>3N/4`. The final boundary has columns `{c_+,c_-,N/2}` and rows

$$
M_{0,\mathrm{elim}}^{\mathrm{new}},\quad D_{d-1}',\quad N_{d-1}.
$$

A direct evaluation of the cofactors of the first row gives, up to the fixed
column-ordering sign,

$$
(\tau-r_{d-2})A_{d-2}^+(r_{d-2})A_{d-2}^-(\tau)
L_0(u_{<d-2})(W_-,-W_+,0).
$$

Expanding along the first row and using the boxed formula for `Delta_rho`,

$$
\det U_E^{\mathrm{hi}}
=\pm r_0^2\tau^2
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}
(\tau-r_{d-2})A_{d-2}^+(r_{d-2})A_{d-2}^-(\tau)
L_0(u_{<d-2})L_\rho(u_{<d-2}).
$$

Hence

$$
\det \widetilde B_E
=\left(\prod_{k=1}^{d-2}\det T_k\right)\det U_E^{\mathrm{hi}}
$$

is a nonzero polynomial in `K`. Since the row changes from `B` to
`\widetilde B` are invertible outside the explicit factors `tau+r_k`, the
original Gemini block has rank `2d`.

Equivalently, after restoring the extracted `tau+r_k` factors,

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

### 8. Low-tail rank and dense containment

Assume `N/2 < E <= 3N/4`; the smaller endpoint where the dense polynomial space
itself is shorter only reduces the leakage dimension.

Put `m=d-2`, `u=u_m`, `r=r_m`, and

$$
\lambda=-\frac{u(\tau-r)+(1-u)\tau r}{1-u}.
$$

For every monomial `s<3N/4`, the final triangularised rows satisfy

$$
N_{d-1}(s)=\lambda D_{d-1}'(s).
$$

This is a three-case check:

| range of `s` | `q_m(s)` | bit `m` | `q_{d-1}(s)` | result |
|---|---:|---:|---:|---|
| `s<N/4` | `0` | `0` | `0` | both rows vanish |
| `N/4 <= s<N/2` | `1` | `1` | `0` | both rows vanish |
| `N/2 <= s<3N/4` | `2` | `0` | `1` | `N_{d-1}=lambda D_{d-1}'` |

Thus the dense degree-`<E` image lies in the hyperplane cut out by
`N_{d-1}-lambda D_{d-1}'`.

For the sparse support, delete the redundant row `N_{d-1}` and the boundary
column `N/2`. The remaining boundary columns are `{c_+,c_-}` with rows
`M_{0,elim}^{new}` and `D_{d-1}'`. On these columns,

$$
D_{d-1}'=(1-u_{d-2})(W_+,W_-).
$$

Therefore

$$
\det U_E^{\mathrm{lo}}
=(1-u_{d-2})\Delta_\rho
=(1-u_{d-2})L_\rho(u_{<d-2})r_0^2\tau^2
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}
\qquad(d\ge4).
$$

Multiplying by the middle block determinants gives a nonzero reduced minor of
size `(2d-1) x (2d-1)`. Hence the sparse image has rank `2d-1`. Since it lies
in the same hyperplane as the dense image and has the full dimension of that
hyperplane, it contains the dense degree-`<E` image.

The resulting reduced-minor formula is, up to the fixed ordering sign,

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

For the degenerate padded case `d=3`, direct symbolic computation gives the same
statement with the saturated power `(r_0 tau)^2` removed; see Appendix B.

### 9. Schwartz-Zippel and simulation

Let `r*` be the active rank witness: `det B_E` in the high-tail case and the
fixed reduced minor in the low-tail case. The witness is a nonzero polynomial in
`K`. After Fiat-Shamir specialisation over the concrete field, rank can drop
only on the zero locus of `r*`, together with the explicit denominator,
collision, and Lagrange-zero events listed at the start. Schwartz-Zippel bounds
this probability by `deg(r*)/|F|`, negligible for the fields and values of `d`
used in production.

Outside this bad set, the random coefficients on `S` induce a uniform mask over
the sparse leakage image. In the high-tail case this image has dimension `2d`.
In the low-tail case it has dimension `2d-1` and contains the dense degree-`<E`
leakage image. A simulator with access to the KZG trapdoor `tau` samples a
uniform point in the sparse image, solves the corresponding full-rank linear
system for the sparse coefficients, and derives the Shplonk and KZG rows from
the same Gemini data. The verifier's transcript is therefore distributed
independently of the unmasked witness contribution except with negligible
probability.

## Appendix A: verification hooks

`SHPLEMINI_ZK_FILTRATION_VERIFY.py` contains exact symbolic and rational checks
for the formulas used above:

- `verify_high_tail_rho()` checks the high-tail determinant formula at
  `d=4`, `E=14,16`, and `d=5`, `E=28,30,32`.
- `verify_low_tail_rho()` checks the low-tail reduced-minor formula at
  `d=4`, `E=12`, and `d=5`, `E=20,22,24`.
- `verify_boundary_port_decomposition()` divides out the middle block product
  and checks only the high/low boundary factors. The boundary ratio is `1` in
  all tested cases.
- `verify_dense_rank_bound()` checks the final-row relation on every monomial
  at `d=3,4` and numerically verifies low-tail dense ranks.

The endpoint `E=N` is proved uniformly in `SHPLEMINI_ZK_FILTRATION_PROOF.md`;
this note ports that proof by replacing the dyadic boundary anti-symmetry with
the rho anti-symmetry above.

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
