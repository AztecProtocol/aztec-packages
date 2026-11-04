# The Core Soundness Theorem (Abstract Form)

This note states, in pure linear-algebra terms with no reference to Poseidon2,
the single mathematical fact that makes the K=4 compressed internal-round
layout sound.

For the Poseidon2-specific construction this theorem underpins — the trace
layout, the explicit $b_k$ formulas, the closed-form coefficient table $C$,
the entry/interior/terminal subrelations, and the witness-materialization
strategy — see [README.md](README.md), in particular the
[Mega Internal Compression](README.md#mega-internal-compression) and
[Soundness Argument](README.md#soundness-argument) sections.

## Setup

Fix a field $\mathbb{F}$.

Fix four scalars $D_1, D_2, D_3, D_4 \in \mathbb{F}$. The only constraint that
matters is

$$D_2,\ D_3,\ D_4 \text{ are pairwise distinct.}$$

$D_1$ is unconstrained — it plays no role in the bijection, only in the output
formula.

Fix an arbitrary "S-box" function $\sigma : \mathbb{F} \to \mathbb{F}$. For
Poseidon2 on BN254, $\sigma(x) = x^5$. The theorem does **not** use any
property of $\sigma$ other than that it is a deterministic function. The same
soundness argument therefore works for any choice of $\sigma$, including the zero function.

Define the $3 \times 3$ matrix $A$ acting on $\mathbb{F}^3$ by

$$A = \mathrm{diag}(D_2, D_3, D_4) + (J - I),$$

where $J$ is the $3 \times 3$ all-ones matrix and $I$ the $3 \times 3$
identity. Equivalently, for $\vec{v} \in \mathbb{F}^3$ and $i \in \{1, 2, 3\}$,

$$(A \vec{v})_i = D_{i+1}\, v_i + \sum_{j \ne i} v_j.$$

Written out:

$$
A = \begin{bmatrix} D_2 & 1 & 1 \\ 1 & D_3 & 1 \\ 1 & 1 & D_4 \end{bmatrix}.
$$

Let $\vec{1}$ denote the all-ones column vector in $\mathbb{F}^3$.

## The Dynamical System

The state space is $\mathbb{F} \times \mathbb{F}^3$. We write a state as
$(s, \vec{v})$ with $s \in \mathbb{F}$ (the *observed lane*) and $\vec{v} \in \mathbb{F}^3$
(the *hidden lanes*).

Each step is parametrized by a "round constant" $c \in \mathbb{F}$. Given a
current state $(s, \vec{v})$ and round constant $c$, the next state is

$$\mathrm{next}(s, \vec{v}, c) = \bigl(\, D_1\, \sigma(s + c) + \vec{1}^\top \vec{v},\ \ A \vec{v} + \sigma(s + c) \cdot \vec{1}\, \bigr).$$

In words: compute the S-box output $u := \sigma(s + c)$ (which is notably independent of $\vec{v}$). Then the new observed lane is $D_1 u + \vec{1}^\top \vec{v}$, and the new hidden lanes are $A \vec{v}$ shifted by $u$ in every coordinate.

This is exactly the Poseidon2 internal round acting on
$(\text{state}[0],\ \text{state}[1..3])$ with $\sigma(x) = x^5$ and round
constant $c$.

## The Four-Step Iteration

Fix four round constants $c_0, c_1, c_2, c_3 \in \mathbb{F}$. Starting from a
state $(s_0, \vec{v}_0)$, iterate the step four times:

$$(s_{k+1},\ \vec{v}_{k+1}) = \mathrm{next}(s_k,\ \vec{v}_k,\ c_k), \qquad k = 0, 1, 2, 3.$$

Define the four S-box outputs

$$u_k := \sigma(s_k + c_k), \qquad k = 0, 1, 2, 3.$$

The *lane-0 chain* of the iteration is the tuple $(s_0, s_1, s_2, s_3, s_4)$.
The *row commitments* the prover supplies are

$$(s_0,\ s_1,\ s_2,\ s_3),$$

the four observed-lane values *before* each S-box. The prover does
**not** commit $\vec{v}_0$. The *row output* is the full final state

$$\mathrm{out} := (s_4, \vec{v}_4) \in \mathbb{F} \times \mathbb{F}^3.$$

## Why the System Is Linear in $\vec{v}_0$

The relation treats $s_0, \dots, s_3$ as four independent committed wires. It does not
receive $\vec{v}_0$ and recompute the iteration. So $u_k = \sigma(s_k + c_k)$ are known
scalars, computed from the committed wires and the public round constants, and the
constraints on $\vec{v}_0$ are linear:

$$
\begin{aligned}
s_1 &= D_1 u_0 + \vec{1}^\top \vec{v}_0, \\
s_2 &= D_1 u_1 + \vec{1}^\top (A \vec{v}_0 + u_0 \vec{1}), \\
s_3 &= D_1 u_2 + \vec{1}^\top (A^2 \vec{v}_0 + A u_0 \vec{1} + u_1 \vec{1}).
\end{aligned}
$$

Committing each $s_k$ keeps the per-variable degree at 5: each $u_k$ is one $\sigma$
applied to one wire, instead of a cascade of degree $5^k$ in $\vec{v}_0$.

The recurrence is checked, not assumed. Part (1) below proves only that each committed
lane-0 chain recovers a unique $\vec{v}_0$, not that the chain is honest. The subrelations
$A_0, \dots, A_3$ reject a dishonest chain when its output fails the successor-row constraints.

In the theorem, "the map $\vec{v}_0 \mapsto (s_1, s_2, s_3)$" means this affine system, with
$u_0, u_1, u_2$ held fixed.

## The Theorem

**Theorem (Quad-row soundness).** *Suppose $D_2, D_3, D_4$ are pairwise
distinct in $\mathbb{F}$. Then:*

**(1) Hidden-lane uniqueness.** *Fix any committed values
$(s_0, s_1, s_2, s_3) \in \mathbb{F}^4$, any round constants
$(c_0, c_1, c_2, c_3) \in \mathbb{F}^4$, and let $u_k := \sigma(s_k + c_k)$
for $k = 0, 1, 2, 3$ be the resulting fixed scalars. Then there is at most
one $\vec{v}_0 \in \mathbb{F}^3$ for which the recurrence is consistent with the
committed $s_k$. Equivalently, the affine map*

$$\vec{v}_0 \ \longmapsto\ (s_1,\ s_2,\ s_3) \qquad (\text{with } s_0,\ c_k,\ u_0, u_1, u_2 \text{ all held fixed})$$

*is a bijection $\mathbb{F}^3 \to \mathbb{F}^3$. Its linear part, after
subtracting the parts of $(s_1, s_2, s_3)$ that depend only on $s_0$, the
round constants, and $(u_0, u_1, u_2)$, is captured (after a change of
basis) by the Vandermonde matrix*

$$
V = \begin{bmatrix} 1 & 1 & 1 \\ D_2 & D_3 & D_4 \\ D_2^2 & D_3^2 & D_4^2 \end{bmatrix},
$$

*whose determinant is*

$$\det(V) = (D_3 - D_2)(D_4 - D_2)(D_4 - D_3),$$

*nonzero exactly when the three nodes are pairwise distinct.*

**(2) Closed-form output.** *Once $\vec{v}_0$ is pinned by (1), the output $\mathrm{out}$
is a fixed $\mathbb{F}$-linear function of $(s_1, s_2, s_3, u_0, u_1, u_2, u_3)$.
There is a $4 \times 7$ matrix $C$ over $\mathbb{F}$, depending only on
$(D_1, D_2, D_3, D_4)$, such that*

$$\mathrm{out} = C \cdot (s_1,\ s_2,\ s_3,\ u_0,\ u_1,\ u_2,\ u_3)^\top.$$

*Note that $s_0$ does not appear in this input vector — it enters only through
$u_0 = \sigma(s_0 + c_0)$.*

The matrix $C$ is what `poseidon2_quad_params.hpp` precomputes and what
`poseidon2_quad_closed_form.test.cpp` cross-checks against direct iteration.

## What the Theorem Buys You in the Circuit

The relation commits only the lane-0 chain $(s_0, s_1, s_2, s_3)$ on each
compressed row. Part (1) says the prover gets no freedom in $\vec{v}_0$ — it is
forced by the committed values together with the publicly fixed round
constants. Part (2) says the row's output state is a fixed linear function of
seven quantities, three of which are already committed wires and four of
which are S-box outputs of committed wires; this is exactly what the four
interior subrelations check.

In the circuit, the theorem is used in the forward direction: the current
compressed row determines a unique full four-round output. For an interior
transition, the relation checks that the successor compressed row starts from
that output state: its first lane-0 wire equals the output's lane 0, and its
reconstructed hidden start lanes equal the output's hidden lanes.

The same Vandermonde inversion is also used at the row-to-row boundary: when
both adjacent rows hide their $\vec{v}$'s, comparing $\vec{v}$'s directly is impossible,
so the relation instead compares their image under $V$. Because $V$ is
bijective, equality of images is equivalent to equality of preimages.

## Proof of Part (1): Why the Vandermonde Appears

Recall that $u_0, u_1, u_2, u_3$ are taken as **fixed scalars**, computed
from the committed wires $s_0, s_1, s_2, s_3$ and the public round
constants. With the $u_k$ frozen, the recurrence on the hidden lanes is
linear in $\vec{v}_0$:

$$\vec{v}_{k+1} = A \vec{v}_k + u_k \cdot \vec{1},$$

so

$$\vec{v}_1 = A \vec{v}_0 + u_0 \vec{1},$$

$$\vec{v}_2 = A^2 \vec{v}_0 + (A u_0 + u_1)\, \vec{1},$$

$$\vec{v}_3 = A^3 \vec{v}_0 + (A^2 u_0 + A u_1 + u_2)\, \vec{1}.$$

The observed-lane recurrence reads

$$s_{k+1} = D_1 u_k + \vec{1}^\top \vec{v}_k.$$

Substituting and collecting all terms that do not involve $\vec{v}_0$ — call this
the *driver-only piece*, since it depends only on $(s_0, c_0, c_1, c_2, c_3,
u_0, u_1, u_2)$, all of which are fixed scalars — gives

$$s_1 - (\text{driver-only}) = \vec{1}^\top \vec{v}_0,$$

$$s_2 - (\text{driver-only}) = \vec{1}^\top A \vec{v}_0,$$

$$s_3 - (\text{driver-only}) = \vec{1}^\top A^2 \vec{v}_0.$$

In matrix form, the linear part of the map $\vec{v}_0 \mapsto (s_1, s_2, s_3)$ is

$$
K = \begin{bmatrix} \vec{1}^\top \\ \vec{1}^\top A \\ \vec{1}^\top A^2 \end{bmatrix}
\quad (\text{a } 3 \times 3 \text{ matrix}).
$$

The question reduces to: **when is $K$ invertible?**

### $K = L \cdot V$ with $L$ Unit Lower-Triangular

Write $\vec{D} = (D_2, D_3, D_4)^\top$, $\vec{D}^2$ for its entrywise square, and
$\Sigma = D_2 + D_3 + D_4$. Since $A = \mathrm{diag}(\vec{D}) + J - I$ and
$\vec{1}^\top J = 3 \cdot \vec{1}^\top$, the rows of $K$ are

$$
\begin{aligned}
\vec{1}^\top &= \vec{1}^\top, \\
\vec{1}^\top A &= \vec{D}^\top + 2 \cdot \vec{1}^\top, \\
\vec{1}^\top A^2 &= (\vec{D}^2)^\top + \vec{D}^\top + (\Sigma + 4) \cdot \vec{1}^\top.
\end{aligned}
$$

The rows of $V$ are $\vec{1}^\top$, $\vec{D}^\top$ and $(\vec{D}^2)^\top$, so

$$
K = L \cdot V, \qquad
L = \begin{bmatrix} 1 & 0 & 0 \\ 2 & 1 & 0 \\ \Sigma + 4 & 1 & 1 \end{bmatrix}.
$$

$L$ is unit lower-triangular, so $\det(K) = \det(V)$:

* $\det(V) = (D_3 - D_2)(D_4 - D_2)(D_4 - D_3) \ne 0$ iff $D_2, D_3, D_4$ are
  pairwise distinct. *(This is the static_assert in `poseidon2_quad_params.hpp`.)*

Therefore $K$ is invertible exactly when $D_2, D_3, D_4$ are pairwise
distinct.

This is the reduction the code uses. `build_tables` in `poseidon2_quad_params.hpp`
holds $L^{-1}$ as the matrix `Bw`; the comments there call the result the
"row-reduced Vandermonde system". In the README, the system $V \vec{v}_0 = \vec{b}$ has
$b_2 = w_o - 2 w_r + \dots$ and $b_3 = w_4 - w_o - (\Sigma + 2) w_r + \dots$: these apply $L^{-1}$
to the committed wires. The entry coefficients $D_j^2 + D_j + \Sigma + 4$ are the third row of $K$.

## Proof of Part (2): The Closed Form $C$

Once $\vec{v}_0$ is determined by part (1), every subsequent $\vec{v}_k$ is determined by
the recurrence $\vec{v}_{k+1} = A \vec{v}_k + u_k \vec{1}$. Iterating four times,

$$\vec{v}_4 = A^4 \vec{v}_0 + (A^3 u_0 + A^2 u_1 + A u_2 + u_3)\, \vec{1},$$

$$s_4 = D_1 u_3 + \vec{1}^\top \vec{v}_3.$$

Substituting $\vec{v}_0 = K^{-1} \cdot (\text{linear in } s_1, s_2, s_3, u_0, u_1, u_2)$
into both expressions yields

$$\mathrm{out} = C \cdot (s_1, s_2, s_3, u_0, u_1, u_2, u_3)^\top$$

for a fixed $4 \times 7$ matrix $C$ over $\mathbb{F}$. The explicit
construction of $C$ is in `poseidon2_quad_params.hpp::build_tables`, and the
random equivalence test in `poseidon2_quad_closed_form.test.cpp` cross-checks
it against direct four-step iteration.

## What This Depends On

* **$D_2, D_3, D_4$ pairwise distinct.** Asserted at compile time in
  `poseidon2_quad_params.hpp`.
* **$\sigma$ is deterministic.** Used implicitly when we treat $u_k$ as a
  function of $(s_k, c_k)$. No other property of $\sigma$ matters — in
  particular the soundness argument is independent of the algebraic degree of
  the S-box.

## Remark: Generalization

The proof uses little structure of $A$. Replace $\mathbb{F}^3$ by $\mathbb{F}^n$, and let
the hidden lanes update as $\vec{v}_{k+1} = A \vec{v}_k + u_k \vec{b}$ and the observed lane as
$s_{k+1} = D_1 u_k + \vec{c}^\top \vec{v}_k$. Poseidon2 has $n = 3$ and $\vec{b} = \vec{c} = \vec{1}$.

Running $n$ steps, the linear part of $\vec{v}_0 \mapsto (s_1, \ldots, s_n)$ is the
**observability matrix** $K$ with rows $\vec{c}^\top A^k$ for $k = 0, \dots, n-1$. The construction is sound iff $K$ is
invertible, i.e. iff $(A, \vec{c}^\top)$ is *observable*. $\vec{b}$ does not appear in the
condition: it affects the driver-only piece, not recoverability of $\vec{v}_0$.

When $A$ is diagonalizable, $K$ is invertible iff the eigenvalues of $A$ are pairwise distinct
(Vandermonde nondegeneracy) and $\vec{c}$ has nonzero projection onto every left eigenvector of $A$.
