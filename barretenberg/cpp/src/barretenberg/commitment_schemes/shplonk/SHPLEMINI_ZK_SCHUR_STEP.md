# Closing Step 2 — Per-Level Schur Correction

This note closes (most of) **Step 2** from
`SHPLEMINI_ZK_TARGET_FILTRATION.md`: the per-level computation that
extracts the level-$k$ Vandermonde factor and identifies where the
affine Gemini-update factor $A_{k-1}^\pm$ enters.

The argument splits into three pieces, each elementary.

## Piece 1 — uniform $(\tau+r_k)$ divisor on row $D_k$

**Lemma A.** *For every $k\in\{0,1,\ldots,d-1\}$,*

$$
(\tau+r_k)\;\bigm|\;D_k(E_s)\qquad\text{for all } s\in S .
$$

*Proof.* By definition
$D_k(E_s) = \ell_k(s)\,\bigl(\tau^{q_k(s)}-(-r_k)^{q_k(s)}\bigr)$.
For $q_k(s) = 0$ both sides are $0$, divisible. For $q_k(s) = m\ge 1$,

$$
\tau^m - (-r_k)^m
\;=\;
(\tau-(-r_k))\bigl(\tau^{m-1}+\tau^{m-2}(-r_k)+\cdots+(-r_k)^{m-1}\bigr)
\;=\;
(\tau+r_k)\,\phi_m(\tau,-r_k),
$$

where $\phi_m(a,b):=\sum_{j=0}^{m-1}a^{m-1-j}b^j$. So
$D_k(E_s) = (\tau+r_k)\cdot\ell_k(s)\,\phi_{q_k(s)}(\tau,-r_k)$. $\square$

**Corollary.** *Let $D_k' := D_k/(\tau+r_k)$. Then*

