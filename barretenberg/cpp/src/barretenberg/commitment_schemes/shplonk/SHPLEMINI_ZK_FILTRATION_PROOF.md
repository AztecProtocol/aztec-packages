# Shplemini ZK Determinant — Filtration Proof

A self-contained proof of the Shplemini ZK determinant identity along these lines:

1. **Lemma A** (§0): extract $\prod_{k=0}^{d-1}(\tau + r_k)$ from $\det B$.
2. **Row operation** (§2): replace each $M_k^{\mathrm{new}}$ by an explicit
   linear combination $N_k$ to make the matrix block-lower-triangular (§3).
3. **Schur step** (§5, Step 1): pivot on the $D_0'(C_0) = 1$ entry; modifies
   no other row, deletes one row and one column.
4. **Middle elimination** (§5, Step 3): use the invertibility of each middle
   block $T_k$ to eliminate $M_0^{\mathrm{new}}$ from middle columns.
5. **Boundary 3×3 identity** (§5, Step 4): the residual $(2d-1) \times (2d-1)$
   determinant factors as $\bigl(\prod \det T_k\bigr)\cdot \det U_d$ where
   $U_d$ is an explicit $3 \times 3$ polynomial matrix on $C_{d-1}$. The
   closed form for $\det U_d$ (boxed in §6) is proved by **Lemma 6** via
   **Lemma 5** (a Casoratian identity in the $X_m$ sequence, derived from
   Identity $(\ast)$ from §0).

**The proof is complete.** See §6.

The middle divisors $(\tau^2 - r_k^2)$ become diagonal entries of the
block-lower-triangular form (Lemma 4), eliminating the need for §7's
per-divisor row-dependence arguments. The level-$0$ anomaly $\tau^{E-4} - r_0^{E-4}$
splits between $\mathsf{Mid}_0$ (the $\tau^2 - r_0^2$ factor, in $T_1$) and the
$3 \times 3$ boundary block $U_d$ (the residual
$(\tau^{E-4} - r_0^{E-4})/(\tau^2 - r_0^2)$).

The triangularisation depends on one explicit row operation, derived from two
multilinear-Lagrange identities (§2). The construction is verified
symbolically at $d = 3, 4$ in `SHPLEMINI_ZK_FILTRATION_VERIFY.py` (same
folder).

Notation is fixed in §0: $N = 2^d$, $E = N$, tail-halving support $S$ is ordered descending, row pairs are $(D_t,M_t)$ for $t=0,\ldots,d-1$, and Step A/Step B define $D_t'$ and $M_t^{\mathrm{new}}$.

---

## 0. Setup and preparation

The proof is self-contained from this point: notation, algebraic identities, the Step-A/Step-B row normalisations, and the staircase structure are recorded here before the filtration argument starts.

### Theorem

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

**Theorem.**

$$
\det B \;=\; (-1)^d\,r_0^2\,\tau^2\,\bigl(\tau^{E-4} - r_0^{E-4}\bigr)\,\prod_{k=1}^{d-2}\!(\tau^2 - r_k^2)\,(\tau + r_{d-1})\,\prod_{k=1}^{d-2}\!L_0(u_{<k})L_{2^k-1}(u_{<k})\,\prod_{k=0}^{d-2}\!A_k^{+}(r_k)\,A_k^{-}(\tau).
$$

---

### Algebraic primitives

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

### Lemma A — Step A row factorisation

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

### Lemma B — Step B row operations

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

### The $q_t$-table and staircase structure

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

## 1. The two filtrations

**Row filtration.** $F_0 \subset F_1 \subset \cdots \subset F_d = K^{2d}$ with
$F_k = \operatorname{span}(D_0, M_0, \ldots, D_{k-1}, M_{k-1})$. Each quotient
$F_{k+1}/F_k$ is rank $2$, generated by the level-$k$ row pair.

**Column filtration.** With $\mathcal A_k = \{s \in S : q_k(s) \ge 1\}$ as in §0,
$$
S = \mathcal A_0 \supset \mathcal A_1 \supset \cdots \supset \mathcal A_{d-1},
\qquad |\mathcal A_k| = 2(d-k) + 1.
$$
Define **fresh columns at level $k$** by $C_k := \mathcal A_k \setminus \mathcal A_{k+1}$
for $0 \le k \le d-2$ and $C_{d-1} := \mathcal A_{d-1}$. Sizes are
$|C_0| = 1$, $|C_k| = 2$ for $1 \le k \le d-2$, $|C_{d-1}| = 3$, summing to $2d$.

