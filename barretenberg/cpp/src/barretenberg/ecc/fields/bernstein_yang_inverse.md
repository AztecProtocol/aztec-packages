# Bernstein–Yang modular inverse: the algorithm

A self-contained derivation of the modular inverse algorithm implemented in
`bernstein_yang_inverse.hpp`. We strip out the side-channel motivation and the
broader safegcd discussion in the original paper and keep only the math that
the code needs.

Throughout, $p$ is an **odd prime**, $0 < a < p$, and we want
$$a^{-1} \bmod p.$$

All quantities are integers; reductions modulo $p$ are made explicit when used.

**Notation.** $\mathbb{Z}_p$ throughout denotes the ring of **$p$-adic integers**
(the completion of $\mathbb{Z}$ with respect to the $p$-adic absolute value),
not the cyclic group $\mathbb{Z}/p\mathbb{Z}$. For the latter we always write
$\mathbb{Z}/p\mathbb{Z}$ or $\mathbb{F}_p$ explicitly. In particular $\mathbb{Z}_2$
is the ring of $2$-adic integers; $\mathbb{Q}_2 = \mathbb{Z}_2[\tfrac{1}{2}]$
is its fraction field. $|x|_2$ denotes the $2$-adic absolute value, with
$|2^k u|_2 = 2^{-k}$ for $u$ a unit, and $\operatorname{val}_2(x) = -\log_2 |x|_2$ the
$2$-adic valuation.

---

## 1. Setup: the state matrix $\Phi$ and the reduction goal

We track a $2 \times 2$ integer matrix

$$
\Phi \;=\; \begin{pmatrix} f & d \\ g & e \end{pmatrix} \;\in\; M_2(\mathbb{Z}_2)
$$

initialised at

$$
\Phi_0 \;=\; \begin{pmatrix} p & 0 \\ a & 1 \end{pmatrix}, \qquad \det \Phi_0 \;=\; p.
$$

So $\Phi_0 \in M_2(\mathbb{Z}_2)$ but **not** in $\mathrm{SL}_2(\mathbb{Z}_2)$:
$|\det \Phi_0|_2 = |p|_2 = 1$ (since $p$ is odd), but $\det \Phi_0 = p \ne \pm 1$.

### The kernel invariant

The whole algorithm preserves a single congruence:

$$
\boxed{\quad \Phi \begin{pmatrix} 1 \\ -a \end{pmatrix} \;\equiv\; \begin{pmatrix} 0 \\ 0 \end{pmatrix} \pmod p. \quad}
$$

Equivalently, the column vector $(1, -a)^T \in \mathbb{F}_p^2$ is in the kernel
of $\Phi \bmod p$. Unpacking entry by entry, this is just two Bezout congruences:

$$
f \;\equiv\; d \cdot a \pmod p, \qquad g \;\equiv\; e \cdot a \pmod p.
$$

The initial state satisfies them ($p \equiv 0 \cdot a$, $a \equiv 1 \cdot a$).

### The reduction goal

We reduce $\Phi$ to upper triangular form:

$$
\Phi_N \;=\; \begin{pmatrix} \pm 1 & a^{-1} \bmod p \\ 0 & \star \end{pmatrix}.
$$

Why this is the target: when $g = 0$, the kernel invariant gives $e a \equiv 0 \pmod p$,
hence (since $\gcd(a, p) = 1$) $p \mid e$, putting the bottom-right at a
multiple of $p$. Independently, $f$ at termination equals $\pm \gcd(p, a) = \pm 1$,
and the invariant collapses to $d a \equiv \pm 1 \pmod p$, giving
$a^{-1} \equiv \pm d \pmod p$. The sign is read off the top-left entry.

So **the BY algorithm is a reduction of $\Phi_0$ to upper triangular form, with
the inverse appearing as the top-right entry.**

---

## 2. The three generators $L_a, L_b, L_c$

The algorithm proceeds by repeated left multiplication: $\Phi \to L_n \Phi$,
choosing $L_n$ from a fixed set of three matrices:

