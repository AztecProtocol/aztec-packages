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
soundness argument therefore works for any choice of $\sigma$. (Somewhat surprisingly, it works for the zero function!)

Define the $3 \times 3$ matrix $A$ acting on $\mathbb{F}^3$ by

$$A = \mathrm{diag}(D_2, D_3, D_4) + (J - I),$$

where $J$ is the $3 \times 3$ all-ones matrix and $I$ the $3 \times 3$
identity. Equivalently, for $\vec{v} \in \mathbb{F}^3$ and $i \in \{1, 2, 3\}$,

$$(A \vec{v})_i = D_i\, v_i + \sum_{j \ne i} v_j.$$

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

the four observed-lane values *before* each S-box. Crucially, the prover does
**not** commit $\vec{v}_0$. The *row output* is the full final state

$$\mathrm{out} := (s_4, \vec{v}_4) \in \mathbb{F} \times \mathbb{F}^3.$$

## A Crucial Point: Treating the $s_k$ as Independent (or why is the reconstruction of the hidden $\vec{v}_0$ linear?)

Before stating the theorem, it is essential to be precise about what is "committed" versus "derived" — otherwise the statement is wrong. 

A naive reading of the dynamical system says: starting from $(s_0, \vec{v}_0)$
together with the round constants, the entire iteration is determined. So
$s_1, s_2, s_3$ are **functions** of $(s_0, \vec{v}_0)$, computed by cascading
$\sigma$ four times. Under this reading, the map $\vec{v}_0 \mapsto (s_1, s_2, s_3)$
(with $s_0, c_k$ fixed) is **highly nonlinear** — each $s_{k+1}$ depends on
$\sigma(s_k + c_k)$, which depends on $\sigma(s_{k-1} + c_{k-1})$, and so on,
giving a tower of $\sigma$'s with combined degree $5^3$ if $\sigma(x) = x^5$.

That naive reading is **not** what the circuit checks. The compressed-row
relation does *not* receive $\vec{v}_0$ and recompute the iteration. Instead, the
prover commits **four independent wires** $(s_0, s_1, s_2, s_3)$, and the
relation asks:

> Does there exist a $\vec{v}_0 \in \mathbb{F}^3$ such that the four committed
> values $(s_0, s_1, s_2, s_3)$, together with the recurrence, are
> consistent — and if so, is that $\vec{v}_0$ unique?

Under this question, $u_k = \sigma(s_k + c_k)$ for $k = 0, 1, 2, 3$ are
**fixed scalars** computed from the committed wires $s_k$ and the publicly
known round constants. They do not "cascade through $\sigma$" in $\vec{v}_0$,
because the $s_k$ are committed independently rather than derived from
$\vec{v}_0$. With the $u_k$ treated as constants, the constraints

$$
\begin{aligned}
s_1 &= D_1 u_0 + \vec{1}^\top \vec{v}_0, \\
s_2 &= D_1 u_1 + \vec{1}^\top (A \vec{v}_0 + u_0 \vec{1}), \\
s_3 &= D_1 u_2 + \vec{1}^\top (A^2 \vec{v}_0 + A u_0 \vec{1} + u_1 \vec{1}),
\end{aligned}
$$

become a **linear system in $\vec{v}_0$**. This is the system the proof inverts.

Two consequences of this design choice:

* **Per-variable degree stays at 5.** Because the $s_k$ are independent
  wires, each $u_k$ is a single $\sigma$ applied to one wire — degree 5 in
  that wire — rather than a cascade that would push the degree to $5^k$. The
  cost is committing three extra wires per row; the benefit is that the
  relation polynomial has manageable degree.

* **The recurrence is checked, not assumed.** What forces the prover to use
  the *correct* $s_1, s_2, s_3$ (i.e. the values that the honest dynamics
  would produce) is precisely the four subrelations $A_0, A_1, A_2, A_3$
  that constrain consistency between the committed $s_k$, the unique
  $\vec{v}_0$ recovered from them, and the adjacent row. Row-locally, every
  committed lane-0 chain recovers a unique hidden state; globally, a dishonest
  chain is rejected when its resulting output fails to match the successor row
  constraints.

