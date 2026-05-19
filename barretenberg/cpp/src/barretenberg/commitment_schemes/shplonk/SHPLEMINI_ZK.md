# Shplemini ZK Determinant — Proof Notes

Theorem statement, algebraic primitives, all proved lemmas, the current proof direction, and an honest list of what is open. Engineering setup in `SHPLEMINI_ZK_MASKING.md`; conjectured closed form and numerical verification at $d = 3, 4, 5$ in `SHPLEMINI_ZK_SMALL_CASES.md`.

---

## 0. Theorem

Work over $K = \mathbb F(u_0,\ldots,u_{d-1}, r_0,\ldots,r_{d-1}, \tau)$. Let $N = 2^d$, $E = N$. The tail-halving support is

$$
S \;=\; \{E-1,\ E-2,\ 2^{d-1},\ 2^{d-1}-1,\ \ldots,\ 2,\ 1\},
$$

ordered descending; partitioned into pairs as $P_{\mathrm{top}} = \{E-1, E-2\}$ and $P_k = \{2^k, 2^k - 1\}$ for $k = 1, \ldots, d-1$.

For $t \in \{0, \ldots, d-1\}$ define the Gemini-fold quantities

$$
\ell_t(s) \;:=\; L_{s \bmod 2^t}(u_0,\ldots,u_{t-1}), \qquad q_t(s) \;:=\; \lfloor s / 2^t\rfloor,
$$

with $L_b(\cdot)$ the standard multilinear Lagrange. The $2d\times 2d$ matrix $B$ has rows $(D_0, M_0, \ldots, D_{d-1}, M_{d-1})$ on columns indexed by $S$, with entries

$$
M_t(E_s) \;=\; \ell_t(s)\,(-r_t)^{q_t(s)}, \qquad D_t(E_s) \;=\; \ell_t(s)\,\bigl(\tau^{q_t(s)} - (-r_t)^{q_t(s)}\bigr).
$$

Define $A_k^{+}(X) = u_k + (1-u_k)X$ and $A_k^{-}(X) = u_k - (1-u_k)X$.

**Theorem (conjectural — proved for $d=3,4,5$ by direct computation; structural proof still has open pieces).**

$$
\det B \;=\; (-1)^d\,r_0^2\,\tau^2\,\bigl(\tau^{E-4} - r_0^{E-4}\bigr)\,\prod_{k=1}^{d-2}\!(\tau^2 - r_k^2)\,(\tau + r_{d-1})\,\prod_{k=1}^{d-2}\!L_0(u_{<k})L_{2^k-1}(u_{<k})\,\prod_{k=0}^{d-2}\!A_k^{+}(r_k)\,A_k^{-}(\tau).
$$

---

## 1. Algebraic primitives

For indeterminates $\tau, y$, define

$$
\phi_m(\tau, y) \;=\; \frac{\tau^m - y^m}{\tau - y} \;=\; \sum_{j=0}^{m-1}\tau^{m-1-j}\,y^{j}, \qquad \phi_0 := 0.
$$

**Identity $(\ast)$.** *For all $a \ge b \ge 1$,*

$$
\phi_a(\tau,y)\,\phi_{b-1}(\tau,y) \;-\; \phi_b(\tau,y)\,\phi_{a-1}(\tau,y) \;=\; -\,(\tau y)^{b-1}\,\phi_{a-b}(\tau, y).
$$

*Proof.* Multiply out using $(\tau - y)\phi_m = \tau^m - y^m$. The mixed terms cancel: $(\tau^a - y^a)(\tau^{b-1} - y^{b-1}) - (\tau^b - y^b)(\tau^{a-1} - y^{a-1}) = -(\tau y)^{b-1}(\tau^{a-b} - y^{a-b})$, then divide by $(\tau - y)^2$. $\square$

**Recursion.**

