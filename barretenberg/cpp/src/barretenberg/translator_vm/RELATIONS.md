# Translator Relations

The primary relation is the **Non-Native Field Relation**, which verifies that certain accumulations hold in a non-native field (the BN254 base field $\mathbb{F}_q$) while operating in the native field (the BN254 scalar field $\mathbb{F}_r$).

Since we follow a two-row trace structure, some relations are only active on even rows, while others are only active on odd rows. Below is a summary of the relations and their activation patterns.

| Constraint                       | Relation class (`relations/translator_vm/`)  | Subrelations | Active on even rows | Active on odd rows |
| -------------------------------- | -------------------------------------------- | ------------ | ------------------- | ------------------ |
| Non-Native Field Relation        | `TranslatorNonNativeFieldRelation`           | 3            | ✓                   | ✗                  |
| Decomposition Relation           | `TranslatorDecompositionRelation`            | 48           | ✓                   | ✓                  |
| Permutation Relation             | `TranslatorPermutationRelation`              | 3            | full circuit        | full circuit       |
| Delta Range Constraint           | `TranslatorDeltaRangeConstraintRelation`     | 10           | full circuit        | full circuit       |
| Opcode Constraint Relation       | `TranslatorOpcodeConstraintRelation`         | 5            | ✓                   | ✓                  |
| Accumulator Transfer Relation    | `TranslatorAccumulatorTransferRelation`      | 12           | result row only     | propagation; last row of the mini-circuit |
| Zero Constraints Relation        | `TranslatorZeroConstraintsRelation`          | 68           | ✓                   | ✓                  |
| Shiftable First-Coefficient Zero | `TranslatorShiftableFirstCoeffZeroRelation`  | 5            | first row only      | first row only     |

Counts equal the length of each class's `SUBRELATION_PARTIAL_LENGTHS`. The permutation and delta range relations act on the full (concatenated) circuit, not on mini-circuit row parity. Subrelation numbers in this file are the code's 0-based `std::get<i>` indices.

Every relation has a `*ShortRelation` twin (`relations/translator_vm/*_short_relation.hpp`) used by `TranslatorShortMonomialFlavor`, whose user is `chonk/batched_honk_translator/batched_honk_translator_prover.{hpp,cpp}`. The two must stay identical; `ShortMonomialRelationsMatchFullEdgeRelations` in `translator_vm/translator.test.cpp` checks this.

Lagrange selectors for activation:

- $L_{\text{even}}$: Equals 1 on even rows of the real op range $[8, 8188)$; 0 elsewhere (including random-op and masking rows)
- $L_{\text{odd}}$: Equals 1 on odd rows of the real op range $[8, 8188)$; 0 elsewhere (including random-op and masking rows)
- $L_{\text{last in minicircuit}}$: Equals 1 at the last row before masking in the mini-circuit, 0 elsewhere

## Table of Contents