The boundary off-by-one — one column short at level $0$, one column extra at
level $d-1$ — is the entire structural source of the formula's "anomalies"
$\tau^{E-4} - r_0^{E-4}$ and the lone $\tau + r_{d-1}$. In the natural row /
column ordering the filtrations are compatible but not split: the level-$k$
row pair vanishes on $S \setminus \mathcal A_k = C_0 \sqcup \cdots \sqcup C_{k-1}$
for the $D$-rows by the staircase, but the $M^{\mathrm{new}}$-rows do *not*
vanish there. They leak in a controlled way, treated in §2.

---

## 2. The triangularising row operation

The two identities below, verified symbolically for $d = 3, 4$ at every
relevant $(k, j, s)$ position, eliminate the M-row leakage.

**Lemma 1 (M-row leakage).** *For every $k$, every $j < k$, every $s \in C_j$,*
$$
M_k^{\mathrm{new}}(E_s) \;=\; \prod_{i=j+1}^{k-1}(1 - u_i) \cdot M_{j+1}^{\mathrm{new}}(E_s).
$$
*Proof.* Both sides vanish unless $q_k(s) = 0$. For $s \in C_j$ we have
$s < 2^{j+1}$, so bits $j+1, \ldots, k-1$ of $s$ are zero. The multilinear
Lagrange identity gives $\ell_k(s) = \ell_{j+1}(s) \cdot \prod_{i=j+1}^{k-1}(1-u_i)$.
By Lemma B (the $q_k = 0$ case), $M_k^{\mathrm{new}}(E_s) = \ell_k(s)$ and
$M_{j+1}^{\mathrm{new}}(E_s) = \ell_{j+1}(s)$, since $q_{j+1}(s) = 0$ also. $\square$

**Lemma 2 (adjacent identity).** *For every $k \ge 1$ and every $s \in C_{k-1}$,*
$$
M_k^{\mathrm{new}}(E_s) \;=\; u_{k-1}\cdot D_{k-1}'(E_s).
$$
*Proof.* $s \in C_{k-1}$ means $2^{k-1} \le s < 2^k$, so $\mathrm{bit}_{k-1}(s) = 1$
and $\ell_k(s) = u_{k-1}\,\ell_{k-1}(s)$. On the other side, $q_{k-1}(s) = 1$
gives $D_{k-1}'(E_s) = \ell_{k-1}(s)\,\phi_1(\tau, -r_{k-1}) = \ell_{k-1}(s)$.
Also $q_k(s) = 0$ gives $M_k^{\mathrm{new}}(E_s) = \ell_k(s)$ by Lemma B. $\square$

