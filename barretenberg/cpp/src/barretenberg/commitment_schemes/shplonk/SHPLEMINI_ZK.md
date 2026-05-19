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

**Bracket identity.** *For all $k$ and all $m \ge 0$,*

$$
\tau r_k\,\phi_{m+1}(\tau, -r_k) - \phi_{m+3}(\tau, -r_k) \;=\; -(\tau - r_k)^2 \cdot (\text{polynomial of degree } m+1).
$$

Special case $m = 0$: $\tau r_k\,\phi_3(\tau, -r_k) - \phi_5(\tau, -r_k) = -(\tau - r_k)^2 (\tau^2 + r_k^2)$. Follows directly from $(\ast)$ with $a = m+3, b = 2$.

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

## 5. Generalised Laplace expansion

Since the rows of $\tilde B$ are organised into $d$ row pairs (the level row blocks), the determinant expands as

$$
\det\tilde B \;=\; \sum_{\pi}\,\mathrm{sgn}(\pi)\,\prod_{k=0}^{d-1}\Lambda_k(a_k, b_k),
$$

where $\pi$ ranges over ordered partitions of the columns into $d$ unordered pairs $\{a_k, b_k\}$ assigned to levels $0,\ldots,d-1$ (with $a_k > b_k$), and $\mathrm{sgn}(\pi)$ is the column-shuffle sign.

This is the standard generalised Laplace expansion by 2-row blocks.

---

## 6. The $q_t$-table and staircase structure

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

By Lemma C, $D_k'(E_s) = 0$ for $s \notin \mathcal{A}_k$. The sets nest:

$$
\mathcal{A}_{d-1} \subset \mathcal{A}_{d-2} \subset \cdots \subset \mathcal{A}_1 \subset \mathcal{A}_0 = S,
$$

with $|\mathcal{A}_k| = 2(d-k)+1$ for $1 \le k \le d-1$. So $D_k'$-rows form an upper staircase when rows are level-decreasing and columns are $s$-decreasing.

---

## 7. Lemma P — parity-disjoint support at $\tau = r_k$

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

## 8. The proof direction — branch-sum vanishing

The factor $(\tau^2 - r_k^2)$ in the theorem factorises into $(\tau + r_k)$ (extracted by Lemma A) and $(\tau - r_k)$ (still to extract). The divisor-theoretic statement is