1. [Limb Decomposition Structure](#limb-decomposition-structure)
2. [Non-Native Field Relations](#non-native-field-relations)
3. [Decomposition Relation](#decomposition-relation)
4. [Permutation Relation](#permutation-relation)
5. [Delta Range Constraint Relation](#delta-range-constraint-relation)
6. [Extra Relations](#extra-relations)
   - (a) [Opcode Constraint Relation](#opcode-constraint-relation)
     - [Subrelations 1-4: accumulator unchanged on no-op](#subrelations-1-4-accumulator-unchanged-on-no-op)
   - (b) [Accumulator Transfer Relation](#accumulator-transfer-relation)
   - (c) [Zero Constraints Relation](#zero-constraints-relation)
   - (d) [Shiftable First-Coefficient Zero Relation](#shiftable-first-coefficient-zero-relation)

---

## Limb Decomposition Structure

This table establishes all notation used in the relations:

| Value                           | Description          | Binary Limbs                                                                 | Native $\mathbb{F}_r$ |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------- | --------------------- |
| **Evaluation challenge**        |
| $x$                             | Evaluation point     | $x_0, x_1, x_2, x_3$                                                         | $x_4$                 |
| **Batching challenges**         |
| $v$                             | Batching challenge   | $v_0, v_1, v_2, v_3$                                                         | $v_4$                 |
| $v^2$                           | v squared            | $(v^2)_0, (v^2)_1, (v^2)_2, (v^2)_3$                                         | $(v^2)_4$             |
| $v^3$                           | v cubed              | $(v^3)_0, (v^3)_1, (v^3)_2, (v^3)_3$                                         | $(v^3)_4$             |
| $v^4$                           | v to fourth          | $(v^4)_0, (v^4)_1, (v^4)_2, (v^4)_3$                                         | $(v^4)_4$             |
| **Point coordinates (witness)** |
| $P_x$                           | Point x-coordinate   | $P_{x,0}, P_{x,1}, P_{x,2}, P_{x,3}$                                         | (reconstructed)       |
| $P_y$                           | Point y-coordinate   | $P_{y,0}, P_{y,1}, P_{y,2}, P_{y,3}$                                         | (reconstructed)       |
| **Z-values (witness, 128-bit)** |
| $z_1$                           | 128-bit value        | $z_{1,0}, z_{1,1}$ (only 2 limbs)                                            | (reconstructed)       |
| $z_2$                           | 128-bit value        | $z_{2,0}, z_{2,1}$ (only 2 limbs)                                            | (reconstructed)       |
| **Accumulator (witness)**       |
| $a^{\text{prev}}$               | Previous accumulator | $a_0^{\text{prev}}, a_1^{\text{prev}}, a_2^{\text{prev}}, a_3^{\text{prev}}$ | (reconstructed)       |
| $a^{\text{curr}}$               | Current accumulator  | $a_0^{\text{curr}}, a_1^{\text{curr}}, a_2^{\text{curr}}, a_3^{\text{curr}}$ | (reconstructed)       |
| **Quotient (witness)**          |
| $\mathcal{Q}$                   | Division quotient    | $q_0, q_1, q_2, q_3$                                                         | (reconstructed)       |
| **Negative $q$ constant**       |
| $\bar{q}$                       | $-q \pmod{2^{272}}$  | $\bar{q}_0, \bar{q}_1, \bar{q}_2, \bar{q}_3$                                 | $\bar{q}_4$           |
| **Carries (witness)**           |
| $c^{\text{lo}}$                 | Lower carry          | (single 84-bit value)                                                        | -                     |
| $c^{\text{hi}}$                 | Higher carry         | (single 84-bit value)                                                        | -                     |
| **Opcode (witness, small)**     |
| $\texttt{op}$                   | Operation code       | (no decomposition, ≤ 8)                                                      | $\texttt{op}$         |

#### Reconstruction Formula (General)

For a 254-bit value decomposed as $\ell_0, \ell_1, \ell_2, \ell_3$:

$$\boxed{\text{Value} = \ell_0 + 2^{68} \cdot \ell_1 + 2^{136} \cdot \ell_2 + 2^{204} \cdot \ell_3}$$

$z_1$ and $z_2$ use two limbs: $z = z_0 + 2^{68} \cdot z_1$.

## Non-Native Field Relations

We want to prove the following accumulation identity holds in $\mathbb{F}_q$:

$$\boxed{a^{\text{curr}} = a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 \pmod{q}}$$

We can only perform arithmetic in $\mathbb{F}_r$, but we need to prove correctness in $\mathbb{F}_q$ (the base field).
To do this, we rewrite the above equation as an integer equation with quotient $\mathcal{Q}$:

$$a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \mathcal{Q} \cdot q - a^{\text{curr}} = 0 \quad (\text{in integers})$$

If this equation holds:

1. Modulo $2^{272}$ (via limb arithmetic in $\mathbb{F}_r$), and
2. Modulo $r$ (native $\mathbb{F}_r$ computation), and
3. All values are properly range-constrained (254 bits for $a^{\text{prev}}, P_x, P_y$; 128 bits for $z_1, z_2$; 256 bits for $\mathcal{Q}$)

then it must hold in integers. This is because the Chinese Remainder Theorem guarantees that if an equation holds modulo two coprime moduli whose product exceeds the maximum possible value of the equation, then it holds over the integers.
Since $a^{\text{prev}}, P_x, P_y$ are range-constrained to 254 bits, $z_1, z_2$ to 128 bits, the challenges are less than $q$, and $\mathcal{Q} < 2^{256}$ (see [the quotient bound](#quotient-bound)), we have:

$$
\begin{aligned}
\textsf{max}(a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4) &< 5q^2 < 5 \cdot (2^{254})^2 < 2^{511}
\\
\textsf{max}(\mathcal{Q} \cdot q) &< 2^{256} \cdot q < 2^{510}
\end{aligned}
$$

Therefore, the maximum possible value of the left-hand side is less than $2^{511}$, while the moduli product is $2^{272} \cdot r > 2^{525} > 2^{511}$.
See [bigfield documentation](../stdlib/primitives/bigfield/README.md) for more details on non-native field arithmetic.

The non-native field relation is enforced through three separate subrelations:

| Subrelation | Purpose                    | Modulus   | Limbs checked                              |
| ----------- | -------------------------- | --------- | ------------------------------------------ |
| 0           | Lower mod $2^{272}$ check  | $2^{136}$ | Limbs 0, 1                                 |
| 1           | Higher mod $2^{272}$ check | $2^{136}$ | Limbs 2, 3 (with carry from subrelation 0) |
| 2           | Native field check         | $r$       | Full native reconstruction                 |

Together, these prove the relation holds in integers.

### Subrelation 0: Lower Mod $2^{136}$ Check

Prove that when we compute the accumulation formula using limbs 0 and 1, the result is a multiple of $2^{136}$.

We compute the accumulation using:

- Limb 0 terms (contribute at weight $2^0$)
- Limb 1 terms (contribute at weight $2^{68}$)

The result should be: $\text{Result} = c^{\text{lo}} \cdot 2^{136}$ for some carry $c^{\text{lo}}$.
The limb 0 contribution is:

$$
\boxed{
    \begin{align*}
    T_0 := &\; a_0^{\text{prev}} \cdot x_0 & \\
    &+ \texttt{op} \\
    &+ P_{x,0} \cdot v_0 \\
    &+ P_{y,0} \cdot (v^2)_0 \\
    &+ z_{1,0} \cdot (v^3)_0 \\
    &+ z_{2,0} \cdot (v^4)_0 \\
    &+ q_0 \cdot \bar{q}_0 \\
    &- a_0^{\text{curr}}
    \end{align*}
}
$$

The limb 1 contribution is:

$$
\boxed{\begin{align*}
T_1 := &\; a_1^{\text{prev}} \cdot x_0 + a_0^{\text{prev}} \cdot x_1 & \\
&+ P_{x,0} \cdot v_1 + P_{x,1} \cdot v_0 \\
&+ P_{y,0} \cdot (v^2)_1 + P_{y,1} \cdot (v^2)_0 \\
&+ z_{1,0} \cdot (v^3)_1 + z_{1,1} \cdot (v^3)_0 \\
&+ z_{2,0} \cdot (v^4)_1 + z_{2,1} \cdot (v^4)_0 \\
&+ q_0 \cdot \bar{q}_1 + q_1 \cdot \bar{q}_0 \\
&- a_1^{\text{curr}}
\end{align*}}
$$

Thus, the combined subrelation is:

$$\boxed{L_{\text{even}} \cdot \texttt{op} \cdot \left( T_0 + 2^{68} \cdot T_1 - 2^{136} \cdot c^{\text{lo}} \right) = 0}$$

If this holds, the lower 136 bits of the accumulation equation are correct.

This subrelation is only active when:

- $L_{\text{even}} = 1$ (even rows in mini-circuit)
- $\texttt{op} \neq 0$ (not a no-op)

### Subrelation 1: Higher Mod $2^{136}$ Check

Prove that when we compute the accumulation formula using limbs 2 and 3, plus the carry from subrelation 0, the result is a multiple of $2^{136}$.

We compute using:

- The carry $c^{\text{lo}}$ from subrelation 0
- Limb 2 terms (contribute at weight $2^{136}$)
- Limb 3 terms (contribute at weight $2^{204}$)

The result should be: $\text{Result} = c^{\text{hi}} \cdot 2^{136}$ for some carry $c^{\text{hi}}$.
The limb 2 contribution (with carry) is:

$$
\boxed{\begin{align*}
T_2 := &\; c^{\text{lo}} \quad \textsf{(carry from subrelation 0)} & \\
&+ a_2^{\text{prev}} \cdot x_0 + a_1^{\text{prev}} \cdot x_1 + a_0^{\text{prev}} \cdot x_2 \\
&+ P_{x,2} \cdot v_0 + P_{x,1} \cdot v_1 + P_{x,0} \cdot v_2 \\
&+ P_{y,2} \cdot (v^2)_0 + P_{y,1} \cdot (v^2)_1 + P_{y,0} \cdot (v^2)_2 \\
&+ z_{1,1} \cdot (v^3)_1 + z_{1,0} \cdot (v^3)_2 \\
&+ z_{2,1} \cdot (v^4)_1 + z_{2,0} \cdot (v^4)_2 \\
&+ q_2 \cdot \bar{q}_0 + q_1 \cdot \bar{q}_1 + q_0 \cdot \bar{q}_2 \\
&- a_2^{\text{curr}}
\end{align*}}
$$

The limb 3 contribution is:

$$
\boxed{\begin{align*}
T_3 := &\; a_3^{\text{prev}} \cdot x_0 + a_2^{\text{prev}} \cdot x_1 + a_1^{\text{prev}} \cdot x_2 + a_0^{\text{prev}} \cdot x_3 & \\
&+ P_{x,3} \cdot v_0 + P_{x,2} \cdot v_1 + P_{x,1} \cdot v_2 + P_{x,0} \cdot v_3 \\
&+ P_{y,3} \cdot (v^2)_0 + P_{y,2} \cdot (v^2)_1 + P_{y,1} \cdot (v^2)_2 + P_{y,0} \cdot (v^2)_3 \\
&+ z_{1,1} \cdot (v^3)_2 + z_{1,0} \cdot (v^3)_3 \\
&+ z_{2,1} \cdot (v^4)_2 + z_{2,0} \cdot (v^4)_3 \\
&+ q_3 \cdot \bar{q}_0 + q_2 \cdot \bar{q}_1 + q_1 \cdot \bar{q}_2 + q_0 \cdot \bar{q}_3 \\
&- a_3^{\text{curr}}
\end{align*}}
$$

The combined subrelation 1 is:

$$\boxed{L_{\text{even}} \cdot \texttt{op} \cdot \left( T_2 + 2^{68} \cdot T_3 - 2^{136} \cdot c^{\text{hi}} \right) = 0}$$

If this holds, the higher 136 bits are correct. Together with subrelation 0, this proves the relation holds modulo $2^{272}$.

### Subrelation 2: Native Field Check

Prove the accumulation formula holds when computed directly in $\mathbb{F}_r$ (the native field).
First, reconstruct all values from their limbs:

$$
\begin{align*}
\tilde{P}_x &= P_{x,0} + 2^{68} \cdot P_{x,1} + 2^{136} \cdot P_{x,2} + 2^{204} \cdot P_{x,3} \pmod{r} \\
\tilde{P}_y &= P_{y,0} + 2^{68} \cdot P_{y,1} + 2^{136} \cdot P_{y,2} + 2^{204} \cdot P_{y,3} \pmod{r} \\
\tilde{z}_1 &= z_{1,0} + 2^{68} \cdot z_{1,1} \pmod{r} \\
\tilde{z}_2 &= z_{2,0} + 2^{68} \cdot z_{2,1} \pmod{r} \\
\tilde{a}^{\text{prev}} &= a_0^{\text{prev}} + 2^{68} \cdot a_1^{\text{prev}} + 2^{136} \cdot a_2^{\text{prev}} + 2^{204} \cdot a_3^{\text{prev}} \pmod{r} \\
\tilde{a}^{\text{curr}} &= a_0^{\text{curr}} + 2^{68} \cdot a_1^{\text{curr}} + 2^{136} \cdot a_2^{\text{curr}} + 2^{204} \cdot a_3^{\text{curr}} \pmod{r} \\
\tilde{\mathcal{Q}} &= q_0 + 2^{68} \cdot q_1 + 2^{136} \cdot q_2 + 2^{204} \cdot q_3 \pmod{r}
\end{align*}
$$

**Note:** The tilde indicates these are native field reconstructions in $\mathbb{F}_r$, not the original $\mathbb{F}_q$ values.

Subrelation 2 is then:

$$
\boxed{\begin{align*}
L_{\text{even}} \cdot \texttt{op} \cdot \Big( &\tilde{a}^{\text{prev}} \cdot x_4 & \\
&+ \texttt{op} \\
&+ \tilde{P}_x \cdot v_4 \\
&+ \tilde{P}_y \cdot (v^2)_4 \\
&+ \tilde{z}_1 \cdot (v^3)_4 \\
&+ \tilde{z}_2 \cdot (v^4)_4 \\
&+ \tilde{\mathcal{Q}} \cdot \bar{q}_4 \\
&- \tilde{a}^{\text{curr}} \Big) = 0
\end{align*}}
$$

where:

- All arithmetic is performed in $\mathbb{F}_{r}$
- $x_4, v_4, (v^2)_4, (v^3)_4, (v^4)_4$ are the native field representations of the challenges
- $\bar{q}_4 = -q \pmod{r}$

Subrelations 0 and 1 prove the identity mod $2^{272}$, and subrelation 2 proves it mod $r$, so it holds in the integers.

## Decomposition Relation

The Decomposition Relation enforces the integrity of the limb decomposition system. While the Non-Native Field Relation proves the accumulation formula is correct, the Decomposition Relation proves all limb decompositions are valid. It consists of 48 subrelations organized into five categories:

| Category                               | No. of Subrelations | Note                                                |
| -------------------------------------- | ------------------- | --------------------------------------------------- |
| Accumulator microlimb decomposition    | 4                   | Active when $L_{\text{even}} \cdot \texttt{op} = 1$ |
| Point & scalar microlimb decomposition | 16                  | Active when $L_{\text{even}} = 1$                   |
| Wide limb decomposition                | 2                   | Decompose 84-bit carry limbs                        |
| Range constraint tightening            | 20                  | Enforce stricter bounds on highest microlimbs       |
| Transcript decomposition               | 6                   | Prove 68-bit limbs reconstruct transcript values    |

These work with the Permutation Relation and Delta Range Constraint which together prove each microlimb is in $[0, 2^{14})$.

---

### The 14-bit Microlimb System

Two-level decomposition hierarchy:

1. Level 1 (68-bit limbs): 254-bit values → 68 + 68 + 68 + 50 bits
2. Level 2 (14-bit microlimbs): 68-bit limbs → 14 + 14 + 14 + 14 + 12 bits

Microlimb reconstruction formula for a 68-bit limb $\ell$ with microlimbs $m_0, \ldots, m_4$:

$$\boxed{\ell = m_0 + m_1 \cdot 2^{14} + m_2 \cdot 2^{28} + m_3 \cdot 2^{42} + m_4 \cdot 2^{56}}$$

Range constraints:

- All microlimbs $m_j \in [0, 2^{14})$ (enforced by permutation)
- For 68-bit limbs: $m_4 \in [0, 2^{12})$
- For 50-bit limbs: $m_3 \in [0, 2^{8})$
- For 52-bit limbs: $m_3 \in [0, 2^{10})$
- For 60-bit limbs: $m_4 \in [0, 2^{4})$

### Categories 1 and 2: Microlimb Decomposition (Subrelations 0-19)

General pattern for decomposing a limb $\ell_i$ into microlimbs $\lbrace \ell_{i,j}\rbrace$:
$$\boxed{L_{\text{selector}} \cdot \left( \sum_{j=0}^{k} \ell_{i,j} \cdot 2^{14j} - \ell_i \right) = 0}$$

where $k=4$ for 68/60-bit limbs and $k=3$ for 50/52-bit limbs.

**Subrelations 0-3:** Accumulator limbs $(a_0, a_1, a_2, a_3)$ with selector $L_{\text{even}} \cdot \texttt{op}$

- $a_3$ is 50-bit (uses only 4 microlimbs)

**Subrelations 4-19:** Point coordinates and scalars with selector $L_{\text{even}}$

| Element       | Limbs decomposed                           | Number of subrelations | Note                              |
| ------------- | ------------------------------------------ | ---------------------- | --------------------------------- |
| $P_y$         | $P_{y,0}, \ P_{y,1}, \ P_{y,2}, \ P_{y,3}$ | 4                      | 68 + 68 + 68 + 50 bits            |
| $z_1, z_2$    | $z_{1,0}, \ z_{2,0}, \ z_{1,1}, \ z_{2,1}$ | 4                      | Each $z$ is 128-bit: 68 + 60 bits |
| $P_x$         | $P_{x,0}, \ P_{x,1}, \ P_{x,2}, \ P_{x,3}$ | 4                      | 68 + 68 + 68 + 50 bits            |
| $\mathcal{Q}$ | $q_0, q_1, q_2, q_3$                       | 4                      | 68 + 68 + 68 + 52 bits            |

### Category 3: Wide Limb Decomposition (Subrelations 20-21)

Carry limbs $c^{\text{lo}}, c^{\text{hi}}$ are 84 bits (6 × 14-bit microlimbs). To save space, the 5th and 6th microlimbs are stored in unused "tail" columns:

$$\boxed{L_{\text{even}} \cdot \left( \sum_{j=0}^{3} c_{i,j} \cdot 2^{14j} + c_{i,4} \cdot 2^{56} + c_{i,5} \cdot 2^{70} - c^{(i)} \right) = 0}$$

where $c^{(0)} = c^{\text{lo}}$, $c^{(1)} = c^{\text{hi}}$.
Microlimb reuse:

- $c_{0,4}^{\text{micro}}$ = `p_x_high_limbs_range_constraint_tail_shift`
- $c_{0,5}^{\text{micro}}$ = `accumulator_high_limbs_range_constraint_tail_shift`
- $c_{1,4}^{\text{micro}}$ = `p_y_high_limbs_range_constraint_tail_shift`
- $c_{1,5}^{\text{micro}}$ = `quotient_high_limbs_range_constraint_tail_shift`

### Category 4: Range Constraint Tightening (Subrelations 22-41)

For limbs with $b = 14k + t$ bits (where $0 < t < 14$), the highest microlimb $m_k$ must satisfy $m_k < 2^t$.

**Shift-and-scale technique:**

For proving $m_k < 2^t$, we add a new variable $m_k^{\text{tail}}\in [0, 2^{14})$ defined as:

$$m_k^{\text{tail}} := m_k \ll (14 - t).$$

Then enforce:

$$\boxed{L_{\text{even}} \cdot \left( m_k \cdot 2^{14-t} - m_k^{\text{tail}} \right) = 0}$$

implying $m_k \in [0, 2^t)$.

Shift factors:

- for 68-bit limbs: $2^2 = 4$: Constrains to 12 bits
- for 52-bit limbs: $2^4 = 16$: Constrains to 10 bits
- for 50-bit limbs: $2^6 = 64$: Constrains to 8 bits
- for 60-bit limbs: $2^{10} = 1024$: Constrains to 4 bits

Subrelations 22-41 apply this pattern to:

| Elements    | No of subrelations | Tail bits           | Total bits constrained |
| ----------- | ------------------ | ------------------- | ---------------------- |
| $P_x$ limbs | 4                  | 12, 12, 12, 8 bits  | 254 bits               |
| $P_y$ limbs | 4                  | 12, 12, 12, 8 bits  | 254 bits               |
| $z_1$ limbs | 2                  | 12, 4 bits          | 128 bits               |
| $z_2$ limbs | 2                  | 12, 4 bits          | 128 bits               |
| Accumulator | 4                  | 12, 12, 12, 8 bits  | 254 bits               |
| Quotient    | 4                  | 12, 12, 12, 10 bits | 256 bits (see note)    |

<a name="quotient-bound"></a>
> **Why 256 bits suffice for the quotient.** The evaluation challenge $x$ and the batching challenge $v$ are full-width Fiat-Shamir challenges, so $x, v, v^2, v^3, v^4$ are field elements $< q$. The relations range-constrain $a^{\text{prev}}$, $P_x$, $P_y$ to 254 bits (not to $< q$) and $z_1$, $z_2$ to 128 bits. So the numerator is below $3 \cdot 2^{254} \cdot q + 2^{129} \cdot q + 8$, and $\mathcal{Q} < 3 \cdot 2^{254} + 2^{129} + 1 < 2^{255.59}$. The quotient limbs are range-constrained to 68 + 68 + 68 + 52 = 256 bits, which leaves a margin of about 0.41 bits.

### Category 5: Transcript Value Reconstruction (Subrelations 42-47)

These prove that 68-bit limbs correctly reconstruct EccOpQueue transcript values.
General pattern for composing two limbs into a transcript value:
$$\boxed{L_{\text{even}} \cdot \left( \ell_{\text{low}} + 2^{68} \cdot \ell_{\text{high}} - \text{transcript}_{\text{value}} \right) = 0}$$

Subrelations:

| Column      | Even row                                                        | Odd row                                                         | No. of subrelations |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ------------------- |
| `X_LO_Y_HI` | $P_{x,\text{lo}} = P_{x, 0} + 2^{68} \cdot P_{x, 1}$ (136 bits) | $P_{y,\text{hi}} = P_{y, 2} + 2^{68} \cdot P_{y, 3}$ (118 bits) | 2                   |
| `X_HI_Z_1`  | $P_{x,\text{hi}} = P_{x, 2} + 2^{68} \cdot P_{x, 3}$ (118 bits) | $z_1 = z_{1, 0} + 2^{68} \cdot z_{1, 1}$ (128 bits)             | 2                   |
| `Y_LO_Z_2`  | $P_{y,\text{lo}} = P_{y, 0} + 2^{68} \cdot P_{y, 1}$ (136 bits) | $z_2 = z_{2, 0} + 2^{68} \cdot z_{2, 1}$ (128 bits)             | 2                   |

#### Interaction with Delta Range Constraint

The Decomposition Relation works in tandem with the Delta Range Constraint (a constraint on consecutive differences of the ordered polynomials):

Delta Range Constraint proves: Every microlimb column (all `*_range_constraint_*` columns) contains only values in $[0, 2^{14})$.

Decomposition Relation proves:

1. Large limbs are correctly reconstructed from microlimbs
2. Highest microlimbs are more strictly bounded (4, 8, 10, or 12 bits)
3. Transcript values are correctly formed from 68-bit limbs

Together they guarantee: All limb decompositions are valid and all values are correctly range-constrained.

## Permutation Relation

The permutation relation proves that the microlimbs in the concatenated polynomials are the same multiset as the ordered polynomials. Together with the delta range constraint, it proves that every microlimb value used in the circuit belongs to the set $[0, 2^{14} - 1]$. The relation uses a grand product argument comparing two multisets:

- **Concatenated multiset:** All microlimbs as they appear in the circuit (spread across 16 blocks in the concatenated polynomials)
- **Ordered multiset:** The same values, but sorted in ascending order

If the two multisets are equal (i.e., one is a permutation of the other), then all values are valid.

The relation consists of 3 subrelations:

0. Grand product identity (degree 6)
1. Finalization check (degree 2)
2. Initialization check (degree 2)

#### Interaction with the Delta Range Constraints

The ordered multiset contains the circuit microlimbs plus a step sequence $\lbrace 0, 3, \ldots, 16383\rbrace$ (5462 values); see [Delta Range Constraint Relation](#delta-range-constraint-relation) for why the steps make the range check complete. The Delta Range Constraints prove that the ordered multiset is correct.

**Balancing the multisets:** The 4 concatenated range constraint wires contain only circuit microlimbs, while each of the 5 ordered wires contains circuit microlimbs plus the step sequence. To balance this, we add a 5th numerator wire (`ordered_extra_range_constraints_numerator`) containing 5 copies of the step sequence—one for each ordered wire. This ensures the multisets have equal cardinality. The Delta Range Constraints enforce that each value in the ordered multiset differs from the previous by at most 3.

---

### Subrelation 0: Grand Product Identity

**Purpose:** Prove the concatenated and ordered multisets are equal via grand product.

The grand product polynomial $z_{\text{perm}}$ is defined recursively:

$$\boxed{z_{\text{perm}}[i+1] \cdot \prod_{j=0}^{4} \left( w_j^{\text{ordered}}[i] + \beta \cdot L_{\text{ordered masking}}[i] + \gamma \right) = z_{\text{perm}}[i] \cdot \prod_{j=0}^{3} \left( w_j^{\text{concatenated}}[i] + \beta \cdot L_{\text{masking}}[i] + \gamma \right) \cdot \left( w^{\text{extra}}[i] + \beta \cdot L_{\text{ordered masking}}[i] + \gamma \right)}$$

where:

- $w_j^{\text{concatenated}}[i]$: The $j$-th concatenated range constraint wire at row $i$
- $w_j^{\text{ordered}}[i]$: The $j$-th ordered (sorted) range constraint wire at row $i$
- $w^{\text{extra}}[i]$: the precomputed `ordered_extra_range_constraints_numerator` at row $i$
- $\beta, \gamma$: Random challenges (from Fiat-Shamir)
- $L_{\text{masking}}[i]$: Lagrange polynomial indicating masking rows for the 4 concatenated range constraint wires (scattered across the 16 blocks)
- $L_{\text{ordered masking}}[i]$: Lagrange polynomial indicating masking rows for the ordered wires and the extra numerator wire (contiguous at the end)

The beta masking terms enforce that the zero-knowledge masking values in both sets are identical.
The numerator uses TWO different masking selectors: $L_{\text{masking}}$ for the 4 concatenated range constraint factors (scattered across 16 blocks), and $L_{\text{ordered masking}}$ for the extra numerator factor.
The denominator uses $L_{\text{ordered masking}}$ for all 5 ordered factors.
These are added only to the masking regions, to avoid interfering with the actual circuit values (which must be in the range $[0, 2^{14} - 1]$).
The subrelation is then expressed, with boundary conditions, as:

$$\boxed{\left( z_{\text{perm}} + L_{\text{first}} \right) \cdot \prod_{j=0}^{3} \left( w_j^{\text{concatenated}} + \beta \cdot L_{\text{masking}} + \gamma \right) \cdot \left( w^{\text{extra}} + \beta \cdot L_{\text{ordered masking}} + \gamma \right) = \left( z_{\text{perm}}^{\text{shift}} + L_{\text{last}} \right) \cdot \prod_{j=0}^{4} \left( w_j^{\text{ordered}} + \beta \cdot L_{\text{ordered masking}} + \gamma \right)}$$

where:

- $L_{\text{first}}$: Lagrange polynomial for first row ($z_{\text{perm}}[0] = 0$ is enforced by subrelation 2)
- $L_{\text{last}}$: Lagrange polynomial for last row (we enforce $z_{\text{perm}}[\text{last}] = 0$ in subrelation 1)
- $z_{\text{perm}}^{\text{shift}}$: Shifted grand product polynomial ($z_{\text{perm}}[i+1]$)
If the two multisets are equal:

1. At each step, the products telescope: contributions cancel out
2. After processing all rows, the grand product returns to 1 (accounting for initialization/finalization)
3. If any value is out of range or missing from the sorted set, the product cannot telescope correctly

Active when: All rows (both even and odd in the full concatenated circuit)

Degree: 6 (each side is linear polynomial × product of 5 linear terms)

---

### Subrelation 1: Finalization Check

Purpose: Ensure the grand product polynomial returns to the correct value at the circuit boundary.

$$\boxed{L_{\text{last}} \cdot z_{\text{perm}}^{\text{shift}} = 0}$$

At the last row, the shifted grand product (which is $z_{\text{perm}}$ at the row after last) must be 0, so the telescoping completed correctly.

Active when: Last row only ($L_{\text{last}} = 1$)

Degree: 2 (Lagrange × shifted polynomial)

---

### Subrelation 2: Initialization Check

Purpose: Ensure the grand product polynomial starts at zero.

$$\boxed{L_{\text{first}} \cdot z_{\text{perm}} = 0}$$

$z_{\text{perm}}$ must be 0 at the first row, so that the $(z_{\text{perm}} + L_{\text{first}})$ term in subrelation 0 evaluates to 1 there.

Active when: First row only ($L_{\text{first}} = 1$)

Degree: 2 (Lagrange × polynomial)

## Delta Range Constraint Relation

The Delta Range Constraint Relation works in tandem with the Permutation Relation to prove that the ordered (sorted) multiset is actually sorted and bounded correctly.

What it proves:

1. The "ordered" wires are actually in non-descending order
2. Consecutive values differ by at most `SORT_STEP = 3`
3. The final value in each column is exactly $2^{14} - 1 = 16383$

The Permutation Relation only proves the multisets are equal. Without the Delta Range Constraint, an attacker could provide out of range values and the permutation would still pass if the concatenated set matches.

The relation consists of 10 subrelations:

- 5 consecutive difference checks (one per ordered wire)
- 5 maximum value checks (one per ordered wire)

---

### Subrelations 0-4: Consecutive Difference Constraints

Purpose: Enforce that each ordered wire is in non-descending order with maximum step 3.

For each ordered wire $j \in \lbrace 0, 1, 2, 3, 4\rbrace$:

$$\boxed{\left( L_{\text{real last}} + L_{\text{ordered masking}} - 1 \right) \cdot \Delta_j \cdot (\Delta_j - 1) \cdot (\Delta_j - 2) \cdot (\Delta_j - 3) = 0}$$

where:
$$\Delta_j := w_j^{\text{ordered}}[i+1] - w_j^{\text{ordered}}[i].$$

When active, it forces: $\Delta_j \in \lbrace 0, 1, 2, 3\rbrace$. The two selectors have disjoint support, so their sum is 0 or 1. The constraint is disabled at the real-last row and on the 64 ordered masking rows.

Why maximum step 3?
To ensure full coverage of $[0, 2^{14} - 1]$, we insert "step values" into the sorted array:

- Start at 0
- Insert values: 0, 3, 6, 9, ..., 16383
- This creates `SORTED_STEPS_COUNT = (2^14 - 1) / 3 + 1 = 5462` steps

Between these steps, actual microlimbs fill in the gaps. With $\Delta \in \lbrace 0, 1, 2, 3\rbrace$:

- No value can "jump over" a step value
- Every value $\leq 16383$ has a step value within distance 3
- Therefore, all values in range can be represented

Degree: 5 (partial length 6)

---

### Subrelations 5-9: Maximum Value Constraints

Ensure the final value in each sorted column is exactly $2^{14} - 1 = 16383$.
For each ordered wire $j \in \lbrace 0, 1, 2, 3, 4\rbrace$:

$$\boxed{L_{\text{real last}} \cdot \left( w_j^{\text{ordered}} - (2^{14} - 1) \right) = 0}$$

At the last real row ($L_{\text{real last}} = 1$):
$$w_j^{\text{ordered}}[\text{last}] = 2^{14} - 1 = 16383$$

This puts the maximum value $2^{14} - 1$ in the sorted multiset. Combined with the difference constraint, it bounds every value in the column by $2^{14} - 1$.

Active when: Last real row only ($L_{\text{real last}} = 1$)

Degree: 2 (Lagrange × difference)

## Extra Relations

To enforce the correctness of the opcodes and the accumulator lifecycle, we have a few additional relations.

### Opcode Constraint Relation

The Opcode Validity Check (subrelation 0) enforces valid opcodes on even rows and **`op = 0` on odd rows**:

$$\boxed{L_{\text{even}} \cdot \texttt{op} \cdot (\texttt{op} - 3)(\texttt{op} - 4)(\texttt{op} - 8) \;+\; L_{\text{odd}} \cdot \texttt{op} \;=\; 0}$$

- On **even** rows ($L_{\text{even}} = 1$): the degree-4 factor forces $\texttt{op} \in \lbrace 0, 3, 4, 8\rbrace$.
- On **odd** rows ($L_{\text{odd}} = 1$): the second term forces $\texttt{op} = 0$.

Valid opcodes:

- `0`: No-op
- `3`: Equality and reset accumulator
- `4`: Scalar multiplication
- `8`: Point addition

**Why odd rows must carry `op = 0` (soundness).** The non-native accumulator is updated only on even rows, gated by $L_{\text{even}} \cdot \texttt{op}$. Without the $L_{\text{odd}} \cdot \texttt{op}$ term a prover could place a genuine opcode (`3`/`4`/`8`) on an odd row: it would satisfy a bare $\texttt{op} \in \lbrace 0, 3, 4, 8\rbrace$ check yet be skipped by the accumulator, excluding that ECC operation from the batched evaluation. Forcing $\texttt{op} = 0$ on odd rows closes this gap.

Masking rows are exempt: both $L_{\text{even}}$ and $L_{\text{odd}}$ are zero in the mini-circuit masking regions, so random masking ops are unconstrained here.

Degree: 5 (degree-1 Lagrange × degree-4 polynomial in `op`).

#### Subrelations 1-4: accumulator unchanged on no-op

These subrelations ensure that when the opcode is `0` (no-op), the accumulator remains unchanged between even rows.
For the other opcodes (`3`, `4`, `8`), this constraint does not apply and must be skipped.
Thus, for each accumulator limb $i \in \lbrace 0, 1, 2, 3\rbrace$, we must enforce:

$$\boxed{L_{\text{even}} \cdot (\texttt{op} - 3) \cdot (\texttt{op} - 4) \cdot (\texttt{op} - 8) \cdot \left( a_i^{\text{current}} - a_i^{\text{shifted}} \right) = 0}$$

Degree: 5

---

### Accumulator Transfer Relation

The Accumulator Transfer Relation manages the lifecycle of the accumulator across the circuit:

1. Initialization: Start with zero accumulator
2. Propagation: Copy accumulator from each odd row to the next even row
3. Finalization: Verify final accumulator matches expected result

The relation consists of 12 subrelations:

- 4 for propagation
- 4 for initialization (set to zero)
- 4 for finalization (check against expected result)

#### Subrelations 0-3: Odd Row Propagation

Ensure that we correctly copy the accumulator from each odd row to the next even row.
This is because the previous accumulator value (in this iteration) becomes the "current" value on the next iteration.
Refer to the [Witness Trace Structure](README.md#witness-trace-structure) for details on how we compute the accumulator iteratively.

Thus, for each limb $i \in \lbrace 0, 1, 2, 3\rbrace$:

$$\boxed{L_{\text{odd}} \cdot (L_{\text{last in minicircuit}} - 1) \cdot \left( a_i^{\text{current}} - a_i^{\text{shifted}} \right) = 0}$$

This correctly "propagates" the accumulator value in computing the final accumulator.

Active when: Odd rows only except the last real row in the mini-circuit (before masking).

Degree: 3

#### Subrelations 4-7: Initialization

Ensure the accumulator starts at zero at the beginning of the computation. Recall that we process the opcodes in reverse order, so the first "previous" accumulator corresponds to the last opcode processed. Thus, for each limb $i \in \lbrace 0, 1, 2, 3\rbrace$:

$$\boxed{L_{\text{last in minicircuit}} \cdot a_i^{\text{current}} = 0}$$

This implies that at the last row in the mini-circuit (before masking), all limbs of the accumulator are zero, ensuring the accumulator starts at 0.

Degree: 2 (Lagrange × limb)

#### Subrelations 8-11: Finalization

Verify the final accumulator value matches the expected result from ECCVM.
For each limb $i \in \lbrace 0, 1, 2, 3\rbrace$:

$$\boxed{L_{\text{result}} \cdot \left( a_i^{\text{current}} - a_i^{\text{expected}} \right) = 0}$$

where $a_i^{\text{expected}}$ is provided as a relation parameter (derived from ECCVM output). The ECCVM circuit computes the batched evaluation:

$$a^{\text{expected}} = \sum_{j=0}^{n-1} x^{j} \cdot \left( \texttt{op}_j + v \cdot P_{x,j} + v^2 \cdot P_{y,j} + v^3 \cdot z_{1,j} + v^4 \cdot z_{2,j} \right) \pmod{q}$$

The Translator must prove it computed the same value. The finalization check ensures that Translator's computation matches ECCVM's computation

Active when: Result row only ($L_{\text{result}} = 1$), this row corresponds to the first real opcode in the mini-circuit.

Degree: 2 (Lagrange × difference)

---

### Zero Constraints Relation

The Zero Constraints Relation enforces that certain witness wires are zero outside the mini-circuit.
Due to concatenation, the full circuit is 16× larger than the mini-circuit:

- Mini-circuit: $2^{13} = 8,192$ rows (actual computation)
- Full circuit: $2^{17} = 131,072$ rows (for concatenation optimization)

The 64 range-constraint wires and the 4 op-queue wires (`op`, `x_lo_y_hi`, `x_hi_z_1`, `y_lo_z_2`) must be zero on rows 0-1 and on every row ≥ 8192. Thus, for each such wire $w$, we enforce:

$$\boxed{\left( L_{\text{even}} + L_{\text{odd}} + L_{\text{mini mask}} - 1 \right) \cdot w = 0}$$

$L_{\text{even}}$, $L_{\text{odd}}$ and $L_{\text{mini mask}}$ have disjoint support. Their sum is 1 on rows $[2, 8192)$ ($L_{\text{mini mask}}$ covers $[2, 8)$ and $[8188, 8192)$; $L_{\text{even}}$ and $L_{\text{odd}}$ cover $[8, 8188)$) and 0 on rows 0-1 and outside the mini-circuit. So the relation forces $w = 0$ on rows 0-1 and on every row ≥ 8192.

Degree: 2 (Lagrange term × wire)

---

### Shiftable First-Coefficient Zero Relation

Implemented by `TranslatorShiftableFirstCoeffZeroRelation` (5 subrelations).

A to-be-shifted polynomial $g$ is opened as the left-shift $g/X$ off the *same* commitment, so the Gemini/Shplemini PCS already forces $g[0] = 0$. This relation makes that invariant explicit at the relation level for the five shiftable `ordered_range_constraints_0..4` wires — the only shiftable Translator polynomials whose first coefficient is not already pinned to 0 by another relation:

- `z_perm` is pinned by the [Permutation Relation](#permutation-relation) (its `z_perm` initialization subrelation);
- the range-constraint and op-queue wires are pinned by the [Zero Constraints Relation](#zero-constraints-relation), which forces them to 0 on rows 0-1 and on every row outside the mini-circuit.

The 13 non-range limb wires (`NonRangeMainWires`) are also shiftable, but no relation pins their first coefficient; only the PCS shift forces it to 0.

For each of the five ordered range-constraint wires $w$:

$$\boxed{\texttt{lagrange first} \cdot w = 0}$$

Anchoring the lower endpoint of each sorted range here removes the [Delta Range Constraint](#delta-range-constraint-relation) argument's dependence on the PCS shift property.

Degree: 2 (`lagrange_first` × wire), partial length 3.

---