$$
\det B \;=\; \prod_{k=0}^{d-1}(\tau+r_k)\;\cdot\;\det B^{(D')} ,
$$

*where $B^{(D')}$ is $B$ with each $D_k$ row replaced by $D_k'$.*

This accounts for **one factor of $(\tau+r_k)$ per level**, uniformly,
and explains:

* the $\tau+r_{d-1}$ factor in $\mathsf{Last}$;
* one of the two factors of $(\tau^2-r_k^2)=(\tau+r_k)(\tau-r_k)$ in each $\mathsf{Mid}_k$;
* one factor of $(\tau+r_0)$ in $\tau^{E-4}-r_0^{E-4}$ (which is divisible by $\tau+r_0$ because $E-4$ is even).

So Lemma A reduces the problem to identifying the remaining factors of
$\det B^{(D')}$:

$$
\det B^{(D')}
\;\stackrel{!}{=}\;
(-1)^d\,r_0^2\,\tau^2\,\frac{\tau^{E-4}-r_0^{E-4}}{\tau+r_0}\,\prod_{k=1}^{d-2}(\tau-r_k)\,\prod_{k=1}^{d-2}L_0(u_{<k})L_{2^k-1}(u_{<k})\,\prod_{k=0}^{d-2}A_k^{+}(r_k)A_k^{-}(\tau) .
$$

## Piece 2 — innermost peel (level $d-1$)

Apply a row operation on $B^{(D')}$ at the innermost level: replace
$M_{d-1}$ with $M_{d-1} + r_{d-1}\,D_{d-1}'$. Determinant unchanged.

**Lemma B.** *Define $M_{d-1}^{\mathrm{new}} := M_{d-1} + r_{d-1}\,D_{d-1}'$. Then for every $s\in S$,*

$$
M_{d-1}^{\mathrm{new}}(E_s)
\;=\;
\begin{cases}
\ell_{d-1}(s) & q_{d-1}(s)=0,\\[2pt]
0 & q_{d-1}(s)=1.
\end{cases}
$$

*Proof.* For $q=0$: $M_{d-1}=\ell\cdot 1$, $D_{d-1}'=0$, so the sum is
$\ell$. For $q=1$: $M_{d-1}=\ell\cdot(-r_{d-1})$,
$D_{d-1}'=\ell\cdot\phi_1=\ell$, so $M_{d-1}+r_{d-1}D_{d-1}' = \ell(-r_{d-1}+r_{d-1})=0$. $\square$

On the tail-halving support $S$, $q_{d-1}(s)\in\{0,1\}$ for every $s$:
$q_{d-1}=1$ exactly on $\{2^{d-1}, E-1, E-2\}$, $q_{d-1}=0$ elsewhere. So after
the row op,

* $D_{d-1}'$ is supported on $\{E_{2^{d-1}}, E_{E-2}, E_{E-1}\}$ (with $D'(E_{2^{d-1}-1})=0$ automatically), with value $\ell_{d-1}(s)$ there;
* $M_{d-1}^{\mathrm{new}}$ is supported on the complementary columns (in particular on $E_{2^{d-1}-1}$), with value $\ell_{d-1}(s)$ there.

**The supports of the two innermost rows are disjoint.** This is the
exact "block separation" needed for the row-block Laplace expansion to
collapse cleanly at the innermost level.

## Piece 3 — what the residual matrix looks like at level $k=d-2$

After Lemma B, expand $\det B^{(D')}$ along rows $(D_{d-1}', M_{d-1}^{\mathrm{new}})$ by row-block Laplace. Each surviving partition has one column from $\{E_{2^{d-1}}, E_{E-2}, E_{E-1}\}$ assigned to $D_{d-1}'$ and one column from $S\setminus\{E_{2^{d-1}},E_{E-2},E_{E-1}\}$ assigned to $M_{d-1}^{\mathrm{new}}$. The $2\times 2$ minor of this row block on such a pair $(c,c')$ is

$$
\det\begin{pmatrix} D_{d-1}'(c) & D_{d-1}'(c') \\ M_{d-1}^{\mathrm{new}}(c) & M_{d-1}^{\mathrm{new}}(c') \end{pmatrix}
\;=\;
-\,\ell_{d-1}(c)\,\ell_{d-1}(c'),
$$

since $D_{d-1}'(c')=0$ and $M_{d-1}^{\mathrm{new}}(c)=0$. So the innermost
row block contributes a *pure Lagrange* scalar to each surviving
partition, and the remaining problem is the determinant of the
$2(d-1)\times 2(d-1)$ minor of $B^{(D')}$ on the remaining rows and
columns.

In particular, the entire $(\tau,r_{d-1})$-dependence has been
extracted: from Lemma A we got $\tau+r_{d-1}$, and from Lemma B the
innermost block contributes only Lagrange monomials.

## Piece 4 — the level-$k$ Schur correction for $1\le k\le d-2$

This is the **one** genuinely non-trivial computation in the proof,
and what was missing from the previous notes. The structural claim is:

**Claim (level-$k$ Schur, $1\le k\le d-2$).** *After applying Lemmas A
and B and inductively the analogous reduction at levels
$d-2, d-3, \ldots, k+1$, the $2\times 2$ block determinant of the
level-$k$ rows on the source pair $P_k = \{E_{2^k}, E_{2^k-1}\}$ equals*

$$
\det\begin{pmatrix} D_k'(E_{2^k}) & D_k'(E_{2^k-1}) \\ \widetilde M_k(E_{2^k}) & \widetilde M_k(E_{2^k-1}) \end{pmatrix}
\;=\;
(\tau-r_k)\,L_0(u_{<k})\,L_{2^k-1}(u_{<k})\,A_{k-1}^{+}(r_{k-1})\,A_{k-1}^{-}(\tau),
$$

*where $\widetilde M_k$ is $M_k$ after the row corrections coming from
peeling levels $> k$.*

The $(\tau-r_k)$ factor and the $A_{k-1}^\pm$ factor both arise from
the *correction*, not from the unmodified $M_k$ row. Concretely:

### Where $(\tau-r_k)$ comes from

After Lemma A, $D_k'(E_{2^k}) = L_0(u_{<k})$ and
$D_k'(E_{2^k-1}) = 0$ — the row is lower-triangular on $P_k$. The
*unmodified* $2\times 2$ block on $P_k$ then has determinant

$$
D_k'(E_{2^k})\cdot M_k(E_{2^k-1}) \;-\; 0
\;=\; L_0(u_{<k})\,\ell_k(2^k-1)\;=\; L_0(u_{<k})\,L_{2^k-1}(u_{<k}) ,
$$

which is **missing** the $(\tau-r_k)$ factor entirely. The factor must
come from $\widetilde M_k - M_k$, i.e., from the Schur correction.

The Schur correction at level $k$ is computed by the same row op as in
Lemma B but applied at level $k$: it modifies $M_k$ to kill the
$D_k'$-supported columns in $P_{k+1}, P_{k+2}, \ldots$. Concretely the
relevant interaction is between rows $(D_k', M_k)$ and the
*already-peeled level-$(k+1)$ block* on the column $E_{2^{k+1}}$ —
this is the column at which $D_k'$ first picks up a $(\tau-r_k)$ factor
(because $q_k(2^{k+1}) = 2$ and
$D_k'(E_{2^{k+1}}) = L_0(u_{<k})\,\phi_2(\tau,-r_k) = L_0(u_{<k})(\tau-r_k)$).

So the $(\tau-r_k)$ factor in the level-$k$ block determinant comes
specifically from the $E_{2^{k+1}}$ column entry of $D_k'$, propagated
into $\widetilde M_k(E_{2^k-1})$ through the Schur step that eliminates
the level-$(k+1)$ block.

### Where $A_{k-1}^\pm$ comes from

The Schur step at the *next* level down — which corrects $M_{k-1}$
using $D_{k-1}'$ — introduces the dependence on $u_{k-1}$ that becomes
$A_{k-1}^\pm$. Specifically, the row op $M_{k-1}\to M_{k-1}+r_{k-1}D_{k-1}'$
mixes Lagrange weights $\ell_{k-1}(s)$ with the next-level Lagrange
weights $\ell_k(s)$ via

$$
\ell_k(s) \;=\; \ell_{k-1}(s)\cdot\begin{cases} 1-u_{k-1} & \text{bit }k{-}1\text{ of }s\text{ is }0,\\ u_{k-1} & \text{bit }k{-}1\text{ of }s\text{ is }1.\end{cases}
$$

After this mixing, the level-$k$ block determinant on $P_k$ picks up,
through the columns of $P_{k-1}$ that the corrected $\widetilde M_k$
"sees", exactly the combination

$$
\bigl(u_{k-1}+(1-u_{k-1})r_{k-1}\bigr)\,\bigl(u_{k-1}-(1-u_{k-1})\tau\bigr)
\;=\; A_{k-1}^{+}(r_{k-1})\,A_{k-1}^{-}(\tau) .
$$

The $A_{k-1}^{+}(r_{k-1})$ factor comes from the symmetric (in $r$)
half of the row op (which substitutes $r_{k-1}\,D_{k-1}'$ into
$M_{k-1}$), and the $A_{k-1}^{-}(\tau)$ factor comes from the
asymmetric (in $\tau$) half of the resulting $D_k'$ entries, which
involve $\phi_{q_k}(\tau, -r_k)$ specialised at the boundary columns of
$P_{k-1}$.

## What this closes, and what remains

**Closed:**

1. Lemma A — $\prod_{k=0}^{d-1}(\tau+r_k)$ divides $\det B$. *Full proof.*
2. Lemma B — innermost row separation. *Full proof.*
3. Innermost row block contributes only Lagrange. *Full proof.*
4. Structural localisation: the $(\tau-r_k)$ and $A_{k-1}^\pm$ factors
   at level $k$ both come from the level-$k$ Schur step and the
   level-$(k-1)$ row op respectively, **not** from the diagonal
   $2\times 2$ minor of $(D_k', M_k)$ on $P_k$.

**Remaining (the actual computation):**

Verify the **Claim** in Piece 4 directly for $d=3$ (one level, $k=1$):
compute the $4\times 4$ residual minor on rows $(D_0', M_0, D_1', M_1)$
after the innermost peel of level $2$ (Lemma B), and show its
expansion along the source pair $P_1=\{E_2, E_1\}$ produces

$$
(\tau^2-r_1^2)\,L_0(u_0)\,L_1(u_0)\,A_0^{+}(r_0)\,A_0^{-}(\tau)\quad\times\quad\text{(top-pair residual)}.
$$

This is now a fully concrete $4\times 4$ computation in the variables
$u_0, r_0, r_1, \tau$ (the variable $u_1$ has been integrated out by
the innermost peel, which contributes only the Lagrange scalars
$L_0(u_0,u_1)\cdot L_{2^{d-1}-1}(u_0,u_1)$ summed over the
partition — these collapse via $\sum_b L_b(u_{<d-1}) = 1$ in the
relevant index range).

Once verified at $d=3$, the same structural identity at general
$1\le k\le d-2$ follows because the level-$k$ row op acts identically
to the level-$(d-1)$ row op (Lemma B), modulo the inductive
hypothesis that the higher-level rows have been correctly peeled.

## Summary of the new state of the proof

The full proof of the determinant formula now factors into:

| step | content | status |
|---|---|---|
| Lemma A | $\prod_k(\tau+r_k)\mid\det B$ | ✓ proved |
| Lemma B | innermost row separates supports | ✓ proved |
| Innermost peel | contributes pure Lagrange + the $\tau+r_{d-1}$ from Lemma A | ✓ proved |
| Mid-level Schur | $4\times 4$ residual minor at $d=3$ gives $\mathsf{Mid}_1$ | ⚪ explicit computation pending |
| Top-pair Schur | $2\times 2$ residual gives $r_0^2\tau^2(\tau^{E-4}-r_0^{E-4})/(\tau+r_0)$ | ⚪ explicit computation pending |
| Sign | $(-1)^d$ | follows from sign of row-block Laplace |

The two pending pieces are now both **concrete finite computations**
in named variables, not open structural questions.
