# Bernstein–Yang modular inverse: the algorithm

A description of the modular inverse algorithm implemented in `bernstein_yang_inverse.hpp`.

Throughout, $p$ is an **odd prime**, $0 < a < p$, and we want
$$a^{-1} \bmod p.$$

All quantities are integers; reductions modulo $p$ are made explicit when used.

---

## 1. Setup

We track a $2 \times 2$ integer matrix

$$
\Phi \;=\; \begin{pmatrix} f & d \\ g & e \end{pmatrix}
$$

initialised at

$$
\Phi_0 \;=\; \begin{pmatrix} p & 0 \\ a & 1 \end{pmatrix}, \qquad \det \Phi_0 \;=\; p.
$$

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

When $g = 0$, the kernel invariant gives $e a \equiv 0 \pmod p$,
hence (since $\gcd(a, p) = 1$) $p \mid e$, putting the bottom-right at a
multiple of $p$. Independently, $f$ at termination equals $\pm \gcd(p, a) = \pm 1$,
and the invariant collapses to $d a \equiv \pm 1 \pmod p$, giving
$a^{-1} \equiv \pm d \pmod p$. The sign is read off the top-left entry.

So **the BY algorithm is a reduction of $\Phi_0$ to upper triangular form, with
the inverse appearing as the top-right entry.**

---

## 2. The generators $L_a, L_b, L_c$

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

### Divstep

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
$(d, e)$). To keep the state integer-valued we add a multiple of $p$ to the
right column before halving — a *2-adic correction* that vanishes modulo $p$
and hence doesn't disturb the kernel invariant. The mechanics live in §6.

So one full divstep is:
$$
\Phi \;\longmapsto\; L_n \,\Phi \;+\; p \cdot \big(\text{adjustment in right column}\big), \qquad L_n \in \{L_a, L_b, L_c\}.
$$

The left column ($f, g$) updates via clean left multiplication; the right
column ($d, e$) updates via left multiplication plus a $p$-shift.

---

## 3. Convergence

The Bernstein--Yang/Pornin convergence proof guarantees $g = 0$ within 735 divsteps for 254-bit inputs; native runs $12 \cdot 62 = 744$ divsteps and wasm runs $13 \cdot 58 = 754$, so both cover the bound.

---

## 4. Batching: products of $L_n$ as a $2 \times 2$ matrix

A single divstep touches only the lowest bit of $g$ (to read parity) and is a
linear combination of $(f, g)$. So the next $\mathrm{BATCH}$ divsteps depend
only on the low $\mathrm{BATCH}$ bits of $(f, g)$ — the high bits do not
influence the choice between $L_a, L_b, L_c$ within those steps.

Let $\mathrm{BATCH} = 62$ (the implementation choice on native; $58$ on wasm).
Run $\mathrm{BATCH}$ divsteps purely on the low $64$ bits of $(f, g)$,
accumulating the result as a single $2 \times 2$ rational matrix

$$
M \;=\; L_{n_{\mathrm{BATCH}-1}} \cdots L_{n_1} L_{n_0} \;=\; \begin{pmatrix} u & v \\ q & r \end{pmatrix} \cdot 2^{-\mathrm{BATCH}}.
$$

After clearing the implicit denominator, the *integer* part $\begin{pmatrix} u & v \\ q & r \end{pmatrix} = 2^{\mathrm{BATCH}} M$ has all four entries bounded by $|u|, |v|, |q|, |r| \le 2^{\mathrm{BATCH}}$ (each individual $L_n$ at most doubles one entry of the running product). With $\mathrm{BATCH} = 62$, the four entries fit in `int64_t`.

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

In the implementation this lives in `NativeMatrix::signed_linear_combination` (the
products) and `NativeMatrix::arithmetic_shift_by_batch` (the right shift).

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
the new $e'$. This is `apply_corrected_row` in the implementation.

---

## 7. State bounds: why 5 limbs

`Native5x64` stores each state value in five signed 64-bit limbs. Four limbs
would be enough for canonical field elements, but the BY state is not always
canonical while a batched matrix is being applied.

For the left column, $f$ and $g$ are roughly 256-bit values between matrix
applications. During §5, however, the products $u f$, $v g$, $q f$, and $r g$
can be as large as $2^{62} \cdot 2^{256}$, and their sums need about 319 bits.
Those sums are held in the temporary six-limb arrays inside
`NativeMatrix::signed_linear_combination`; after the exact right shift by
`BATCH`, $f$ and $g$ return to the normal state size.

For the right column, $d$ and $e$ need extra resting headroom too. The 2-adic
correction adds $k \cdot p$ before the shift, and repeated matrix applications
can move   00,p)1 The implementation therefore reduces them
to canonical form every `REDUCE_INTERVAL = 4` iterations rather than after every
matrix application.

Between reductions, $|d|$ and $|e|$ are bounded by roughly $32p$. Five signed
64-bit limbs provide about 319 bits of magnitude, enough room for that growth.
`Native5x64::reduce_to_canonical(p)` then repeatedly adds or subtracts $p$,
with a loop bound of 36 to cover the same worst-case headroom.

---

## 8. Final answer extraction