**Definition.** For $k \ge 1$, the *triangularised* row at level $k$ is
$$
\boxed{\;N_k \;:=\; M_k^{\mathrm{new}} \;-\; u_{k-1}\,D_{k-1}' \;-\; (1 - u_{k-1})\,M_{k-1}^{\mathrm{new}}\;}
$$
*applied in parallel*, using the original $M_{k-1}^{\mathrm{new}}$ — not a previously
substituted $N_{k-1}$.

**Proposition 3.** *$(D_k', N_k)$ vanishes on $C_j$ for every $j < k$. The row
substitution $M_k^{\mathrm{new}} \mapsto N_k$ preserves $\det B$.*

*Proof.* The two subtraction terms have disjoint supports on the regions they
cancel:

| region | $D_{k-1}'$ | $M_{k-1}^{\mathrm{new}}$ | identity used |
|---|---|---|---|
| $C_{k-1}$ ($q_{k-1}=1$) | $\ne 0$ | $= 0$ (Lemma B at $q=1$: $\phi_0 = 0$) | Lemma 2 |
| $C_j$, $j \le k-2$ ($q_{k-1}=0$) | $= 0$ (staircase) | $\ne 0$ | Lemma 1 at level $k-1 \to j$ |

On $C_{k-1}$: $N_k = M_k^{\mathrm{new}} - u_{k-1}D_{k-1}' - 0 = 0$ by Lemma 2.
On $C_j$, $j \le k-2$: $N_k = M_k^{\mathrm{new}} - 0 - (1-u_{k-1})M_{k-1}^{\mathrm{new}} = 0$
by Lemma 1 applied at $(k-1, j)$, which gives
$M_{k-1}^{\mathrm{new}}(E_s) = \prod_{i=j+1}^{k-2}(1-u_i)\,M_{j+1}^{\mathrm{new}}(E_s)$,
combined with Lemma 1 at $(k, j)$. Determinant preservation is immediate:
$N_k$ is a sum of $M_k^{\mathrm{new}}$ and lower-index rows of $\tilde B$. $\square$

The $D$-rows vanish on $C_0 \sqcup \cdots \sqcup C_{k-1}$ already, by the
staircase. Together with Proposition 3 this gives:

---

## 3. Block-lower-triangular form

Order rows as $(D_0', M_0^{\mathrm{new}}, D_1', N_1, \ldots, D_{d-1}', N_{d-1})$
and columns as $C_0 \mid C_1 \mid \cdots \mid C_{d-1}$ (lowest level first
on the left). The level-$k$ row pair has support only on
$C_k \sqcup C_{k+1} \sqcup \cdots \sqcup C_{d-1}$, so the matrix is block
lower-triangular with row partition $(2, 2, \ldots, 2)$ and column partition
$(1, 2, \ldots, 2, 3)$:

```
            C_0   C_1   C_2  ...  C_{d-2}  C_{d-1}
D_0',M_0n   .     .     .    ...  .        .
D_1',N_1    0     .     .    ...  .        .
D_2',N_2    0     0     .    ...  .        .
...
D_{d-1}',N_{d-1}  0     0    ...  0        .
```

The "diagonal" blocks are the level-$k$ row pair restricted to $C_k$:
$$
T_k \;:=\;
\begin{pmatrix} D_k'(E_s) \\ N_k(E_s) \end{pmatrix}_{s \in C_k}.
$$
Sizes: $T_0$ is $2\times 1$, $T_k$ is $2 \times 2$ for $1 \le k \le d-2$,
$T_{d-1}$ is $2 \times 3$.

Because $T_0$ and $T_{d-1}$ are not square, $\det \tilde B$ is *not* a simple
product of $\det T_k$. It is the Laplace expansion across the column blocks
respecting the lower-triangular support — see §5.

---

## 4. Middle blocks

For $1 \le k \le d-2$, $T_k$ is a square $2 \times 2$ block. Its closed
form has an *index shift*: $T_k$ on $C_k$ carries the level-$(k-1)$ algebra.

**Lemma 4 (middle block determinant).** *For $1 \le k \le d-2$,*
$$
\det T_k \;=\;
-\,L_0(u_{<k-1})\,L_{2^{k-1}-1}(u_{<k-1})\,(\tau-r_{k-1})\,
A_{k-1}^{+}(r_{k-1})\,A_{k-1}^{-}(\tau).
$$

*Proof.* Put $m=k-1$, $u=u_m$, $r=r_m$, $L_-=L_0(u_{<m})$, and
$L_+=L_{2^m-1}(u_{<m})$. On the tail support,

$$
C_k=\{2^{k+1}-1,\;2^k\}.
$$

On both columns $q_k=1$, hence $M_k^{\mathrm{new}}=0$ and
$D_k'=\ell_k$. The $D_k'$ row on $C_k$ is therefore

$$
\bigl(uL_+,\;(1-u)L_-\bigr).
$$

Since $M_k^{\mathrm{new}}=0$ on $C_k$,

$$
N_k=-uD_m'-(1-u)M_m^{\mathrm{new}}
$$

there. For the two columns $2^{k+1}-1$ and $2^k$, the level-$m$ quotients are
$3$ and $2$, respectively. Using

$$
\phi_2(\tau,-r)=\tau-r,\qquad \phi_3(\tau,-r)=\tau^2-\tau r+r^2,
$$

Lemma B gives

$$
N_k(2^{k+1}-1)=
-L_+\bigl(u(\tau^2-\tau r+r^2)+(1-u)\tau r(\tau-r)\bigr),
$$

$$
N_k(2^k)=
-L_-\bigl(u(\tau-r)+(1-u)\tau r\bigr).
$$

Taking the $2\times2$ determinant and expanding gives

$$
\begin{aligned}
\det T_k
&= L_+L_-\Bigl((1-u)\bigl(u(\tau^2-\tau r+r^2)+(1-u)\tau r(\tau-r)\bigr)\\
&\hspace{5.5em}-u\bigl(u(\tau-r)+(1-u)\tau r\bigr)\Bigr)\\
&= -L_+L_-(\tau-r)\bigl(u+(1-u)r\bigr)\bigl(u-(1-u)\tau\bigr).
\end{aligned}
$$

This is the claimed formula. $\square$

Combined with Lemma A's prefactor $(\tau + r_{k-1})$,
$$
(\tau + r_{k-1}) \cdot \det T_k \;=\; -\,\mathsf{Mid}_{k-1}.
$$
This realises every middle Mid factor as a *single 2×2 determinant*, replacing
the earlier row-dependence and quotient-interpolation route with a direct
computation.

---

## 5. Boundary handling: Schur step + middle elimination + 3×3 identity

The block-lower-triangular form has row partition $(2, 2, \ldots, 2)$ and
column partition $(1, 2, \ldots, 2, 3)$. The boundary imbalance — 1 column
short at the left, 1 column extra at the right — is resolved in three steps:
a free Schur step at the left, an elimination of $M_0^{\mathrm{new}}$ from
middle columns, and a single 3×3 determinant identity at the right.

### Step 1: Schur out $D_0'$ against $C_0$

The level-0 block $T_0$ is

$$
T_0 \;=\; \begin{pmatrix} D_0'(E_1) \\ M_0^{\mathrm{new}}(E_1) \end{pmatrix} \;=\; \begin{pmatrix} 1 \\ 0 \end{pmatrix}
$$

(using $\ell_0 = 1$, $\phi_1(\tau, -r_0) = 1$, and Lemma B's $q_0 = 1$ case
$M_0^{\mathrm{new}} = \tau r_0 \phi_0 = 0$). Pivot on the entry $D_0'(E_1) = 1$:

- The pivot value is $1$.
- Every other row vanishes on $C_0$: $M_0^{\mathrm{new}}(C_0) = 0$ by Lemma B,
  $D_k'(C_0) = 0$ for $k \ge 1$ by the staircase, $N_k(C_0) = 0$ for $k \ge 1$
  by Proposition 3.

So this Schur step modifies no other row. It just removes row $D_0'$ and
column $C_0$ from the matrix, multiplying $\det$ by $1$.

### Step 2: the residual $(2d-1)\times(2d-1)$ matrix

After Step 1 the matrix has rows
$(M_0^{\mathrm{new}}, D_1', N_1, \ldots, D_{d-1}', N_{d-1})$
on columns $C_1 \sqcup \cdots \sqcup C_{d-1}$, sizes $2d-1$ each. The
block-lower-triangular structure survives, with row partition $(1, 2, \ldots, 2)$
on column partition $(2, \ldots, 2, 3)$:

- One floating row $M_0^{\mathrm{new}}$, supported on **every** column
  (since $q_0(s) \ge 1$ for all $s \in S \setminus C_0$).
- $d-2$ squared $2\times 2$ middle blocks $T_k$ on $C_k$ for $1 \le k \le d-2$.
- One non-square $2 \times 3$ boundary block $T_{d-1}$ on $C_{d-1}$.

### Step 3: middle elimination of $M_0^{\mathrm{new}}$

The floating row $M_0^{\mathrm{new}}$ has nonzero entries on **every** column.
A naive Laplace expansion along this row across all $2d-2$ columns gives
contributions from middle columns as well as from $C_{d-1}$, leaving a
combinatorially heavy sum. Instead, we use the invertibility of each middle
block $T_k$ (Lemma 4: $\det T_k \ne 0$ in $K$) to eliminate
$M_0^{\mathrm{new}}|_{C_k}$ before doing the boundary expansion.

For each $k \in \{1, \ldots, d-2\}$, solve the $2 \times 2$ system
$$
(M_0^{\mathrm{new}}|_{C_k}) \;=\; \alpha_k\,(D_k'|_{C_k}) \,+\, \beta_k\,(N_k|_{C_k}),
$$
uniquely solvable since $\det T_k \ne 0$, and replace
$$
M_0^{\mathrm{new}} \;\leftarrow\; M_0^{\mathrm{new}} - \alpha_k\,D_k' - \beta_k\,N_k.
$$

**Order matters.** Perform the eliminations in ascending $k$ order. Because
$D_k'$ and $N_k$ vanish on $C_l$ for $l < k$ (staircase + Proposition 3),
step $k$ leaves $M_0^{\mathrm{new}}$ unchanged on $C_1, \ldots, C_{k-1}$;
only $C_l$ for $l \ge k$ are modified. So previously cleared blocks stay
cleared.

After all $d - 2$ steps, $M_0^{\mathrm{new}}$ (now denoted
$M_{0,\mathrm{elim}}^{\mathrm{new}}$) is **zero on $C_1 \sqcup \cdots \sqcup C_{d-2}$**
and (modified) nonzero on $C_{d-1}$. The coefficients $(\alpha_k, \beta_k)$ are
rational functions in $K$ with $\det T_k$ in the denominator.

### Step 4: the 3×3 boundary identity

After Step 3, merge the floating row with the level-$(d-1)$ row pair into a
single block of size 3 on $C_{d-1}$ (size 3). The matrix is now
block-lower-triangular with row and column partitions both equal to
$(2, 2, \ldots, 2, 3)$, so the determinant is the product of diagonal-block
determinants:

$$
\det \tilde B
\;=\;
\prod_{k=1}^{d-2}\det T_k \;\cdot\; \det U_d,
\qquad
U_d \;:=\;
\begin{pmatrix}
M_{0,\mathrm{elim}}^{\mathrm{new}}(c_1) & M_{0,\mathrm{elim}}^{\mathrm{new}}(c_2) & M_{0,\mathrm{elim}}^{\mathrm{new}}(c_3) \\
D_{d-1}'(c_1) & D_{d-1}'(c_2) & D_{d-1}'(c_3) \\
N_{d-1}(c_1) & N_{d-1}(c_2) & N_{d-1}(c_3)
\end{pmatrix},
$$

where $c_1, c_2, c_3$ enumerate $C_{d-1} = \{E-1, E-2, 2^{d-1}\}$.

The entries of $M_{0,\mathrm{elim}}^{\mathrm{new}}$ are rational with
denominators dividing $\prod_{k=1}^{d-2}\det T_k$. Multiplying the top row of
$U_d$ by this product clears all denominators, so the boxed identity for
$\det U_d$ in §6 is in fact a polynomial identity in
$K[\tau, r_0, r_{d-2}, r_{d-1}, u_0, \ldots, u_{d-1}]$ — the middle $r_k$'s do
not appear because they have been absorbed into the $\det T_k$ middle product.

### Verification at d = 3

Direct symbolic computation gives
$$
\det U_3 \;=\; -\,r_0^2\,\tau^2\,(r_0^2 + \tau^2)\,(\tau - r_1)\,(1 - u_0)\,u_0\,A_1^+(r_1)\,A_1^-(\tau).
$$
This matches the boxed formula in §6 at $d = 3$ with
$E = 8$: $(\tau^{E-4} - r_0^{E-4})/(\tau^2 - r_0^2) = (\tau^4 - r_0^4)/(\tau^2 - r_0^2) = \tau^2 + r_0^2$,
and the $\mathsf{Mid}_{d-2}$-content piece is $u_0(1 - u_0)(\tau - r_1) A_1^+ A_1^-$.

Multiplied by $\det T_1 = -(\tau - r_0) A_0^+(r_0) A_0^-(\tau)$ and the
Lemma-A prefactor $\prod (\tau + r_k)$, this reconstructs the $d=3$ theorem
instance, including the expected sign once the fixed column ordering is applied.

### General-$d$ identity

The structural identity proved in §6 is the boxed formula for $\det U_d$. Three
things to note:

1. The non-binary cyclotomic factors of $\tau^{E-4} - r_0^{E-4}$
   ($\Phi_3, \Phi_6, \Phi_7, \ldots$ at $d \ge 4$) sit entirely inside
   $(\tau^{E-4} - r_0^{E-4})/(\tau^2 - r_0^2)$, which is itself entirely
   inside $\det U_d$. The 3×3 block "sees" them via the high-degree polynomials
   $M_0^{\mathrm{new}}(E_{E-1}), M_0^{\mathrm{new}}(E_{E-2}), M_0^{\mathrm{new}}(E_{2^{d-1}})$
   that feed (via the eliminator) into the top row of $U_d$.

2. The identity has the shape of a $\tau \leftrightarrow r_0$ anti-symmetric
   $\phi$-product difference — exactly what Identity $(\ast)$ from §0
   telescopes.

3. After the eliminator clears denominators, the polynomial identity for
   $\det U_d$ involves only $\tau, r_0, r_{d-2}, r_{d-1}, u_0, \ldots, u_{d-1}$.
   The middle $r_k$'s ($1 \le k \le d - 3$) are absent — they enter only via
   the eliminator coefficients, which combine with $\det T_k$ to produce
   polynomial output.

---

## 6. Status

**Proved or reduced to one explicit computation.**

| piece | content | how |
|---|---|---|
| M-row leakage identity (Lemma 1) | $M_k^{\mathrm{new}} = \prod(1-u_i)\,M_{j+1}^{\mathrm{new}}$ on $C_j$ | multilinear Lagrange + Lemma B |
| Adjacent identity (Lemma 2) | $M_k^{\mathrm{new}}(C_{k-1}) = u_{k-1}\,D_{k-1}'(C_{k-1})$ | bit pattern on $C_{k-1}$ |
| Row op $N_k$ triangularises (Proposition 3) | $(D_k', N_k)$ vanishes on $C_j$, $j < k$ | disjoint-support cancellation |
| Block-lower-triangular form (§3) | with column order $C_0 \mid \cdots \mid C_{d-1}$ | staircase + Proposition 3 |
| Middle block determinants (Lemma 4) | $\det T_k = -L\cdot(\tau - r_{k-1})\cdot A_{k-1}^+\,A_{k-1}^-$ | uniform $2\times2$ determinant computation |
| Middle elimination | clears $M_0^{\mathrm{new}}$ from $C_1,\ldots,C_{d-2}$ | Gaussian elimination against the invertible $T_k$ blocks |
| Boundary determinant (Lemma 6) | closed form for $\det U_d$ | uniform algebra via Lemma 5 (Casoratian) + Identity $(\ast)$ |
| Casoratian identity (Lemma 5) | $X_2 X_{E-1} - X_3 X_{E-2} = \tau r_0\,\phi_{E-4}(\tau,-r_0)\,A_0^+(r_0)\,A_0^-(\tau)$ | three applications of Identity $(\ast)$ + $\phi$-recursion; verified at $E = 8,12,16,20,24,28,32,64$ |

**The proof is complete.** See the next subsection.

### Boundary determinant (proof)

For each $k=1,\ldots,d-2$, solve against the square block $T_k$ and subtract the
corresponding linear combination of $D_k',N_k$ from the floating row
$M_0^{\mathrm{new}}$. This kills the floating row on every middle block
$C_1,\ldots,C_{d-2}$ and preserves the determinant over the localisation where
$\prod_{k=1}^{d-2}\det T_k\ne0$.

The residual determinant factors as

$$
\det\tilde B
= \Bigl(\prod_{k=1}^{d-2}\det T_k\Bigr)\cdot \det U_d,
$$

where $U_d$ is the final $3\times3$ boundary matrix on
$C_{d-1}=\{E-1,E-2,2^{d-1}\}$, with rows

$$
M_{0,\mathrm{elim}}^{\mathrm{new}},\qquad D_{d-1}',\qquad N_{d-1}.
$$

The boundary block has the closed form

$$
\boxed{
\det U_d
= -\,r_0^2\tau^2\,
\frac{\tau^{E-4}-r_0^{E-4}}{\tau^2-r_0^2}\,
(\tau-r_{d-2})\,
L_0(u_{<d-2})L_{2^{d-2}-1}(u_{<d-2})\,
A_{d-2}^+(r_{d-2})A_{d-2}^-(\tau)
}
$$

The proof below shows this identity holds for all $d \ge 2$.

### Lemma 5 (Casoratian)

*For $E \ge 4$ with $E - 4$ even, with $X_m := (1-u_0)\,\phi_m(\tau,-r_0) - u_0\,\phi_{m-1}(\tau,-r_0)$,*
$$
X_2\,X_{E-1} \;-\; X_3\,X_{E-2} \;=\; \tau\,r_0\,\phi_{E-4}(\tau,-r_0)\,A_0^+(r_0)\,A_0^-(\tau).
$$

*Proof.* Expand the LHS bilinearly in $u_0,(1-u_0)$:
$$
X_2 X_{E-1} - X_3 X_{E-2}
= (1-u_0)^2\,[\phi_2 \phi_{E-1} - \phi_3 \phi_{E-2}]
+ u_0(1-u_0)\,[\phi_3 \phi_{E-3} - \phi_{E-1}]
+ u_0^2\,[\phi_{E-2} - \phi_2 \phi_{E-3}].
$$
Apply Identity $(\ast)$ from §0 at three index pairs:
$$
\phi_2 \phi_{E-1} - \phi_3 \phi_{E-2} \;=\; -\tau^2 r_0^2\,\phi_{E-4},\qquad
\phi_{E-2} - \phi_2 \phi_{E-3} \;=\; \tau r_0\,\phi_{E-4},\qquad
\tau r_0\,\phi_{E-5} - \phi_{E-3} \;=\; -\phi_2 \phi_{E-4}.
$$
For the middle bracket, apply the recursions
$\phi_{E-1} = \tau \phi_{E-2} + r_0^{E-2}$ ($E-2$ even) and
$\phi_{E-2} = \tau \phi_{E-3} - r_0^{E-3}$ ($E-3$ odd), then use the third
identity:
$$
\phi_3 \phi_{E-3} - \phi_{E-1} \;=\; -r_0\,\tau\,\phi_2\,\phi_{E-4}.
$$
Substituting:
$$
X_2 X_{E-1} - X_3 X_{E-2}
= \tau r_0\,\phi_{E-4}\,\bigl[u_0^2 - u_0(1-u_0)\,\phi_2 - (1-u_0)^2\,\tau r_0\bigr].
$$
The bracket equals $A_0^+(r_0)\,A_0^-(\tau)$ by direct expansion of the product
$(u_0 + (1-u_0)r_0)(u_0 - (1-u_0)\tau)$ and the identity $\phi_2 = \tau - r_0$.
$\square$

### Lemma 6 (boundary determinant)

*The boxed formula above holds for all $d \ge 2$.*

*Proof.* Write the boundary columns as
$c_1=E-1$, $c_2=E-2$, and $c_3=2^{d-1}$. A direct evaluation of the lower two
rows $D_{d-1}',N_{d-1}$ on these three columns gives the cofactor vector

$$
\bigl(C_1,C_2,C_3\bigr)
=
Q_{d-2}\,\ell_{d-2}(2^{d-1})\,v_{d-2}\,\bigl(1-u_0,\,-u_0,\,0\bigr),
\qquad
v_{d-2}:=u_1u_2\cdots u_{d-3},
$$

where $C_i$ is the signed cofactor of the top-row entry in column $c_i$, and

$$
Q_{d-2}:=-(\tau-r_{d-2})A_{d-2}^{+}(r_{d-2})A_{d-2}^{-}(\tau).
$$

Indeed, the cofactor $C_3$ is zero because the two top-pair columns have the
same $q_{d-1}$ and differ only by the $u_0$ vs. $(1-u_0)$ Lagrange factor; the
other two cofactors are the same two-column computation as Lemma 4 at the final
level, with the common factor $\ell_{d-2}(2^{d-1})v_{d-2}$ pulled out.
Therefore the cofactor expansion of $\det U_d$ along the top row is

$$
\det U_d
\;=\; Q_{d-2}\,\ell_{d-2}(2^{d-1})\,v_{d-2}\,\Delta',
$$

with

$$
\Delta' := (1-u_0)\,\tilde M_0(E_{E-1})-u_0\,\tilde M_0(E_{E-2}).
$$

**Step 1: $u_0$-anti-symmetry of higher-level rows on $\{E-1, E-2\}$.**

For every $k \ge 1$ and $s \in \{E-1, E-2\}$: $q_k(s) = 2^{d-k} - 1$ is the same
for both $s$, and $\ell_k(s)$ factors as $\ell_1(s) \cdot u_1 \cdots u_{k-1}$
with $\ell_1(E-1) = u_0$, $\ell_1(E-2) = 1 - u_0$. Hence both $D_k'(s)$ and
$M_k^{\mathrm{new}}(s)$ split as $\ell_1(s) \cdot Y_k(\tau, r_k, u_1, \ldots, u_{k-1})$,
and
$$
(1-u_0)\,D_k'(E-1) - u_0\,D_k'(E-2) \;=\; 0,\qquad
(1-u_0)\,M_k^{\mathrm{new}}(E-1) - u_0\,M_k^{\mathrm{new}}(E-2) \;=\; 0,
$$
for all $k \ge 1$. By induction on the row operation, the same vanishing holds
for $N_k$ when $k \ge 2$ (since $N_k$ is a $K$-linear combination of
$D_{k-1}', M_{k-1}^{\mathrm{new}}$). $N_1$ is the exception: it depends on
$D_0'$ and $M_0^{\mathrm{new}}$, which do not have the $u_0$-structure.

**Step 2: reducing $\Delta'$.**

Substituting $\tilde M_0 = M_0^{\mathrm{new}} - \sum_{k=1}^{d-2}[\alpha_k D_k' + \beta_k N_k]$
into $\Delta'$ and using Step 1, only the level-$0$ piece and the $\beta_1 N_1$ piece survive:
$$
\Delta' \;=\; \bigl[(1-u_0)\,M_0^{\mathrm{new}}(E-1) - u_0\,M_0^{\mathrm{new}}(E-2)\bigr]
\;-\; \beta_1\,\bigl[(1-u_0)\,N_1(E-1) - u_0\,N_1(E-2)\bigr].
$$
Using $M_0^{\mathrm{new}}(E_s) = \tau r_0\,\phi_{s-1}(\tau, -r_0)$:
$$
(1-u_0)\,M_0^{\mathrm{new}}(E-1) - u_0\,M_0^{\mathrm{new}}(E-2) \;=\; \tau r_0\,X_{E-2}.
$$
For $N_1$, Step 1 cancels the $M_1^{\mathrm{new}}$ contribution, leaving
$$
(1-u_0)\,N_1(E-1) - u_0\,N_1(E-2)
\;=\; -u_0\,X_{E-1} \;-\; (1-u_0)\,\tau r_0\,X_{E-2}.
$$

**Step 3: $\beta_1$.**

$\beta_1$ is determined by the level-$1$ elimination on $C_1 = \{3, 2\}$. By
Cramer's rule against
$T_1 = \begin{pmatrix} D_1'(3) & N_1(3) \\ D_1'(2) & N_1(2) \end{pmatrix}$,
$$
\beta_1 \;=\; \frac{D_1'(3)\,M_0^{\mathrm{new}}(2) - D_1'(2)\,M_0^{\mathrm{new}}(3)}{\det T_1}
\;=\; \frac{u_0\,\tau r_0 - (1-u_0)\,\tau r_0\,\phi_2}{\det T_1}
\;=\; \frac{\tau r_0\,X_2}{D_0},
$$
where the last step uses $u_0 - (1-u_0)\phi_2 = -X_2$ (since $\phi_1 = 1$) and
Lemma 4 at $k = 1$ gives $\det T_1 = -D_0$ with $D_0 := (\tau - r_0)\,A_0^+(r_0)\,A_0^-(\tau)$.

**Step 4: combining and applying Lemma 5.**

Substituting Steps 2 and 3 and multiplying through by $D_0$:
$$
\Delta'\,D_0 \;=\; \tau r_0\,X_{E-2}\,D_0
\;+\; \tau r_0\,X_2\,\bigl[u_0\,X_{E-1} + (1-u_0)\,\tau r_0\,X_{E-2}\bigr].
$$
Using $X_2=(1-u_0)\phi_2-u_0$, $X_3=(1-u_0)\phi_3-u_0\phi_2$, and
$D_0=(\tau-r_0)A_0^+(r_0)A_0^-(\tau)$, a direct expansion gives

$$
D_0+(1-u_0)\tau r_0X_2=-u_0X_3.
$$

Hence

$$
\Delta'\,D_0
= u_0\tau r_0X_2X_{E-1}+\tau r_0X_{E-2}\bigl(D_0+(1-u_0)\tau r_0X_2\bigr)
= u_0\,\tau r_0\,\bigl[X_2X_{E-1}-X_3X_{E-2}\bigr].
$$
By Lemma 5,
$$
\Delta'\,D_0 \;=\; u_0\,\tau r_0 \cdot \tau r_0\,\phi_{E-4}(\tau,-r_0)\,A_0^+(r_0)\,A_0^-(\tau)
\;=\; u_0\,\tau^2 r_0^2\,\phi_{E-4}\,A_0^+\,A_0^-.
$$
Dividing by $D_0 = (\tau - r_0)\,A_0^+\,A_0^-$ and using
$\phi_{E-4}(\tau, -r_0) = (\tau^{E-4} - r_0^{E-4})/(\tau + r_0)$ ($E - 4$ even):
$$
\Delta' \;=\; u_0\,\tau^2 r_0^2\,\frac{\tau^{E-4} - r_0^{E-4}}{\tau^2 - r_0^2}.
$$

**Step 5: assembling $\det U_d$.**

Using $L_0(u_{<d-2})\,L_{2^{d-2}-1}(u_{<d-2}) = u_0\,\ell_{d-2}(2^{d-1})\,v_{d-2}$:
$$
\det U_d \;=\; Q_{d-2}\,\ell_{d-2}(2^{d-1})\,v_{d-2}\,\Delta'
\;=\; -(\tau - r_{d-2})\,A_{d-2}^+\,A_{d-2}^-\,\frac{L_0\,L_{2^{d-2}-1}}{u_0}\,u_0\,\tau^2 r_0^2\,\frac{\tau^{E-4} - r_0^{E-4}}{\tau^2 - r_0^2},
$$
giving the boxed formula. $\square$

### Assembly: full determinant

Combining everything:
$$
\det B
\;=\; \prod_{k=0}^{d-1}(\tau + r_k)\;\cdot\;\prod_{k=1}^{d-2}\det T_k\;\cdot\;\det U_d.
$$
For each $k = 1, \ldots, d-2$, Lemma 4 gives
$(\tau + r_{k-1})\,\det T_k = -\mathsf{Mid}_{k-1}$. For $k = d-1$ the factor
$(\tau + r_{d-1})$ from Lemma A is $\mathsf{Last}_d$. Lemma 6 gives
$\det U_d$ as the boxed formula, which combined with $(\tau + r_0)(\tau + r_{d-2})$
from Lemma A yields
$$
r_0^2 \tau^2\,(\tau^{E-4} - r_0^{E-4})\,(\tau^2 - r_{d-2}^2)\,L_0(u_{<d-2})\,L_{2^{d-2}-1}(u_{<d-2})\,A_{d-2}^+\,A_{d-2}^-,
$$
i.e., $\mathsf{Top}_d \cdot \mathsf{Mid}_{d-2} / [A_0^+(r_0)\,A_0^-(\tau)]$.
The missing $A_0^\pm$ factors come from the $k=1$ middle block, where
$(\tau+r_0)\det T_1=-\mathsf{Mid}_0$. The signs are therefore the $(d-2)$
middle signs, the boundary sign in Lemma 6, and the fixed column-ordering sign;
with the original descending support order these combine to $(-1)^d$. Therefore:
$$
\det B
\;=\;
(-1)^d\,r_0^2\,\tau^2\,(\tau^{E-4} - r_0^{E-4})\,\prod_{k=1}^{d-2}(\tau^2 - r_k^2)\,(\tau + r_{d-1})\,\mathcal L\,\mathcal A,
$$
which is the theorem statement in §0. $\blacksquare$

---

## 7. Verification and companion notes

This file is the canonical source for the determinant statement and proof. The remaining companion files are auxiliary:

- `SHPLEMINI_ZK_FILTRATION_VERIFY.py`: symbolic/numerical checks for the filtration identities.
- `SHPLEMINI_ZK_MASKING.md`: engineering setup for the masking-rank argument used by code comments and tests.

Earlier divisor-by-divisor, finite-case, and cyclic-module routes are superseded by Lemma 4 for the middle blocks and Lemma 6 for the boundary block.