$$
L_a \;=\; \begin{pmatrix} 1 & 0 \\ 0 & \tfrac{1}{2} \end{pmatrix}, \qquad
L_b \;=\; \begin{pmatrix} 1 & 0 \\ \tfrac{1}{2} & \tfrac{1}{2} \end{pmatrix}, \qquad
L_c \;=\; \begin{pmatrix} 0 & 1 \\ -\tfrac{1}{2} & \tfrac{1}{2} \end{pmatrix}.
$$

Each has $\det L_n = \tfrac{1}{2}$, so $L_n \in \mathrm{GL}_2(\mathbb{Z}[\tfrac{1}{2}])$
but not in $\mathrm{SL}_2$. They act on the rows of $\Phi$: equivalently, on
$(f, g)$ and on $(d, e)$ in lockstep.

### The choice rule (the divstep)

A small auxiliary integer $\delta$ is carried alongside $\Phi$, initialised at
$\delta_0 = 1$. At every step, the parity of $g$ together with the sign of
$\delta$ dictates which generator to apply:

| Condition | Generator | $\delta$ update |
| --- | --- | --- |
| $g$ even | $L_a$ | $\delta \leftarrow \delta + 1$ |
| $g$ odd, $\delta \le 0$ | $L_b$ | $\delta \leftarrow \delta + 1$ |
| $g$ odd, $\delta > 0$ | $L_c$ | $\delta \leftarrow 1 - \delta$ |

The convention $f$ odd is maintained throughout: $p$ is odd, the $L_n$ preserve
$f \bmod 2$, so $f$ stays odd until termination.

One application of this rule is one **divstep**. Each divstep multiplies $\det \Phi$
by $\tfrac{1}{2}$ (so after $N$ divsteps $\det \Phi_N = p / 2^N$) and shrinks
the magnitude of the lower-left entry $g$ on average.

### Why the case split makes sense

Unpacking $L_a, L_b, L_c$ as row operations on $(f, g)$:

- $L_a$: $g \leftarrow g/2$. Valid only when $g$ is even, otherwise the result is non-integer.
- $L_b$: $g \leftarrow (g + f)/2$. Used when $g$ is odd but $|g| \le |f|$ in spirit (tracked by $\delta \le 0$): adding $f$ first makes the sum even.
- $L_c$: $(f, g) \leftarrow (g, (g - f)/2)$. Swap-and-subtract; used when $g$ is odd and $|g| > |f|$ in spirit ($\delta > 0$).

The "in spirit" caveats are because BY tracks $|f|$ vs. $|g|$ comparisons via the
integer $\delta$ rather than by an actual size comparison — $\delta$ effectively
measures the running deficit "extra divisions of $g$ over extra divisions of $f$."

### Right-column $p$-shift

Left multiplication by $L_n$ alone would leave $\Phi$ with non-integer entries
in the right column (because $L_n$ has $\tfrac{1}{2}$ entries acting on
$(d, e)$). To keep $\Phi \in M_2(\mathbb{Z}_2)$ we add a multiple of $p$ to the
right column before halving — a *2-adic correction* that vanishes modulo $p$
and hence doesn't disturb the kernel invariant. The mechanics live in §6.

So one full divstep is:
$$
\Phi \;\longmapsto\; L_n \,\Phi \;+\; p \cdot \big(\text{adjustment in right column}\big), \qquad L_n \in \{L_a, L_b, L_c\}.
$$

The left column ($f, g$) updates via clean left multiplication; the right
column ($d, e$) updates via left multiplication plus a $p$-shift.

---

## 3. Why $g$ shrinks: convergence

After enough divsteps $g$ reaches $0$. There are two convergence bounds in
common use:

$$
N_{\mathrm{BY}}(b)      \;=\; \left\lceil \frac{49\,b + 80}{17} \right\rceil
\qquad \text{(Bernstein–Yang 2019, original)}.
$$

$$
N_{\mathrm{Pornin}}(b)  \;=\; \left\lceil \frac{49\,(b + 1)}{17} \right\rceil
\qquad \text{(Pornin 2020, tighter, variable-time variant)}.
$$