After the iteration loop:

- $g = 0$.
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
`invert_vartime`.

---

## 9. Math-to-code map

The implementation keeps the same mathematical state but hides the limb details
behind `Native5x64` and `Wasm9x29`.

| Math description | Code |
| --- | --- |
| $\Phi = \begin{pmatrix} f & d \\ g & e \end{pmatrix}$ | `S P(p), f = P, g(a), d, e = S::one()` in `invert_vartime` |
| Auxiliary divstep counter $\delta$ | local `i64 delta` |
| Product of one batch of divsteps | `S::compute_divstep_matrix(delta, f.low_64(), g.low_64())` |
| $M = \begin{pmatrix} u & v \\ q & r \end{pmatrix} 2^{-B}$ | `DivstepMatrix { u, v, q, r }`; the denominator is the implicit `2^BATCH` |
| $M(f,g)/2^B$ | `apply_divstep_matrix`, using `NativeMatrix::signed_linear_combination` and `arithmetic_shift_by_batch` on native |
| $k \equiv -t p^{-1} \pmod {2^B}$ | `apply_corrected_row` on native; streamed as `k_d`, `k_e` on wasm |
| $p^{-1} \bmod 2^B$ from Montgomery metadata | `p_inv_mod_2k_from_montgomery_r_inv` |
| Periodic reduction of $d,e$ modulo $p$ | `reduce_to_canonical(P)` every `REDUCE_INTERVAL` iterations |
| Final sign correction $a^{-1} = \pm d$ | final `if (f.is_negative()) { d.neg(); ... }` |
| Platform-specific limb representation | `using State = Native5x64` or `Wasm9x29` |

---

## 10. Example

This example uses the same batched mechanics as the implementation, but with a toy $B = 3$ instead of native $B = 62$.

Let

$$
p = 17, \qquad a = 3, \qquad
\Phi_0 = \begin{pmatrix} f & d \\ g & e \end{pmatrix}
       = \begin{pmatrix} 17 & 0 \\ 3 & 1 \end{pmatrix}, \qquad
\delta_0 = 1.
$$

Since $17 \equiv 1 \pmod 8$, we have $p^{-1} \equiv 1 \pmod 8$. For each row
of the right column, the correction is

$$
k \equiv -t \cdot p^{-1} \pmod 8,
\qquad
x^\prime = (t + k p) / 8.
$$

### Batch 0

The first three divsteps are $L_c, L_b, L_a$. Their product is

$$
M_0 = \begin{pmatrix} 0 & 8 \\ -1 & 3 \end{pmatrix} \cdot 2^{-3}.
$$

Apply it to the left column:

$$
f^\prime = \frac{0 \cdot 17 + 8 \cdot 3}{8} = 3,
\qquad
g^\prime = \frac{-1 \cdot 17 + 3 \cdot 3}{8} = -1.
$$

Apply it to the right column. For $d^\prime$, $t = 0 \cdot 0 + 8 \cdot 1 = 8$,
so $k = 0$ and $d^\prime = 1$. For $e^\prime$, $t = -1 \cdot 0 + 3 \cdot 1 = 3$,
so $k \equiv -3 \equiv 5 \pmod 8$ and

$$
e^\prime = \frac{3 + 5 \cdot 17}{8} = 11.
$$

After batch 0,

$$
(f,g,d,e;\delta) = (3,-1,1,11;2).
$$

### Batch 1

The next three divsteps are $L_c, L_a, L_b$, giving

$$
M_1 = \begin{pmatrix} 0 & 8 \\ -1 & 5 \end{pmatrix} \cdot 2^{-3}.
$$

For the left column,

$$
f^\prime = \frac{0 \cdot 3 + 8 \cdot (-1)}{8} = -1,
\qquad
g^\prime = \frac{-1 \cdot 3 + 5 \cdot (-1)}{8} = -1.
$$

For the right column, the first row gives $t = 88$ and $k = 0$, hence
$d^\prime = 11$. The second row gives $t = -1 \cdot 1 + 5 \cdot 11 = 54$,
so $k \equiv -54 \equiv 2 \pmod 8$ and

$$
e^\prime = \frac{54 + 2 \cdot 17}{8} = 11.
$$

After batch 1,

$$
(f,g,d,e;\delta) = (-1,-1,11,11;1).
$$

### Batch 2

The next batch starts with the terminating divstep $L_c$; the remaining two
low-bit divsteps keep $g = 0$. The accumulated matrix is

$$
M_2 = \begin{pmatrix} 0 & 8 \\ -1 & 1 \end{pmatrix} \cdot 2^{-3}.
$$

Applying it gives

$$
f^\prime = \frac{0 \cdot (-1) + 8 \cdot (-1)}{8} = -1,
\qquad
g^\prime = \frac{-1 \cdot (-1) + 1 \cdot (-1)}{8} = 0,
$$

and for the right column, $d^\prime = 11$ and $e^\prime = 0$.

Now $g=0$. Since $f=-1$, the inverse is $-d \bmod p$:

$$
a^{-1} \equiv -11 \equiv 6 \pmod {17},
\qquad
3 \cdot 6 \equiv 1 \pmod {17}.
$$
