# The Translator Circuit

> Design overview. Where this file and the code disagree, the code is correct.

## Table of Contents

1. [Overview](#overview)
2. [High-Level Statement](#high-level-statement)
3. [Architecture and Constants](#architecture-and-constants)
4. [Glossary and Common Confusions](#glossary-and-common-confusions)
5. [Witness Trace Structure](#witness-trace-structure)
6. [Concatenation](#concatenation)
7. [Witness Generation and Proving Key Construction](#witness-generation-and-proving-key-construction)
8. [Tests](#tests)

The constraints are specified in [RELATIONS.md](RELATIONS.md).

---

## Overview

The Translator proves that the ECCVM's batched evaluation of the ECC op queue, computed over $\mathbb{F}_q$, matches the op queue that Mega circuits committed to over $\mathbb{F}_r$.

| Curve    | Base Field     | Scalar Field   | Usage                                     |
| -------- | -------------- | -------------- | ----------------------------------------- |
| BN254    | $\mathbb{F}_q$ | $\mathbb{F}_r$ | Used in Mega circuits                     |
| Grumpkin | $\mathbb{F}_r$ | $\mathbb{F}_q$ | Used in ECCVM for efficient EC operations |

When proving recursive circuits with Mega circuit builder, we accumulate elliptic curve operations in an `EccOpQueue`. Proving these ECC operations is delegated to the ECCVM circuit, which operates over the Grumpkin curve. However, the same operations have different representations in the two circuits because:

- Mega circuit operates over the BN254 scalar field $\mathbb{F}_r$ so elements in $\mathbb{F}_q$ are non-native (i.e., since $q > r$ they need to be decomposed into limbs in $\mathbb{F}_r$)
- ECCVM operates over the Grumpkin scalar field $\mathbb{F}_q$ so elements in $\mathbb{F}_q$ (as well as $\mathbb{F}_r$) are circuit native

For example, consider the operation $(z \cdot P)$ where $P \equiv (P_x, P_y) \in \mathbb{F}_q^2$ is a point on the curve and $z \in \mathbb{F}_r$ is a scalar. The ECCVM arithmetisation represents this operation (in 1 row) as:

| Opcode | $x$-coordinate | $y$-coordinate | Scalar $z_1$ | Scalar $z_2$ | Full scalar $z$ |
| ------ | -------------- | -------------- | ------------ | ------------ | --------------- |
| `MUL`  | $P_x$          | $P_y$          | $z_1$        | $z_2$        | $z$             |

The Mega circuit arithmetisation represents the same operation (in 2 rows) as:

| Column 1 | Column 2             | Column 3             | Column 4             |
| -------- | -------------------- | -------------------- | -------------------- |
| `MUL`    | $P_{x, \textsf{lo}}$ | $P_{x, \textsf{hi}}$ | $P_{y, \textsf{lo}}$ |
| $0$      | $P_{y, \textsf{hi}}$ | $z_1$                | $z_2$                |

where $P_x = (P_{x, \textsf{lo}} + 2^{136} \cdot P_{x, \textsf{hi}}), \ P_y = (P_{y, \textsf{lo}} + 2^{136} \cdot P_{y, \textsf{hi}})$ and the scalar $z = (z_1 + 2^{128} \cdot z_2)$. Note that the limbs $P_{x/y, \textsf{lo}}, P_{x/y, \textsf{hi}}$ are elements in $\mathbb{F}_r$.

We need to prove that these two representations are consistent, i.e., that the polynomial evaluations computed in the ECCVM circuit (over $\mathbb{F}_q$) match those computed in the Mega circuit (over $\mathbb{F}_r$).
The Translator circuit is a custom circuit designed to solve this problem. It:

1. **Receives** the ECC op queue in Mega arithmetisation and the batched polynomial evaluation problem from ECCVM (operating over $\mathbb{F}_q$),
2. **Computes** the batched polynomial evaluation using non-native field arithmetic in $\mathbb{F}_r$ and,
3. **Verifies** that the result matches the evaluation provided by ECCVM.

In Chonk the Translator is not proven alone. `BatchedHonkTranslatorProver` runs its Oink phase and then a joint 17-round sumcheck and a joint PCS with the MegaZK hiding kernel; see [Batched Honk + Translator](../chonk/batched_honk_translator/README.md). That prover uses `TranslatorShortMonomialFlavor`, whose relations are the `*ShortRelation` classes.

## High-Level Statement

The Translator proves that the ECCVM's batched polynomial evaluation of the ECC operations is computed correctly.
Given:

- A sequence of `UltraOp` operations from the `EccOpQueue` (each containing: $\text{op}, P_x, P_y, z_1, z_2$)
- An evaluation challenge $x \in \mathbb{F}_q$
- A batching challenge $v \in \mathbb{F}_q$

Prove that:
$$\boxed{\text{accumulator}_{\text{final}} = \sum_{i=0}^{n-1} x^{i} \cdot \left( \text{op}_i + v \cdot P_x^{(i)} + v^2 \cdot P_y^{(i)} + v^3 \cdot z_1^{(i)} + v^4 \cdot z_2^{(i)} \right) \pmod{q}}$$

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
Note that the "previous" accumulator for the _last_ operation must be 0. No-ops inside the op range are skipped for accumulation; on their rows the accumulator limbs are copied from the previous real operation.

**Method:** Since we cannot directly compute in $\mathbb{F}_q$ using $\mathbb{F}_r$ arithmetic (as $q \neq r$, and in fact $q > r$), we use non-native field arithmetic. Similar to the technique in [bigfield](../stdlib/primitives/bigfield/README.md), we prove the equation holds in integers:

$$\text{acc}_{\text{prev}} \cdot x + \text{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \text{quotient} \cdot q - \text{acc}_{\text{curr}} = 0$$

We prove it modulo $2^{272}$ (68-bit limb arithmetic, as two 136-bit checks) and modulo $r$ (natively), with range constraints on all limbs; by the Chinese Remainder Theorem it then holds over the integers, and thus modulo $q$. See [RELATIONS.md](RELATIONS.md#non-native-field-relations) for the bound.

## Architecture and Constants

The Translator is a **fixed-size** circuit. Its key constants (from `translator_flavor.hpp` / `constants.hpp`):

| Constant | Value | Meaning |
|---|---|---|
| `NUM_LIMB_BITS` | 68 | width of a non-native **limb** (one $\mathbb{F}_r$ chunk of an $\mathbb{F}_q$ value) |
| `MICRO_LIMB_BITS` | 14 | width of a **microlimb** (the finer chunk used for range constraints) |
| `LOG_MINI_CIRCUIT_SIZE` | 13 | $\log_2$ of the mini-circuit size |
| `MINI_CIRCUIT_SIZE` | $2^{13}$ | rows in the mini-circuit (where the witness actually lives) |
| `CONCATENATION_GROUP_SIZE` | 16 | mini-circuit-size columns concatenated into one full-circuit column |
| `NUM_CONCATENATED_POLYS` | 5 | number of concatenated polynomials: 4 range-constraint groups (64 microlimb wires) + 1 non-range group (13 limb wires, zero-padded to 16) |
| `NUM_OP_QUEUE_WIRES` | 4 | op-queue transcript columns (`op`, `x_lo_y_hi`, `x_hi_z_1`, `y_lo_z_2`) |

**Mini-circuit vs. full circuit.** Witness generation happens in the **mini-circuit** of `MINI_CIRCUIT_SIZE = 2^13` rows. Range-constraint columns are then **concatenated** in groups of `CONCATENATION_GROUP_SIZE = 16` into full-circuit-size polynomials, so the full circuit has $\log$-size `LOG_MINI_CIRCUIT_SIZE + log2(CONCATENATION_GROUP_SIZE) = 13 + 4 = 17` (this is the `17` rounds of the [joint sumcheck](../chonk/batched_honk_translator/README.md)). See [Concatenation](#concatenation).

## Glossary and Common Confusions

A quick reference for terms and columns that are easy to confuse. Full treatment is in the linked sections.

### Where things live in the code

| Concern | Location |
|---|---|
| Columns / entities (canonical list) | `translator_vm/translator_flavor.hpp` |
| Witness generation | `translator_vm/translator_circuit_builder.{hpp,cpp}` |
| Constraints | `relations/translator_vm/` — see [RELATIONS.md](RELATIONS.md) |
| Prover / Verifier | `translator_vm/translator_prover.cpp`, `translator_vm/translator_verifier.cpp` |
| Short-monomial flavor (batched prover) | `TranslatorShortMonomialFlavor` in `translator_vm/translator_flavor.hpp`; `relations/translator_vm/*_short_relation.hpp` |
| Joint proving with MegaZK (Chonk) | `chonk/batched_honk_translator/` |

### Easily-confused terms

| Term | The trap | What it actually means |
|---|---|---|
| native $\mathbb{F}_r$ vs. non-native $\mathbb{F}_q$ | which field is which? | Native field $\mathbb{F}_r$; the accumulator identity is checked mod $q$ ($q > r$). The ECCVM is the opposite (native $\mathbb{F}_q$). |
| limb (68-bit) vs. microlimb (14-bit) | both "limbs" | A **limb** (`NUM_LIMB_BITS = 68`) is one $\mathbb{F}_r$ chunk of a non-native $\mathbb{F}_q$ value (bigfield-style). A **microlimb** (`MICRO_LIMB_BITS = 14`) is the finer chunk a limb is split into for range constraints (the `*_range_constraint_*` columns). |
| mod $2^{272}$ **and** mod $r$ | redundant checks? | Both are needed: by CRT, together they prove the identity over the integers. Neither check alone suffices. See [High-Level Statement](#high-level-statement). |
| mini-circuit vs. full circuit | one size? | Witness in the mini-circuit (`2^13`); concatenated ×16 into the full circuit (`2^17`). See [Concatenation](#concatenation). |
| even rows vs. odd rows | which row does what? | A **2-row cycle**: **even** rows (`2i`) are **computation** rows where the non-native relation is checked; **odd** rows (`2i+1`) store values that the even row reads through shifted polynomials, including the *previous* accumulator. |
| op-queue processing order | first op → first row? | Processed in reverse; see [High-Level Statement](#high-level-statement). |
| `x` (evaluation challenge) vs. `v` (batching challenge) | two challenges | Both $\in \mathbb{F}_q$. `v` batches the **5 values per op** (`op, P_x, P_y, z_1, z_2`) via powers $v,\dots,v^4$; `x` combines **all ops** via Horner (powers of `x`). |
| `z_1`, `z_2` vs. the accumulator | | `z_1`, `z_2` are the decomposed 128-bit scalar of one op ($z = z_1 + 2^{128} z_2$); the **accumulator** is the running batched evaluation across all ops. |
| `*_binary_limbs_*` vs. `*_range_constraint_*` | | `*_binary_limbs_*` hold the four 68-bit limbs of a value (e.g. `accumulators_binary_limbs_0..3`); the `*_range_constraint_*` columns hold the 14-bit microlimb decomposition that **range-checks** those limbs. |
| the op-queue columns `x_lo_y_hi`, `x_hi_z_1`, `y_lo_z_2` | odd names | The 4 op-queue transcript columns pack op data across the 2-row cycle; each non-`op` column carries two values (`x_lo_y_hi` holds the low 136 bits of `P_x` on the even row and the high 118 bits of `P_y` on the odd row, etc.). They are **shared** with the merge protocol: the Translator reuses the merge output commitments $[M_j]$ and does **not** commit to them independently. |
| `ordered_extra_range_constraints_numerator` | a witness column | It is the **only precomputed selector that needs a commitment** (all other precomputed columns are verifier-computable); it seeds the sorted-list range argument. |

## Witness Trace Structure

The Translator circuit has 81 witness columns, organized into:

- 4 columns: `EccOpQueue` transcript ($\texttt{op}, P_x, P_y, z_1, z_2$ encoded across 2 rows)
- 13 columns: Limb decompositions (68-bit limbs for non-native arithmetic)
- 64 columns: Microlimb decompositions (14-bit microlimbs for range constraints)

The circuit operates on a 2-row cycle structure. Each `EccOpQueue` entry occupies exactly 2 rows:

- Row $2i$ (Even rows): Computation rows where the non-native field relation is actively checked
- Row $2i+1$ (Odd rows): Data storage rows that hold values accessed via shifts

The opcode is constrained to `0` on odd rows by the [Opcode Constraint Relation](RELATIONS.md#opcode-constraint-relation) — a soundness requirement: the non-native accumulator reads only even rows, so a genuine opcode parked on an odd row would be silently skipped, excluding that ECC operation from the batched evaluation.

While enforcing constraints on the even rows, we can access values from the "next" row (which is odd) using shifted column polynomials.
As hinted earlier, the "previous" accumulator value needed for computation is stored at odd row $(2i+1)$.
This value becomes the "current" accumulator for the next even row $(2i+2)$:

| Operation index      | $0$                                    | $1$                                   | $\quad \dots \quad$ | $(n-2)$                                  | $(n-1)$                              |
| -------------------- | -------------------------------------- | ------------------------------------- | ------------------- | ---------------------------------------- | ------------------------------------ |
| Current accumulator  | $\textcolor{violet}{\text{acc}(n-1)}$ | $\textcolor{brown}{\text{acc}(n-2)}$ | $\quad \dots \quad$ | $\textcolor{lightgreen}{\text{acc}(1)}$ | $\textcolor{orange}{\text{acc}(0)}$ |
| Previous accumulator | $\textcolor{brown}{\text{acc}(n-2)}$  | $\textcolor{grey}{\text{acc}(n-3)}$  | $\quad \dots \quad$ | $\textcolor{orange}{\text{acc}(0)}$     | $0$                                  |

### 1. EccOpQueue Transcript Columns (4 columns)

These columns directly represent the EccOpQueue transcript:

| Column Name | Even Row $(2i)$                  | Odd Row $(2i+1)$             | Description                                                        |
| ----------- | -------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `OP`        | $\texttt{op} \in \lbrace 0, 3, 4, 8\rbrace$ | 0 (no-op)                    | Opcode (the type of elliptic curve operation)                      |
| `X_LO_Y_HI` | $P_{x,\text{lo}}$ (136 bits)     | $P_{y,\text{hi}}$ (118 bits) | Low 136 bits of $x$-coordinate and high 118 bits of $y$-coordinate |
| `X_HI_Z_1`  | $P_{x,\text{hi}}$ (118 bits)     | $z_1$ (128 bits)             | High 118 bits of $x$-coordinate and first scalar                   |
| `Y_LO_Z_2`  | $P_{y,\text{lo}}$ (136 bits)     | $z_2$ (128 bits)             | Low 136 bits of $y$-coordinate and second scalar                   |

**Encoding scheme**: Point coordinates $P_x$ and $P_y$ are each 254 bits, split as:

- $P_x = (P_{x,\text{hi}}$ (118 bits) $\Vert$ $P_{x,\text{lo}}$ (136 bits) $)$
- $P_y = (P_{y,\text{hi}}$ (118 bits) $\Vert$ $P_{y,\text{lo}}$ (136 bits) $)$

### 2. Limb Decomposition Columns (13 columns)

These columns store finer-grained limb decompositions for non-native arithmetic:

| Column Group                  | Even Row $(2i)$                   | Odd Row $(2i+1)$                 | Bits   | Purpose                                  |
| ----------------------------- | --------------------------------- | -------------------------------- | ------ | ---------------------------------------- |
| `P_X_LOW_LIMBS`               | $P_{x,0}^{\text{lo}} = P_{x, 0}$  | $P_{x,1}^{\text{lo}} = P_{x, 1}$ | 68     | Limbs 0 & 1 of $P_{x}$                   |
| `P_X_HIGH_LIMBS`              | $P_{x,0}^{\text{hi}} =  P_{x, 2}$ | $P_{x,1}^{\text{hi}} = P_{x, 3}$ | 68, 50 | Limbs 2 & 3 of $P_{x}$                   |
| `P_Y_LOW_LIMBS`               | $P_{y,0}^{\text{lo}} = P_{y, 0}$  | $P_{y,1}^{\text{lo}} = P_{y, 1}$ | 68     | Limbs 0 & 1 of $P_{y}$                   |
| `P_Y_HIGH_LIMBS`              | $P_{y,0}^{\text{hi}} = P_{y, 2}$  | $P_{y,1}^{\text{hi}} = P_{y, 3}$ | 68, 50 | Limbs 2 & 3 of $P_{y}$                   |
| `Z_LOW_LIMBS`                 | $z_{1,0}$                         | $z_{2,0}$                        | 68     | Low limbs of $z_1$ and $z_2$             |
| `Z_HIGH_LIMBS`                | $z_{1,1}$                         | $z_{2,1}$                        | 60     | High limbs of $z_1$ and $z_2$            |
| `ACCUMULATORS_BINARY_LIMBS_0` | $a_0^{\text{curr}}$               | $a_0^{\text{prev}}$              | 68     | Limb 0 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_1` | $a_1^{\text{curr}}$               | $a_1^{\text{prev}}$              | 68     | Limb 1 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_2` | $a_2^{\text{curr}}$               | $a_2^{\text{prev}}$              | 68     | Limb 2 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_3` | $a_3^{\text{curr}}$               | $a_3^{\text{prev}}$              | 50     | Limb 3 of current/previous accumulator   |
| `QUOTIENT_LOW_BINARY_LIMBS`   | $q_0$                             | $q_1$                            | 68     | Limbs 0 & 1 of quotient $\mathcal{Q}$    |
| `QUOTIENT_HIGH_BINARY_LIMBS`  | $q_2$                             | $q_3$                            | 68, 52 | Limbs 2 & 3 of quotient $\mathcal{Q}$    |
| `RELATION_WIDE_LIMBS`         | $c^{\text{lo}}$                   | $c^{\text{hi}}$                  | 84     | Carry/overflow from mod $2^{136}$ checks |

The accumulator columns show the shift mechanism:

- Even row stores $a^{\text{curr}}$ (result of current computation)
- Odd row stores what will become $a^{\text{prev}}$ (input to next computation)
- Via shifts, even row $2i$ reads odd row $2i+1$ to get "previous" values

### 3. Range Constraint Microlimb Columns (64 columns)

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
| Coordinate $z_1$ and $z_2$ microlimbs          |                                                          |                                                           |
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

The tail microlimbs (shown in yellow) enforce tight range constraints by ensuring top limbs use exactly the required number of bits (explained in the Decomposition Relation section of [RELATIONS.md](RELATIONS.md)).

Some columns are reassigned in odd rows to hold tail microlimbs for limbs that don't need all 5 microlimbs. For example, limb $P_{x, 3}$ is only 50 bits (= 3×14 + 8), requiring only 4 microlimbs. The 5th microlimb column `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4` at odd rows is therefore reassigned to hold the tail microlimb of $P_{x,3}$. The freed odd-row `*_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL` cells hold the carry microlimbs $c^{\text{lo}}[4]$, $c^{\text{lo}}[5]$, $c^{\text{hi}}[4]$, $c^{\text{hi}}[5]$.

### Derived (committed) polynomials

The prover builds the 5 concatenated polynomials from the mini-circuit wires and the 5 ordered polynomials by sorting. They are stored proving-key polynomials, and the prover commits to all 10.

### Mini-Circuit Layout

The mini-circuit layout is illustrated below:

- The first 4 columns represent the `EccOpQueue` transcript
- The next 13 columns represent limb decompositions
- The last 64 columns represent microlimb decompositions
- Let $n$ = total number of rows in the mini-circuit
- Let $r_{\textsf{start}}$ = number of rows for randomness at start
- Let $r_{\textsf{end}}$ = number of rows for randomness at the end
- Let $n_0$ = number of initial zero rows (to ensure column polynomials are shiftable)

| Rows | Count | 4 op-queue columns | 13 limb + 64 microlimb columns |
|---|---|---|---|
| 0-1 | $n_0 = 2$ | zero (shiftability) | zero (shiftability) |
| 2-7 | $r_{\textsf{start}} = 6$ (3 random ops) | random op values | zero |
| 8-8187 | $n - n_0 - r_{\textsf{start}} - r_{\textsf{end}} = 8180$ | ops | ops |
| 8188-8191 | $r_{\textsf{end}} = 4$ (2 random ops) | random op values | random values (ZK sumcheck masking) |

In our implementation, mini-circuit size is $n = 2^{13}$. We have $n_0 = 2$ (two zero rows at the start to ensure shiftability), $r_{\textsf{start}} = 6$ (rows for three random ops at start), and $r_{\textsf{end}} = 4$ (rows for two random ops at end). Thus, the number of main operation rows is $n - r_{\textsf{start}} - r_{\textsf{end}} - n_0 = 8180$.

In AVM mode (`avm_mode` in `translator_circuit_builder.cpp`), the builder takes `get_no_zk_reconstructed_ultra_ops()` and appends no end random ops; `GoblinAvm::GoblinAvm` (`goblin_avm/goblin_avm.cpp`) queues the leading no-op, the 3 random ops and a deterministic hiding op itself.

The random ops and the end masking rows provide zero-knowledge; see [Step 7](#step-7-zero-knowledge-masking). Below, $m = r_{\textsf{end}} = 4$ (`NUM_MASKED_ROWS_END`) is the number of masked rows at the end of the mini-circuit.

### Lagrange Polynomials (Precomputed)

The circuit uses Lagrange polynomials to control which constraints are active: ($I_{\text{size}} = 16$ is the number of columns concatenated together)

| Polynomial                     | Description                               | Active Rows                                                                                     |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `lagrange_first`               | First row                                 | $i = 0$                                                                                         |
| `lagrange_real_last`           | Last row in full circuit (before masking) | $i = N -$ `MAX_RANDOM_VALUES_PER_ORDERED` $- 1 = 2^{17} - 64 - 1 = 131007$               |
| `lagrange_last`                | Last row in full circuit                  | $i = 2^{17} - 1$                                                                                |
| `lagrange_masking`             | Scattered masking rows in full circuit    | $i \in \lbrace j \cdot 2^{13} + k : j \in [0,16), k \in [2^{13} - m, 2^{13})\rbrace$                       |
| `lagrange_mini_masking`        | Masking rows in mini circuit              | $i \in [n_0, \ n_0 + r_{\textsf{start}}) \cup [n - r_{\textsf{end}}, \ n)$                      |
| `lagrange_even_in_minicircuit` | Even indices in real mini-circuit         | $i \in \lbrace u \ \mid  \ u \ \bmod  \ 2 = 0, \ (n_0 + r_{\textsf{start}}) \leq u < n - r_{\textsf{end}}\rbrace$ |
| `lagrange_odd_in_minicircuit`  | Odd indices in real mini-circuit          | $i \in \lbrace u \ \mid  \ u \ \bmod  \ 2 = 1, \ (n_0 + r_{\textsf{start}}) \leq u < n - r_{\textsf{end}}\rbrace$ |
| `lagrange_result_row`          | Row containing final accumulator result   | $i = (n_0 + r_{\textsf{start}})$                                                                |
| `lagrange_last_in_minicircuit` | Last real row in mini-circuit             | $i = (n - r_{\textsf{end}}) - 1$                                                                |
| `lagrange_ordered_masking`     | Contiguous masking at end of circuit      | $i \in [N - 64, N)$                                                                             |

## Concatenation

The Translator must range-constrain 64 microlimb columns using permutation argument (and the delta range constraint). The permutation argument's degree equals $1 +$ `NUM_COLS`, where NUM_COLS is the number of columns being permuted:

$$
z_{\textsf{perm}}[i+1] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{ordered}[j] + \gamma) =
z_{\textsf{perm}}[i] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{concatenated}[j] + \gamma)
$$

The problem: permuting all 64 microlimb columns simultaneously would require us to commit to all of them. Further, since the relation degree would be $1 + 64 = 65$, computing the sumcheck univariates could be a significant overhead for the prover. The prover would need to then commit to the univariates (instead of sending evaluations directly).

The solution: concatenate 16 columns into one polynomial, giving 4 concatenated range-constraint polynomials. One grand product `z_perm` compares a 5-factor numerator (the 4 concatenated range-constraint polynomials and the precomputed `ordered_extra_range_constraints_numerator`) with a 5-factor denominator (the 5 ordered polynomials). Its degree is 6 (partial length 7), against degree 65 for 64 separate columns.

### Circuit Structure

```
Mini-circuit size:  2^13 = 8,192 rows    (actual computation)
Full circuit size:  2^13 x 16 = 2^17 = 131,072 rows  (after concatenation)
```

To compute the concatenated polynomials, we group 16 polynomials together and concatenate them end-to-end (lane bits as MSB). Consider the following 16 polynomials each of size $n=2^{13}$ in the mini-circuit:

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
\textsf{lane} & \textsf{index} & \textsf{concatenated} \\
\hline
0 & 0 & \textcolor{skyblue}{a_0} \\
0 & 1 & \textcolor{skyblue}{a_1} \\
0 & 2 & \textcolor{skyblue}{a_2} \\
\vdots & \vdots & \vdots \\[3pt]
0 & n-1 & \textcolor{skyblue}{a_{n-1}} \\ \hline
1 & n & \textcolor{orange}{b_0} \\
1 & n+1 & \textcolor{orange}{b_1} \\
1 & n+2 & \textcolor{orange}{b_2} \\
\vdots & \vdots & \vdots \\[3pt]
1 & 2n-1 & \textcolor{orange}{b_{n-1}} \\ \hline
\vdots & \vdots & \vdots \\ \hline
15 & 15n & \textcolor{firebrick}{p_0} \\
15 & 15n+1 & \textcolor{firebrick}{p_1} \\
15 & 15n+2 & \textcolor{firebrick}{p_2} \\
\vdots & \vdots & \vdots \\[3pt]
15 & 16n-1 & \textcolor{firebrick}{p_{n-1}} \\
\hline
\end{array}
$$

For 64 microlimb columns, we have 4 groups of 16 columns each, resulting in four concatenated polynomials each of size $16n = 2^{17}$. The 13 non-range limb wires form a 5th group, `concatenated_non_range` (zero-padded to 16). The single grand product has:

- Numerator: 4 concatenated range-constraint polynomials + 1 extra numerator = 5 terms
- Denominator: 5 ordered polynomials = 5 terms
- Degree: 6 (partial length 7)

The permutation argument verifies that the concatenated values plus the extra numerator are a permutation of the ordered (sorted) values. Concatenation increases the circuit size 16×, which requires more zero-padding. This is acceptable given the degree reduction from 65 to 6 (about 11×).

> **Effect on Commitment Scheme**: The prover commits to 5 concatenated polynomials (4 range-constraint groups and 1 group of the 13 non-range limb wires) instead of 77 individual wires. Only the 4 range-constraint groups enter the permutation numerator. This reduces the proof size and recursive verification cost. The verifier reconstructs evaluations of the concatenated polynomials from individual wire evaluations using Lagrange decomposition over the top 4 sumcheck challenges.

## Witness Generation and Proving Key Construction

Witness generation transforms the `EccOpQueue` from the Mega circuit into the 92 polynomials required by the Translator circuit:

```
Input:  EccOpQueue (n operations)
        Evaluation challenge x ∈ Fq
        Batching challenge v ∈ Fq

Output: 92 polynomials of size 2^17
        - 81 witness polynomials
        - 5 ordered range constraint polynomials
        - 5 concatenated polynomials (committed)
        - 1 grand product polynomial (z_perm, for the permutation argument)
```

**Note:** Witness generation happens in the **mini-circuit size** (2¹³ = 8,192 rows), then is expanded to **full circuit size** (2¹⁷ = 131,072 rows) through concatenation and zero-padding.

### Step 1: Populate Transcript Polynomials

The prover receives the `EccOpQueue` from the Mega circuit. Each entry contains:

$$\texttt{UltraOp} = \lbrace \texttt{op}, P_x, P_y, z_1, z_2\rbrace$$

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

See [RELATIONS.md](RELATIONS.md#quotient-bound) for why 256 bits suffice for the quotient.

**Carry computation:** The relation-wide limbs $c^{\text{lo}}$ and $c^{\text{hi}}$ (84 bits each) capture overflow from the mod $2^{136}$ checks:

$$c^{\text{lo}} = \left\lfloor \frac{T_0 + 2^{68} \cdot T_1}{2^{136}} \right\rfloor, \quad c^{\text{hi}} = \left\lfloor \frac{T_2 + 2^{68} \cdot T_3}{2^{136}} \right\rfloor$$

where $T_0, T_1, T_2, T_3$ are the limb contributions defined in [RELATIONS.md](RELATIONS.md#non-native-field-relations); $T_2$ includes $c^{\text{lo}}$.

### Step 4: Microlimb Decomposition

Each limb is split into 14-bit microlimbs, with a tail microlimb that tightens the range of the top microlimb. See [RELATIONS.md](RELATIONS.md#decomposition-relation) for the decomposition formulas and the tail shifts.

### Step 5: Construct Concatenated Polynomials

The 64 microlimb columns are organized into 4 groups of 16 columns each. Each group is **concatenated** into a single polynomial at full circuit size.

**Concatenation formula:** For group polynomials $\lbrace p_0, p_1, \ldots, p_{15}\rbrace$ each of mini-size $n = 2^{13}$:

$$p_{\text{concatenated}}[j \cdot n + k] = p_j[k] \quad \text{for } j \in [0, 16), \ k \in [0, n)$$

This expands the circuit from mini-size $2^{13}$ to full size $2^{17} = 2^{13} \times 16$.

**Illustration:** We have a total of 64 microlimb columns, each with $n = 2^{13}$ rows (mini-circuit size). We illustrate the microlimb distribution and concatenation process below:

1. Let $I_{\textsf{size}} = 16$ be the number of microlimb columns in one group. Since we have 64 microlimb columns, we will have 4 groups.

2. Each group separates the microlimbs into circuit witnesses ($n-m$ rows) and masking values ($m$ rows).

3. For each group, we concatenate the microlimbs end-to-end to create one concatenated polynomial of size $n \cdot I_{\textsf{size}}$. Within each of the $I_{\textsf{size}}$ blocks, the last $m$ rows are masking values, so masking is scattered across the concatenated polynomial (not contiguous at the end).

```
group g, lane j (j = 0..15), mini-circuit rows:  [ n - m witness rows | m masking rows ]
concatenated_range_constraints_g:                [ lane 0 | lane 1 | ... | lane 15 ]   (size 16n)
```

### Step 6: Construct Ordered (Sorted) Polynomials

The permutation argument requires proving that the concatenated microlimbs equal the **sorted** microlimbs. The prover constructs 5 ordered polynomials by collecting microlimbs from all 64 columns, sorting them, and distributing across ordered polynomials with inserted step values. We first describe the mathematical setup and then illustrate the construction steps.

**Constants:**

- Mini-circuit size: $n = 2^{13} = 8{,}192$
- Number of masked rows in mini-circuit: $m = 4$
- Mini-circuit size without masking: $(n - m) = 8{,}188$
- Number of concatenation groups: $G = 4$
- Group size: $I_{\text{size}} = 16$ (polynomials per group)
- Full circuit size: $N := n \cdot I_{\text{size}} = 2^{17} = 131{,}072$
- Circuit size without masking: $N_{\text{no-mask}} = N - m \cdot I_{\textsf{size}}$
- Step sequence size: $N_{\text{steps}} = 5{,}462$

$\mathcal{S}$ is the sorted step sequence $\lbrace 0, 3, \ldots, 16383\rbrace$; see [RELATIONS.md](RELATIONS.md#delta-range-constraint-relation).

#### Step 6.1: Collect Microlimbs from Each Group

For each group $g \in \lbrace 0, 1, 2, 3\rbrace$, collect all microlimbs from its 16 polynomials:

$$\mathcal{M}_g = \bigcup_{j=0}^{15} \Big\lbrace p_{g,j}[i] : i \in [1, (n-m)) \Big\rbrace$$

where $p_{g,j}$ is the $j$-th polynomial in group $g$. Each wire is zero at index 0 and is collected from index 1. Size of each group microlimb set:

$$|\mathcal{M}_g| = 16 \times (n - m - 1)$$

and total microlimbs across all groups:
$$|\mathcal{M}_0 \cup \mathcal{M}_1 \cup \mathcal{M}_2 \cup \mathcal{M}_3| = 64 \times (n - m - 1).$$

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

Mathematically, for $g \in \lbrace 0, 1, 2, 3\rbrace$:

$$
\text{ordered}[g]_{\text{unsorted}} = \begin{cases}
\mathcal{M}_g[k] & \text{if } k < C_{\text{capacity}} \\
\mathcal{S}[k - C_{\text{capacity}}] & \text{if } C_{\text{capacity}} \leq k < N_{\text{no-mask}} \\
0 & \text{if } k \geq N_{\text{no-mask}} \text{ (masking region)}
\end{cases}
$$

Then sort:
$$\text{ordered}[g] = \text{sort}(\text{ordered}[g]_{\text{unsorted}})$$

The sorted values are placed from position 1. Position 0 of every ordered polynomial is a zero, `ordered[g][0] = 0`, enforced by `TranslatorShiftableFirstCoeffZeroRelation`.

Overflow microlimbs: If $|\mathcal M_g| > C_{\text{capacity}}$, the excess microlimbs go to group 4:

$$\mathcal{M}_{g,\text{overflow}} = \left\lbrace \mathcal{M}_g[k] : k \geq C_{\text{capacity}} \right\rbrace$$

$$|\mathcal{M}_{g,\text{overflow}}| = |\mathcal{M}_g| - C_{\text{capacity}}$$

#### Step 6.4: Construct the 5th Ordered Polynomial

The 5th ordered polynomial (`ordered_range_constraints_4`) collects all overflow:

$$\mathcal{M}_{\text{overflow}} = \bigcup_{g=0}^{3} \mathcal{M}_{g,\text{overflow}}$$

Size of overflow:
$$|\mathcal{M}_{\text{overflow}}| = 4 \times |\mathcal{M}_{g,\text{overflow}}| = 4 \times (16 \times (n - m - 1) - C_{\text{capacity}})$$

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

**Illustration:** We start with the 4 concatenated range constraint polynomials constructed earlier:

1. First, we add an extra numerator polynomial $I_5$ containing the step values (repeated 5 times) to enable the delta range constraint.

2. The remainder of $I_5$ is filled with zeros to match the size $N$ of the concatenated polynomials.

3. In the four concatenated polynomials, we have circuit witness values and masking values, scattered across 16 lanes. Some circuit witness values overflow into the 5th ordered polynomial.

4. We then construct the ordered polynomials $O_1, \dots, O_5$ by adding the step values into each concatenated polynomial and sorting the witness values appropriately.

5. The randomness in the masking region is redistributed to ensure that the multisets of the concatenated polynomials plus extra numerator equal the multisets of the ordered polynomials. Hence, the number of masking rows in each of the ordered polynomials is at least $\left\lfloor\frac{4 \cdot m \cdot I_{\textsf{size}}}{5}\right\rfloor$. The remainder of the rows in each ordered polynomial is filled with zero-padding.

```
I_1..I_4 (concatenated range constraints): 16 lanes x (0 | 8187 witness | 4 random)
I_5 (extra numerator):                     5 x 5462 steps | zeros
        |
        v  sort witness + steps; move the 256 random values to the end
O_1..O_5 (ordered):                        0 | sorted witness + steps | zeros | 52 or 51 random
```

> In our case, we have $m=4$ and $I_{\textsf{size}}=16$ which results in $(m \cdot I_{\textsf{size}}) = 64$ masked rows in each concatenated polynomial. Thus, each ordered polynomial will have at least $\left\lfloor\frac{4 \cdot 64}{5}\right\rfloor = 51$ masked rows. The remainder masked rows are added to the respective ordered polynomials. The masking rows in each ordered polynomial are padded with zero values to ensure the multiset equality holds.
>
> As illustrated, the two sets of concatenated and ordered polynomials satisfy the multiset equality:
> $$\bigcup_{i=1}^5 I_i = \bigcup_{i=1}^5 O_i.$$

### Step 7: Zero-Knowledge Masking

The translator uses three masking mechanisms.

#### Random ops in the op-queue columns (merge protocol ZK)

- The 3 random ops at the start (rows 2-7, from the batch-merge ZK prefix) put random values in the 4 op-queue columns.
- The 2 random ops at the end (rows 8188-8191, from the hiding kernel) put random values in the 4 op-queue columns.
- Together they contribute 40 random coefficients (10 per wire) that hide the merge protocol evaluations. See [MERGE_PROTOCOL.md](../goblin/MERGE_PROTOCOL.md#zk-considerations) for the degree-of-freedom analysis.

#### ZK sumcheck masking (non-op-queue wires)

To hide polynomial evaluations used in ZK sumcheck, random values are added to the last $m = r_{\textsf{end}} = 4$ rows of the mini-circuit for all non-op-queue wires (13 limb decomposition columns, 64 microlimb columns).

1. During random op processing, these columns are initially filled with zeros.
2. During proving key construction, these zeros are overwritten with random field elements.
3. The Lagrange polynomial `lagrange_mini_masking` marks rows $[2, 8)$ and the last 4 rows as masked.

#### Permutation argument masking (ordered polynomials)

For each wire, the masking region is the last $m$ rows of the mini-circuit, $[n - m, \ n)$. After concatenation, the 4 concatenated range-constraint polynomials hold random values at

$$\lbrace j \cdot n + k : j \in [0, 16), \ k \in [n - m, n) \rbrace$$

(`lagrange_masking`), scattered over the last 4 rows of each of the 16 blocks.

The ordered polynomials must be committed. To maintain zero-knowledge, the prover moves the random values from the 4 concatenated polynomials to the 5 ordered polynomials. The total number of random values is

$$M = 4 \cdot m \cdot I_{\textsf{size}} = 256.$$

Each ordered polynomial receives $\left\lfloor\frac{M}{5}\right\rfloor$ random values. The remaining $M \bmod 5$ values go one each to the first ordered polynomials. With $M = 256$, `ordered_range_constraints_0` gets 52 random values and the others get 51. They are placed at the end: $[N-52, N)$ in `ordered_range_constraints_0` and $[N-51, N)$ in `ordered_range_constraints_1..4`. These lie inside the 64-row `lagrange_ordered_masking` region $[N-64, N)$, whose other positions are zero.

**Note:** The same random values appear in both the concatenated and the ordered polynomials, at different positions within their masking regions. This is why the $\beta \cdot L_{\text{mask}}$ terms are needed in the permutation relation; see [RELATIONS.md](RELATIONS.md#subrelation-0-grand-product-identity).

Some positions in the ordered masking region contain random values, others contain zeros. The `ordered_extra_range_constraints_numerator` compensates for these zeros in the permutation check.

#### Ordered extra range constraints numerator

This precomputed polynomial contains the step values, repeated to balance the permutation:

$$\texttt{ordered extra}[i \cdot 5 + j] = \text{sorted steps}[i] \quad \text{for } i \in [0, 5462), \ j \in [0, 5)$$

where $\text{sorted steps} = \lbrace 0, 3, 6, 9, \ldots, 16383\rbrace$. The multisets then balance:

- **Numerator:** 4 concatenated range constraints + 1 extra (with 5 copies of each step value)
- **Denominator:** 5 ordered (each with 1 copy of each step value)

The Lagrange (precomputed selector) polynomials are listed in [Lagrange Polynomials](#lagrange-polynomials-precomputed).

## Tests

From `barretenberg/cpp`:

```bash
cmake --preset default
cd build && ninja translator_vm_tests && ./bin/translator_vm_tests
```