For $b = 254$ (BN254 scalar field):
- $N_{\mathrm{BY}}(254) = \lceil 12526 / 17 \rceil = \lceil 736.82\ldots \rceil = 737$.
- $N_{\mathrm{Pornin}}(254) = \lceil 12495 / 17 \rceil = 735$ (exactly: $17 \cdot 735 = 12495$).

The implementation cites the Pornin bound of $735$ in the comment around
`NUM_ITERATIONS`. The looser BY-2019 bound of $737$ is also covered.

Intuitively each $L_n$ halves *one of* $|f|, |g|$ (with a possible swap), so on
average $\max(|f|, |g|)$ shrinks by about $1 / 1.7 \approx 0.588$ bits per
step. The proof is a careful potential argument tracking the maximum of two
log-magnitudes against $\delta$; we treat it as a black box here.

---

## 4. Batching: products of $L_n$ as a $2 \times 2$ matrix

A single divstep touches only the lowest bit of $g$ (to read parity) and is a
linear combination of $(f, g)$. So the next $\mathrm{BATCH}$ divsteps depend
only on the low $\mathrm{BATCH}$ bits of $(f, g)$ — the high bits don't
influence the choice between $L_a, L_b, L_c$ within those steps.

Let $\mathrm{BATCH} = 62$ (the implementation's choice on native; $31$ on
wasm). Run $\mathrm{BATCH}$ divsteps purely on the low $64$ bits of $(f, g)$,
accumulating the result as a single $2 \times 2$ rational matrix

$$
M \;=\; L_{n_{\mathrm{BATCH}-1}} \cdots L_{n_1} L_{n_0} \;=\; \begin{pmatrix} u & v \\ q & r \end{pmatrix} \cdot 2^{-\mathrm{BATCH}}.
$$

After clearing the implicit denominator, the *integer* part $\begin{pmatrix} u & v \\ q & r \end{pmatrix} = 2^{\mathrm{BATCH}} M$ has all four entries bounded by $|u|, |v|, |q|, |r| \le 2^{\mathrm{BATCH}}$ (each individual $L_n$ at most doubles one entry of the running product). With $\mathrm{BATCH} = 62$, the four entries fit in `int64_t`.

**Termination of the batched loop.** Running
$12 = \lceil 735 / 62 \rceil$ outer iterations $\times\; 62$ divsteps gives
$744$ total divsteps, which exceeds both the Pornin bound ($735$) and the
looser BY-2019 bound ($737$). The implementation's `NUM_ITERATIONS = 12`.

---

## 5. Applying $M$ to the left column $(f, g)$

The new $(f', g')^T = M \cdot (f, g)^T$ is computed as

1. The two integer linear combinations
   $$t_f = u \cdot f + v \cdot g, \qquad t_g = q \cdot f + r \cdot g$$
   in full precision. With $|u|, \ldots, |r| \le 2^{62}$ and $|f|, |g|$
   fitting in $256$ bits (see §7), each product fits in $318$ bits and the
   sum in $319$ bits.
2. Arithmetic-right-shift by $\mathrm{BATCH}$ bits:
   $$f' \;=\; t_f \gg \mathrm{BATCH}, \qquad g' \;=\; t_g \gg \mathrm{BATCH}.$$

The shift is exact: the low $\mathrm{BATCH}$ bits of $t_f$ and $t_g$ are zero
by construction. Each divstep makes one bit of $g$ cancel, and after
$\mathrm{BATCH}$ divsteps the bottom $\mathrm{BATCH}$ bits of the linear
combinations are guaranteed zero — this is the "exact integer division"
property of the divstep cascade.

In the implementation this lives in `NativeMatrix::linear_combo` (the
products) and `NativeMatrix::arsh62` (the right shift).

---

## 6. Applying $M$ to the right column $(d, e)$: the 2-adic correction

