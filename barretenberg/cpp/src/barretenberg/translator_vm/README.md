# The Translator Circuit

> $\textcolor{orange}{\textsf{Warning}}$: This document provides a technical overview of the Translator Circuit used in the Goblin Plonk proving system. It is intended for understanding the design and optimizations. The code is the source of truth for implementation specifics.

## Table of Contents

1. [Overview](#overview)
2. [High-Level Statement](#high-level-statement)
3. [Architecture and Constants](#architecture-and-constants)
4. [Witness Trace Structure](#witness-trace-structure)
5. [Witness Generation and Proving Key Construction](#witness-generation-and-proving-key-construction)
6. [Interleaving: The Key Optimization](#interleaving-the-key-optimization)
7. [The Seven Relations](#the-seven-relations)
8. [Proof System Details](#proof-system-details)
9. [Proof Size Analysis](#proof-size-analysis)
10. [Critical Components for Auditing](#critical-components-for-auditing)

---

## Overview

The **Translator Circuit** is a critical component of the Goblin Plonk proving system in Aztec. It serves as a bridge between the Mega and ECCVM circuits.

| Curve    | Base Field     | Scalar Field   | Usage                                     |
| -------- | -------------- | -------------- | ----------------------------------------- |
| BN254    | $\mathbb{F}_q$ | $\mathbb{F}_r$ | Used in Mega circuits                     |
| Grumpkin | $\mathbb{F}_r$ | $\mathbb{F}_q$ | Used in ECCVM for efficient EC operations |

When proving recursive circuits with Mega circuit builder, we accumulate elliptic curve operations in an `EccOpQueue`. Proving these ECC operations is delegated to the ECCVM circuit, which operates over the Grumpkin curve. However, the **same operations have different representations** in the two circuits because:

- Mega circuit operates over the BN254 scalar field $\mathbb{F}_r$ so elements in $\mathbb{F}_q$ are non-native (i.e., they need to decomposed into limbs in $\mathbb{F}_r$)
- ECCVM operates over the Grumpkin scalar field $\mathbb{F}_q$ so elements in $\mathbb{F}_q$ are circuit native

For example, consider the operation $(z \cdot P)$ where $P$ is a point on the curve and $z$ is a scalar:

The ECCVM arithmetisation represents this operation (in 1 row) as:

| Opcode | $x$-coordinate | $y$-coordinate | Scalar $z_1$ | Scalar $z_2$ | Full scalar $z$ |
| ------ | -------------- | -------------- | ------------ | ------------ | --------------- |
| `MUL`  | $P_x$          | $P_y$          | $z_1$        | $z_2$        | $z$             |
|        |                |                |              |              |                 |

The Mega circuit arithmetisation represents the same operation (in 2 rows) as:

| Column 1 | Column 2             | Column 3             | Column 4             |
| -------- | -------------------- | -------------------- | -------------------- |
| `MUL`    | $P_{x, \textsf{lo}}$ | $P_{x, \textsf{hi}}$ | $P_{y, \textsf{lo}}$ |
| $0$      | $P_{y, \textsf{hi}}$ | $z_1$                | $z_2$                |
|          |                      |                      |                      |

where $P_x = (P_{x, \textsf{lo}} + 2^{136} \cdot P_{x, \textsf{hi}}), \ P_y = (P_{y, \textsf{lo}} + 2^{136} \cdot P_{y, \textsf{hi}})$ and the scalar $z = (z_1 + 2^{128} \cdot z_2)$.

We need to prove that these two representations are consistent, i.e., that the polynomial evaluations computed in the ECCVM circuit (over $\mathbb{F}_q$) match those computed in the Mega circuit (over $\mathbb{F}_r$).

The Translator circuit is a custom circuit designed to solve this problem. It:

1. **Receives** the ECC op queue in Mega arithmetisation and the batched polynomial evaluation problem from ECCVM (operating over $\mathbb{F}_q$),
2. **Computes** the batched polynomial evaluation using non-native field arithmetic in $\mathbb{F}_r$ and,
3. **Verifies** that the result matches the evaluation provided by ECCVM.

---

## High-Level Statement

The Translator proves that the ECCVM's batched polynomial evaluation of the ECC operations is computed correctly.

**Given:**

- A sequence of `UltraOp` operations from the `EccOpQueue` (each containing: $\text{op}, P_x, P_y, z_1, z_2$)
- An evaluation challenge $x \in \mathbb{F}_q$
- A batching challenge $v \in \mathbb{F}_q$

**Prove:**
$$\boxed{\text{accumulator}_{\text{final}} = \sum_{i=0}^{n-1} x^{n-1-i} \cdot \left( \text{op}_i + v \cdot P_x^{(i)} + v^2 \cdot P_y^{(i)} + v^3 \cdot z_1^{(i)} + v^4 \cdot z_2^{(i)} \right) \pmod{q}}$$

The batching via powers of $v$ combines the 5 values per operation into a single field element, and the powers of $x$ combine all operations into a single accumulator.

Specifically, for each accumulation step (every 2 rows), prove:

$$\text{acc}_{\text{curr}} = \text{acc}_{\text{prev}} \cdot x + \text{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 \pmod{q}$$

**Method:** Since we cannot directly compute in $\mathbb{F}_q$ using $\mathbb{F}_r$ arithmetic (as $q \neq r$), we use non-native field arithmetic. Similar to the technique in [bigfield](../stdlib/primitives/bigfield/README.md), we prove the equation holds in integers:

$$\text{acc}_{\text{prev}} \cdot x + \text{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \text{quotient} \cdot q - \text{acc}_{\text{curr}} = 0$$

We verify this by proving the equation holds:

1. **modulo $2^{272}$** (via 68-bit limb arithmetic split into two 136-bit checks)
2. **modulo $r$** (natively in $\mathbb{F}_r$)
3. with **range constraints** on all limbs (prevents overflow/underflow)

By the Chinese Remainder Theorem, since $2^{272} \cdot r > 2^{514}$ exceeds the maximum possible value, the equation must hold in integers, and thus modulo $q$.

## Architecture and Constants

#### Circuit Size Parameters

```cpp
CONST_TRANSLATOR_MINI_CIRCUIT_LOG_SIZE = 13      // Mini-circuit: 2^13 = 8,192 rows (log₂ of size)
INTERLEAVING_GROUP_SIZE = 16                     // Interleaving factor
CONST_TRANSLATOR_LOG_N = 13 + 4 = 17             // Full circuit: 2^17 = 131,072 rows (log₂ of size)
```

**Why interleaving?** Without interleaving, checking ~64 microlimb columns simultaneously would create a degree-65 polynomial in the permutation argument, making sumcheck impractical. Interleaving reduces this to degree 6-7 by spreading the checks across 16 segments (see [Interleaving section](#interleaving-the-key-optimization)).

#### Field Moduli

```
BN254 Base Field (Fq):
q = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
  ≈ 2^254

BN254 Scalar Field (Fr):
r = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
  ≈ 2^254
```

**Key observation:** $q \neq r$ (they differ by $\approx 2^{47}$), so we cannot directly compute in $\mathbb{F}_q$ using $\mathbb{F}_r$ arithmetic.

#### Limb Decomposition Constants

```cpp
NUM_LIMB_BITS = 68                    // Each limb is 68 bits
NUM_LAST_LIMB_BITS = 50               // Top limb: 254 - 3*68 = 50 bits
NUM_BINARY_LIMBS = 4                  // Total limbs per element

NUM_Z_BITS = 128                      // z₁ and z₂ are 128-bit
NUM_Z_LIMBS = 2                       // z values use 2 limbs (68 + 60 bits)

NUM_QUOTIENT_BITS = 256               // Quotient needs 256 bits
NUM_LAST_QUOTIENT_LIMB_BITS = 52      // 256 - 3*68 = 52 bits

MICRO_LIMB_BITS = 14                  // Range constraint granularity
NUM_MICRO_LIMBS = 6                   // 68 / 14 ≈ 5, plus 1 for tail
```

#### Opcode Values

```cpp
Valid opcodes: {0, 1, 2, 3, 4, 8}
```

Encoding EC operations:

- `0`: No-op / NULL
- `1`: Add
- `2`: Mul (scalar multiplication)
- `3`: Equality check
- `4`: Reset accumulator
- `8`: [Special operation]

#### Range Constraint Constants

```cpp
SORT_STEP = 3                         // Max delta between sorted values
NUM_RANGE_CONSTRAINT_WIRES = 5        // ordered_range_constraints_{0,1,2,3,4}
SORTED_STEPS_COUNT = 2^14 / 3 + 1     // Number of "step" values inserted
                   = 5462 steps
```

Each microlimb must be $≤ 2^{14} - 1 = 16383$.

---

## Witness Trace Structure

The Translator circuit has **81 witness columns**, organized into:

- **4 columns**: EccOpQueue transcript (op, P.x, P.y, z₁, z₂ encoded across 2 rows)
- **13 columns**: Limb decompositions (68-bit limbs for non-native arithmetic)
- **64 columns**: Microlimb decompositions (14-bit microlimbs for range constraints)

The circuit operates on a **2-row cycle structure**. Each EccOpQueue entry occupies exactly 2 rows:

- **Row $2i$ (Even rows)**: **Computation rows** where the non-native field relation is actively checked
- **Row $2i+1$ (Odd rows)**: **Data storage rows** that hold values accessed by the next even row via shifts

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

Each limb is further decomposed into **14-bit microlimbs** for range checking. Each 68-bit limb has 5 microlimbs (14 bits each) plus a "tail" microlimb that enforces tight range constraints. The columns are organized as follows:

| Column Group                                   | Even Row (2i)                                            | Odd Row (2i+1)                                            |
| ---------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Coordinate $P_x$ microlimbs                    |                                                          |                                                           |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_0`             | $P_{x,0}[0]$                                             | $P_{x,1}[0]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_1`             | $P_{x,0}[1]$                                             | $P_{x,1}[1]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_2`             | $P_{x,0}[2]$                                             | $P_{x,1}[2]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_3`             | $P_{x,0}[3]$                                             | $P_{x,1}[3]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_4`             | $P_{x,0}[4]$                                             | $P_{x,1}[4]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0`            | $P_{x,2}[0]$                                             | $P_{x,3}[0]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_1`            | $P_{x,2}[1]$                                             | $P_{x,3}[1]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_2`            | $P_{x,2}[2]$                                             | $P_{x,3}[2]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_3`            | $P_{x,2}[3]$                                             | $P_{x,3}[3]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4`            | $P_{x,2}[4]$                                             | $\textcolor{yellow}{P_{x,3}[\textsf{tail}]}$ (reassigned) |
| Coordinate $P_y$ microlimbs                    |                                                          |                                                           |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0`             | $P_{y,0}[0]$                                             | $P_{y,1}[0]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_1`             | $P_{y,0}[1]$                                             | $P_{y,1}[1]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_2`             | $P_{y,0}[2]$                                             | $P_{y,1}[2]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_3`             | $P_{y,0}[3]$                                             | $P_{y,1}[3]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_4`             | $P_{y,0}[4]$                                             | $P_{y,1}[4]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0`            | $P_{y,2}[0]$                                             | $P_{y,3}[0]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_1`            | $P_{y,2}[1]$                                             | $P_{y,3}[1]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_2`            | $P_{y,2}[2]$                                             | $P_{y,3}[2]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_3`            | $P_{y,2}[3]$                                             | $P_{y,3}[3]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_4`            | $P_{y,2}[4]$                                             | $\textcolor{yellow}{P_{y,3}[\textsf{tail}]}$ (reassigned) |
| Coordinate $z_1$ microlimbs                    |                                                          |                                                           |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_0`               | $z_{1,0}[0]$                                             | $z_{2,0}[0]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_1`               | $z_{1,0}[1]$                                             | $z_{2,0}[1]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_2`               | $z_{1,0}[2]$                                             | $z_{2,0}[2]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_3`               | $z_{1,0}[3]$                                             | $z_{2,0}[3]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_4`               | $z_{1,0}[4]$                                             | $z_{2,0}[4]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_0`              | $z_{1,1}[0]$                                             | $z_{2,1}[0]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_1`              | $z_{1,1}[1]$                                             | $z_{2,1}[1]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_2`              | $z_{1,1}[2]$                                             | $z_{2,1}[2]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_3`              | $z_{1,1}[3]$                                             | $z_{2,1}[3]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_4`              | $z_{1,1}[4]$                                             | $z_{2,1}[4]$                                              |
| Accumulator microlimbs                         |                                                          |                                                           |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0`     | $a_{0}^{\text{curr}}[0]$                                 | $a_{1}^{\text{curr}}[0]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_1`     | $a_{0}^{\text{curr}}[1]$                                 | $a_{1}^{\text{curr}}[1]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_2`     | $a_{0}^{\text{curr}}[2]$                                 | $a_{1}^{\text{curr}}[2]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_3`     | $a_{0}^{\text{curr}}[3]$                                 | $a_{1}^{\text{curr}}[3]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_4`     | $a_{0}^{\text{curr}}[4]$                                 | $a_{1}^{\text{curr}}[4]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0`    | $a_{2}^{\text{curr}}[0]$                                 | $a_{3}^{\text{curr}}[0]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_1`    | $a_{2}^{\text{curr}}[1]$                                 | $a_{3}^{\text{curr}}[1]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_2`    | $a_{2}^{\text{curr}}[2]$                                 | $a_{3}^{\text{curr}}[2]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_3`    | $a_{2}^{\text{curr}}[3]$                                 | $a_{3}^{\text{curr}}[3]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_4`    | $a_{2}^{\text{curr}}[4]$                                 | $\textcolor{yellow}{a_{3}[\textsf{tail}]}$ (reassigned)   |
| Quotient microlimbs                            |                                                          |                                                           |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_0`        | $q_{0}[0]$                                               | $q_{1}[0]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_1`        | $q_{0}[1]$                                               | $q_{1}[1]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_2`        | $q_{0}[2]$                                               | $q_{1}[2]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_3`        | $q_{0}[3]$                                               | $q_{1}[3]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_4`        | $q_{0}[4]$                                               | $q_{1}[4]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_0`       | $q_{2}[0]$                                               | $q_{3}[0]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_1`       | $q_{2}[1]$                                               | $q_{3}[1]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_2`       | $q_{2}[2]$                                               | $q_{3}[2]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_3`       | $q_{2}[3]$                                               | $q_{3}[3]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_4`       | $q_{2}[4]$                                               | $\textcolor{yellow}{q_{3}[\textsf{tail}]}$ (reassigned)   |
| Carry microlimbs                               |                                                          |                                                           |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0`       | $c^{\text{lo}}[0]$                                       | $c^{\text{hi}}[0]$                                        |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_1`       | $c^{\text{lo}}[1]$                                       | $c^{\text{hi}}[1]$                                        |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2`       | $c^{\text{lo}}[2]$                                       | $c^{\text{hi}}[2]$                                        |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_3`       | $c^{\text{lo}}[3]$                                       | $c^{\text{hi}}[3]$                                        |
| Tail microlimbs                                |                                                          |                                                           |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`          | $\textcolor{yellow}{P_{x,0}[\textsf{tail}]}$             | $\textcolor{yellow}{P_{x,1}[\textsf{tail}]}$              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`         | $\textcolor{yellow}{P_{x,2}[\textsf{tail}]}$             | $c^{\text{lo}}[4]$ (reassigned)                           |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`          | $\textcolor{yellow}{P_{y,0}[\textsf{tail}]}$             | $\textcolor{yellow}{P_{y,1}[\textsf{tail}]}$              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`         | $\textcolor{yellow}{P_{y,2}[\textsf{tail}]}$             | $c^{\text{hi}}[4]$ (reassigned)                           |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`            | $\textcolor{yellow}{z_{1,0}[\textsf{tail}]}$             | $\textcolor{yellow}{z_{2,0}[\textsf{tail}]}$              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`           | $\textcolor{yellow}{z_{1,1}[\textsf{tail}]}$             | $\textcolor{yellow}{z_{2,1}[\textsf{tail}]}$              |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`  | $\textcolor{yellow}{a_{0}^{\text{curr}}[\textsf{tail}]}$ | $\textcolor{yellow}{a_{1}^{\text{curr}}[\textsf{tail}]}$  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL` | $\textcolor{yellow}{a_{2}^{\text{curr}}[\textsf{tail}]}$ | $c^{\text{lo}}[5]$ (reassigned)                           |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`     | $\textcolor{yellow}{q_{0}[\textsf{tail}]}$               | $\textcolor{yellow}{q_{1}[\textsf{tail}]}$                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`    | $\textcolor{yellow}{q_{2}[\textsf{tail}]}$               | $c^{\text{hi}}[5]$ (reassigned)                           |
|                                                |                                                          |                                                           |

The tail microlimbs (shown in yellow) enforce tight range constraints by ensuring top limbs use exactly the required number of bits (explained in [Relation 3](#relation-3-decomposition-relation-48-subrelations)).

**Column reuse optimization:** Some columns are reassigned in odd rows to hold tail microlimbs for limbs that don't need all 5 microlimbs. For example, limb $P_{x, 3}$ is only 50 bits (= 3×14 + 8), requiring only 4 microlimbs. The 5th microlimb column `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4` at odd rows is therefore reassigned to hold the tail microlimb for $P_{x,3}$ (and carry values $c^{\text{lo}}[4]$, $c^{\text{hi}}[4]$, etc.).

### Virtual Columns

Some columns are "virtual" and not explicitly stored in the witness trace. Instead, they are computed on-the-fly during relation evaluation using existing columns. These include:

- Interleaved columns for range constraint microlimbs (computed from the physical microlimb columns)
- Sorted (ordered) columns for range constraint microlimbs (computed by sorting the physical microlimb columns)

### Lagrange Polynomials (Precomputed)

The Translator circuit uses **ZERO selector polynomials** (`NUM_SELECTORS = 0`).

Instead, the circuit uses **Lagrange polynomials** to control which constraints are active:

| Polynomial                     | Description                     | Active Rows                           |
| ------------------------------ | ------------------------------- | ------------------------------------- |
| `lagrange_even_in_minicircuit` | Even indices in mini-circuit    | $i \in \{0, 2, 4, ..., 8190\}$ (mini) |
| `lagrange_odd_in_minicircuit`  | Odd indices in mini-circuit     | $i \in \{1, 3, 5, ..., 8191\}$ (mini) |
| `lagrange_first`               | First row                       | $i = 0$                               |
| `lagrange_last_in_minicircuit` | Last row in mini-circuit        | $i = 8191$ (mini)                     |
| `lagrange_result_row`          | Row containing final result     | Specific row in trace                 |
| `lagrange_masking`             | Masking rows for zero-knowledge | Last few rows                         |
| `lagrange_mini_masking`        | Masking within mini-circuit     | Last rows of mini-circuit             |

The circuit's regularity (2-row cycles, uniform structure) allows using Lagrange polynomials, which are more efficient than custom selectors.

---

## Witness Generation and Proving Key Construction

This section details how the Translator circuit's witness polynomials are populated and how zero-knowledge is achieved through masking.

### Overview

Witness generation transforms the `EccOpQueue` from the Mega circuit into the 91 polynomials required by the Translator circuit:

```
Input:  EccOpQueue (n operations)
        Evaluation challenge x ∈ Fq
        Batching challenge v ∈ Fq

Output: 91 polynomials of size 2^17
        - 81 witness polynomials
        - 5 ordered range constraint polynomials
        - 4 interleaved range constraint polynomials (virtual)
        - 1 precomputed extra numerator
```

**Note:** Witness generation happens in the **mini-circuit size** (2¹³ = 8,192 rows), then is expanded to **full circuit size** (2¹⁷ = 131,072 rows) through interleaving and zero-padding.

### Step 1: Populate Transcript Polynomials

The prover receives the `EccOpQueue` from the Mega circuit. Each entry contains:

$$\texttt{UltraOp} = \{\texttt{op}, P_x, P_y, z_1, z_2\}$$

For operation $i$ at rows $2i$ (even) and $2i+1$ (odd), populate:

**Even row ($2i$):**

$$
\begin{aligned}
\texttt{OP}[2i] &= \texttt{op}_i \\
\texttt{X\_LO\_Y\_HI}[2i] &= P_{x,\text{lo}} = P_x \bmod 2^{136} \\
\texttt{X\_HI\_Z\_1}[2i] &= P_{x,\text{hi}} = \lfloor P_x / 2^{136} \rfloor \\
\texttt{Y\_LO\_Z\_2}[2i] &= P_{y,\text{lo}} = P_y \bmod 2^{136}
\end{aligned}
$$

**Odd row ($2i+1$):**

$$
\begin{aligned}
\texttt{OP}[2i+1] &= 0 \\
\texttt{X\_LO\_Y\_HI}[2i+1] &= P_{y,\text{hi}} = \lfloor P_y / 2^{136} \rfloor \\
\texttt{X\_HI\_Z\_1}[2i+1] &= z_1 \\
\texttt{Y\_LO\_Z\_2}[2i+1] &= z_2
\end{aligned}
$$

### Step 2: Compute Binary Limb Decompositions

Each 136-bit transcript value is further decomposed into two 68-bit limbs. For $P_{x,\text{lo}}$:

$$P_{x,\text{lo}} = P_{x,0}^{\text{lo}} + 2^{68} \cdot P_{x,1}^{\text{lo}}$$

where:

- $P_{x,0}^{\text{lo}} = P_{x,\text{lo}} \bmod 2^{68}$

- $P_{x,1}^{\text{lo}} = \lfloor P_{x,\text{lo}} / 2^{68} \rfloor$

Even row ($2i$) limb assignments:

$$
\begin{aligned}
\texttt{P\_X\_LOW\_LIMBS}[2i] &= P_{x,0}^{\text{lo}} \\
\texttt{P\_X\_HIGH\_LIMBS}[2i] &= P_{x,0}^{\text{hi}} \\
\texttt{P\_Y\_LOW\_LIMBS}[2i] &= P_{y,0}^{\text{lo}} \\
\texttt{P\_Y\_HIGH\_LIMBS}[2i] &= P_{y,0}^{\text{hi}} \\
\texttt{Z\_LOW\_LIMBS}[2i] &= z_{1,0} \\
\texttt{Z\_HIGH\_LIMBS}[2i] &= z_{1,1}
\end{aligned}
$$

Odd row ($2i+1$) limb assignments:

$$
\begin{aligned}
\texttt{P\_X\_LOW\_LIMBS}[2i+1] &= P_{x,1}^{\text{lo}} \\
\texttt{P\_X\_HIGH\_LIMBS}[2i+1] &= P_{x,1}^{\text{hi}} \\
\texttt{P\_Y\_LOW\_LIMBS}[2i+1] &= P_{y,1}^{\text{lo}} \\
\texttt{P\_Y\_HIGH\_LIMBS}[2i+1] &= P_{y,1}^{\text{hi}} \\
\texttt{Z\_LOW\_LIMBS}[2i+1] &= z_{2,0} \\
\texttt{Z\_HIGH\_LIMBS}[2i+1] &= z_{2,1}
\end{aligned}
$$

### Step 3: Compute Accumulator and Quotient

For each even row $2i$, compute the accumulator update and quotient. The accumulator evolves as:

$$a^{\text{curr}} = a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 \pmod{q}$$

The current and the previous accumulators are decomposed into 4 limbs each:

$$
\begin{aligned}
a^{\text{curr}} &=
a_0^{\text{curr}}
+
2^{68} \cdot a_1^{\text{curr}}
+
2^{136} \cdot a_2^{\text{curr}}
+
2^{204} \cdot a_3^{\text{curr}}
\\[5pt]
a^{\text{prev}} &=
a_0^{\text{prev}}
+
2^{68} \cdot a_1^{\text{prev}}
+
2^{136} \cdot a_2^{\text{prev}}
+
2^{204} \cdot a_3^{\text{prev}}
\end{aligned}
$$

Since we're working in $\mathbb{F}_r$ (not $\mathbb{F}_q$), we must compute the quotient $\mathcal{Q}$ such that:

$$a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 = \mathcal{Q} \cdot q + a^{\text{curr}}$$

$$
\implies \mathcal{Q} = \left\lfloor \frac{a^{\text{prev}} \cdot x + \texttt{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4}{q} \right\rfloor
$$

The quotient is then decomposed into 4 limbs (68 + 68 + 68 + 52 bits):

$$\mathcal{Q} = q_0 + 2^{68} \cdot q_1 + 2^{136} \cdot q_2 + 2^{204} \cdot q_3$$

**Carry computation:** The relation-wide limbs $c^{\text{lo}}$ and $c^{\text{hi}}$ (84 bits each) capture overflow from the mod $2^{136}$ checks:

$$c^{\text{lo}} = \left\lfloor \frac{T_0 + 2^{68} \cdot T_1}{2^{136}} \right\rfloor, \quad c^{\text{hi}} = \left\lfloor \frac{c^{\text{lo}} + T_2 + 2^{68} \cdot T_3}{2^{136}} \right\rfloor$$

where $T_0, T_1, T_2, T_3$ are the limb contributions defined in [RELATIONS.md](RELATIONS.md).

### Step 4: Microlimb Decomposition

Each 68-bit limb is decomposed into five 14-bit microlimbs plus a tail microlimb for range tightening. For a general 68-bit limb $\ell$:

$$\ell = \sum_{k=0}^{4} 2^{14k} \cdot m_k$$

where each $m_k \in [0, 2^{14})$ and $m_4 \in [0, 2^{12})$ (since $68 = 14 \times 4 + 12$).

**Tail microlimb:** To enforce $m_4 < 2^{12}$, compute:

$$m_{\text{tail}} = m_4 \cdot 2^{14-12} = m_4 \cdot 4$$

The decomposition relation enforces $m_{\text{tail}} \in [0, 2^{14})$, which implies $m_4 \in [0, 2^{12})$. For limbs with fewer bits, the tail microlimb is adjusted accordingly.

- 50-bit limbs (top limb): $m_3 \in [0, 2^8) \implies$ tail shift is $2^{14-8} = 64$
- 60-bit limbs (z high): $m_4 \in [0, 2^4)\implies$ tail shift is $2^{14-4} = 1024$

### Step 5: Construct Interleaved Polynomials

The 64 microlimb columns are organized into 4 groups of 16 columns each. Each group is **interleaved** into a single polynomial at full circuit size.

**Interleaving formula:** For group polynomials $\{p_0, p_1, \ldots, p_{15}\}$ each of mini-size $n = 2^{13}$:

$$p_{\text{interleaved}}(x) = \sum_{j=0}^{15} x^j \cdot p_j(x^{16})$$

**In coefficient form:** Element at position $i \cdot 16 + j$ in the interleaved polynomial comes from row $i$ of polynomial $p_j$:

$$p_{\text{interleaved}}[i \cdot 16 + j] = p_j[i] \quad \text{for } i \in [0, n), \ j \in [0, 16)$$

This expands the circuit from mini-size $2^{13}$ to full size $2^{17} = 2^{13} \times 16$.

**Illustration:** We have a total of 64 microlimb columns, each with $n = 2^{13}$ rows (mini-circuit size). We illustrate the microlimb distribution and interleaving process below:

1. Let $I_{\textsf{size}} = 16$ be the number of microlimb columns in one group. Since we have 64 microlimb columns, we will have 4 groups.

2. Each group separates the microlimbs into circuit witnesses ($n-m$ rows in orange) and masking values ($m$ rows in gray).

3. For each group, we interleave the microlimbs to create one interleaved polynomial of size $(n - m) \cdot I_{\textsf{size}}$ for circuit witnesses and $m \cdot I_{\textsf{size}}$ for masking values.

$$
\begin{array}{rllll}
n - m
&
\overbrace{
\textcolor{orange}{
   \boxed{
      \begin{array}{ccccc}
      \\
      \\
      \\
      & & W & & \\
      \\
      \\
      \\
      \end{array}
   }
}
}^{I_{\textsf{size}}}
\
\overbrace{
\textcolor{orange}{
   \boxed{
      \begin{array}{ccccc}
      \\
      \\
      \\
      & & W & & \\
      \\
      \\
      \\
      \end{array}
   }
}
}^{I_{\textsf{size}}}
\
\overbrace{
\textcolor{orange}{
   \boxed{
      \begin{array}{ccccc}
      \\
      \\
      \\
      & & W & & \\
      \\
      \\
      \\
      \end{array}
   }
}
}^{I_{\textsf{size}}}
\
\overbrace{
\textcolor{orange}{
   \boxed{
      \begin{array}{ccccc}
      \\
      \\
      \\
      & & W & & \\
      \\
      \\
      \\
      \end{array}
   }
}
}^{I_{\textsf{size}}}
\\[2pt]
m
&
\textcolor{grey}{
   \boxed{
      \begin{array}{ccccc}
      & & M & & \\
      \end{array}
   }
}
\
\textcolor{grey}{
   \boxed{
      \begin{array}{ccccc}
      & & M & & \\
      \end{array}
   }
}
\
\textcolor{grey}{
   \boxed{
      \begin{array}{ccccc}
      & & M & & \\
      \end{array}
   }
}
\
\textcolor{grey}{
   \boxed{
      \begin{array}{ccccc}
      & & M & & \\
      \end{array}
   }
}
\end{array}

\xrightarrow[]{\textsf{interleaved polys}}

\begin{array}{lllll}
I_1 \quad I_2 \quad I_3 \quad I_4 \\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
&
N - m \cdot I_{\textsf{size}}
\\
\\[-10pt]
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
&
m \cdot I_{\textsf{size}}
\end{array}
$$

### Step 6: Construct Ordered (Sorted) Polynomials

The permutation argument requires proving that the interleaved microlimbs equal the **sorted** microlimbs. The prover constructs 5 ordered polynomials by collecting microlimbs from all 64 columns, sorting them, and distributing across ordered polynomials with inserted step values. We first describe the mathematical setup and then illustrate the construction steps.

**Constants:**

- Mini-circuit size: $n = 2^{13} = 8{,}192$
- Number of masked rows in mini-circuit: $m = 4$
- Mini-circuit size without masking: $(n - m) = 8{,}188$
- Number of interleaving groups: $G = 4$
- Group size: $I_{\text{size}} = 16$ (polynomials per group)
- Full circuit size: $N := n \cdot I_{\text{size}} = 2^{17} = 131{,}072$
- Circuit size without masking: $N_{\text{no-mask}} = N - m \cdot I_{\textsf{size}}$
- Step sequence size: $N_{\text{steps}} = 5{,}462$

**Step sequence:** The sorted steps $\mathcal{S} = \{s_0, s_1, \ldots, s_{5461}\}$ where:
$$s_i = 3i \quad \text{for } i \in [0, 5461], \quad s_{5461} = 16{,}383 = 2^{14} - 1$$

This ensures coverage of all values in $[0, 2^{14})$ with max gap of 3.

#### Step 6.1: Collect Microlimbs from Each Group

For each group $g \in \{0, 1, 2, 3\}$, collect all microlimbs from its 16 polynomials:

$$\mathcal{M}_g = \bigcup_{j=0}^{15} \Big\{ p_{g,j}[i] : i \in [0, (n-m)) \Big\}$$

where $p_{g,j}$ is the $j$-th polynomial in group $g$. Size of each group microlimb set:

$$|\mathcal{M}_g| = 16 \times (n - m)$$

and total microlimbs across all groups:
$$|\mathcal{M}_0 \cup \mathcal{M}_1 \cup \mathcal{M}_2 \cup \mathcal{M}_3| = 64 \times (n - m).$$

#### Step 6.2: Determine Capacity for Each Ordered Polynomial

Each ordered polynomial has size $N$ but must accommodate:

1. Microlimbs from the circuit (actual witness values)
2. Step values $\mathcal{S}$ (for delta range constraint)

**Capacity per ordered polynomial (for circuit microlimbs):**
$$C_{\text{capacity}} = N_{\text{no-mask}} - N_{\text{steps}} = N_{\text{no-mask}} - 5{,}462$$

This is the maximum number of witnesses each ordered polynomial can hold before adding step values.

#### Step 6.3: Distribute Microlimbs to Ordered Polynomials

For groups 0-3, construct `ordered_range_constraints_i` by:

1. Collect microlimbs from group $g$: $\mathcal{M}_g$
2. Take first $C_{\text{capacity}}$ elements (arbitrarily ordered at this point)
3. Add step values $\mathcal{S}$
4. Sort the combined set

Mathematically, for $g \in \{0, 1, 2, 3\}$:

$$
\text{ordered}[g]_{\text{unsorted}} = \begin{cases}
\mathcal{M}_g[k] & \text{if } k < C_{\text{capacity}} \\
\mathcal{S}[k - C_{\text{capacity}}] & \text{if } C_{\text{capacity}} \leq k < N_{\text{no-mask}} \\
0 & \text{if } k \geq N_{\text{no-mask}} \text{ (masking region)}
\end{cases}
$$

Then sort:
$$\text{ordered}[g] = \text{sort}(\text{ordered}[g]_{\text{unsorted}})$$

Overflow microlimbs: If $|\mathcal{M}_g| > C_{\text{capacity}}$, the excess microlimbs go to group 4:

$$\mathcal{M}_{g,\text{overflow}} = \left\{ \mathcal{M}_g[k] : k \geq C_{\text{capacity}} \right\}$$

$$|\mathcal{M}_{g,\text{overflow}}| = |\mathcal{M}_g| - C_{\text{capacity}}$$

#### Step 6.4: Construct the 5th Ordered Polynomial

The 5th ordered polynomial (`ordered_range_constraints_4`) collects all overflow:

$$\mathcal{M}_{\text{overflow}} = \bigcup_{g=0}^{3} \mathcal{M}_{g,\text{overflow}}$$

Size of overflow:
$$|\mathcal{M}_{\text{overflow}}| = 4 \times |\mathcal{M}_{g,\text{overflow}}| = 4 \times (16 \times (n - m) - C_{\text{capacity}})$$

Then construct:

$$
\text{ordered}[4]_{\text{unsorted}} = \begin{cases}
\mathcal{M}_{\text{overflow}}[k] & \text{if } k < |\mathcal{M}_{\text{overflow}}| \\
\mathcal{S}[k - |\mathcal{M}_{\text{overflow}}|] & \text{if } |\mathcal{M}_{\text{overflow}}| \leq k < |\mathcal{M}_{\text{overflow}}| + N_{\text{steps}} \\
0 & \text{otherwise}
\end{cases}
$$

Then sort:
$$\text{ordered}[4] = \text{sort}(\text{ordered}[4]_{\text{unsorted}})$$

**Illustration:** We start with the 4 interleaved polynomials constructed earlier:

1. First, we add an extra numerator polynomial $I_5$ containing the step values (shown in green, repeated 5 times) to enable the delta range constraint.

2. The remainder of $I_5$ is filled with zero-padding (shown in violet) to match the size $N$ of the interleaved polynomials.

3. In the four interleaved polynomials, we have circuit witness values (orange) and masking values (gray). We also show the overflow microlimbs that will go into the 5th ordered polynomial (smaller orange boxes).

4. We then construct the ordered polynomials $O_1, \dots, O_5$ by adding the step values into each interleaved polynomial and sorting the witness values appropriately.

5. The randomess in the masking region (gray) is redistributed to ensure that the multisets of the interleaved polynomials plus extra numerator equal the multisets of the ordered polynomials. Hence, the number of masking rows in each of the ordered polynomials is at least $\left\lfloor\frac{4 \cdot m \cdot I_{\textsf{size}}}{5}\right\rfloor$. The remainder of the rows in each ordered polynomial is filled with zero-padding.

$$
\begin{array}{rllll}
& I_1 \quad I_2 \quad I_3 \quad I_4 \\
N - m \cdot I_{\textsf{size}}
&
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[60pt]
\end{array}
}}
\\
\\[-10pt]
m \cdot I_{\textsf{size}}
&
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\end{array}

\xrightarrow[]{\textsf{add extra numerator}}

\begin{array}{lrrrrr}
I_1 \quad I_2 \quad I_3 \quad I_4 \\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\\
\\[-10pt]
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\\
\\[-10pt]
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-3pt]\\[-3pt]
\end{array}
}}
\end{array}

\begin{array}{l}
   I_5 \\
   \textcolor{lightgreen}{
   \boxed{
   \begin{array}{c}
   s \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{lightgreen}{
   \boxed{
   \begin{array}{c}
   s \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{lightgreen}{
   \boxed{
   \begin{array}{c}
   s \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{lightgreen}{
   \boxed{
   \begin{array}{c}
   s \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{lightgreen}{
   \boxed{
   \begin{array}{c}
   s \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{violet}{
   \boxed{
   \begin{array}{c}
   \\ \\ z \\ \\[2pt]
   \end{array}
   }}
\end{array}

\xrightarrow[]{\textsf{sort into ordered polys}}


\begin{array}{lrrrrr}
O_1 \quad O_2 \ \ O_3 \quad O_4 \\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\
\textcolor{orange}{
\boxed{
\begin{array}{c}
\\ \\ \\ \\ \\ \\ \\[25pt]
\end{array}
}}
\\
\\[-10pt]
\textcolor{lightgreen}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\
\textcolor{lightgreen}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\
\textcolor{lightgreen}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\
\textcolor{lightgreen}{
\boxed{
\begin{array}{c}
\\[1pt]
\end{array}
}}
\\
\\[-10pt] \hline\hline
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-6pt]\\[-6pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-6pt]\\[-6pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-6pt]\\[-6pt]
\end{array}
}}
\
\textcolor{gray}{
\boxed{
\begin{array}{c}
\\[-6pt]\\[-6pt]
\end{array}
}}
\\
\\[-10pt]
\textcolor{violet}{
\boxed{
\begin{array}{c}
\\[-2pt]
\end{array}
}}
\
\textcolor{violet}{
\boxed{
\begin{array}{c}
\\[-2pt]
\end{array}
}}
\
\textcolor{violet}{
\boxed{
\begin{array}{c}
\\[-2pt]
\end{array}
}}
\
\textcolor{violet}{
\boxed{
\begin{array}{c}
\\[-2pt]
\end{array}
}}
\end{array}

\begin{array}{l}
   O_5 \\
   \textcolor{orange}{
   \boxed{
   \begin{array}{c}
   \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{orange}{
   \boxed{
   \begin{array}{c}
   \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{orange}{
   \boxed{
   \begin{array}{c}
   \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{orange}{
   \boxed{
   \begin{array}{c}
   \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{lightgreen}{
   \boxed{
   \begin{array}{c}
   \\[1pt]
   \end{array}
   }}
   \\
   \\[-10pt]
   \textcolor{violet}{
   \boxed{
   \begin{array}{c}
   \\[10pt]
   \end{array}
   }}
   \\
   \\[-10pt] \hline\hline
   \textcolor{gray}{
   \boxed{
   \begin{array}{c}
   \\[-6pt]\\[-6pt]
   \end{array}
   }}
   &
   \longleftarrow {\scriptsize \textsf{randomness of size}} \left\lfloor\frac{4 \cdot m \cdot I_{\textsf{size}}}{5}\right\rfloor
   \\
   \\[-10pt]
   \textcolor{violet}{
   \boxed{
   \begin{array}{c}
   \\[-2pt]
   \end{array}
   }}
\end{array}
$$

> In our case, we have $m=4$ and $I_{\textsf{size}}=16$ which results in $(m \cdot I_{\textsf{size}}) = 64$ masked rows in each interleaved polynomials. Thus, each ordered polynomial will have at least $\left\lfloor\frac{4 \cdot 64}{5}\right\rfloor = 51$ masked rows. The remainder masked row is added to the first ordered polynomial. The masking rows in each ordered polynomial are padded with zero values to ensure the multiset equality holds.
>
> As illustrated, the two sets of interleaved and ordered polynomials satisfy the multiset equality:
> $$\bigcup_{i=1}^5 I_i = \bigcup_{i=1}^5 O_i.$$

### Step 7: Zero-Knowledge Masking

To achieve zero-knowledge, the prover adds random values to the end of polynomials.
For each of the witness polynomials, the masking region is defined as the last $m$ rows of the mini-circuit size, indexed as:

$$[n - m, \ n).$$

After interleaving, the 4 interleaved polynomials have random values at positions:

$$[N - m \cdot I_{\textsf{size}}, \ N).$$

#### Redistributing Randomness to Ordered Polynomials

The ordered polynomials must be committed (unlike interleaved polynomials, which are virtual). To maintain zero-knowledge, the prover redistributes the random values from the 4 interleaved to the 5 ordered polynomials. As illustrated above, each ordered polynomial receives approximately an equal share of the randomness from the interleaved polynomials. The total number of random values in the interleaved polynomials:

$$M = 4 \cdot m \cdot I_{\textsf{size}}.$$

To distribute these $M$ random values to 5 ordered polynomials, each ordered polynomial receives $\left\lfloor\frac{M}{5}\right\rfloor$ random values in its masking region. The remaining random values (if $M$ is not divisible by 5) are distributed one per ordered polynomial starting from the first. Further, since

$$
\underbrace{(m \cdot I_{\textsf{size}})}_{\textsf{size of masking region}} >
\underbrace{\left\lfloor \left(\frac{4}{5} \cdot m \cdot I_{\textsf{size}}\right) \right\rfloor}_{\textsf{size of randomness in ordered polys}},
$$

the remaining positions in the ordered masking region are filled with zeros.

**Note:** The same random values appear in both interleaved and ordered polynomials (just at different positions within the masking region). This is why the $\beta \cdot L_{\text{mask}}$ term is needed in the permutation relation - see [RELATIONS.md](RELATIONS.md#permutation-relation-mathematical-specification) for details.

Some positions in the ordered masking region contain random values, others contain zeros. The `ordered_extra_range_constraints_numerator` compensates for these zeros in the permutation check.

### Step 8: Precomputed Polynomials

Several polynomials are **precomputed** and independent of the witness:

#### Lagrange Polynomials

Define row-specific selectors:

$$
\begin{aligned}
\texttt{lagrange\_first}[i] &= \begin{cases} 1 & i = 0 \\ 0 & \text{otherwise} \end{cases} \\
\texttt{lagrange\_last}[i] &= \begin{cases} 1 & i = 2^{17} - 1 \\ 0 & \text{otherwise} \end{cases} \\
\texttt{lagrange\_even}[i] &= \begin{cases} 1 & i \in [0, 2^{13}), \ i \text{ even} \\ 0 & \text{otherwise} \end{cases} \\
\texttt{lagrange\_odd}[i] &= \begin{cases} 1 & i \in [0, 2^{13}), \ i \text{ odd} \\ 0 & \text{otherwise} \end{cases}
\end{aligned}
$$

#### Ordered Extra Range Constraints Numerator

This polynomial contains the "step values" repeated to balance the permutation:

$$\texttt{ordered\_extra}[i \cdot 5 + j] = \text{sorted\_steps}[i] \quad \text{for } i \in [0, 5462), \ j \in [0, 5)$$

where $\text{sorted\_steps} = \{0, 3, 6, 9, \ldots, 16383\}$.

This ensures the multisets balance:

- **Numerator:** 4 interleaved + 1 extra (with 5 copies of each step value)
- **Denominator:** 5 ordered (each with 1 copy of each step value)

---

## Interleaving: The Key Optimization

The Translator must range-constrain approximately 64 different microlimb sets using permutation argument. The permutation argument's degree equals $1 + \text{NUM\_COLS}$, where NUM_COLS is the number of columns being permuted:

$$
z_{\textsf{perm}}[i+1] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{ordered}[j] + \beta + \gamma) =
z_{\textsf{perm}}[i] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{interleaved}[j] + \beta + \gamma)
$$

**The Problem:** Permuting all ~64 microlimb columns simultaneously yields degree $1 + 64 = 65$, making sumcheck impractical.

**The Solution:** Interleave 16 logical column groups into the same 5 physical wires across 16 circuit segments. Each segment performs an independent permutation check with degree $1 + 5 = 6$ (or 7 with Lagrange selector). This reduces the relation degree by 9×.

### Circuit Structure

```
Mini-circuit size:  2^13 = 8,192 rows    (actual computation)
Full circuit size:  2^17 = 131,072 rows  (16× larger for interleaving)
FULL_SIZE = MINI_SIZE × INTERLEAVING_GROUP_SIZE = 8,192 × 16
```

To compute the interleaved polynomials, we group 16 polynomials together and interleave their coefficients. Consider the following 16 polynomials each of size $n=2^{13}$ in the mini-circuit:

$$
\newcommand{\arraystretch}{1.2}
\begin{array}{|c|c|c|c|c|c|}
\hline
\textsf{index} & \textsf{poly 1} & \textsf{poly 2} & \textsf{poly 3} & \ldots & \textsf{poly 16} \\
\hline
0 & \textcolor{skyblue}{a_0} & \textcolor{orange}{b_0} & \textcolor{lightgreen}{c_0} & \quad \ldots \quad & \textcolor{firebrick}{p_0} \\
1 & \textcolor{skyblue}{a_1} & \textcolor{orange}{b_1} & \textcolor{lightgreen}{c_1} & \quad \ldots \quad & \textcolor{firebrick}{p_1} \\
2 & \textcolor{skyblue}{a_2} & \textcolor{orange}{b_2} & \textcolor{lightgreen}{c_2} & \quad \ldots \quad & \textcolor{firebrick}{p_2} \\
3 & \textcolor{skyblue}{a_3} & \textcolor{orange}{b_3} & \textcolor{lightgreen}{c_3} & \quad \ldots \quad & \textcolor{firebrick}{p_3} \\[5pt]
\vdots & \vdots & \vdots & \vdots & \ddots & \vdots \\[5pt]
n-1 & \textcolor{skyblue}{a_{n-1}} & \textcolor{orange}{b_{n-1}} & \textcolor{lightgreen}{c_{n-1}} & \quad \ldots \quad & \textcolor{firebrick}{p_{n-1}} \\
\hline
\end{array}
\quad \longrightarrow \quad
\begin{array}{|c|c|c|}
\hline
\textsf{group} & \textsf{index} & \textsf{interleaved} \\
\hline
0 & 0 & \textcolor{skyblue}{a_0} \\
0 & 1 & \textcolor{orange}{b_0} \\
0 & 2 & \textcolor{lightgreen}{c_0} \\
\vdots & \vdots & \vdots \\[3pt]
1 & 15 & \textcolor{firebrick}{p_0} \\ \hline
1 & 4 & \textcolor{skyblue}{a_1} \\
1 & 5 & \textcolor{orange}{b_1} \\
1 & 6 & \textcolor{lightgreen}{c_1} \\
\vdots & \vdots & \vdots \\[3pt]
1 & 7 & \textcolor{firebrick}{p_1} \\ \hline
\vdots & \vdots & \vdots \\[5pt]
\vdots & \vdots & \vdots \\ \hline
n-1 & 4n-4 & \textcolor{skyblue}{a_{n-1}} \\
n-1 & 4n-3 & \textcolor{orange}{b_{n-1}} \\
n-1 & 4n-2 & \textcolor{lightgreen}{c_{n-1}} \\
\vdots & \vdots & \vdots \\[3pt]
n-1 & 4n-1 & \textcolor{firebrick}{p_{n-1}} \\
\hline
\end{array}
$$

The resulting interleaved polynomial has size $16n = 2^{17}$.
For 64 microlimb columns, we have 4 groups of 16 columns each, resulting in four interleaved polynomials. Note that the interleaved polynomials are "physical" wires in the circuit trace: we refer to them as virtual polynomials. Each of these groups performs an independent permutation check:

- **Numerator:** 4 interleaved wires + 1 extra = 5 terms
- **Denominator:** 5 ordered wires = 5 terms
- **Degree:** $1 + 5 = 6$ (or 7 with Lagrange)

The permutation argument verifies that within each group, the interleaved values are a permutation of the ordered (sorted) values. Due to interleaving, the total circuit size increases 16×, requiring more zero-padding (enforced by Relation 7). Interleaving trades circuit size (inexpensive) for relation degree (expensive). The 16× size increase is acceptable given the 9× degree reduction.

> $\textcolor{orange}{\textsf{Effect on Commitment Scheme}}$: The interleaved polynomials do not require separate commitments. During proving key construction, the prover computes them for use in sumcheck. In the Gemini PCS phase, the prover sends only **two additional field element evaluations** $P_+(r^{16})$ and $P_-(r^{16})$ where $r$ is the Gemini challenge:
> $$P_{\pm}(x) = \sum_{i=0}^{15} (\pm r)^i \cdot p_{i}(x)$$
> The verifier reconstructs full batched polynomial evaluations as $A_0(r) = A_{0+}(r) + P_+(r^{16})$ and $A_0(-r) = A_{0-}(-r) + P_-(r^{16})$. Since $P_{\pm}(r^{16})$ relates to evaluations $p_i(r^{16})$ already in the Gemini protocol, no additional commitments are needed. The PCS proof grows by only **2 field elements**.
>
> For polynomials $p_0, \dots, p_{15}$ of size $n$, the interleaved polynomial of size $16n$ is:
> $$p_{\textsf{interleaved}}(x) = \sum_{i=0}^{15} x^i \cdot p_{i}(x^{16})$$

---

## Proof System Details

### Proof System Type

**TranslatorFlavor** uses:

- **HyperNova-style sumcheck** with ZK (zero-knowledge)
- **KZG polynomial commitment scheme** over BN254
- **Libra** for ZK masking
- **Gemini + Shplonk** for batched polynomial openings (Shplemini protocol)

### Inputs to the Prover

```cpp
struct TranslatorProverInput {
    // From ECCVM
    std::vector<UltraOp> ecc_op_queue;          // EC operations to batch
    Fq evaluation_challenge_x;                   // Challenge point x ∈ Fq
    Fq batching_challenge_v;                     // Batching challenge v ∈ Fq

    // Expected output (from ECCVM verification)
    Fq expected_accumulator_result;              // What acc_final should be

    // Powers of challenges (precomputed)
    Fq x;
    Fq v, v_squared, v_cubed, v_quartic;

    // Proving key
    std::shared_ptr<TranslatorProvingKey> proving_key;
};
```

**Construction:**

1. For each `UltraOp` in the queue, generate witness values:
   - Decompose P.x, P.y, z₁, z₂ into limbs and microlimbs
   - Compute quotient and new accumulator
   - Compute relation wide limbs
2. Fill witness polynomials (81 wires × circuit_size values)
3. Construct ordered range constraint polynomials via sorting
4. Create interleaved polynomials

### Prover Algorithm

```
TranslatorProver::prove():
  1. OINK phase (witness commitment):
     - Commit to all 91 witness polynomials (90 + masking)
     - Generate commitment challenges

  2. Sumcheck phase:
     - For each round d = 1 to 17:
       - Compute sumcheck univariates over all 7 relations
       - Send univariate coefficients to verifier
       - Receive challenge u_d
     - Output: Claimed evaluations at challenge point ū

  3. Libra ZK sumcheck masking:
     - Generate ZK commitments
     - Prove claimed evaluation matches with ZK

  4. Gemini multilinear opening:
     - Fold multilinear polynomials d-1 times
     - Reduce to d univariate openings

  5. Shplonk batching:
     - Batch all opening claims
     - Reduce to single KZG opening

  6. KZG opening proof:
     - Compute W commitment
     - Output final opening proof

  Return: TranslatorProof (568 field elements)
```

### Outputs from the Prover

```cpp
struct TranslatorProof {
    std::vector<Fr> proof_data;       // 568 field elements
    Fq accumulated_result;            // The batched evaluation result (Fq element)
};
```

The proof contains:

1. Witness commitments (88 × 2 = 176 Fr elements)
2. Libra commitments and sum (2 + 1 = 3 Fr)
3. Sumcheck univariates (17 rounds × 8 coefficients = 136 Fr)
4. Sumcheck evaluations (188 Fr)
5. Libra evaluation (1 Fr)
6. Libra grand sum and quotient commitments (2 + 2 = 4 Fr)
7. Gemini commitments (16 × 2 = 32 Fr)
8. Gemini evaluations (17 Fr)
9. Gemini positive/negative evaluations (2 Fr)
10. SmallSubgroupIPA evaluations (4 Fr)
11. Shplonk Q commitment (2 Fr)
12. KZG W commitment (2 Fr)
13. Accumulated result in Fq (1 Fq = 1 Fr for encoding)

### Verifier Algorithm

```
TranslatorVerifier::verify(proof, vk):
  1. Deserialize proof

  2. Reconstruct challenges (Fiat-Shamir):
     - Hash commitments to generate challenges

  3. Sumcheck verification:
     - For each round, check univariate identity
     - Accumulate claimed evaluations

  4. Libra verification:
     - Verify ZK grand sum
     - Check claimed evaluation

  5. Gemini verification:
     - Verify fold commitments
     - Check evaluation consistency

  6. Shplonk verification:
     - Batch all opening claims

  7. KZG pairing check:
     - Compute pairing e(W, [τ]₂) vs e(commitment, [1]₂)
     - Accept if pairing checks pass

  8. Check accumulated_result matches expected:
     - Compare proof's accumulator against ECCVM output

  Return: accept/reject
```

---

## Proof Size Analysis

As computed in CHONK_MATH_EXPLAINED.md, the Translator proof size is:

### Detailed Breakdown

| Component                         | Formula      | Field Elements |
| --------------------------------- | ------------ | -------------- |
| 1. Accumulated result (BN254 Fq)  | `1 × 1`      | **1**          |
| 2. Witness commitments            | `88 × 2`     | **176**        |
| 3. Libra concatenation commitment | `1 × 2`      | **2**          |
| 4. Libra sum                      | `1 × 1`      | **1**          |
| 5. Sumcheck univariates           | `17 × 8 × 1` | **136**        |
| 6. Sumcheck evaluations           | `188 × 1`    | **188**        |
| 7. Libra claimed evaluation       | `1 × 1`      | **1**          |
| 8. Libra grand sum commitment     | `1 × 2`      | **2**          |
| 9. Libra quotient commitment      | `1 × 2`      | **2**          |
| 10. Gemini fold commitments       | `16 × 2`     | **32**         |
| 11. Gemini evaluations            | `17 × 1`     | **17**         |
| 12. Gemini P positive evaluation  | `1 × 1`      | **1**          |
| 13. Gemini P negative evaluation  | `1 × 1`      | **1**          |
| 14. SmallSubgroupIPA evals        | `4 × 1`      | **4**          |
| 15. Shplonk Q commitment          | `1 × 2`      | **2**          |
| 16. KZG opening commitment        | `1 × 2`      | **2**          |

**Total: 568 field elements = 568 × 32 bytes = 18,176 bytes ≈ 17.8 KB**

### Comparison with Other Components

| Component      | Size (field elements) | Size (KB) | Percentage of Chonk |
| -------------- | --------------------- | --------- | ------------------- |
| **Translator** | **568**               | **17.8**  | **37.6%**           |
| Mega ZK        | 356                   | 11.1      | 23.6%               |
| ECCVM          | 488                   | 15.2      | 32.3%               |
| Merge          | 42                    | 1.3       | 2.8%                |

**Insight:** Translator is the **largest single component** in the Chonk proof, primarily due to:

1. 188 sumcheck evaluations (all 91 witness + 86 derived + shifts)
2. 136 sumcheck univariates (17 rounds × 8 coefficients)
3. 176 witness commitments (88 polynomials)

The large number of witness polynomials (81 explicit + derived) drives the proof size.

---

## Critical Components for Auditing

Ranked from most to least critical for security:

### 🔴 **CRITICAL (Audit First)**

#### 1. Non-Native Field Relation (Relation 4)

**File:** `translator_non_native_field_relation.hpp`

**Why critical:**

- **Core soundness:** This is the heart of the circuit. If this relation is wrong, the entire translation is invalid.
- **Complex arithmetic:** Involves intricate modular arithmetic across two moduli with limb-based computation.
- **Overflow risks:** If the mod 2²⁷² check is wrong, overflow could allow false proofs.

**What to audit:**

- Verify the limb combination formulas match the mathematical specification exactly
- Check all powers of 2 (2⁶⁸, 2¹³⁶, etc.) are correct
- Ensure the "wide" relation limbs correctly capture carries
- Confirm native field reconstruction is complete (all cross-terms present)
- Test edge cases: maximum values, zero values, boundary conditions

**Attack vector:** Incorrect arithmetic could allow proving wrong evaluations, breaking Goblin soundness.

#### 2. Permutation Relation (Relation 1)

**File:** `translator_permutation_relation.hpp`

**Why critical:**

- **Foundation for range constraints:** If permutation is broken, attacker can use out-of-range values.
- **Grand product soundness:** The z_perm computation must be absolutely correct.
- **Masking handling:** ZK rows must be properly excluded.

**What to audit:**

- Verify grand product formula matches the specification
- Check initialization (z_perm[0] = 1 accounting for L_0)
- Verify finalization (z_perm[last] = 0 accounting for L_last and masking)
- Ensure interleaving structure is correctly implemented
- Test with malicious permutations

**Attack vector:** Broken permutation → use 2⁶⁸ instead of 2¹⁴ limbs → completely break non-native arithmetic.

#### 3. Delta Range Constraint Relation (Relation 2)

**File:** `translator_delta_range_constraint_relation.hpp`

**Why critical:**

- **Enforces sorted property:** Without this, permutation check is meaningless.
- **Maximum value check:** Must ensure final value is exactly 2¹⁴ - 1.
- **Step constraint:** Max step of 3 is necessary for coverage.

**What to audit:**

- Verify Δ ∈ {0,1,2,3} check is correctly implemented
- Confirm final value check at lagrange_last is exact
- Check masking rows are properly excluded
- Test boundary: can attacker craft a sequence that looks sorted but isn't?

**Attack vector:** Wrong max value (e.g., 2¹⁵ instead of 2¹⁴) → double the range → break soundness.

### 🟠 **HIGH PRIORITY**

#### 4. Decomposition Relation (Relation 3)

**File:** `translator_decomposition_relation.hpp`

**Why high priority:**

- **Ensures consistency:** Limbs must match original values.
- **Many subrelations (48):** More code = more potential bugs.
- **Tail microlimb logic:** The shift factors must be exact.

**What to audit:**

- Verify all 48 decomposition formulas match specification
- Check powers of 2 are correct (2⁶⁸, 2¹⁴, etc.)
- Confirm tail shift calculations (especially the ×4, ×16 multipliers)
- Test: provide wrong decomposition, ensure relation catches it

**Attack vector:** Wrong decomposition → mismatch between transcript and limbs → arbitrary values.

#### 5. Opcode Constraint Relation (Relation 5)

**File:** `translator_extra_relations.hpp`

**Why high priority:**

- **Input validation:** Invalid opcodes could inject malicious data.
- **Relatively simple:** But critical to get right.

**What to audit:**

- Verify opcode set {0, 1, 2, 3, 4, 8} is complete and correct
- Check polynomial roots match opcodes exactly
- Ensure masking rows are handled

**Attack vector:** Missing opcode constraint → inject opcode 255 → break accumulation logic.

### 🟡 **MEDIUM PRIORITY**

#### 6. Accumulator Transfer Relation (Relation 6)

**File:** `translator_extra_relations.hpp`

**Why medium priority:**

- **Ensures state consistency:** But doesn't directly affect arithmetic soundness.
- **Edge cases:** Initialization and finalization must be correct.

**What to audit:**

- Verify odd row copy constraint is active at all odd rows
- Check initialization to zero at start
- Confirm final result comparison uses correct expected value
- Test: try to skip initialization, see if caught

**Attack vector:** Wrong initialization → start with non-zero acc → offset all computations.

#### 7. Zero Constraints Relation (Relation 7)

**File:** `translator_extra_relations.hpp`

**Why medium priority:**

- **Cleanup relation:** Ensures unused rows don't pollute permutation.
- **Many subrelations (68):** But mostly repetitive.

**What to audit:**

- Verify all 68 wires are covered
- Check lagrange polynomial logic for "outside minicircuit"
- Ensure no-op case (op = 0) is handled correctly

**Attack vector:** Garbage in unused rows → permutation allows wrong values → potential soundness break.

### 🟢 **LOW PRIORITY (But Still Check)**

#### 8. Circuit Builder Logic

**File:** `translator_circuit_builder.cpp`

**Why low priority for audit:**

- Prover-side only (doesn't affect verification soundness directly)
- But bugs here could cause proof generation failures

**What to check:**

- Witness generation formulas match relation formulas
- Quotient calculation is correct
- Microlimb splitting logic matches decomposition relation

#### 9. Flavor Configuration

**File:** `translator_flavor.hpp`

**Why low priority:**

- Configuration and constants
- But errors here (wrong NUM_LIMB_BITS) would be catastrophic

**What to check:**

- All constants match specification
- Proof length formula is correct
- Polynomial commitment configuration is sound

---

## Audit Checklist

Use this checklist when auditing the Translator:

### Mathematical Specification

- [ ] Verify q (Fq modulus) is correct BN254 base field
- [ ] Verify r (Fr modulus) is correct BN254 scalar field
- [ ] Confirm 2²⁷² · r > 2⁵¹⁴ (soundness bound)
- [ ] Check limb sizes: 68, 68, 68, 50 bits for 254-bit values
- [ ] Verify microlimb size: 14 bits
- [ ] Confirm SORT_STEP = 3 is sufficient for coverage

### Non-Native Field Arithmetic

- [ ] Audit all limb combination formulas in subrelation 4.1
- [ ] Audit all limb combination formulas in subrelation 4.2
- [ ] Verify native field reconstruction in subrelation 4.3
- [ ] Test with maximum value inputs
- [ ] Test with zero inputs
- [ ] Test with adversarial quotients

### Range Constraints

- [ ] Verify permutation grand product formula
- [ ] Check delta constraint polynomial (degree 5 product)
- [ ] Confirm final value = 2¹⁴ - 1 exactly
- [ ] Test with out-of-order values
- [ ] Test with values > 2¹⁴

### Decomposition

- [ ] Verify all 6 binary limb decompositions
- [ ] Verify all 44 microlimb decompositions
- [ ] Check all 42 tail microlimb stricter constraints
- [ ] Test with wrong decompositions

### Edge Cases

- [ ] First row (initialization)
- [ ] Last row (finalization)
- [ ] No-op case (op = 0)
- [ ] Masking rows (ZK)
- [ ] Interleaving boundary

### Implementation

- [ ] Code review all relation implementations
- [ ] Verify relation degrees match specification
- [ ] Check lagrange polynomial usage is correct
- [ ] Ensure no off-by-one errors in indices
- [ ] Test proof generation and verification end-to-end

---

**Document Version:** 1.0
**Author:** ZK Content Expert
**Last Updated:** 2025-12-04
**Purpose:** Advanced Modern Cryptography Course Material & Security Audit Guide
