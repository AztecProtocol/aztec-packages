# Translator Non-Native Field Relation: Complete Mathematical Derivation

## Document Purpose

This document provides a rigorous mathematical treatment of the **Non-Native Field Relation** in the Translator circuit, using consistent LaTeX nomenclature throughout. This is the core relation that enables computation in 𝔽q (BN254 base field) using only 𝔽r (BN254 scalar field) arithmetic.

---

## Witness Trace Structure

The Translator circuit operates on a **2-row cycle structure**. Each EccOpQueue entry occupies exactly 2 rows:

- **Row 2i (Even rows)**: **Computation rows** where the non-native field relation is actively checked
- **Row 2i+1 (Odd rows)**: **Data storage rows** that hold values accessed by the next even row via shifts

This architecture exists because of how polynomial commitments work in the KZG scheme: the "shifted" polynomial at index $i$ evaluates to the polynomial at index $i+1$. Thus:

- Even row $2i$ performs computation using "current" values from its own row
- Even row $2i$ accesses "previous" values from odd row $2i+1$ via shift columns
- Odd row $2i+1$ stores the data that will become "previous" for the next computation at row $2i+2$

The Translator circuit has **81 witness columns** organized into several categories:

#### 1. EccOpQueue Transcript Columns (4 columns)

These columns directly represent the EccOpQueue transcript:

| Column      | Even Row (2i)                     | Odd Row (2i+1)               | Description                                   |
| ----------- | --------------------------------- | ---------------------------- | --------------------------------------------- |
| `OP`        | $\texttt{op} \in \{0,1,2,3,4,8\}$ | 0 (no-op)                    | Opcode (the type of elliptic curve operation) |
| `X_LO_Y_HI` | $P_{x,\text{lo}}$ (136 bits)      | $P_{y,\text{hi}}$ (118 bits) | Low 136 bits of P.x and High 118 bits of P.y  |
| `X_HI_Z_1`  | $P_{x,\text{hi}}$ (118 bits)      | $z_1$ (128 bits)             | High 118 bits of P.x and first scalar         |
| `Y_LO_Z_2`  | $P_{y,\text{lo}}$ (136 bits)      | $z_2$ (128 bits)             | Low 136 bits of P.y and second scalar         |
|             |                                   |                              |                                               |

**Encoding scheme**: Point coordinates $P_x$ and $P_y$ are each 254 bits, split as:

- $P_x = (P_{x,\text{hi}}$ (118 bits) $\|$ $P_{x,\text{lo}}$ (136 bits) $)$
- $P_y = (P_{y,\text{hi}}$ (118 bits) $\|$ $P_{y,\text{lo}}$ (136 bits) $)$

#### 2. Limb Decomposition Columns (13 columns)

These columns store finer-grained limb decompositions for non-native arithmetic:

| Column Group                  | Even Row (2i)         | Odd Row (2i+1)        | Bits   | Purpose                                  |
| ----------------------------- | --------------------- | --------------------- | ------ | ---------------------------------------- |
| `P_X_LOW_LIMBS`               | $P_{x,0}^{\text{lo}}$ | $P_{x,1}^{\text{lo}}$ | 68     | Limbs 0 & 1 of $P_{x,\text{lo}}$         |
| `P_X_HIGH_LIMBS`              | $P_{x,0}^{\text{hi}}$ | $P_{x,1}^{\text{hi}}$ | 68, 50 | Limbs 0 & 1 of $P_{x,\text{hi}}$         |
| `P_Y_LOW_LIMBS`               | $P_{y,0}^{\text{lo}}$ | $P_{y,1}^{\text{lo}}$ | 68     | Limbs 0 & 1 of $P_{y,\text{lo}}$         |
| `P_Y_HIGH_LIMBS`              | $P_{y,0}^{\text{hi}}$ | $P_{y,1}^{\text{hi}}$ | 68, 50 | Limbs 0 & 1 of $P_{y,\text{hi}}$         |
| `Z_LOW_LIMBS`                 | $z_{1,0}$             | $z_{2,0}$             | 68     | Low limbs of $z_1$ and $z_2$             |
| `Z_HIGH_LIMBS`                | $z_{1,1}$             | $z_{2,1}$             | 60     | High limbs of $z_1$ and $z_2$            |
| `ACCUMULATORS_BINARY_LIMBS_0` | $a_0^{\text{curr}}$   | $a_0^{\text{prev}}$   | 68     | Limb 0 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_1` | $a_1^{\text{curr}}$   | $a_1^{\text{prev}}$   | 68     | Limb 1 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_2` | $a_2^{\text{curr}}$   | $a_2^{\text{prev}}$   | 68     | Limb 2 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_3` | $a_3^{\text{curr}}$   | $a_3^{\text{prev}}$   | 50     | Limb 3 of current/previous accumulator   |
| `QUOTIENT_LOW_BINARY_LIMBS`   | $q_0$                 | $q_1$                 | 68     | Limbs 0 & 1 of quotient $\mathcal{Q}$    |
| `QUOTIENT_HIGH_BINARY_LIMBS`  | $q_2$                 | $q_3$                 | 68, 52 | Limbs 2 & 3 of quotient $\mathcal{Q}$    |
| `RELATION_WIDE_LIMBS`         | $c^{\text{lo}}$       | $c^{\text{hi}}$       | 84     | Carry/overflow from mod $2^{136}$ checks |

**Key insight**: The accumulator columns demonstrate the shift mechanism:

- Even row stores $a^{\text{curr}}$ (result of current computation)
- Odd row stores what will become $a^{\text{prev}}$ (input to next computation)
- Via shifts, even row $2i$ reads odd row $2i+1$ to get "previous" values

#### 3. Range Constraint Microlimb Columns (64 columns)

Each limb is further decomposed into **14-bit microlimbs** for range checking:

| Column Group                                | Count | Decomposition                    | Range per Microlimb |
| ------------------------------------------- | ----- | -------------------------------- | ------------------- |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_*`          | 6     | 5×14-bit + 1 tail (shifted by 4) | [0, 2¹⁴) each       |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_*`         | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_*`          | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_*`         | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_*`            | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_*`           | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_*`  | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_*` | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_*`     | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_*`    | 6     | 5×14-bit + 1 tail                | [0, 2¹⁴) each       |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_*`    | 4     | 6×14-bit (84 bits total)         | [0, 2¹⁴) each       |

**Tail microlimb**: The "\_TAIL" column contains the highest 14-bit microlimb multiplied by 4, providing a stricter constraint to ensure the total limb doesn't overflow its intended bit width.

### Active Constraints by Row Type

| Constraint                                 | Active on Even Rows | Active on Odd Rows |
| ------------------------------------------ | ------------------- | ------------------ |
| Non-Native Field Relation (3 subrelations) | ✓                   | ✗                  |
| Accumulator Transfer Relation              | ✗                   | ✓                  |
| Opcode Constraint                          | ✓                   | ✓                  |
| Range Constraints (Permutation)            | ✓                   | ✓                  |
| Decomposition Relations                    | ✓                   | ✓                  |

**Lagrange selectors**:

- $L_{\text{even}}$: Equals 1 on even rows, 0 elsewhere
- $L_{\text{odd}}$: Equals 1 on odd rows, 0 elsewhere

---

## Table of Contents