Applying $M$ to $(d, e)$ presents the same divisibility question, but now the
state lives modulo $p$. The integer linear combination $t = u \cdot d + v \cdot e$
is **not** generally divisible by $2^{\mathrm{BATCH}}$. We need an integer
correction $k$ such that $t + k \cdot p$ is divisible by $2^{\mathrm{BATCH}}$,
then take the quotient.

This is a 2-adic problem:

$$
t + k\cdot p \;\equiv\; 0 \pmod{2^{\mathrm{BATCH}}}
\;\Longleftrightarrow\;
k \;\equiv\; -\, t \cdot p^{-1} \pmod{2^{\mathrm{BATCH}}}.
$$

$p$ is odd, so $p^{-1} \bmod 2^{\mathrm{BATCH}}$ exists. The implementation
precomputes it once: $p^{-1} \bmod 2^{\mathrm{BATCH}}$ is the low
$\mathrm{BATCH}$ bits of $-r_{\mathrm{inv}}$, where $r_{\mathrm{inv}}$ is
barretenberg's Montgomery constant $-p^{-1} \bmod 2^{64}$.

The correction step:

$$
\begin{aligned}
t  &\;=\; u \cdot d + v \cdot e, \\
k  &\;\equiv\; -\, t \cdot p^{-1} \pmod{2^{\mathrm{BATCH}}}, \\
d' &\;=\; (t + k \cdot p) \gg \mathrm{BATCH}.
\end{aligned}
$$

After the shift, $d'$ is an integer (because $t + k \cdot p$ is divisible by
$2^{\mathrm{BATCH}}$). The added $k \cdot p$ contributes only a multiple of $p$
to the right column, so the kernel invariant $\Phi \binom{1}{-a} \equiv 0 \pmod p$
is preserved.

The same construction applied with $(q, r)$ and the second row of $M$ gives
the new $e'$. This is `apply_de` in the implementation.

---

## 7. State bounds: why 5 limbs

The left column $(f, g)$ holds values that grow temporarily large during the
matrix multiplication of §5 — to $318$ bits — then shrink back to $\sim 256$
bits after the right shift. So $f, g$ only need $256$-bit storage as the
*resting* state.

The right column $(d, e)$ is different. The 2-adic correction $+\, k \cdot p$
grows them by roughly an additive $p$ per matrix application. Without periodic
reduction modulo $p$, $|d|, |e|$ grow by a factor of $2 + O(1)$ per iteration.
To keep them in bounded storage, the implementation reduces them to canonical
form $[0, p)$ every $\mathrm{REDUCE\_INTERVAL} = 4$ iterations:

- Between reductions, $|d|, |e| \le 2^{4} \cdot p \approx 16 p \approx 2^{258}$.
- $5$ signed $64$-bit limbs hold up to $\sim 2^{319}$ of headroom.

So $5$ limbs $\approx 320$ bits give comfortable margin.

`Native5x64::reduce_to_canonical(p)` does the reduction by repeated conditional
add/sub of $p$, looping up to $36$ times to absorb the maximum $\sim 32 p$ of
headroom that $\mathrm{REDUCE\_INTERVAL} = 4$ can produce.

---

## 8. Final answer extraction

After the iteration loop:

- $g = 0$ (the convergence bound guarantees this within $\mathrm{NUM\_ITERATIONS}$ outer iterations).
- $f = \pm \gcd(p, a) = \pm 1$.
- Kernel invariant: $d \cdot a \equiv f \pmod{p}$, so $d \equiv \pm a^{-1} \pmod p$.

Reduce $d$ to canonical form $[0, p)$. Then

$$
a^{-1} \bmod p \;=\;
\begin{cases}
d & \text{if } f > 0, \\
{-d} \bmod p & \text{if } f < 0.
\end{cases}
$$

In code, this is the
`if (f.is_negative()) { d.neg(); d.reduce_to_canonical(P); }` at the end of
`invert_bernsteinyang19`.

---

## 9. Structural framing: Bruhat, Bruhat–Tits, classical comparison

The story above is BY as an algorithm. The same content also has a clean
algebraic restatement that places it inside the standard $p$-adic group theory.