$$
\phi_m(\tau, y) \;=\; \tau\,\phi_{m-1}(\tau, y) + y^{m-1}, \qquad \phi_m(\tau, y) \;=\; \phi_{m-1}(\tau, y)\,y + \tau^{m-1}.
$$

**Difference identity.**

$$
\phi_a(\tau, y) - y\,\phi_{a-1}(\tau, y) \;=\; \tau^{a-1}.
$$

**Bracket identity (even-index case).** *For all $k$ and all $n \ge 0$,*

$$
\tau r_k\,\phi_{2n+1}(\tau, -r_k) - \phi_{2n+3}(\tau, -r_k) \;=\; -(\tau - r_k)^2 \cdot P_n(\tau, r_k),
$$

*where $P_n$ is a polynomial of degree $2n$. Concretely $P_0 = 1$, $P_1 = \tau^2 + r_k^2$, $P_2 = \tau^4 + \tau^2 r_k^2 + r_k^4$, …*

*For odd index $m = 2n+1$, the analogous combination $\tau r_k\,\phi_{m+1} - \phi_{m+3}$ has only a single factor of $(\tau - r_k)$, not squared:*

$$
\tau r_k\,\phi_{2n+2}(\tau, -r_k) - \phi_{2n+4}(\tau, -r_k) \;=\; -(\tau - r_k)\cdot(\text{polynomial of degree } 2n+2).
$$

Both follow directly from $(\ast)$ with $a = m+3, b = 2$ and then evaluating $\phi_m(r_k, -r_k)$ via parity.

**Multilinear Lagrange identity.**

$$
\ell_{k+1}(s) \;=\; \ell_k(s)\cdot\begin{cases} u_k & \mathrm{bit}_k(s) = 1, \\ 1 - u_k & \mathrm{bit}_k(s) = 0. \end{cases}
$$

These three facts plus the multilinear identity are the only algebraic inputs used below.

---

## 2. Lemma A — Step A row factorisation

**Lemma A.** *For every $k$ and every $s\in S$,*

$$
D_k(E_s) \;=\; (\tau + r_k) \cdot \ell_k(s) \cdot \phi_{q_k(s)}(\tau, -r_k).
$$

*Proof.* $D_k(E_s) = \ell_k(s)(\tau^{q_k(s)} - (-r_k)^{q_k(s)})$. The bracket equals $(\tau - (-r_k))\phi_{q_k(s)} = (\tau + r_k)\phi_{q_k(s)}$. For $q_k = 0$ both sides are $0$. $\square$

**Definition.** $D_k'(E_s) := D_k(E_s)/(\tau + r_k) = \ell_k(s)\phi_{q_k(s)}(\tau, -r_k)$.

**Corollary.**

$$
\det B \;=\; \prod_{k=0}^{d-1}(\tau + r_k)\;\cdot\;\det B^{(D')}.
$$

This extracts $(\tau + r_{d-1})$, the $(\tau + r_k)$ half of each $(\tau^2 - r_k^2)$, and the $(\tau + r_0)$ half of $(\tau^{E-4} - r_0^{E-4})$ (divisible since $E - 4$ is even).

---

## 3. Lemma B — Step B row operations

**Lemma B.** *Define $M_k^{\mathrm{new}} := M_k + r_k D_k'$. The determinant of $B^{(D')}$ is unchanged. For every $s \in S$,*

$$
M_k^{\mathrm{new}}(E_s) \;=\;
\begin{cases}
\ell_k(s) & q_k(s) = 0,\\[3pt]
\ell_k(s)\,\tau r_k\,\phi_{q_k(s)-1}(\tau, -r_k) & q_k(s) \ge 1.
\end{cases}
$$

*Proof.* For $q_k = 0$: $M_k = \ell_k$, $D_k' = 0$. Sum is $\ell_k$. For $q_k = m \ge 1$, by the recursion $\phi_m = \tau\phi_{m-1} + y^{m-1}$ with $y = -r_k$, multiply by $r_k$: $r_k\phi_m = \tau r_k\phi_{m-1} + r_k(-r_k)^{m-1} = \tau r_k\phi_{m-1} - (-r_k)^m$. Adding $(-r_k)^m$ cancels. $\square$