1. [Limb Decomposition Structure](#limb-decomposition-structure)
2. [The Problem Statement](#the-problem-statement)
3. [Nomenclature and Notation](#nomenclature-and-notation)
4. [The Three Subrelations](#the-three-subrelations)
5. [Subrelation 1: Lower Mod 2¹³⁶ Check](#subrelation-1-lower-mod-2136-check)
6. [Subrelation 2: Higher Mod 2¹³⁶ Check](#subrelation-2-higher-mod-2136-check)
7. [Subrelation 3: Native Field Check](#subrelation-3-native-field-check)
8. [Soundness Argument](#soundness-argument)
9. [Complete Constraint System](#complete-constraint-system)

---

## Limb Decomposition Structure

### Why 68-bit Limbs?

- Need to represent 254-bit values (elements of 𝔽q)
- Split into **4 limbs**: 68 + 68 + 68 + 50 = 254 bits
- 68 bits chosen for efficient range constraints (68 = 14 × 4 + 12)

### Complete Decomposition Table

This table establishes **all notation** used in the relations:

| Value                           | Native (𝔽q)          | Binary Limbs                                                                         | Native (𝔽r)     |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------ | --------------- |
| **Evaluation challenge**        |
| $x$                             | Evaluation point     | $x_0, x_1, x_2, x_3$                                                                 | $x_4$           |
| **Batching challenges**         |
| $v$                             | Batching challenge   | $v_0, v_1, v_2, v_3$                                                                 | $v_4$           |
| $v^2$                           | v squared            | $(v^2)_0, (v^2)_1, (v^2)_2, (v^2)_3$                                                 | $(v^2)_4$       |
| $v^3$                           | v cubed              | $(v^3)_0, (v^3)_1, (v^3)_2, (v^3)_3$                                                 | $(v^3)_4$       |
| $v^4$                           | v to fourth          | $(v^4)_0, (v^4)_1, (v^4)_2, (v^4)_3$                                                 | $(v^4)_4$       |
| **Point coordinates (witness)** |
| $P_x$                           | Point x-coordinate   | $P_{x,0}^{\text{lo}}, P_{x,1}^{\text{lo}}, P_{x,0}^{\text{hi}}, P_{x,1}^{\text{hi}}$ | (reconstructed) |
| $P_y$                           | Point y-coordinate   | $P_{y,0}^{\text{lo}}, P_{y,1}^{\text{lo}}, P_{y,0}^{\text{hi}}, P_{y,1}^{\text{hi}}$ | (reconstructed) |
| **Z-values (witness, 128-bit)** |
| $z_1$                           | 128-bit value        | $z_{1,0}, z_{1,1}$ (only 2 limbs)                                                    | (reconstructed) |
| $z_2$                           | 128-bit value        | $z_{2,0}, z_{2,1}$ (only 2 limbs)                                                    | (reconstructed) |
| **Accumulator (witness)**       |
| $a^{\text{prev}}$               | Previous accumulator | $a_0^{\text{prev}}, a_1^{\text{prev}}, a_2^{\text{prev}}, a_3^{\text{prev}}$         | (reconstructed) |
| $a^{\text{curr}}$               | Current accumulator  | $a_0^{\text{curr}}, a_1^{\text{curr}}, a_2^{\text{curr}}, a_3^{\text{curr}}$         | (reconstructed) |
| **Quotient (witness)**          |
| $\mathcal{Q}$                   | Division quotient    | $q_0, q_1, q_2, q_3$                                                                 | (reconstructed) |
| **Carries (witness)**           |
| $c^{\text{lo}}$                 | Lower carry          | (single 84-bit value)                                                                | -               |
| $c^{\text{hi}}$                 | Higher carry         | (single 84-bit value)                                                                | -               |
| **Opcode (witness, small)**     |
| $\texttt{op}$                   | Operation code       | (no decomposition, ≤ 8)                                                              | $\texttt{op}$   |

### Reconstruction Formula (General)

For a 254-bit value decomposed as $\ell_0, \ell_1, \ell_2, \ell_3$:

$$\boxed{\text{Value} = \ell_0 + 2^{68} \cdot \ell_1 + 2^{136} \cdot \ell_2 + 2^{204} \cdot \ell_3}$$

**Specific reconstructions:**

The coordinates $P_x$ and $P_y$ are reconstructed as:

$$P_x = P_{x,0}^{\text{lo}} + 2^{68} \cdot P_{x,1}^{\text{lo}} + 2^{136} \cdot P_{x,0}^{\text{hi}} + 2^{204} \cdot P_{x,1}^{\text{hi}}$$

$$P_y = P_{y,0}^{\text{lo}} + 2^{68} \cdot P_{y,1}^{\text{lo}} + 2^{136} \cdot P_{y,0}^{\text{hi}} + 2^{204} \cdot P_{y,1}^{\text{hi}}$$

The scalars $z_1$ and $z_2$ (both 128-bit) are reconstructed as:

$$z_1 = z_{1,0} + 2^{68} \cdot z_{1,1}$$

$$z_2 = z_{2,0} + 2^{68} \cdot z_{2,1}$$

The accumulators are reconstructed as:

$$a^{\text{prev}} = a_0^{\text{prev}} + 2^{68} \cdot a_1^{\text{prev}} + 2^{136} \cdot a_2^{\text{prev}} + 2^{204} \cdot a_3^{\text{prev}}$$

$$a^{\text{curr}} = a_0^{\text{curr}} + 2^{68} \cdot a_1^{\text{curr}} + 2^{136} \cdot a_2^{\text{curr}} + 2^{204} \cdot a_3^{\text{curr}}$$

The quotient $\mathcal{Q}$ is reconstructed as:

$$\mathcal{Q} = q_0 + 2^{68} \cdot q_1 + 2^{136} \cdot q_2 + 2^{204} \cdot q_3$$

---

## The Problem Statement

### Field Moduli

| Symbol | Value                                                                | Description                     |
| ------ | -------------------------------------------------------------------- | ------------------------------- |
| $q$    | `0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47` | BN254 base field modulus (𝔽q)   |
| $r$    | `0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001` | BN254 scalar field modulus (𝔽r) |

**Key fact:** $q \neq r$, so we cannot directly compute in 𝔽q using 𝔽r arithmetic.

### Goal

Prove the following accumulation identity holds in $\mathbb{F}_q$:

$$\boxed{a^{\text{curr}} = a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 \pmod{q}}$$

### Challenge

We can only perform arithmetic in $\mathbb{F}_r$ (the scalar field), but we need to prove correctness in $\mathbb{F}_q$ (the base field).

### Solution Approach

Rewrite as an integer equation with quotient:

$$a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \mathcal{Q} \cdot q - a^{\text{curr}} = 0 \quad (\text{in integers})$$

**Key insight:** If this equation holds:

1. **Modulo $2^{272}$** (via limb arithmetic in 𝔽r), AND
2. **Modulo $r$** (native 𝔽r computation), AND
3. All values are properly range-constrained

Then it holds in integers (since $2^{272} \cdot r > 2^{514}$ > max possible value), which implies it holds modulo $q$.

### Negative Prime Modulus

We work with $-q \pmod{2^{272}}$ to avoid subtraction:

$$\bar{q} := 2^{272} - q$$

Decomposed into limbs:

$$\bar{q} = \bar{q}_0 + 2^{68} \cdot \bar{q}_1 + 2^{136} \cdot \bar{q}_2 + 2^{204} \cdot \bar{q}_3$$

Plus native field representation: $\bar{q}_4 = -q \pmod{r}$

---

## The Problem Statement

### Goal

Prove the following accumulation identity holds in 𝔽q:

$$\boxed{a^{\text{curr}} = a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 \pmod{q}}$$

### Challenge

We can only perform arithmetic in 𝔽r (the scalar field), but we need to prove correctness in 𝔽q (the base field).
Since $q \neq r$, so we cannot directly compute in 𝔽q using 𝔽r arithmetic.

| Symbol | LaTeX | Value                                                                | Description                     |
| ------ | ----- | -------------------------------------------------------------------- | ------------------------------- |
| q      | `q`   | `0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47` | BN254 base field modulus (𝔽q)   |
| r      | `r`   | `0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001` | BN254 scalar field modulus (𝔽r) |

### Solution Approach

Rewrite as an integer equation with quotient:

$$a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \mathcal{Q} \cdot q - a^{\text{curr}} = 0 \quad (\text{in integers})$$

**Key insight:** If this equation holds:

1. **Modulo 2²⁷²** (via limb arithmetic in 𝔽r), AND
2. **Modulo r** (native 𝔽r computation), AND
3. All values are properly range-constrained

Using Chinese Remainder Theorem, then it holds in integers (since $2^{272} \cdot r > 2^{514}$ > max possible value), which implies it holds modulo q.
See [bigfield documentation](barretenberg/cpp/src/barretenberg/stdlib/primitives/bigfield/README.md) for more details on non-native field arithmetic.

## Non-Native Field Relations

The non-native field relation is enforced through **three separate subrelations**:

| Subrelation | Purpose               | Modulus   | Limbs Checked                         |
| ----------- | --------------------- | --------- | ------------------------------------- |
| 1           | Lower mod 2²⁷² check  | $2^{136}$ | Limbs 0, 1                            |
| 2           | Higher mod 2²⁷² check | $2^{136}$ | Limbs 2, 3 (with carry from subrel 1) |
| 3           | Native field check    | $r$       | Full native reconstruction            |

Together, these prove the relation holds in integers.

---

## Subrelation 1: Lower Mod 2¹³⁶ Check

### Goal

Prove that when we compute the accumulation formula using limbs 0 and 1, the result is a multiple of $2^{136}$.

### The Computation

We compute the accumulation using:

- Limb 0 terms (contribute at weight $2^0$)
- Limb 1 terms (contribute at weight $2^{68}$)

The result should be: $\text{Result} = c^{\text{lo}} \cdot 2^{136}$ for some carry $c^{\text{lo}}$.

### Limb 0 Contribution

$$\boxed{T_0 := a_0^{\text{prev}} \cdot x_0 + \texttt{op} + P_{x,0}^{\text{lo}} \cdot v_0 + P_{y,0}^{\text{lo}} \cdot (v^2)_0 + z_{1,0} \cdot (v^3)_0 + z_{2,0} \cdot (v^4)_0 + q_0 \cdot \bar{q}_0 - a_0^{\text{curr}}}$$

**Expanded with all products:**

| Term                                | Product                                           | Weight |
| ----------------------------------- | ------------------------------------------------- | ------ |
| $a_0^{\text{prev}} \cdot x_0$       | Previous acc limb 0 × evaluation challenge limb 0 | $2^0$  |
| $\texttt{op}$                       | Operation code (small value ≤ 8)                  | $2^0$  |
| $P_{x,0}^{\text{lo}} \cdot v_0$     | P.x low limb 0 × batching challenge limb 0        | $2^0$  |
| $P_{y,0}^{\text{lo}} \cdot (v^2)_0$ | P.y low limb 0 × v² limb 0                        | $2^0$  |
| $z_{1,0} \cdot (v^3)_0$             | z₁ limb 0 × v³ limb 0                             | $2^0$  |
| $z_{2,0} \cdot (v^4)_0$             | z₂ limb 0 × v⁴ limb 0                             | $2^0$  |
| $q_0 \cdot \bar{q}_0$               | Quotient limb 0 × negative modulus limb 0         | $2^0$  |
| $-a_0^{\text{curr}}$                | Negative of current accumulator limb 0            | $2^0$  |

### Limb 1 Contribution

$$
\boxed{\begin{align}T_1 := &\; a_1^{\text{prev}} \cdot x_0 + a_0^{\text{prev}} \cdot x_1 \\
&+ P_{x,0}^{\text{lo}} \cdot v_1 + P_{x,1}^{\text{lo}} \cdot v_0 \\
&+ P_{y,0}^{\text{lo}} \cdot (v^2)_1 + P_{y,1}^{\text{lo}} \cdot (v^2)_0 \\
&+ z_{1,0} \cdot (v^3)_1 + z_{1,1} \cdot (v^3)_0 \\
&+ z_{2,0} \cdot (v^4)_1 + z_{2,1} \cdot (v^4)_0 \\
&+ q_0 \cdot \bar{q}_1 + q_1 \cdot \bar{q}_0 \\
&- a_1^{\text{curr}}
\end{align}}
$$

**Expanded with all cross-products:**

| Term                                | Product                                 | Weight   |
| ----------------------------------- | --------------------------------------- | -------- |
| $a_1^{\text{prev}} \cdot x_0$       | Prev acc limb 1 × eval challenge limb 0 | $2^{68}$ |
| $a_0^{\text{prev}} \cdot x_1$       | Prev acc limb 0 × eval challenge limb 1 | $2^{68}$ |
| $P_{x,0}^{\text{lo}} \cdot v_1$     | P.x low limb 0 × batching limb 1        | $2^{68}$ |
| $P_{x,1}^{\text{lo}} \cdot v_0$     | P.x low limb 1 × batching limb 0        | $2^{68}$ |
| $P_{y,0}^{\text{lo}} \cdot (v^2)_1$ | P.y low limb 0 × v² limb 1              | $2^{68}$ |
| $P_{y,1}^{\text{lo}} \cdot (v^2)_0$ | P.y low limb 1 × v² limb 0              | $2^{68}$ |
| $z_{1,0} \cdot (v^3)_1$             | z₁ limb 0 × v³ limb 1                   | $2^{68}$ |
| $z_{1,1} \cdot (v^3)_0$             | z₁ limb 1 × v³ limb 0                   | $2^{68}$ |
| $z_{2,0} \cdot (v^4)_1$             | z₂ limb 0 × v⁴ limb 1                   | $2^{68}$ |
| $z_{2,1} \cdot (v^4)_0$             | z₂ limb 1 × v⁴ limb 0                   | $2^{68}$ |
| $q_0 \cdot \bar{q}_1$               | Quotient limb 0 × neg mod limb 1        | $2^{68}$ |
| $q_1 \cdot \bar{q}_0$               | Quotient limb 1 × neg mod limb 0        | $2^{68}$ |
| $-a_1^{\text{curr}}$                | Negative of current acc limb 1          | $2^{68}$ |

### Combined Subrelation 1 Formula

$$\boxed{L_{\text{even}} \cdot \texttt{op} \cdot \left( T_0 + 2^{68} \cdot T_1 - 2^{136} \cdot c^{\text{lo}} \right) = 0}$$

**Interpretation:**

- Compute $T_0$ (limb 0 contribution)
- Compute $T_1 \cdot 2^{68}$ (limb 1 contribution, shifted by 68 bits)
- Their sum should equal $c^{\text{lo}} \cdot 2^{136}$
- If this holds, the lower 136 bits of the accumulation equation are correct

**Active when:**

- $L_{\text{even}} = 1$ (even rows in mini-circuit)
- $\texttt{op} \neq 0$ (not a no-op)

---

## Subrelation 2: Higher Mod 2¹³⁶ Check

### Goal

Prove that when we compute the accumulation formula using limbs 2 and 3, plus the carry from subrelation 1, the result is a multiple of $2^{136}$.

### The Computation

We compute using:

- The carry $c^{\text{lo}}$ from subrelation 1
- Limb 2 terms (contribute at weight $2^{136}$)
- Limb 3 terms (contribute at weight $2^{204}$)

The result should be: $\text{Result} = c^{\text{hi}} \cdot 2^{136}$ for some carry $c^{\text{hi}}$.

### Limb 2 Contribution (with Carry)

$$
\boxed{\begin{align}T_2 := &\; c^{\text{lo}} \quad \text{(carry from subrelation 1)} \\
&+ a_2^{\text{prev}} \cdot x_0 + a_1^{\text{prev}} \cdot x_1 + a_0^{\text{prev}} \cdot x_2 \\
&+ P_{x,0}^{\text{hi}} \cdot v_0 + P_{x,1}^{\text{lo}} \cdot v_1 + P_{x,0}^{\text{lo}} \cdot v_2 \\
&+ P_{y,0}^{\text{hi}} \cdot (v^2)_0 + P_{y,1}^{\text{lo}} \cdot (v^2)_1 + P_{y,0}^{\text{lo}} \cdot (v^2)_2 \\
&+ z_{1,1} \cdot (v^3)_1 + z_{1,0} \cdot (v^3)_2 \\
&+ z_{2,1} \cdot (v^4)_1 + z_{2,0} \cdot (v^4)_2 \\
&+ q_2 \cdot \bar{q}_0 + q_1 \cdot \bar{q}_1 + q_0 \cdot \bar{q}_2 \\
&- a_2^{\text{curr}}
\end{align}}
$$

**Key cross-products at weight $2^{136}$:**

| Term                            | Product                    | Description                        |
| ------------------------------- | -------------------------- | ---------------------------------- |
| $c^{\text{lo}}$                 | Carry                      | From lower 136-bit computation     |
| $a_2^{\text{prev}} \cdot x_0$   | Acc limb 2 × eval limb 0   | Direct limb 2 term                 |
| $a_1^{\text{prev}} \cdot x_1$   | Acc limb 1 × eval limb 1   | Cross-product $(1,1)$              |
| $a_0^{\text{prev}} \cdot x_2$   | Acc limb 0 × eval limb 2   | Cross-product $(0,2)$              |
| $P_{x,0}^{\text{hi}} \cdot v_0$ | P.x high limb 0 × v limb 0 | High limbs start here              |
| $P_{x,1}^{\text{lo}} \cdot v_1$ | P.x low limb 1 × v limb 1  | Cross-product                      |
| $P_{x,0}^{\text{lo}} \cdot v_2$ | P.x low limb 0 × v limb 2  | Cross-product                      |
| ...                             | (similar for P.y, z₁, z₂)  | All combinations summing to limb 2 |

### Limb 3 Contribution

$$
\boxed{\begin{align}T_3 := &\; a_3^{\text{prev}} \cdot x_0 + a_2^{\text{prev}} \cdot x_1 + a_1^{\text{prev}} \cdot x_2 + a_0^{\text{prev}} \cdot x_3 \\
&+ P_{x,1}^{\text{hi}} \cdot v_0 + P_{x,0}^{\text{hi}} \cdot v_1 + P_{x,1}^{\text{lo}} \cdot v_2 + P_{x,0}^{\text{lo}} \cdot v_3 \\
&+ P_{y,1}^{\text{hi}} \cdot (v^2)_0 + P_{y,0}^{\text{hi}} \cdot (v^2)_1 + P_{y,1}^{\text{lo}} \cdot (v^2)_2 + P_{y,0}^{\text{lo}} \cdot (v^2)_3 \\
&+ z_{1,1} \cdot (v^3)_2 + z_{1,0} \cdot (v^3)_3 \\
&+ z_{2,1} \cdot (v^4)_2 + z_{2,0} \cdot (v^4)_3 \\
&+ q_3 \cdot \bar{q}_0 + q_2 \cdot \bar{q}_1 + q_1 \cdot \bar{q}_2 + q_0 \cdot \bar{q}_3 \\
&- a_3^{\text{curr}}
\end{align}}
$$

**Key cross-products at weight $2^{204}$:**

| Term                          | Product                  | Description                        |
| ----------------------------- | ------------------------ | ---------------------------------- |
| $a_3^{\text{prev}} \cdot x_0$ | Acc limb 3 × eval limb 0 | Direct limb 3 term                 |
| $a_2^{\text{prev}} \cdot x_1$ | Acc limb 2 × eval limb 1 | Cross-product $(2,1)$              |
| $a_1^{\text{prev}} \cdot x_2$ | Acc limb 1 × eval limb 2 | Cross-product $(1,2)$              |
| $a_0^{\text{prev}} \cdot x_3$ | Acc limb 0 × eval limb 3 | Cross-product $(0,3)$              |
| ...                           | (all 4-limb products)    | All combinations summing to limb 3 |

### Combined Subrelation 2 Formula

$$\boxed{L_{\text{even}} \cdot \texttt{op} \cdot \left( T_2 + 2^{68} \cdot T_3 - 2^{136} \cdot c^{\text{hi}} \right) = 0}$$

**Interpretation:**

- Start with carry $c^{\text{lo}}$ from subrelation 1
- Add limb 2 contribution $T_2$
- Add limb 3 contribution $T_3 \cdot 2^{68}$
- Result should be $c^{\text{hi}} \cdot 2^{136}$
- If this holds, the higher 136 bits are correct

**Together with Subrelation 1:** We've proven the relation holds modulo $2^{272}$.

---

## Subrelation 3: Native Field Check

### Goal

Prove the accumulation formula holds when computed directly in 𝔽r (the native field).

### Reconstruction

First, reconstruct all values from their limbs:

$$
\begin{align}
\tilde{P}_x &= P_{x,0}^{\text{lo}} + 2^{68} \cdot P_{x,1}^{\text{lo}} + 2^{136} \cdot P_{x,0}^{\text{hi}} + 2^{204} \cdot P_{x,1}^{\text{hi}} \pmod{r} \\
\tilde{P}_y &= P_{y,0}^{\text{lo}} + 2^{68} \cdot P_{y,1}^{\text{lo}} + 2^{136} \cdot P_{y,0}^{\text{hi}} + 2^{204} \cdot P_{y,1}^{\text{hi}} \pmod{r} \\
\tilde{z}_1 &= z_{1,0} + 2^{68} \cdot z_{1,1} \pmod{r} \\
\tilde{z}_2 &= z_{2,0} + 2^{68} \cdot z_{2,1} \pmod{r} \\
\tilde{a}^{\text{prev}} &= a_0^{\text{prev}} + 2^{68} \cdot a_1^{\text{prev}} + 2^{136} \cdot a_2^{\text{prev}} + 2^{204} \cdot a_3^{\text{prev}} \pmod{r} \\
\tilde{a}^{\text{curr}} &= a_0^{\text{curr}} + 2^{68} \cdot a_1^{\text{curr}} + 2^{136} \cdot a_2^{\text{curr}} + 2^{204} \cdot a_3^{\text{curr}} \pmod{r} \\
\tilde{\mathcal{Q}} &= q_0 + 2^{68} \cdot q_1 + 2^{136} \cdot q_2 + 2^{204} \cdot q_3 \pmod{r}
\end{align}
$$

**Note:** The tilde $\tilde{}$ indicates these are native field reconstructions in 𝔽r, not the original 𝔽q values.

### Subrelation 3 Formula

$$
\boxed{\begin{align}L_{\text{even}} \cdot \texttt{op} \cdot \Big( &\tilde{a}^{\text{prev}} \cdot x_4 \\
&+ \texttt{op} \\
&+ \tilde{P}_x \cdot v_4 \\
&+ \tilde{P}_y \cdot (v^2)_4 \\
&+ \tilde{z}_1 \cdot (v^3)_4 \\
&+ \tilde{z}_2 \cdot (v^4)_4 \\
&+ \tilde{\mathcal{Q}} \cdot \bar{q}_4 \\
&- \tilde{a}^{\text{curr}} \Big) = 0
\end{align}}
$$

Where:

- All arithmetic is performed in $\mathbb{F}_{r}$
- $x_4, v_4, (v^2)_4, (v^3)_4, (v^4)_4$ are the native field representations of the challenges
- $\bar{q}_4 = -q \pmod{r}$

**Interpretation:**

- Reconstruct all limbed values back to native $\mathbb{F}_{r}$ elements
- Compute the accumulation formula directly in $\mathbb{F}_{r}$
- If subrelations 1 and 2 prove it holds mod $2^{272}$, and subrelation 3 proves it holds mod $r$, then it holds in integers

---

## Soundness Argument

### The Two-Moduli Approach

We prove the accumulation identity holds in three ways:

1. **Modulo $2^{136}$ (lower):** Subrelation 1
2. **Modulo $2^{136}$ (higher):** Subrelation 2, which together with 1 gives mod $2^{272}$
3. **Modulo $r$:** Subrelation 3

### Chinese Remainder Theorem Intuition

If an equation holds modulo $M_1$ and modulo $M_2$ where $\gcd(M_1, M_2) = 1$, then it holds modulo $M_1 \cdot M_2$.

**Application:**

- $\gcd(2^{272}, r) = 1$ (since $r$ is odd prime)
- If equation holds mod $2^{272}$ AND mod $r$
- Then it holds mod $2^{272} \cdot r$

### Maximum Value Bound

**Maximum possible value of LHS:**

$$\text{Max} = \max(a^{\text{prev}}) \cdot \max(x) + \text{sum of other products}$$

Each factor is at most $2^{254}$, so:

$$\text{Max} < 2^{254} \cdot 2^{254} + 4 \cdot 2^{254} \cdot 2^{254} < 5 \cdot 2^{508} < 2^{511}$$

**Key inequality:**
$$2^{272} \cdot r > 2^{272} \cdot 2^{254} = 2^{526} > 2^{511} > \text{Max}$$

**Conclusion:**

- If the equation holds mod $2^{272} \cdot r$
- AND all values are bounded as above
- THEN the equation holds in integers (no wraparound possible)
- THEREFORE it holds modulo any smaller modulus, including $q$

### Range Constraints are Critical

The soundness argument **requires** that all limbs are properly range-constrained:

| Limb                                             | Required Range                 | Enforced By                            |
| ------------------------------------------------ | ------------------------------ | -------------------------------------- |
| $P_{x,i}^{\text{lo}}, P_{x,i}^{\text{hi}}$ (i=0) | $[0, 2^{68})$                  | Decomposition + Delta Range Constraint |
| $P_{x,1}^{\text{hi}}$                            | $[0, 2^{50})$                  | Stricter constraint via tail microlimb |
| All other 68-bit limbs                           | $[0, 2^{68})$                  | Permutation argument                   |
| Quotient limbs                                   | $[0, 2^{68})$ or $[0, 2^{52})$ | Permutation argument                   |
| Carries $c^{\text{lo}}, c^{\text{hi}}$           | $[0, 2^{84})$                  | Relation wide limb range constraints   |

**If any limb is out of range**, the maximum value bound is violated and soundness breaks.

---

## Complete Constraint System

### Subrelation 1: Lower 136 Bits

$$
\boxed{\begin{align}
&L_{\text{even}} \cdot \texttt{op} \cdot \Bigg[ \\
&\quad \underbrace{a_0^{\text{prev}} \cdot x_0 + \texttt{op} + \sum_{j} \text{(limb 0 products)}_j - a_0^{\text{curr}}}_{\text{Limb 0: } T_0} \\
&\quad + 2^{68} \cdot \underbrace{\sum_{i,j: i+j=1} \text{(limb } i \text{ × limb } j \text{ products)} - a_1^{\text{curr}}}_{\text{Limb 1: } T_1} \\
&\quad - 2^{136} \cdot c^{\text{lo}} \\
&\Bigg] = 0
\end{align}}
$$

### Subrelation 2: Higher 136 Bits

$$
\boxed{\begin{align}
&L_{\text{even}} \cdot \texttt{op} \cdot \Bigg[ \\
&\quad \underbrace{c^{\text{lo}} + \sum_{i,j: i+j=2} \text{(limb } i \text{ × limb } j \text{ products)} - a_2^{\text{curr}}}_{\text{Limb 2: } T_2} \\
&\quad + 2^{68} \cdot \underbrace{\sum_{i,j: i+j=3} \text{(limb } i \text{ × limb } j \text{ products)} - a_3^{\text{curr}}}_{\text{Limb 3: } T_3} \\
&\quad - 2^{136} \cdot c^{\text{hi}} \\
&\Bigg] = 0
\end{align}}
$$

### Subrelation 3: Native Field

$$
\boxed{\begin{align}
&L_{\text{even}} \cdot \texttt{op} \cdot \Bigg[ \\
&\quad \tilde{a}^{\text{prev}} \cdot x_4 + \texttt{op} + \tilde{P}_x \cdot v_4 + \tilde{P}_y \cdot (v^2)_4 \\
&\quad + \tilde{z}_1 \cdot (v^3)_4 + \tilde{z}_2 \cdot (v^4)_4 + \tilde{\mathcal{Q}} \cdot \bar{q}_4 - \tilde{a}^{\text{curr}} \\
&\Bigg] = 0
\end{align}}
$$

Where all $\tilde{\cdot}$ values are reconstructed from limbs in $\mathbb{F}_{r}$.

### Combined Guarantee

**If all three subrelations hold**, then:

$$a^{\text{curr}} = a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 \pmod{q}$$

is **provably correct in $\mathbb{F}_{q}$**, despite being computed entirely in $\mathbb{F}_{r}$.

---

**This completes the mathematical specification of the Non-Native Field Relation.**