### 9.1 The generators as Bruhat building blocks

The three $L_n$ factor into the standard generating set of $\mathrm{GL}_2$ —
elementary unipotents, the Weyl element, and a torus element:

$$
L_a = \underbrace{\begin{pmatrix} 1 & 0 \\ 0 & \tfrac{1}{2} \end{pmatrix}}_{\tau\ =\ \mathrm{diag}(1,\,1/2)},
$$
$$
L_b = \underbrace{\begin{pmatrix} 1 & 0 \\ 1 & 1 \end{pmatrix}}_{E_{21}(1)} \cdot \tau,
$$
$$
L_c = \underbrace{\begin{pmatrix} 0 & 1 \\ -1 & 0 \end{pmatrix}}_{w\ \text{(Weyl)}} \cdot \underbrace{\begin{pmatrix} 1 & 0 \\ -1 & 1 \end{pmatrix}}_{E_{21}(-1)} \cdot \tau.
$$

So the BY generating set is exactly the toolkit of the **Bruhat / Iwasawa
decomposition** of $\mathrm{GL}_2(\mathbb{Q}_2)$: every element factors as
$g = n \cdot t \cdot k$ with $n$ upper triangular unipotent, $t$ in the
diagonal torus $T$, and $k$ in the maximal compact $K_0 = \mathrm{GL}_2(\mathbb{Z}_2)$.
The torus element $\tau = \mathrm{diag}(1, \tfrac{1}{2})$ differs from a
canonical $\mathrm{SL}_2$-torus element $\mathrm{diag}(x, x^{-1})$ only by a
$\det^{-1/2}$ rescaling out of the $\mathrm{SL}_2$ center; on $\mathrm{PGL}_2$
they coincide.

### 9.2 BY as constructive Bruhat decomposition

The reduction of §1–§8 then reads: starting from
$$\Phi_0 = \begin{pmatrix} p & 0 \\ a & 1 \end{pmatrix},$$
left-multiply by a *bounded-length word* in $\{E_{21}(\pm 1),\, w,\, \tau\}$
(plus right-column $p$-shifts) to reach the form
$$\Phi_N = \begin{pmatrix} \pm 1 & a^{-1} \bmod p \\ 0 & \star \end{pmatrix} \;\in\; N \cdot K_0.$$

This is **a constructive Bruhat decomposition of $\Phi_0$**, with the divstep
generators playing the role of elementary row operations and the $+k p$ shifts
handling the $\mathbb{Z}_2$-integrality.

### 9.3 Determinant tracking, the Bruhat–Tits tree, and the cheap-vs-rich trade-off

Ignoring the $+kp$ correction (which only adds a multiple of $p$ to $\det$):

$$\det \Phi_N \;=\; \Big(\prod_{n=0}^{N-1} \det L_n\Big) \cdot \det \Phi_0 \;=\; \frac{p}{2^N}.$$

So $\det \Phi$ has $p$-adic valuation $1$ throughout — $\Phi \bmod p$ is always
rank-$1$ — while its $2$-adic valuation slides from $0$ down to $-N$.

The natural ambient group is

$$G \;=\; \{\, M \in \mathrm{GL}_2(\mathbb{Q}_2) \;:\; \det M \in 2^{\mathbb{Z}} \,\},$$

mapping to $\mathbb{Z}$ via $M \mapsto \operatorname{val}_2(\det M)$.
Quotienting by scalar matrices and sign gives $\mathrm{PGL}_2(\mathbb{Q}_2)$,
whose **Bruhat–Tits tree** is the regular tree of valence $3$. The divstep
walk is a deterministic walk on this tree, with the three generators
$L_a, L_b, L_c$ corresponding to the three outgoing edges from each vertex.