With this understanding in place, "the map $\vec{v}_0 \mapsto (s_1, s_2, s_3)$"
in the theorem below means **the linear-in-$\vec{v}_0$ component of the system
above**, with the committed-wire S-box outputs $u_0, u_1, u_2$ treated as
known scalars. This map is genuinely affine in $\vec{v}_0$.

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
seven quantities, four of which are already committed wires and three of
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

### A is Diagonalizable with Eigenvalues $D_2, D_3, D_4$

A short calculation gives the characteristic polynomial of $A$:

$$\det(A - x I) = (D_2 - x)(D_3 - x)(D_4 - x).$$

So the eigenvalues of $A$ are exactly $D_2, D_3, D_4$. When they are pairwise
distinct, $A$ is diagonalizable: there is an invertible $P$ with

$$A = P\, \mathrm{diag}(D_2, D_3, D_4)\, P^{-1}.$$

### $K$ Invertible $\iff$ Vandermonde Invertible

Using $A^k = P\, \mathrm{diag}(D_2^k, D_3^k, D_4^k)\, P^{-1}$,

$$\vec{1}^\top A^k = (P^\top \vec{1})^\top \mathrm{diag}(D_2^k, D_3^k, D_4^k)\, P^{-1}.$$

Set $\vec{w} := P^\top \vec{1} = (w_1, w_2, w_3) \in \mathbb{F}^3$. Stacking the
three rows for $k = 0, 1, 2$,

$$
K = \begin{bmatrix} w_1 & w_2 & w_3 \\ w_1 D_2 & w_2 D_3 & w_3 D_4 \\ w_1 D_2^2 & w_2 D_3^2 & w_3 D_4^2 \end{bmatrix} P^{-1}.
$$

The middle matrix factors as

$$
\begin{bmatrix} w_1 & w_2 & w_3 \\ w_1 D_2 & w_2 D_3 & w_3 D_4 \\ w_1 D_2^2 & w_2 D_3^2 & w_3 D_4^2 \end{bmatrix} = \begin{bmatrix} 1 & 1 & 1 \\ D_2 & D_3 & D_4 \\ D_2^2 & D_3^2 & D_4^2 \end{bmatrix} \begin{bmatrix} w_1 & 0 & 0 \\ 0 & w_2 & 0 \\ 0 & 0 & w_3 \end{bmatrix} = V \cdot \mathrm{diag}(\vec{w}),
$$

so $K = V \cdot \mathrm{diag}(\vec{w}) \cdot P^{-1}$ and therefore

$$\det(K) = \det(V) \cdot w_1 w_2 w_3 \cdot \det(P^{-1}).$$

Since $P$ is invertible, $\det(P^{-1}) \ne 0$, so $K$ is invertible iff
$\det(V) \ne 0$ **and** every $w_i \ne 0$.

* $\det(V) = (D_3 - D_2)(D_4 - D_2)(D_4 - D_3) \ne 0$ iff $D_2, D_3, D_4$ are
  pairwise distinct. *(This is the static_assert in `poseidon2_quad_params.hpp`.)*
* $w_i = (P^\top \vec{1})_i$ is the projection of $\vec{1}$ onto the
  $i$-th left eigenvector of $A$. For this specific $A = \mathrm{diag}(D) + J - I$,
  each eigenvector on a distinct eigenvalue has nonzero coordinate sum, so
  $w_i \ne 0$ automatically.

Therefore $K$ is invertible exactly when $D_2, D_3, D_4$ are pairwise
distinct.

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
* **The all-ones vector has nonzero projection onto every left eigenvector of
  $A$.** Automatic for $A = \mathrm{diag}(D) + J - I$ when the $D_i$ are
  distinct, but worth flagging as a side condition; it is what lets
  "Vandermonde invertible" suffice without a separate runtime check.