After Step B the matrix $\tilde B$ has rows $(D_0', M_0^{\mathrm{new}}, \ldots, D_{d-1}', M_{d-1}^{\mathrm{new}})$. At each column $E_s$ the level-$k$ row pair is:

$$
\bigl(D_k'(E_s),\,M_k^{\mathrm{new}}(E_s)\bigr) \;=\;
\begin{cases}
(0,\ \ell_k(s)) & q_k(s) = 0,\\[3pt]
\ell_k(s)\,\bigl(\phi_{q_k(s)},\ \tau r_k\,\phi_{q_k(s)-1}\bigr) & q_k(s) \ge 1.
\end{cases}
$$

---

## 4. Lemma C — universal $2\times 2$ minor formula

For each level $k$ and column pair $\{E_a, E_b\}$ with $a > b$,

$$
\Lambda_k(a, b) \;:=\; \det\!\begin{pmatrix} D_k'(E_a) & D_k'(E_b) \\ M_k^{\mathrm{new}}(E_a) & M_k^{\mathrm{new}}(E_b) \end{pmatrix}.
$$

**Lemma C.** *Set $\alpha := q_k(a),\, \beta := q_k(b)$. Then*

$$
\Lambda_k(a, b) \;=\;
\begin{cases}
0 & \alpha = \beta = 0,\\[3pt]
\ell_k(a)\,\ell_k(b)\,\phi_\alpha(\tau, -r_k) & \alpha \ge 1,\ \beta = 0,\\[3pt]
(-1)^{\beta}\,\ell_k(a)\,\ell_k(b)\,(\tau r_k)^{\beta}\,\phi_{\alpha - \beta}(\tau, -r_k) & \alpha \ge \beta \ge 1.
\end{cases}
$$

*Proof.* Case $\alpha = \beta = 0$ is immediate. Case $\alpha \ge 1, \beta = 0$: $D_k'$ has only the top entry nonzero, $M_k^{\mathrm{new}}$ has only the bottom; determinant $= \ell_k(a)\phi_\alpha\cdot\ell_k(b)$. Case $\alpha \ge \beta \ge 1$: factor $\ell_k(a)\ell_k(b)\tau r_k$ and apply identity $(\ast)$. $\square$

**Vanishing corollary.** $\Lambda_k(a, b) = 0 \iff q_k(a) = q_k(b)$.

---

## 5. The $q_t$-table and staircase structure

The $q_t$-values on $S$:

| column $s$ | $q_0$ | $q_1$ | $q_2$ | $\cdots$ | $q_{d-1}$ |
|---|---|---|---|---|---|
| $E - 1$ | $E-1$ | $E/2 - 1$ | $\cdots$ | $\cdots$ | $1$ |
| $E - 2$ | $E-2$ | $E/2 - 1$ | $\cdots$ | $\cdots$ | $1$ |
| $2^{d-1}$ | $2^{d-1}$ | $2^{d-2}$ | $\cdots$ | $2$ | $1$ |
| $2^{d-1}-1$ | $2^{d-1}-1$ | $2^{d-2}-1$ | $\cdots$ | $1$ | $0$ |
| $\vdots$ | | | | | |
| $2$ | $2$ | $1$ | $0$ | $\cdots$ | $0$ |
| $1$ | $1$ | $0$ | $0$ | $\cdots$ | $0$ |

**Block-staircase structure.** Define the level-$k$ availability set

$$
\mathcal{A}_k \;:=\; \{s\in S : q_k(s) \ge 1\}.
$$

By the definition of $D_k'$ (and $\phi_0 = 0$), $D_k'(E_s) = 0$ for $s \notin \mathcal{A}_k$. The sets nest:

$$
\mathcal{A}_{d-1} \subset \mathcal{A}_{d-2} \subset \cdots \subset \mathcal{A}_1 \subset \mathcal{A}_0 = S,
$$

with $|\mathcal{A}_k| = 2(d-k)+1$ for $1 \le k \le d-1$. So $D_k'$-rows form an upper staircase when rows are level-decreasing and columns are $s$-decreasing.

---

## 6. Lemma P — parity-disjoint support at $\tau = r_k$

**Lemma P.** *For each fold level $k \in \{0, \ldots, d-1\}$ and each $s \in S$,*

$$
D_k'(E_s)\big|_{\tau = r_k} \;=\;
\begin{cases}
\ell_k(s)\,r_k^{q_k(s) - 1} & q_k(s)\text{ odd},\\[3pt]
0 & q_k(s)\text{ even},
\end{cases}
$$

$$
M_k^{\mathrm{new}}(E_s)\big|_{\tau = r_k} \;=\;
\begin{cases}
\ell_k(s)\,r_k^{q_k(s)} & q_k(s)\text{ even},\\[3pt]
0 & q_k(s)\text{ odd}.
\end{cases}
$$

*In particular $D_k'$ and $M_k^{\mathrm{new}}$ have disjoint supports on $S$, partitioned by the parity of $q_k$.*

*Proof.* $\phi_m(r_k, -r_k) = (r_k^m - (-r_k)^m)/(2r_k) = 0$ for $m$ even, $= r_k^{m-1}$ for $m$ odd. Substitute into $D_k'(E_s) = \ell_k(s)\phi_{q_k(s)}(\tau, -r_k)$ and $M_k^{\mathrm{new}}(E_s) = \ell_k(s)\tau r_k\phi_{q_k(s)-1}(\tau, -r_k)$ for $q_k \ge 1$ (else $\ell_k(s)$). For $M_k^{\mathrm{new}}$ at $q_k$ even, $q_k \ge 2$: $\tau r_k\phi_{q_k-1}|_{\tau = r_k} = r_k^2 \cdot r_k^{q_k - 2} = r_k^{q_k}$. At $q_k = 0$: $M_k^{\mathrm{new}} = \ell_k(s) = \ell_k(s) r_k^0$. $\square$

**Corollary (parity vanishing of $\Lambda_k$ at $\tau = r_k$).** By Lemma C,

$$
\Lambda_k(a, b)\big|_{\tau = r_k} \ne 0 \iff q_k(a) \not\equiv q_k(b) \pmod 2.
$$

The generic vanishing $q_k(a) \ne q_k(b)$ tightens to a parity condition.

**Why this is the right generalisation of Lemma B.** Lemma B (i.e., the level-$(d-1)$ structure) gave support disjointness only at the innermost level, where $q_{d-1}(s) \in \{0, 1\}$ on $S$ and the parity equals the value. Lemma P says that for *any* level $k$, the same parity-based disjointness emerges automatically when one specialises $\tau = r_k$.

Equivalently: $\tau = r_k$ is the divisor on which level $k$ behaves like the innermost level.

---

## 7. The proof direction — row dependence

The factor $(\tau^2 - r_k^2)$ in the theorem factorises into $(\tau + r_k)$ (extracted by Lemma A) and $(\tau - r_k)$ (the positive divisor). The divisor-theoretic statement is

$$
(\tau - r_k) \;\bigm|\; \det\tilde B^{(D')}\quad\text{for each } k \in \{1, \ldots, d-2\}.
$$

The full divisor-theoretic statement requires $\det\tilde B^{(D')}|_{\tau = r_k} = 0$ as a polynomial in the remaining variables (all $u_j$ included). For the top-adjacent case $k=d-2$, this can be proved directly by a row dependence, with no boundary specialisation.

**Top-adjacent row dependence.** Let $k=d-2$ and $R=r_k$. At $\tau=R$,

$$
u_kD_k' + (1-u_k)M_k^{\mathrm{new}}
\;-\;R^2D_{k+1}' - M_{k+1}^{\mathrm{new}} \;=\; 0
$$

as an equality of rows on $S$.

Indeed, for $k=d-2$ every column has $q_k(s)\in\{0,1,2,3\}$ and
$q_{k+1}(s)\in\{0,1\}$. By Lemma P at $\tau=R$, the level-$k$ row pair has

| $q_k(s)$ | $D_k'$ | $M_k^{\mathrm{new}}$ |
|---|---|---|
| $0$ | $0$ | $\ell_k(s)$ |
| $1$ | $\ell_k(s)$ | $0$ |
| $2$ | $0$ | $\ell_k(s)R^2$ |
| $3$ | $\ell_k(s)R^2$ | $0$ |

At the top level $k+1=d-1$, the row pair is innermost: $D_{k+1}'=\ell_{k+1}$
on $q_{k+1}=1$ columns and $0$ otherwise, while
$M_{k+1}^{\mathrm{new}}=\ell_{k+1}$ on $q_{k+1}=0$ columns and $0$ otherwise.
Using $\ell_{k+1}(s)=u_k\ell_k(s)$ for odd $q_k(s)$ and
$\ell_{k+1}(s)=(1-u_k)\ell_k(s)$ for even $q_k(s)$, the four cases
$q_k=0,1,2,3$ give the displayed row identity.

Therefore the rows of $\tilde B$ are dependent at $\tau=r_{d-2}$, and

$$
(\tau-r_{d-2})\mid\det\tilde B^{(D')}.
$$

For lower levels, the same first step gives

$$
u_kD_k' + (1-u_k)M_k^{\mathrm{new}}
\;=\;\bigl[s\mapsto \ell_{k+1}(s)r_k^{2q_{k+1}(s)}\bigr]
\quad\text{at }\tau=r_k.
$$

The right-hand side is a virtual level-$(k+1)$ evaluation at $r_k^2$. The
remaining positive-divisor problem for $k<d-2$ is to show this virtual row lies
in the span of the actual rows at levels $k+1,\ldots,d-1$ on the tail-halving
support. The boundary-slice branch-sum argument in Appendix B is evidence for
this dependence, but it is no longer the preferred formulation of the proof.

The containment reduces to a quotient interpolation statement. Put $h=k+1$ and
$D=d-h$. After factoring the common nonzero row multiplier $\ell_h(s)$, the
higher rows depend only on

$$
q=q_h(s).
$$

The distinct quotient columns are

$$
Q_D=\{2^D-1,\;2^{D-1},\;2^{D-1}-1,\;\ldots,\;2,\;1,\;0\},
$$

of size $2D$. The rows from levels $h,\ldots,d-1$ become the same Step-A/B row
system on $Q_D$, with local levels $0,\ldots,D-1$ and parameters
$u_h,\ldots,u_{d-1}$ and $r_h,\ldots,r_{d-1}$.

**Quotient interpolation lemma (reduced target).** *For the quotient support
$Q_D$, the $2D$ Step-A/B rows have full rank. Therefore every row*

$$
q\longmapsto X^q
$$

*restricted to $Q_D$ lies in their span. In particular, taking $X=r_k^2$ gives
the virtual row needed above.*

This lemma is the current algebraic core. It is verified for the relevant small
quotient depths by exact rational rank computation. A promising proof is by
specialising $u_i=\tfrac12$ and $r_i=0$: after removing nonzero row scalars, the
quotient matrix has rows

$$
A_t(q)=\mathbf 1_{q\ge 2^t}\,\tau^{\lfloor q/2^t\rfloor-1},\qquad
B_t(q)=\mathbf 1_{q<2^t},
$$

on $Q_D$, and exact checks show this specialised matrix has rank $2D$ for
$D\le 8$. The remaining work is to write the finite-difference/triangular
argument for this specialised matrix uniformly in $D$.

---

## 8. Status

**Fully proved:**

| item | content |
|---|---|
| Identity $(\ast)$ | Casoratian-style identity for $\phi_m$ |
| Bracket identity | corollary of $(\ast)$ |
| Lemma A | $\prod_k (\tau + r_k) \mid \det B$ |
| Lemma B | canonical row pair form via $\phi$ |
| Lemma C | universal $2\times 2$ minor formula |
| Vanishing of $\Lambda_k$ at $q_k(a) = q_k(b)$ | corollary of Lemma C |
| Staircase structure of $D_k'$-rows | corollary of $q_t$-table |
| Lemma P | parity-disjoint support at $\tau = r_k$ |
| Parity vanishing of $\Lambda_k$ at $\tau = r_k$ | corollary of Lemma P |
| Top-adjacent divisor | $(\tau-r_{d-2})\mid\det\tilde B^{(D')}$ by explicit row dependence |
| Slice closure at $k = d-2, u_{d-2} = 0, \tau = r_{d-2}$, $d \ge 3$ | Appendix B — pairwise swap exhausts contributing partitions |

**Numerically verified (not symbolically proved at the full-polynomial level):**

| item | content |
|---|---|
| Full closed form at $d=3,4,5$ | direct computation in `SHPLEMINI_ZK_SMALL_CASES.md` |
| Branch-sum diagnostics at $d=3,4,5$ | boundary-slice cancellations match the row-dependence picture |
| Quotient interpolation specialisation | exact rational full-rank checks through quotient depth $D=8$ |

**Open:**

1. **Prove the quotient interpolation lemma.** This would put the virtual
level-$(k+1)$ row in the span of the actual higher rows for every
$k<d-2$, proving all remaining positive divisors $\tau-r_k$.

2. **Relate the boundary branch-sum proof to row dependence.** Appendix B proves the
$u_{d-2}=0$ slice by a pairwise swap, but §7 proves the full top-adjacent
divisor directly. The slice cancellation should be a Laplace-expansion shadow
of the row dependence; this has not been written out.

3. **Top-pair alternant $\tau^{E-4} - r_0^{E-4}$.** Conjectured to follow from a refined Lemma P at level 0, on the cyclotomic divisor of $\tau^{E-4} = r_0^{E-4}$. Not yet formulated precisely.

4. **Lagrange factors $L_0(u_{<k})L_{2^k-1}(u_{<k})$ and affine factors $A_k^{\pm}$.** Conjectured to come from the same level-adjacent row/column structure that produces the positive divisors. Not yet derived.

5. **Sign $(-1)^d$.** Column-shuffle count, expected to follow once the rest is in place.

6. **Degree match.** Show the listed divisors saturate $\det\tilde B^{(D')}$ — no additional polynomial factors. Standard once the divisors are confirmed.

---

## 9. The complete factor-to-mechanism map (target)

| factor in the theorem | divisor locus | mechanism |
|---|---|---|
| $\tau + r_k$ for $k = 0, \ldots, d-1$ | $\tau = -r_k$ | Lemma A (proved) |
| $\tau - r_{d-2}$ | $\tau = r_{d-2}$ | explicit row dependence (proved) |
| $\tau - r_k$ for $k = 1, \ldots, d-3$ | $\tau = r_k$ | quotient interpolation lemma (open) |
| $\tau^{E-4} - r_0^{E-4}$ | $\tau^{E-4} = r_0^{E-4}$ | refined Lemma P at level 0 (open) |
| $r_0^2, \tau^2$ | $r_0 = 0, \tau = 0$ | residual from level-0 / Lemma C powers (open) |
| $L_0(u_{<k})L_{2^k-1}(u_{<k})$ | Lagrange zero loci | $\ell_k$ content from level-$k$ peel (open) |
| $A_k^\pm$ | affine loci | level-adjacent residual structure (open) |
| $(-1)^d$ | sign | column shuffle (open) |

The proved entries provide the negative linear divisors and the top-adjacent
positive divisor. The lower positive divisors and the non-linear/top-pair
factors are the remaining structural work.

---

## Appendix A. Laplace expansion

This appendix records the determinant expansion used only for the branch-sum
diagnostics.

Since the rows of $\tilde B$ are organised into $d$ row pairs, the determinant
expands as

$$
\det\tilde B \;=\; \sum_{\pi}\,\mathrm{sgn}(\pi)\,\prod_{k=0}^{d-1}\Lambda_k(a_k, b_k),
$$

where $\pi$ ranges over ordered partitions of the columns into $d$ unordered
pairs $\{a_k,b_k\}$ assigned to levels $0,\ldots,d-1$ (with $a_k>b_k$), and
$\mathrm{sgn}(\pi)$ is the column-shuffle sign.

---

## Appendix B. Boundary branch sums

The branch-sum computations are not the main proof route, but they are useful
checks on the row-dependence picture. On the boundary slice
$u_{d-2}=0,\tau=r_{d-2}$, the top-level chart has

$$
(a_{d-1},b_{d-1})=(2^{d-1},b),\qquad
b\in\{s\in S:s<2^{d-1},\mathrm{bit}_{d-2}(s)=0\},
$$

with branch counts $1,3,5,\ldots$ for $d=3,4,5,\ldots$. Detailed rational
branch values and closed-form determinant checks live in
`SHPLEMINI_ZK_SMALL_CASES.md`.

**Boundary-slice cancellation.** Specialise to
$k=d-2, u_{d-2}=0, \tau=r_{d-2}$. The level-$(d-1)$ chart has
$a_{d-1}=2^{d-1}$ forced and

$$
b_{d-1}\in\mathcal L:=\{s\in S:s<2^{d-1},\mathrm{bit}_{d-2}(s)=0\}.
$$

By Lemma P at level $d-2$, $\Lambda_{d-2}(a,b)\ne0$ requires
$q_{d-2}(a)\not\equiv q_{d-2}(b)\pmod2$.

On tail-halving $S$, the $q_{d-2}$-odd columns are
$\{E-1,E-2,2^{d-1}-1,2^{d-2}\}$, and the $q_{d-2}$-even columns are

$$
\{2^{d-1}\}\cup\{2^{d-2}-1,2^{d-3},2^{d-3}-1,\ldots,2,1\}.
$$

Since $2^{d-1}=a_{d-1}$ is already used, every available even column is
$<2^{d-2}$ and hence lies in $\mathcal L$. Thus any contributing level-$(d-2)$
pair has

$$
a_{d-2}\in\{E-1,E-2,2^{d-1}-1,2^{d-2}\},\qquad
b_{d-2}\in\mathcal L\setminus\{b_{d-1}\}.
$$

Define the swap $\sigma$ by

$$
C_{d-1}^\sigma=(2^{d-1},b_{d-2}),\qquad
C_{d-2}^\sigma=(a_{d-2},b_{d-1}),
$$

leaving all other column blocks fixed. The enumeration above makes $\sigma$ a
fixed-point-free involution on contributing partitions.

The two paired terms cancel:

- the consumed column set is unchanged;
- at $u_{d-2}=0$, $\ell_{d-1}(s)=\ell_{d-2}(s)$ on the three swap-relevant
  columns $2^{d-1},b_{d-1},b_{d-2}$;
- the column-shuffle sign flips by one transposition.

Therefore

$$
\det\tilde B^{(D')}\big|_{u_{d-2}=0,\tau=r_{d-2}}=0.
$$

For $d=3$, after the forced top chart $a_{d-1}=4,b_{d-1}=1$ is taken, the
remaining columns have odd $q_1$, so no parity-mixed level-1 partition
contributes at $\tau=r_1$.

This slice proof does not itself imply
$(\tau-r_{d-2})\mid\det\tilde B^{(D')}$. That divisibility is supplied by the
row-dependence argument in §7. The appendix shows how the same dependence
appears after expanding the determinant into row-block minors at
$u_{d-2}=0$.