**Why $N$ is linear in $b$, not bounded.** Note that $|\det \Phi_0|_2 = |p|_2 = 1$
since $p$ is odd, so $\Phi_0 \in \mathrm{GL}_2(\mathbb{Z}_2)$, the maximal
compact subgroup. By bounded-generation results over local rings (Klingenberg,
Vaserstein) $\Phi_0$ admits a factorisation into $O(1)$ — small uniform
constant — elementary matrices *over $\mathbb{Z}_2$*. **A uniform-constant
bound exists.** But the parameters of those elementary matrices are arbitrary
$2$-adic integers, each $b$ bits of data, whose computation is itself
inversion-equivalent. The $L_n$ are restricted in compensation: only three
matrices, $\det = \tfrac{1}{2}$ each, no $\mathbb{Z}_2$-parameter. The price is
that they can only move $\operatorname{val}_2(\det \Phi)$ by $-1$ per step, so
reducing $\Phi$ to canonical position takes $\Theta(b)$ steps. The cost
balance:

| Generating set | $|\text{generators}|$ | Word-length to reduce $\Phi_0$ | Per-generator bit cost |
| --- | --- | --- | --- |
| $\{E_{12}(x), E_{21}(y) : x, y \in \mathbb{Z}_2\}$ | $\infty$ (parameterised) | $O(1)$ uniform | $\Theta(b)$ |
| $\{L_a, L_b, L_c\}$ (BY) | $3$ (finite) | $\Theta(b)$ | $O(1)$ |

Total bit complexity is $\Theta(b)$ in both — that's the floor for modular
inversion. What BY does is push *all* the complexity into the step count and
none into the step cost. The BT-tree picture is the geometry that makes this
trade-off precise: the deterministic walk on a regular trivalent tree with
$O(1)$-bit choices at each vertex.

### 9.4 What BY adds beyond the existence statement

Bounded-length factorisations in $p$-adic linear groups are classical:

| Setting | Bound | Reference |
| --- | --- | --- |
| $\mathrm{SL}_2(\mathbb{Z})$ | unbounded | classical |
| $\mathrm{SL}_2(\mathbb{Z}[1/p])$ | $\le 5$ elementaries | Vsemirnov |
| $\mathrm{SL}_2(\mathcal{O}_S)$, $|\mathcal{O}_S^\times| = \infty$ | $\le 9$ elementaries | Morgan–Rapinchuk–Sury 2017 |
| $\mathrm{SL}_2$ over local rings | small constant | Klingenberg 1961, Vaserstein |
| $\mathrm{GL}_2(\mathbb{Q}_p)$ Bruhat | $\le 2\,|\operatorname{val}_p(\det)| + O(1)$ in affine Weyl length | Iwahori–Matsumoto 1965 |

These are all existence statements: the factorisation exists, with the stated
bound. Constructive realisation (finding the factorisation, given the input)
typically requires Dirichlet-style unit-finding or other non-trivial
subroutines, with per-step cost not pinned down.

What BY adds is everything that turns the existence statement into an
algorithm:

| Property | Generic Bruhat over $\mathbb{Q}_2$ | Bernstein–Yang |
| --- | --- | --- |
| Choice of next generator | Existential | **Deterministic** ($\delta$ + parity rule, no search) |
| State representation | Allowed in $\mathbb{Q}_2$ | **Pinned to $M_2(\mathbb{Z}_2)$** throughout via $+k\,p$ correction |
| Starting matrix | Arbitrary $g \in \mathrm{GL}_2(\mathbb{Q}_2)$ | Specific family $\Phi_0(a, p) = \begin{pmatrix} p & 0 \\ a & 1 \end{pmatrix}$ |
| Word-length constant | Existential / asymptotic | **Explicit**: $\lceil 49(b+1)/17 \rceil$, with $b = \lceil \log_2 \max(p, a) \rceil$ |
| Per-step cost | Existence, not computation | Constant work per step (parity check + add/shift) |

So BY = **"a deterministic, $\mathbb{Z}_2$-integral, constructive realisation
of Bruhat decomposition for the specific matrix family $\Phi_0(a, p)$ with an
explicit linear word-length constant."** Each of those qualifiers is needed —
removing any one drops BY back to a classical existence statement.

