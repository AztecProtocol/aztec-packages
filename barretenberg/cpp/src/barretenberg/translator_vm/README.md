# The Translator Circuit

> **Warning**: This document provides a technical overview of the Translator Circuit used in the Goblin Plonk proving system. It is intended for understanding the design and optimizations. The code is the source of truth for implementation specifics.

## Table of Contents

1. [Overview](#overview)
2. [High-Level Statement](#high-level-statement)
3. [Architecture and Constants](#architecture-and-constants)
4. [Witness Trace Structure](#witness-trace-structure)
5. [Interleaving: The Key Optimization](#interleaving-the-key-optimization)
6. [Witness Generation and Proving Key Construction](#witness-generation-and-proving-key-construction)
7. [Translator Relations](#translator-relations)

---

## Overview

The Translator circuit is a critical component of the Goblin Plonk proving system in Aztec. It serves as a bridge between the Mega and ECCVM circuits.

| Curve    | Base Field     | Scalar Field   | Usage                                     |
| -------- | -------------- | -------------- | ----------------------------------------- |
| BN254    | $\mathbb{F}_q$ | $\mathbb{F}_r$ | Used in Mega circuits                     |
| Grumpkin | $\mathbb{F}_r$ | $\mathbb{F}_q$ | Used in ECCVM for efficient EC operations |

When proving recursive circuits with Mega circuit builder, we accumulate elliptic curve operations in an `EccOpQueue`. Proving these ECC operations is delegated to the ECCVM circuit, which operates over the Grumpkin curve. However, the same operations have different representations in the two circuits because:

- Mega circuit operates over the BN254 scalar field $\mathbb{F}_r$ so elements in $\mathbb{F}_q$ are non-native (i.e., they need to decomposed into limbs in $\mathbb{F}_r$)
- ECCVM operates over the Grumpkin scalar field $\mathbb{F}_q$ so elements in $\mathbb{F}_q$ are circuit native

For example, consider the operation $(z \cdot P)$ where $P$ is a point on the curve and $z$ is a scalar. The ECCVM arithmetisation represents this operation (in 1 row) as:

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

Note that we process the `EccOpQueue` in reverse order while computing the accumulator in steps:

$$
\begin{aligned}
\textcolor{orange}{\text{acc}_0} &= \textcolor{lightgrey}{0} \cdot x + \text{op}_{n-1} + P_x^{(n-1)} \cdot v + P_y^{(n-1)} \cdot v^2 + z_1^{(n-1)} \cdot v^3 + z_2^{(n-1)} \cdot v^4 \\
\textcolor{lightgreen}{\text{acc}_1} &= \textcolor{orange}{\text{acc}_0} \cdot x + \text{op}_{n-2} + P_x^{(n-2)} \cdot v + P_y^{(n-2)} \cdot v^2 + z_1^{(n-2)} \cdot v^3 + z_2^{(n-2)} \cdot v^4 \\
\textcolor{skyblue}{\text{acc}_2} &= \textcolor{lightgreen}{\text{acc}_1} \cdot x + \text{op}_{n-3} + P_x^{(n-3)} \cdot v + P_y^{(n-3)} \cdot v^2 + z_1^{(n-3)} \cdot v^3 + z_2^{(n-3)} \cdot v^4 \\
&\ \ \vdots \\
\textcolor{brown}{\text{acc}_{n-2}} &= \textcolor{grey}{\text{acc}_{n-3}} \cdot x + \text{op}_1 + P_x^{(1)} \cdot v + P_y^{(1)} \cdot v^2 + z_1^{(1)} \cdot v^3 + z_2^{(1)} \cdot v^4 \\
\textcolor{violet}{\text{acc}_{n-1}} &= \textcolor{brown}{\text{acc}_{n-2}} \cdot x + \text{op}_0 + P_x^{(0)} \cdot v + P_y^{(0)} \cdot v^2 + z_1^{(0)} \cdot v^3 + z_2^{(0)} \cdot v^4 \\
\end{aligned}
$$

The final accumulator value $\textcolor{violet}{\text{acc}_{n-1}}$ is what we need to verify against the ECCVM's output.
Note that the "previous" accumulator in the _last_ step must be 0.

**Method:** Since we cannot directly compute in $\mathbb{F}_q$ using $\mathbb{F}_r$ arithmetic (as $q \neq r$, and in fact $q > r$), we use non-native field arithmetic. Similar to the technique in [bigfield](../stdlib/primitives/bigfield/README.md), we prove the equation holds in integers:

$$\text{acc}_{\text{prev}} \cdot x + \text{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \text{quotient} \cdot q - \text{acc}_{\text{curr}} = 0$$

We verify this by proving the equation holds:

1. modulo $2^{272}$ (via 68-bit limb arithmetic split into two 136-bit checks)
2. modulo $r$ (natively in $\mathbb{F}_r$)
3. with range constraints on all limbs (prevents overflow/underflow)

By the Chinese Remainder Theorem, since $2^{272} \cdot r > 2^{514}$ exceeds the maximum possible value, the equation must hold in integers, and thus modulo $q$.

## Witness Trace Structure

The Translator circuit has 81 witness columns, organized into:

- 4 columns: `EccOpQueue` transcript ($\texttt{op}, P_x, P_y, z_1, z_2$ encoded across 2 rows)
- 13 columns: Limb decompositions (68-bit limbs for non-native arithmetic)
- 64 columns: Microlimb decompositions (14-bit microlimbs for range constraints)

The circuit operates on a 2-row cycle structure. Each `EccOpQueue` entry occupies exactly 2 rows:

- Row $2i$ (Even rows): Computation rows where the non-native field relation is actively checked
- Row $2i+1$ (Odd rows): Data storage rows that hold values accessed via shifts

While enforcing constraints on the even rows, we can access values from the "next" odd row using shifted column polynomials.
As hinted earlier, the "previous" accumulator value needed for computation is stored at odd row $(2i+1)$.
This value becomes the "current" accumulator for the next even row $(2i+2)$:

| Op index             | $0$                                    | $1$                                   | $\quad \dots \quad$ | $(n-2)$                                  | $(n-1)$                              |
| -------------------- | -------------------------------------- | ------------------------------------- | ------------------- | ---------------------------------------- | ------------------------------------ |
| Current accumulator  | $\textcolor{violet}{\text{acc}_{n-1}}$ | $\textcolor{brown}{\text{acc}_{n-2}}$ | $\quad \dots \quad$ | $\textcolor{lightgreen}{\text{acc}_{1}}$ | $\textcolor{orange}{\text{acc}_{0}}$ |
| Previous accumulator | $\textcolor{brown}{\text{acc}_{n-2}}$  | $\textcolor{grey}{\text{acc}_{n-3}}$  | $\quad \dots \quad$ | $\textcolor{orange}{\text{acc}_{0}}$     | $0$                                  |
|                      |                                        |                                       |                     |                                          |                                      |

#### 1. EccOpQueue Transcript Columns (4 columns)

These columns directly represent the EccOpQueue transcript:

| Column      | Even Row $(2i)$                  | Odd Row $(2i+1)$             | Description                                                        |
| ----------- | -------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `OP`        | $\texttt{op} \in \{0, 3, 4, 8\}$ | 0 (no-op)                    | Opcode (the type of elliptic curve operation)                      |
| `X_LO_Y_HI` | $P_{x,\text{lo}}$ (136 bits)     | $P_{y,\text{hi}}$ (118 bits) | Low 136 bits of $x$-coordinate and high 118 bits of $y$-coordinate |
| `X_HI_Z_1`  | $P_{x,\text{hi}}$ (118 bits)     | $z_1$ (128 bits)             | High 118 bits of $x$-coordinate and first scalar                   |
| `Y_LO_Z_2`  | $P_{y,\text{lo}}$ (136 bits)     | $z_2$ (128 bits)             | Low 136 bits of $y$-coordinate and second scalar                   |
|             |                                  |                              |                                                                    |

**Encoding scheme**: Point coordinates $P_x$ and $P_y$ are each 254 bits, split as:

- $P_x = (P_{x,\text{hi}}$ (118 bits) $\|$ $P_{x,\text{lo}}$ (136 bits) $)$
- $P_y = (P_{y,\text{hi}}$ (118 bits) $\|$ $P_{y,\text{lo}}$ (136 bits) $)$

#### 2. Limb Decomposition Columns (13 columns)

These columns store finer-grained limb decompositions for non-native arithmetic:

| Column Group                  | Even Row $(2i)$       | Odd Row $(2i+1)$      | Bits   | Purpose                                  |
| ----------------------------- | --------------------- | --------------------- | ------ | ---------------------------------------- |
| `P_X_LOW_LIMBS`               | $P_{x,0}^{\text{lo}}$ | $P_{x,1}^{\text{lo}}$ | 68     | Limbs 0 & 1 of $P_{x}$                   |
| `P_X_HIGH_LIMBS`              | $P_{x,0}^{\text{hi}}$ | $P_{x,1}^{\text{hi}}$ | 68, 50 | Limbs 2 & 3 of $P_{x}$                   |
| `P_Y_LOW_LIMBS`               | $P_{y,0}^{\text{lo}}$ | $P_{y,1}^{\text{lo}}$ | 68     | Limbs 0 & 1 of $P_{y}$                   |
| `P_Y_HIGH_LIMBS`              | $P_{y,0}^{\text{hi}}$ | $P_{y,1}^{\text{hi}}$ | 68, 50 | Limbs 2 & 3 of $P_{y}$                   |
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

Each limb is further decomposed into 14-bit microlimbs for range checking. Each 68-bit limb has 5 microlimbs (14 bits each) plus a "tail" microlimb that enforces tight range constraints. The columns are organized as follows:

| Column Group                                   | Even Row $(2i)$                                          | Odd Row $(2i+1)$                                          |
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
| Current and previous accumulator microlimbs    |                                                          |                                                           |
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

The tail microlimbs (shown in yellow) enforce tight range constraints by ensuring top limbs use exactly the required number of bits (explained in the Decomposition Relation section of [RELATIONS.md](RELATIONS.md)).

**Column reuse optimization:** Some columns are reassigned in odd rows to hold tail microlimbs for limbs that don't need all 5 microlimbs. For example, limb $P_{x, 3}$ is only 50 bits (= 3×14 + 8), requiring only 4 microlimbs. The 5th microlimb column `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4` at odd rows is therefore reassigned to hold the tail microlimb for $P_{x,3}$ (and carry values $c^{\text{lo}}[4]$, $c^{\text{hi}}[4]$, etc.).

### Virtual Columns

Some columns are "virtual" and not explicitly stored in the witness trace. Instead, they are computed on-the-fly during relation evaluation using existing columns. These include:

- Interleaved columns for range constraint microlimbs (computed from the physical microlimb columns)
- Sorted (ordered) columns for range constraint microlimbs (computed by sorting the physical microlimb columns)

### Lagrange Polynomials (Precomputed)

The Translator circuit uses ZERO selector polynomials (`NUM_SELECTORS = 0`).

Instead, the circuit uses Lagrange polynomials to control which constraints are active:

| Polynomial                     | Description                     | Active Rows                                                                  |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------------------------- |
| `lagrange_even_in_minicircuit` | Even indices in mini-circuit    | $i \in \{0, 2, 4, ..., 8190\}$ (mini)                                        |
| `lagrange_odd_in_minicircuit`  | Odd indices in mini-circuit     | $i \in \{1, 3, 5, ..., 8191\}$ (mini)                                        |
| `lagrange_first`               | First row                       | $i = 0$                                                                      |
| `lagrange_last_in_minicircuit` | Last row in mini-circuit        | $i = 8191$ (mini)                                                            |
| `lagrange_result_row`          | Row containing final result     | $i = 8$ (mini, equals no of rows are to be left for random ops at the start) |
| `lagrange_masking`             | Masking rows for zero-knowledge | Last few rows                                                                |
| `lagrange_mini_masking`        | Masking within mini-circuit     | Last rows of mini-circuit                                                    |

The circuit's regularity (2-row cycles, uniform structure) allows using Lagrange polynomials, which are more efficient than custom selectors.

## Interleaving: The Key Optimization

The Translator must range-constrain approximately 64 different microlimb sets using permutation argument (and the delta range constraint). The permutation argument's degree equals $1 + \textsf{NUM\_COLS}$, where NUM_COLS is the number of columns being permuted:

$$
z_{\textsf{perm}}[i+1] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{ordered}[j] + \gamma) =
z_{\textsf{perm}}[i] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{interleaved}[j] + \gamma)
$$

The Problem: Permuting all ~64 microlimb columns simultaneously yields degree $1 + 64 = 65$, making sumcheck impractical.

The Solution: Interleave 16 logical columns into one virtual column, and create 4 such columns (plus 1 for the extra column). Each group can then perform an independent permutation check with degree $1 + 5 = 6$ (or 7 with Lagrange selector). This reduces the relation degree from 65 to 7.

### Circuit Structure

```
Mini-circuit size:  2^13 = 8,192 rows    (actual computation)
Full circuit size:  2^13 x 16 = 2^17 = 131,072 rows  (after interleaving)
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
0 & 15 & \textcolor{firebrick}{p_0} \\ \hline
1 & 4 & \textcolor{skyblue}{a_1} \\
1 & 5 & \textcolor{orange}{b_1} \\
1 & 6 & \textcolor{lightgreen}{c_1} \\
\vdots & \vdots & \vdots \\[3pt]
1 & 7 & \textcolor{firebrick}{p_1} \\ \hline
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
For 64 microlimb columns, we have 4 groups of 16 columns each, resulting in four interleaved polynomials. Note that the interleaved polynomials are not "physical" wires in the circuit trace: we refer to them as virtual polynomials. Each of these groups performs an independent permutation check:

- Numerator: 4 interleaved wires + 1 extra = 5 terms
- Denominator: 5 ordered wires = 5 terms
- Degree: $1 + 5 = 6$ (or 7 with Lagrange)

The permutation argument verifies that within each group, the interleaved values are a permutation of the ordered (sorted) values. Due to interleaving, the total circuit size increases 16×, requiring more zero-padding. Interleaving trades circuit size (inexpensive) for relation degree (expensive). The 16× size increase is acceptable given the 9× degree reduction.

> **Effect on Commitment Scheme**: For polynomials $p_0, \dots, p_{15}$ of size $n$, the interleaved polynomial of size $16n$ is:
> $$p_{\textsf{interleaved}}(x) = \sum_{i=0}^{15} x^i \cdot p_{i}(x^{16})$$
> The interleaved polynomials do not require separate commitments because they can be derived from the original polynomials' commitments. In the Gemini PCS phase, the prover sends only two additional field element evaluations $P_+(r^{16})$ and $P_-(r^{16})$ where $r$ is the Gemini challenge:
> $$P_{\pm}(x) = \sum_{i=0}^{15} (\pm r)^i \cdot p_{i}(x)$$
> The verifier reconstructs full batched polynomial evaluations as $A_0(r) = A_{0+}(r) + P_+(r^{16})$ and $A_0(-r) = A_{0-}(-r) + P_-(r^{16})$. Since $P_{\pm}(r^{16})$ relates to evaluations $p_i(r^{16})$ already in the Gemini protocol, no additional commitments are needed.

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

## Translator Relations

Constraints for the translator VM are specified in [RELATIONS.md](RELATIONS.md).