* **$\sigma$ is deterministic.** Used implicitly when we treat $u_k$ as a
  function of $(s_k, c_k)$. No other property of $\sigma$ matters — in
  particular the soundness argument is independent of the algebraic degree of
  the S-box.

That is the entire mathematical content of the soundness proof.

## Generalization: What Other Matrices Would Work?

The proof above used very little structure of $A$. Stripped to its essentials,
the construction works for any $3 \times 3$ matrix that satisfies a single
*observability* condition. Stated for general dimension $n$ in place of $3$:

### The Abstract Setup

Replace $\mathbb{F}^3$ by $\mathbb{F}^n$, and choose:

* an $n \times n$ matrix $A$ over $\mathbb{F}$ (the hidden-lane update),
* a column vector $\vec{b} \in \mathbb{F}^n$ (the *input direction*,
  controlling how the driver $u$ enters the hidden lanes: $\vec{v}_{k+1} = A \vec{v}_k + u_k \vec{b}$),
* a row vector $\vec{c}^\top \in \mathbb{F}^n$ (the *output direction*,
  controlling how the hidden lanes feed back to the observed lane:
  $s_{k+1} = D_1 u_k + \vec{c}^\top \vec{v}_k$).

In Poseidon2's case, $n = 3$ and $\vec{b} = \vec{c} = \vec{1}$, but
nothing in the proof actually requires $\vec{b} = \vec{c}$, nor that
either equals the all-ones vector.

### The Key Condition

Running the system $n$ steps, the linear part of the map
$\vec{v}_0 \mapsto (s_1, \ldots, s_n)$ is the **observability matrix**

$$
K = \begin{bmatrix} \vec{c}^\top \\ \vec{c}^\top A \\ \vdots \\ \vec{c}^\top A^{n-1} \end{bmatrix}.
$$

The construction is sound iff $K$ is invertible — equivalently, iff the pair
$(A, \vec{c}^\top)$ is *observable*. Note that $\vec{b}$ does not appear in
the condition: the input direction affects the driver-only piece but not
recoverability of $\vec{v}_0$.

When $A$ is diagonalizable with distinct eigenvalues $\lambda_1, \ldots, \lambda_n$,
the same factorization as in the Poseidon2 proof shows $K$ is invertible iff:

1. The $\lambda_i$ are pairwise distinct (Vandermonde nondegeneracy), **and**
2. $\vec{c}$ has nonzero projection onto every left eigenvector of $A$.

So observability of $(A, \vec{c}^\top)$ — a single condition — splits into
"distinct eigenvalues" + "output not orthogonal to any eigenvector" in the
diagonalizable case. Poseidon2 satisfies both: condition (1) by the static
assertion that $D_2, D_3, D_4$ are distinct, condition (2) automatically
because eigenvectors of $\mathrm{diag}(D) + J - I$ on distinct eigenvalues
have nonzero coordinate sum.

### Quick Examples

**Works:** any pure-diagonal $A = \mathrm{diag}(\lambda_1, \ldots, \lambda_n)$
with distinct $\lambda_i$ and $\vec{c}$ entrywise nonzero; companion matrices
of separable polynomials with $\vec{c} = \vec{e}_1$; generic circulants over a
field containing the relevant roots of unity.

**Fails:** $A = \lambda I$ (every vector is an eigenvector, $K$ has rank 1);
any $A$ with a repeated eigenvalue when $\vec{c}^\top$ annihilates the
difference of two eigenvectors on that eigenvalue (then $\vec{v}_0$ and a
shift by that difference produce identical lane-0 chains — a free witness
channel for the prover).

### Takeaway

The Poseidon2 quad-row layout is one instance of a general phenomenon: any
observable single-input single-output linear system of dimension $n$ admits
an $n$-step compression where only the observed lane is committed and the
hidden state is recovered by inverting the observability matrix. The
Vandermonde appears as a clean sufficient condition when $A$ is diagonalizable;
the underlying requirement is just observability.