### 9.5 Comparison to the classical $\mathrm{SL}_2(\mathbb{Z})$ story

The Euclidean algorithm reduces any coprime $\binom{f}{g} \in \mathbb{Z}^2$ to
$\binom{\pm 1}{0}$ by left multiplication from $\mathrm{SL}_2(\mathbb{Z})$,
using the *parameterised* family of matrices
$E_q = \begin{pmatrix} 0 & 1 \\ 1 & -q \end{pmatrix}$ for varying
$q \in \mathbb{Z}$. BY replaces this:

| | Euclidean / $\mathrm{SL}_2(\mathbb{Z})$ | Bernstein–Yang |
| --- | --- | --- |
| Generators | $\{E_q : q \in \mathbb{Z}_{\ge 1}\}$ (parameterised, infinite) | $\{L_a, L_b, L_c\}$ (fixed, finite) |
| $\det$ per step | $-1$ | $\tfrac{1}{2}$ |
| Ambient group | $\mathrm{GL}_2(\mathbb{Z})$ | $\mathrm{GL}_2(\mathbb{Z}[\tfrac{1}{2}])$ |
| Word-length bound | $O(\log)$, no explicit constant | $\lceil 49(b+1)/17 \rceil$, explicit |
| Target form | $\binom{\pm 1}{0}$ | upper triangular with $a^{-1}$ in position $(1, 2)$ |
| Per-step branching | data-dependent quotient $q$ | $\delta$- and parity-driven choice from $3$ generators |

The finite generating set is what makes Pornin's batching (§4) work: the next
$\mathrm{BATCH}$ choices depend only on the low $\mathrm{BATCH}$ bits of
$(f, g)$ together with $\delta$, so a single $u64$ register per pair plus a
few bytes of state is enough to simulate them.

---

## 10. Cost summary

For a $254$-bit prime modulus with $\mathrm{BATCH} = 62$:

| Quantity | Value |
| --- | --- |
| Divsteps per inversion (worst case) | $735$ |
| Batched divsteps in one matrix | $62$ |
| Outer iterations (matrix applications) | $12$ |
| Multi-limb multiplications per inversion | $\sim 50$ (matrix × state) |
| Modular multiplications per inversion | $1$ (final Montgomery housekeeping, outside this file) |
| Limb add/sub operations per inversion | $\sim 750$ |
| Branches | data-dependent inside `divsteps`, none outside |

The cost is dominated by the matrix-times-state products (`linear_combo`,
$\sim 50$ of them, each is $4$–$5$ multi-limb signed multiplies). Compared to
Fermat's $a^{p-2}$ at $\sim 317$ modular multiplications, BY trades expensive
modular arithmetic for cheap limb arithmetic.

---

## 11. Correctness summary in one paragraph

We track the matrix $\Phi = \begin{pmatrix} f & d \\ g & e \end{pmatrix}$ with
the kernel invariant $\Phi \binom{1}{-a} \equiv 0 \pmod p$, starting from
$\Phi_0 = \begin{pmatrix} p & 0 \\ a & 1 \end{pmatrix}$. Each divstep is left
multiplication by one of $L_a, L_b, L_c \in \mathrm{GL}_2(\mathbb{Z}[\tfrac{1}{2}])$
(plus a right-column $p$-shift to keep $\Phi$ in $M_2(\mathbb{Z}_2)$),
selected by the parity of $g$ and the sign of $\delta$, and monotonically
shrinks $|g|$. We batch $\mathrm{BATCH}$ divsteps into a single rational
$2 \times 2$ matrix $M$, then apply $M$ to the full-precision state with an
exact $/2^{\mathrm{BATCH}}$ (left column) or with a 2-adic correction
$+\, k \cdot p$ (right column). After $\le \lceil 49(b+1)/17 \rceil$ divsteps,
$g = 0$, $f = \pm \gcd(p, a) = \pm 1$, and the kernel invariant collapses to
$d \cdot a \equiv \pm 1 \pmod p$, so $a^{-1} \equiv \pm d \pmod p$ with the
sign read from $f$.