$$
(\tau - r_k) \;\bigm|\; \det\tilde B^{(D')}\quad\text{for each } k \in \{1, \ldots, d-2\}.
$$

The proof strategy: show $\det\tilde B^{(D')}|_{\tau = r_k} = 0$ as a polynomial identity in the remaining variables. By Lemma P, at $\tau = r_k$ the row-block Laplace sum restricts to parity-mixed pairs at level $k$. The conjectured mechanism is **pairwise cancellation under a $b_k \leftrightarrow b_{k+1}$ swap** that uses the multilinear Lagrange identity at $u_k = 0$. The argument is proved on a subset of partitions and verified numerically beyond that.

---

## 9. Numerical evidence for branch-sum vanishing

**$d = 3, k = 1, u_1 = 0$.** One forced level-2 chart $(a_2, b_2) = (4, 1)$. The residual on $\{7, 6, 3, 2\}$ has four level-1 cross-pairs, each with $\alpha - \beta = 2$, so all share the factor $\tau - r_1$ as a common $\Lambda_1$ content. The bracket identity collapses the level-0 sum to $r_0^2\tau^2(\tau-r_0)(\tau^2+r_0^2)A_0^+(r_0)A_0^-(\tau)$.

**$d = 4, k = 2, u_2 = 0$.** Three top-level branches $(8, 3), (8, 2), (8, 1)$. At $\tau = r_2 = 7$, $r_0 = 3, r_1 = 5, r_3 = 11, u_0 = 1/3, u_1 = 2/5$:

| level-3 pair | branch contribution |
|---|---|
| $(8, 3)$ | $\phantom{-}45698708420619118294528 / 50625$ |
| $(8, 2)$ | $-35484815824782097731328 / 50625$ |
| $(8, 1)$ | $-45395078203720091392 / 225$ |

Sum is exactly zero. At a non-special $\tau = 2$ the three branches sum to $40605565$, matching the reduced closed form.

**$d = 5, k = 3, u_3 = 0$.** Five top-level branches $(16, 7), (16, 4), (16, 3), (16, 2), (16, 1)$. At $\tau = r_3 = 7$ (with $r_0 = 3, r_1 = 5, r_2 = 11, r_4 = 13, u_0 = 1/3, u_1 = 2/5, u_2 = 3/7$):

| level-4 pair | branch contribution |
|---|---|
| $(16, 7)$ | $\phantom{-}7182742404847275650809850461138776713887744 / 2953125$ |
| $(16, 4)$ | $-2394317806039835545436735002967416814206976 / 984375$ |
| $(16, 3)$ | $-587093697076363938876231266792927994332905472 / 759375$ |
| $(16, 2)$ | $\phantom{-}2629664183095013133397469162781736628912324608 / 3796875$ |
| $(16, 1)$ | $\phantom{-}6795657190879669859540677426064110040711168 / 84375$ |

Sum is exactly zero. At non-special $\tau = 2$ the five branches sum to $-152796879231077796/125$, matching the closed form.

**Branch count rule (at $u_{d-2} = 0$).** The top-level chart $(a_{d-1}, b_{d-1}) = (2^{d-1}, b)$ has $b \in \{s \in S : s < 2^{d-1}, \mathrm{bit}_{d-2}(s) = 0\}$, of size $1, 3, 5, 7, \ldots$ for $d = 3, 4, 5, 6, \ldots$

---

## 10. Pairwise cancellation — partial result

**Setup.** Specialise to $k = d-2, u_{d-2} = 0, \tau = r_{d-2}$. The level-$(d-1)$ chart has $a_{d-1} = 2^{d-1}$ forced, $b_{d-1} \in \mathcal{L} := \{s \in S : s < 2^{d-1}, \mathrm{bit}_{d-2}(s) = 0\}$.

By Lemma P at level $d-2$, $\Lambda_{d-2}(a, b) \ne 0$ requires $q_{d-2}(a) \not\equiv q_{d-2}(b) \pmod 2$.

**Swap involution.** For a contributing partition $\pi$ with $C_{d-1} = (2^{d-1}, b_{d-1}),\; C_{d-2} = (a_{d-2}, b_{d-2})$, define $\sigma(\pi)$ to be the partition with the same other column blocks and

$$
C_{d-1}^\sigma = (2^{d-1}, b_{d-2}), \quad C_{d-2}^\sigma = (a_{d-2}, b_{d-1}).
$$

For $\sigma$ to be a well-defined involution on contributing partitions, we need $b_{d-2}$ to be a valid level-$(d-1)$ choice, i.e., $b_{d-2} \in \mathcal{L}$, *and* $b_{d-1}$ to be a valid level-$(d-2)$ choice, i.e., $q_{d-2}(b_{d-1})$ has opposite parity to $q_{d-2}(a_{d-2})$.

**The swap-symmetric subset.** Let $\mathcal{P}_{\mathrm{sym}}$ be the set of contributing partitions on which $\sigma$ is a well-defined involution. On $\mathcal{P}_{\mathrm{sym}}$:

* (I) **Residual minor unchanged.** Consumed col set $\{2^{d-1}, a_{d-2}, b_{d-1}, b_{d-2}\}$ is the same.
* (II) **Combined Lagrange weight unchanged.** At $u_{d-2} = 0$, the multilinear identity gives $\ell_{d-1}(s) = \ell_{d-2}(s)$ for $\mathrm{bit}_{d-2}(s) = 0$. All four cols involved in the swap have $\mathrm{bit}_{d-2} = 0$ (necessary for both $b_{d-2}$ and $b_{d-1}$ to lie in $\mathcal{L}$). The combined Lagrange product $\ell_{d-1}(2^{d-1})\ell_{d-1}(b_{d-1})\ell_{d-2}(a_{d-2})\ell_{d-2}(b_{d-2})$ becomes symmetric in $b_{d-1} \leftrightarrow b_{d-2}$.
* (III) **Column-shuffle sign flips.** Swapping two entries of the concatenated column tuple is one transposition.

Therefore $\pi$ and $\sigma(\pi)$ cancel pairwise within $\mathcal{P}_{\mathrm{sym}}$.

**Limitation.** $\mathcal{P}_{\mathrm{sym}}$ is a *subset* of contributing partitions. Partitions where $b_{d-2}$ has $q_{d-2}(b_{d-2}) \ne 0$ (i.e., $b_{d-2} \in \{E-1, E-2\}$ or other $q_{d-2}$-even cols with $\mathrm{bit}_{d-2} = 1$) are not paired by $\sigma$; their contributions require a separate accounting.

So the pairwise cancellation closes only $\mathcal{P}_{\mathrm{sym}}$, not the full branch sum.

---

## 11. Status

**Fully proved:**

| item | content |
|---|---|
| Identity $(\ast)$ | Casoratian-style identity for $\phi_m$ |
| Bracket identity | corollary of $(\ast)$ |
| Lemma A | $\prod_k (\tau + r_k) \mid \det B$ |
| Lemma B | canonical row pair form via $\phi$ |
| Lemma C | universal $2\times 2$ minor formula |
| Generalised Laplace | structural sum |
| Vanishing of $\Lambda_k$ at $q_k(a) = q_k(b)$ | corollary of Lemma C |
| Staircase structure of $D_k'$-rows | corollary of $q_t$-table |
| Lemma P | parity-disjoint support at $\tau = r_k$ |
| Parity vanishing of $\Lambda_k$ at $\tau = r_k$ | corollary of Lemma P |
| $d = 3, u_1 = 0$ explicit verification | §9 below |
| Pairwise cancellation on $\mathcal{P}_{\mathrm{sym}}$ at $k = d-2, u_{d-2} = 0, \tau = r_{d-2}$ | §10 |

**Numerically verified (not symbolically proved):**

| item | content |
|---|---|
| Branch-sum vanishing at $d = 3, k = 1, u_1 = 0, \tau = r_1$ | one numerical point, plus the $d=3$ collapse |
| Branch-sum vanishing at $d = 4, k = 2, u_2 = 0, \tau = r_2$ | one special point ($\tau = r_2$) and one generic |
| Branch-sum vanishing at $d = 5, k = 3, u_3 = 0, \tau = r_3$ | one special and one generic |

**Open:**

1. **Close the residual subset of partitions at $k = d-2, u_{d-2} = 0, \tau = r_{d-2}$** — partitions outside $\mathcal{P}_{\mathrm{sym}}$ (those with $b_{d-2}$ having $q_{d-2}(b_{d-2}) \ne 0$). Their contributions either independently vanish, cancel among themselves, or cancel against $\mathcal{P}_{\mathrm{sym}}$ contributions via a different mechanism. Not yet identified.

2. **Lift $u_{d-2} = 0$ to general $u_{d-2}$.** Vanishing of a polynomial on the $u_{d-2} = 0$ slice does not imply $(\tau - r_{d-2})$ divides the full polynomial; the remainder could be divisible by $u_{d-2}$. Need a separate divisibility argument, e.g., the same vanishing at another value of $u_{d-2}$.

3. **Extend from $k = d-2$ to general $k \in \{1, \ldots, d-2\}$.** The pairwise swap relies on $a_{k+1}$ being singly forced ($a_{k+1} = 2^{k+1}$), which uses the specialisation $u_k = 0$ at the top level. For $k < d - 2$ there are multiple $a_{k+1}$ choices and no such forcing.

4. **Top-pair alternant $\tau^{E-4} - r_0^{E-4}$.** Conjectured to follow from a refined Lemma P at level 0, on the cyclotomic divisor of $\tau^{E-4} = r_0^{E-4}$. Not yet formulated precisely.

5. **Lagrange factors $L_0(u_{<k})L_{2^k-1}(u_{<k})$ and affine factors $A_k^{\pm}$.** Conjectured to fall out of the $u_{k-1}$-bilinear collapse in the branch sum. Not yet derived.

6. **Sign $(-1)^d$.** Column-shuffle count, expected to follow once the rest is in place.

7. **Degree match.** Show the listed divisors saturate $\det\tilde B^{(D')}$ — no additional polynomial factors. Standard once the divisors are confirmed.

---

## 12. The complete factor-to-mechanism map (target)

| factor in the theorem | divisor locus | mechanism |
|---|---|---|
| $\tau + r_k$ for $k = 0, \ldots, d-1$ | $\tau = -r_k$ | Lemma A (proved) |
| $\tau - r_k$ for $k = 1, \ldots, d-2$ | $\tau = r_k$ | Lemma P + pairwise cancellation (partial) |
| $\tau^{E-4} - r_0^{E-4}$ | $\tau^{E-4} = r_0^{E-4}$ | refined Lemma P at level 0 (open) |
| $r_0^2, \tau^2$ | $r_0 = 0, \tau = 0$ | residual from level-0 / Lemma C powers (open) |
| $L_0(u_{<k})L_{2^k-1}(u_{<k})$ | Lagrange zero loci | $\ell_k$ content from level-$k$ peel (open) |
| $A_k^\pm$ | affine loci | Schur correction / $u_{k-1}$ collapse (open) |
| $(-1)^d$ | sign | column shuffle (open) |

The proved entries provide the complete linear-$\tau$ divisor extraction modulo the residual subset and lifting issues; the remaining entries are the open structural work.
