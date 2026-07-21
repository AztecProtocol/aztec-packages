# Merge Protocol with Degree Checks

## Table of Contents
1. [Overview](#overview)
2. [Mathematical Foundation](#mathematical-foundation)
3. [Trace Layout Alignment](#trace-layout-alignment)
4. [Protocol Description](#protocol-description)
5. [Degree Check Mechanism](#degree-check-mechanism)
6. [Concatenation Check](#concatenation-check)
7. [Implementation Details](#implementation-details)
8. [Usage Examples](#usage-examples)
9. [Security Considerations](#security-considerations)

## Overview

The **Merge Protocol** is a component of the CHONK proving system used in Aztec. It proves the
correct construction and concatenation of the ECC (Elliptic Curve Cryptography) operation-queue
polynomials.

### Scope: latest merge vs. batch merge

This document describes a **single pairwise merge** step: given a left table $L_j$ and a right table
$R_j$, it proves their committed concatenation $M_j = L_j + X^\ell R_j$ together with a degree bound
on $L_j$.

In the current Chonk flow, per-circuit op-queue merges are **delayed**: each kernel only extends a
running hash over the op-queue subtable commitments it observes, and a single
[**Batch Merge Protocol**](./BATCH_MERGE_PROTOCOL.md) proves, in one shot, that the whole accumulated
table is the concatenation of all per-circuit subtables (plus a zero-knowledge prefix). This Merge
Protocol is then used for exactly **one** pairwise step — the **latest (final) merge**, which appends
the hiding kernel's own subtable to the batch-merged aggregate table at a fixed location. It runs in
**APPEND** mode only (see [Merge Settings](#merge-settings)). The degree-of-freedom analysis in
[Security Considerations](#security-considerations) is the ZK analysis for this final merge.

### Purpose

In the Goblin architecture, elliptic curve operations from multiple circuits are accumulated into a
shared operation queue. The (latest) Merge Protocol proves that:
1. **Concatenation is correct**: $M_j(X) = L_j(X) + X^\ell R_j(X)$.
2. **The left table has bounded degree** (so subtables do not overlap and the appended subtable lands
   at the expected fixed location).

### Role in Goblin

The Merge Protocol is one of the components in a full Goblin proof:
- **ECCVM (Elliptic Curve Virtual Machine)**: Proves correct execution of ECC operations
- **Translator**: Translates operations between BN254 and Grumpkin curves
- **Merge / Batch Merge**: Prove correct accumulation of operation tables (batch merge for the
  cumulative accumulation, the latest merge for the final hiding-kernel append)

## Mathematical Foundation

### Notation

| Symbol | Code identifier | Meaning | Bound / value |
|---|---|---|---|
| $j$ | wire index | op-queue column index | $j \in \lbrace 1,2,3,4\rbrace$ (`NUM_WIRES`) |
| $L_j$ | `left_table` | left table: the aggregate up to and including the tail subtable, $T_{\text{tail},j}$ | $\deg(L_j) < \ell$ |
| $R_j$ | `right_table` | right table: the hiding kernel's subtable $t_j$ | carries `APPEND_TRACE_OFFSET` leading zeros |
| $M_j$ | `merged_table` | full merged table $T_j = L_j + X^\ell R_j$ | |
| $\ell$ | `fixed_append_shift_size` (verifier-derived, not sent) | fixed append shift | `ZK_ULTRA_OPS + append_offset * NUM_ROWS_PER_OP` |
| $G$ | `reversed_batched_left_tables` | degree-check polynomial $X^{\ell-1}\sum_i \alpha_i L_i(X^{-1})$ | size $\ell$ |
| $\alpha_i$ | `degree_check_challenges` | degree-check batching challenges | $i \in \lbrace 1,\ldots,4\rbrace$ |
| $\kappa$ | `kappa` | evaluation challenge | |

### The Two Main Claims

The Merge Prover convinces the verifier that for each column $j = 1, 2, 3, 4$:

**1. Concatenation Identity:**
$$M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$$

where $\ell$ is the size of the left table (called `shift_size` in the code).

**2. Degree Bound:**
$$\deg(L_j(X)) < \ell$$

where $\ell =$ `shift_size` that prevents overlapping of different subtables.

### Merge Settings

In the current Chonk flow the Merge Protocol runs in **APPEND** mode only, at a **fixed location**:

- $L_j = T_{\text{tail},j}$: the aggregate table up to and including the tail subtable. It already
  contains the batch-merge zero-knowledge prefix at its start (see [Batch Merge](./BATCH_MERGE_PROTOCOL.md)),
  and is produced by `op_queue->construct_table_columns_up_to_tail()`.
- $R_j = t_j$: the hiding kernel's own subtable, produced by
  `op_queue->construct_current_ultra_ops_subtable_columns()`. It is appended at a fixed offset and
  carries `UltraEccOpsTable::APPEND_TRACE_OFFSET` leading zero rows.
- $M_j = T_j$: the resulting full table, produced by `op_queue->construct_ultra_ops_table_columns()`.

New operations (the hiding kernel's) are added at the **end**, at a fixed location, so that the merged
table always has the same total size regardless of transaction complexity (see
[Constant Merged Table Size](../chonk/README.md#constant-merged-table-size-for-zk) in the Chonk README).

The cumulative concatenation of all earlier subtables is established separately by the
[Batch Merge Protocol](./BATCH_MERGE_PROTOCOL.md); this protocol proves only the final append.

## Trace Layout Alignment

The merge protocol's correctness rests on the layout of three distinct polynomial families:

1. The **Mega circuit's `ecc_op_wire` polynomials** — the source of $[t_j]$ for each merge.
2. The **merge output $[M_j]$** — produced by this protocol.
3. The **Translator's op queue wire polynomials** (`x_lo_y_hi`, `x_hi_z_1`, `y_lo_z_2`, plus `op`) — consumed at the end of the IVC.

These three share commitments across proof layers, so their leading-zero structure must agree exactly.

### MegaZK circuit trace layout

Constants (from `constants.hpp` and `flavor/mega_flavor.hpp`):

- `NUM_ZERO_ROWS = 1` — single leading zero row that makes wire polynomials shiftable.
- `NUM_MASKED_ROWS = 3` — ZK masking rows, only populated with random values when `Flavor::HasZK`.
- `TRACE_OFFSET = NUM_MASKED_ROWS + 1 = 4` — number of rows disabled in Sumcheck (rows `[0, 4)`); equivalently, the first row where the Sumcheck gate separator is non-zero is `TRACE_OFFSET = 4`.

The first block (always `ecc_op`) has `trace_offset() = TRACE_OFFSET + NUM_ZERO_ROWS = 5`:

```
Row 0:     zero row (shiftability)
Rows 1-3:  masking rows in ZK flavors (MegaZKFlavor); zero otherwise
Row 4:     first active Sumcheck row; lagrange_first = 1 here
Row 5+:    ecc_op block data starts
```

Note the gap between row 4 and row 5. `lagrange_first` is placed at row 4 — the first row where the gate separator fires — and enforces the permutation boundary condition `lagrange_first` $\cdot z_{\text{perm}} = 0$, pinning $z_{\text{perm}}(4) = 0$. The first ecc_op witness values begin one row later at the ecc_op block's trace offset.

The Mega `ecc_op_wire_*` polynomials are **not shiftable** (`start_index = 0`) and **not masked** — they rely on random ops placed into the op queue itself for ZK. The regular wires `w_l, w_r, w_o, w_4` are shiftable (`start_index = NUM_ZERO_ROWS = 1`) and masked iff `HasZK`. Both copies hold identical values at rows 5+; the `EccOpQueueRelation` constrains them to agree wherever `lagrange_ecc_op = 1`.

### Translator mini-circuit layout

Constants (from `translator_vm/translator_flavor.hpp`):

- `TRACE_OFFSET = 0` — no disabled preamble.
- `RANDOMNESS_START = 2` — first row of real op-queue data.

```
Row 0:    zero (shiftability)
Row 1:    zero (RANDOMNESS_START - 1)
Row 2:    first op's data (x_lo, x_hi, y_lo, op)
Row 3:    first op's data (y_hi, z_1, z_2, 0)
```

Each op occupies `NUM_ROWS_PER_OP = 2` rows, with the split `(op, x_lo, x_hi, y_lo)` on the even row and `(0, y_hi, z_1, z_2)` on the odd row. Rows 0 and 1 — together one op-slot's worth of zeros — form the leading gap. The op queue wires (`x_lo_y_hi`, `x_hi_z_1`, `y_lo_z_2`) are shiftable with `start_index = 1`.

Critically, **the Translator does not commit to its op queue wires**. Instead, the commitment comes from the merge protocol's output $[M_j]$, so $[M_j]$ must commit to a polynomial with exactly `RANDOMNESS_START` leading zeros followed by the op-queue data.

### MegaAvmFlavor

The AVM recursive verifier uses `MegaAvmFlavor` which overrides the Mega preamble:

- `TRACE_OFFSET = 1` (no masking — `MegaAvmFlavor` inherits `HasZK = false` from `MegaFlavor`).
- Block offsets start at `TRACE_OFFSET + NUM_ZERO_ROWS = 2`.

```
Row 0:    zero (shiftability)
Row 1:    first active Sumcheck row (no masking)
Row 2+:   ecc_op block data
```

By construction this yields exactly 2 leading zeros in the ecc_op_wire commitments, matching the Translator's `RANDOMNESS_START = 2` without any merge-protocol shift adjustment.

### The merge protocol shift

The latest merge appends the hiding kernel's subtable at a **fixed offset**. The single shift size is
computed in `MergeProver`'s constructor:

```cpp
const size_t append_offset = op_queue->get_append_offset();
fixed_append_shift_size = UltraEccOpsTable::ZK_ULTRA_OPS + (append_offset * UltraEccOpsTable::NUM_ROWS_PER_OP);
op_queue->merge_fixed_append(append_offset);
```

So $\ell =$ `fixed_append_shift_size` is the fixed total number of rows of $L = T_{\text{tail}}$:
the `ZK_ULTRA_OPS` rows of the batch-merge ZK prefix plus the rows of all subtables up to the fixed
append offset. The `ZK_ULTRA_OPS` contain both the randomness and the zero row required by Translator and ECCVM. The hiding kernel's subtable $R$ is constructed with `APPEND_TRACE_OFFSET` leading zero
rows (matching the appender flavor's `TRACE_OFFSET`), so that it matches the commitments coming from the `MegaZK` prover.

Because a single shift $\ell$ is applied uniformly to $L$, $R$ and $M$, the concatenation identity is
the plain $M_j(X) = L_j(X) + X^\ell R_j(X)$.

## Protocol Description

### Commitment Layout Summary

All of $L$, $R$, $M$ are constructed in their final (shifted) form, with leading zero rows baked in,
and the same shift $\ell$ governs the concatenation. The shift $\ell$ = `fixed_append_shift_size` is
**not** sent in the proof: the verifier recomputes it from the fixed hiding-kernel op count
(`ECCOpQueue::compute_fixed_append_offset(ECCOpQueue::get_append_offset_for_verifier())`, driven by
`HIDING_KERNEL_ULTRA_OPS`), and the prover asserts its own hiding subtable matches. This pinning is a
zero-knowledge requirement — a prover-supplied `shift_size` would leak the private op-queue extent —
so the merge proof carries one field fewer than a transcript-supplied shift would.

### Commitment Propagation

The Merge Protocol does NOT commit to $L_j$ and $R_j$. Their commitments are **obtained from the
shared transcript / public inputs**, and the caller must already have bound them before calling the
verifier:

- $[L_j] = [T_{\text{tail},j}]$: the batch-merged aggregate table, carried in the hiding kernel's
  `HidingKernelIO.ecc_op_tables` public inputs.
- $[R_j] = [t_j]$: the hiding kernel's `ecc_op_wire` commitments, bound during the MegaZK Oink phase.

**The merge prover commits only to:**
- $[M_j]$ (`MERGED_TABLE_j`): the four merged-table commitments.
- $[G]$ (`REVERSED_BATCHED_LEFT_TABLES`): the degree-check polynomial commitment.


### Prover Algorithm

The `MergeProver::construct_proof()` method executes the following steps (see `merge_prover.cpp`):

#### Step 0: Prerequisite - Input Commitments
**Before** the merge proof begins, $[L_j] = [T_{\text{tail},j}]$ and $[R_j] = [t_j]$ must already be
bound to the shared transcript (via `HidingKernelIO` and the MegaZK Oink phase respectively). They are
**not** sent during the merge proof.

#### Step 1: Table Construction
Construct $L$, $R$, $M$ in final form. The left table spans the fixed $\ell$ rows; the right table
carries `APPEND_TRACE_OFFSET` leading zeros so its data lands at the fixed append location:
```cpp
merged_table = op_queue->construct_ultra_ops_table_columns();         // M = T
left_table   = op_queue->construct_table_columns_up_to_tail();        // L = T_tail
right_table  = op_queue->construct_current_ultra_ops_subtable_columns(); // R = t (hiding subtable)
```
The shift $\ell =$ `fixed_append_shift_size` is a fixed constant that prover and verifier each compute
independently (`ECCOpQueue::compute_fixed_append_offset`); it is **not** sent in the proof (see
[The merge protocol shift](#the-merge-protocol-shift)).

#### Step 2: Commit to Merged Tables
Commit to $M_j$ and send `MERGED_TABLE_j` for $j = 0,\ldots,3$.

#### Step 3: Degree Check Polynomial
Receive challenges $\alpha_1, \ldots, \alpha_4$ and compute the reversed batched left table, of size
$\ell$:
$$G(X) = X^{\ell-1} \cdot \sum_{i=1}^{4} \alpha_i \cdot L_i(X^{-1}).$$

#### Step 4: Commit to Degree Check Polynomial
```cpp
transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES",
                             pcs_commitment_key.commit(reversed_batched_left_tables));
```

#### Step 5: Evaluation Challenge
Receive evaluation challenge $\kappa$ from the verifier (and compute $\kappa^{-1}$).

#### Step 6: Send Evaluations
Send the evaluations of the final-form polynomials:
- $l_j = L_j(\kappa)$ for all $j$ (`LEFT_TABLE_EVAL_j`)
- $r_j = R_j(\kappa)$ for all $j$ (`RIGHT_TABLE_EVAL_j`)
- $m_j = M_j(\kappa)$ for all $j$ (`MERGED_TABLE_EVAL_j`)
- $g = G(\kappa^{-1})$ (`REVERSED_BATCHED_LEFT_TABLES_EVAL`)

#### Step 7: Shplonk Batched Opening
Batch all 13 opening claims — $[L_1..L_4]$, $[R_1..R_4]$, $[M_1..M_4]$ at $\kappa$ and $[G]$ at
$\kappa^{-1}$ — into a single Shplonk quotient, then produce one KZG opening proof. The opening of
$[L_j]$ against $l_j$ pins the leading-zero structure of $L$: any nonzero coefficient outside the
claimed support makes the opening fail.

### Verifier Algorithm

The verifier (`MergeVerifier_::reduce_to_pairing_check`) computes the fixed shift $\ell$ itself
(`ECCOpQueue::compute_fixed_append_offset`, matching the prover — it is not read from the proof),
derives $\kappa$, and sets $\kappa^\ell$ and $\kappa^{\ell-1} = \kappa^\ell \cdot \kappa^{-1}$.

#### Check Concatenation Identity
For each column $j$ (`check_concatenation_identities`):
$$l_j + \kappa^\ell \cdot r_j = m_j.$$

#### Check Degree Identity
For the batched left table (`check_degree_identity`):
$$\sum_{i=1}^{4} \alpha_i \cdot l_i = g \cdot \kappa^{\ell-1}.$$
This proves $\deg(L_j) < \ell$. The exponent $\kappa^{\ell-1}$ forces $\deg(G) \leq \ell - 1$:
if $\deg(G) > \ell - 1$, the LHS (a polynomial of degree $\leq \ell - 1$ in $\kappa$) cannot match
the RHS (which would contain negative powers of $\kappa$).

#### Verify Shplonk Opening
Reduce all 13 claims to one batched KZG opening claim and verify it:
- $[L_1], \ldots, [L_4]$ and $[R_1], \ldots, [R_4]$ (from the input commitments)
- $[M_1], \ldots, [M_4]$ (from the proof)
- $[G]$ (from the proof)

The verifier returns the merged table commitments $[M_j]$ and the resulting pairing points.


## Degree Check Mechanism

Without a degree check, $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ does not guarantee that $L_j$ stays
within its $\ell$ rows; a malicious prover could let the left table bleed into the region reserved for
the appended hiding-kernel subtable. The degree check enforces $\deg(L_j) < \ell$ so the append lands
at exactly the fixed location.

**Method:** Use the reversed-polynomial identity (based on Thakur's degree check protocol
[[6](#ref-thakur)], Section 6.2). For $\deg(L_j) < \ell$:
$$L_j^{\ast}(X) = X^{\ell-1} \cdot L_j(X^{-1}) \implies L_j^{\ast}(\kappa^{-1}) = \kappa^{-(\ell-1)} \cdot L_j(\kappa)$$

**Batching:** Check all 4 columns simultaneously with one reversed polynomial of size $\ell$:
$$G(X) = X^{\ell-1} \cdot \sum_{i=1}^{4} \alpha_i \cdot L_i(X^{-1})$$

**Verification:** Check $\sum_{i=1}^{4} \alpha_i \cdot l_i = g \cdot \kappa^{\ell-1}$, where
$l_i = L_i(\kappa)$.

**Implementation** (`merge_prover.cpp`): $G$ is the reverse of the $\alpha$-batched left table,
allocated at the fixed left-table size:
```cpp
MergeProver::Polynomial MergeProver::compute_degree_check_polynomial(
    const std::array<Polynomial, NUM_WIRES>& left_table,
    const std::vector<FF>& degree_check_challenges) const
{
    Polynomial reversed_batched_left_tables(fixed_append_shift_size);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        reversed_batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
    }
    return reversed_batched_left_tables.reverse();
}
```

## Concatenation Check

Verifies $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ by checking, at the random evaluation point $\kappa$,
$$l_j + \kappa^\ell \cdot r_j = m_j \qquad (j = 1,\ldots,4).$$

A single shift $\ell$ governs all three polynomials. The polynomial identity holds for all $X$ if and
only if it holds at random $\kappa$ (Schwartz–Zippel lemma).

## Implementation Details

### File Structure

- **merge_prover.hpp**: Prover class declaration
- **merge_prover.cpp**: Prover implementation
- **merge_verifier.hpp**: Verifier class template declaration
- **merge_verifier.cpp**: Verifier implementation with native and recursive instantiations

### Costs and Proof Size

Per merge (`NUM_WIRES` $= 4$ columns), reducing all openings to a single KZG claim:

| | Prover | Verifier |
|---|---|---|
| Group ops | commit $[M_1..M_4]$, $[G]$, Shplonk quotient $[Q]$ (6 commitments); 1 KZG opening | batched opening over the 13 claims ($4\ L + 4\ R + 4\ M + G$) reduced to a single pairing claim |
| Field ops | build $G$ (size $\ell$) and the Shplonk quotient | concatenation check (4 identities) + degree check (1 batched identity) |
| Pairings | — | returns `PairingPoints`, aggregated and verified later (deferred to L1) |
| Proof size | $[M_1..M_4]$, $[G]$, 12 evals ($l_j, r_j, m_j$), $g$, $[Q]$, KZG proof | — |

$[L_j]$ and $[R_j]$ are not part of the merge proof; they are taken from the shared transcript
(`HidingKernelIO` and the MegaZK Oink phase). The batched-claim size is asserted as
`MERGE_BATCHED_CLAIM_SIZE` in `merge_verifier.cpp`.

## Security Considerations

### Soundness

The Merge Protocol achieves soundness through:

1. **Thakur Degree Check** [[6](#ref-thakur)]: Reversed polynomial technique ensures $\deg(L_j) < \ell$
2. **Schwartz-Zippel Lemma**: Polynomial identities checked at random points
3. **Batching Security**: We are using Shplonk to batch different opening claims.
4. **KZG Commitment Security**: Based on the hardness of the discrete logarithm problem on BN254


### ZK Considerations

#### Standalone Merge Protocol is Not ZK

The Merge Protocol, as described above, is **not inherently zero-knowledge**. The protocol reveals:
- Commitments to $[L_j]$, $[R_j]$, $[M_j]$, $[G]$
- Evaluations $l_j$, $r_j$, $m_j$, $g$ at challenge points $\kappa$ and $\kappa^{-1}$

These commitments and evaluations could potentially leak information about the ECC operations in the queue.

#### ZK-ification in CHONK

Within the **CHONK** proving system, the merged op-queue table is hidden by **random (non-)operations**
added at the two ends of the table:

##### Random Op Placement

**Beginning — batch-merge ZK prefix** (`ECCOpQueue::construct_zk_columns()`), prepended once to the
whole accumulated table by the [Batch Merge Protocol](./BATCH_MERGE_PROTOCOL.md). It has
`ECC_NUM_NO_OPS_START` + `ECC_NUM_RANDOM_OPS_START` + `ECC_NUM_HIDING_OPS_START` $= 1 + 3 + 1$ ops
(total `ZK_ULTRA_OPS` rows):

1. **1 no-op** — no randomness, just a leading slot.
2. **3 random Ultra-only ops** — random field elements, not pushed to `eccvm_ops_table`.
3. **1 valid hiding op** — a real ECC operation (pushed to both `ultra_ops_table` and `eccvm_ops_table`) that hides the accumulation result.

This prefix sits at the very start of the table, so it is part of $L = T_{\text{tail}}$ in the final
merge.

**End — hiding kernel** (`Chonk::hide_op_queue_content_in_hiding()`), **2 random non-ops** appended
via two `queue_ecc_random_op()` calls. These are part of $R = t$, the hiding kernel's subtable.

**Randomness budget for the final merge** (the random non-ops that mask $L$ and $R$):
- Each random op = 2 rows, contributing 2 random coefficients per column polynomial
- 3 prefix random ops → 6 coefficients per column (in $L$)
- 2 hiding random ops → 4 coefficients per column (in $R$)
- **Total: 10 random coefficients** per $M_j$ polynomial

##### Degree-of-Freedom Analysis

**Shared Commitments:** Merge and Translator use the **same commitment** $[M_j]$ (not separate commitments). Shifted evaluations $M_{j, \text{shifted}}(u)$ re-use $[M_j]$. Here $u^\prime$ is the Translator sumcheck evaluation challenge.

**Total Randomness Available:**
- 4 $M_j$ wires (op queue columns), each with 10 random coefficients (6 from $L_j$ batch-merge ZK prefix, 4 from $R_j$ hiding kernel)
- **Total: 40 random coefficients**

Let $r = (r_1, \ldots, r_{40}) \in \mathbb{F}^{40}$ denote these coefficients.

The verifier observes the following.

1. Per wire $j \in \lbrace 1, 2, 3, 4\rbrace$ observables:
    - Commitments $[L_j], [R_j]$ (**shared**: committed once in the kernel's Oink phase and reused by both Merge and Translator)
        - Note that the commitment $[M_j]$ can be determined from $\ell$, $L_j(\tau)$ and $R_j(\tau)$.
    - Merge: $L_j(\kappa)$
    - Merge: $R_j(\kappa)$
        - Note: $M_j(\kappa) = L_j(\kappa) + \kappa^\ell \cdot R_j(\kappa)$ (not an independent constraint)
    - MegaZK: $R_j(u)$ (as `ecc_op_wires` )
    - Translator: $M_j(u^\prime)$
    - Translator: $M_{j, \text{shifted}}(u^\prime)$

Each wire contributes at most 7 observable values, and hence totalling at most 28.

2. Shared observables:
    - Degree check polynomial $G(X) = X^{\ell - 1} \cdot \sum_{j=1}^4 \alpha_j L_j(X^{-1})$:
        - Commitment: $[G]$
        - Evaluation: $G(\kappa^{-1})$
        - Consistency check: $\sum_i \alpha_i L_i(\kappa) = G(\kappa^{-1}) \cdot \kappa^{\ell-1}$ (not new constraint, asserts linear dependence between $L_i(\kappa)$ and $G(\kappa^{-1})$ )

    - Shplonk batching (Batches all 13 opening claims ($4 \times 3$ for $L, R, M$ plus $G$)):
        - Quotient commitment: $[Q]$
        - Quotient opening: $Q(z)$

These contribute at most $4$ more observables.

These polynomials $L_j, R_j, M_j, G, Q$, for $j \in \lbrace 1, 2, 3, 4\rbrace$, have the form

$F(X)= F^{\mathrm{fixed}}(X)+ F^{\mathrm{rand}}(X) = F^{\mathrm{fixed}}(X) + \sum_{i=1}^{40} r_i  B_i^{F}(X)$.


Here, $B_i^{F}(X)$ is the coefficient polynomial of $r_i$ in $F$, which determines the contribution of $r_i$ in $F$ given by $r_i B_i^{F}(X)$.
- For the polynomials $F \in \lbrace L_j, R_j\rbrace$, if the randomness $r_i$  appears in polynomial $F$ at some row $t$ of the op-queue, then $B_i^{F}(X)$ is the polynomial that evaluates to $1$ at $t$, and $0$ at all other rows where $F$ is defined. In case if $r_i$ does not appear in $F$, then $B_i^{F}(X) = 0$.
- For the polynomials $F \in \lbrace M_j, G, Q\rbrace$, $B_i^{F}$ are obtained by applying to the coefficient polynomials of its constituent polynomials (those that define $F$, e.g., $L_j, R_j$ for $M_j$, or $L_j$ for $G$, etc.) the same linear combinations used to define $F$ itself.
For example, if $r_{8}$ appears in $R_1$ at row $5$, then in $M_1(X) = L_1(X) + X^{\ell}R_1(X)$, we will have $B_{8}^{M_1}(X) = X^{\ell} \cdot B_{8}^{R_1}(X)$, where $B_{8}^{R_1}(X)$ is the polynomial that evaluates to $1$ at $X=5$ and $0$ elsewhere.


Since not every random non-op affects every wire, for a given $F \in \lbrace L_j, R_j, M_j, G, Q\rbrace$, most $B_i^{F}=0$.


Each observable value $v_k$ is obtained from one of the polynomials
$F \in \lbrace L_j, R_j, M_j, G, Q\rbrace$ by applying a linear transformation
(e.g., evaluation at $\kappa$, evaluation at $u'$, a shift of
the variable followed by evaluation, etc.).
Thus, each observable value can be written as

$v_k(r,X) =  T_k(F_k(X))$,

where $T_k$ denotes the linear transformation associated with that observable value.

Substituting

$F(X)=F^{\mathrm{fixed}}(X)+\sum_{i=1}^{40} r_i B_i^{F}(X)$

in the equation for $v_k(r, X)$ gives

$v_k(r,X) = c_k(X) + \sum_{i=1}^{40} r_i T_k(B_i^{F_k}(X))$, where $c_k(X)$ is the fixed part.

Denoting

$A_{k,i}(X) = T_k(B_i^{F_k}(X))$,

we can write

$v_k(r, X) = \sum_{i=1}^{40} A_{k,i}(X) r_i + c_k(X)$.


Collecting these, say $N=32$, observable values into a vector $v(r, X)\in\mathbb{F}^N$, we can write $v(r, X) = A(X) r + c(X)$ for $A(X) \in \mathbb{F}^{N \times 40}$ and $c(X) \in \mathbb{F}^N$. Here, $X$ denotes the tuple of challenges $(\kappa, u, u', z)$ at which the polynomials $L_j, R_j, M_j, G, Q$ are queried.

Thus, the number of linear equations in $r$ induced by this transcript of observable values can be bounded as follows.

- 28 observables across all wires ($[L_j], [R_j], L_j(\kappa), R_j(\kappa), R_j(u), M_j(u'), M_{j,\text{shift}}(u')$ for $j \in \lbrace 1, 2, 3, 4\rbrace$)

- 4 shared observables ( $[G], G(\kappa^{-1}), [Q], Q(z)$ )

We therefore have at most $32$ linear equations in $40$ unknowns when considering $v = A r + c$. Assuming that the rows of $A(X)$ are linearly independent, at least $8$ independent coefficients remain uniformly distributed from the verifier’s point of view.  This suffices to hide the contribution of the true ECC op-queue.

We next show that rank of $A(X) = 32$ for random $X$. This implies that the rows of $A(X)$ are linearly independent.

###### $\mathrm{rank}(A(X)) = 32$ for random challenges $X$:
To show that $\mathrm{rank}(A(X)) = 32$, we will show that there does not exist a non-zero $\beta \in \mathbb{F}^{40}$ such that $A(X)\beta = 0$ for a  random $X$.

Assume, for contradiction, that there exists a non-zero vector
$\beta=(\beta_1,\dots,\beta_{40})$ such that $A(X)\beta = 0$ identically as a function of the challenges $X$.

This implies that for each observable index $k$, $\sum_{i=1}^{40} A_{k,i}(X) \beta_i = 0$.

Substituting $A_{k,i}(X)$ as defined earlier, we get $0 = \sum_{i=1}^{40} \beta_i T_k(B_i^{F_k}(X)) = T_k \left( \sum_{i=1}^{40} \beta_i B_i^{F_k}(X) \right)$.

For each $F$, let $H_F(X) := \sum_{i=1}^{40} \beta_i  B_i^{F}(X)$.

Then, $A(X)\beta = 0$ implies for all $k$, $T_k\big(H_{F_k}(X)\big) = 0$.

We now argue that there exists at least one $F$ such that $H_{F}$ is non-zero.

- To see why this is true, observe that since $\beta \neq 0$, there exists at least one index $i$, such that $\beta_i \neq 0$.
- Consider the corresponding randomness $r_i$ at index $i$. As per the placement of the random non-ops in the op-queue, let  $F_{r_i} \in \lbrace L_j, R_j\rbrace$ be the polynomial where $r_i$ appears in row $\rho_i$ of $F_{r_i}$ (here $\rho_i$ denotes the row index where $r_i$ is placed).
- In general, note that the placement of the random non-ops ensures that for each $r_i$ for $i \in \lbrace 1, \ldots, 40\rbrace$, there exists polynomial $F_{r_i} \in \lbrace L_j, R_j\rbrace$ and a corresponding row $\rho_i$ such that

  (1) the coefficient polynomial $B_i^{F_{r_i}}$ is non-zero. Specifically, $B_i^{F_{r_i}}(\rho_i) \neq 0$,

  (2) no other $r_k$ ($k \neq i$) affects $\rho_i$ of $F_{r_i}$, i.e., $B_k^{F_{r_i}}(\rho_i) = 0$.

- Evaluating $H_{F_{r_i}}(X)$ at $\rho_i$, we get

    $H_{F_{r_i}}(\rho_i) = \sum_{j=1}^{40} \beta_j  B_j^{F_{r_i}}(\rho_i) = \beta_i B_i^{F_{r_i}}(\rho_i) + \sum_{j\neq i} \beta_j B_j^{F_{r_i}}(\rho_i) = \beta_i B_i^{F_{r_i}}(\rho_i) \neq 0$.

- Thus, given $\beta \neq 0$, there exists at least one $F$ ($F_{r_i}$ in this case) such that $H_{F}$ is non-zero.

In particular, corresponding to $F_{r_i}$, there exists an observable index $k_{r_i}$ with $F_{k_{r_i}} = F_{r_i}$ and a non-zero linear transformation $T_{k_{r_i}}$. Thus, $T_{k_{r_i}}\big(H_{F_{r_i}}(X)\big)$ is non-zero polynomial. This contradicts the assumption that for all $k$, $T_k\big(H_{F_k}(X)\big) = 0$.


This contradiction arose due to our assumption that $A(X)\beta = 0$ for a non-zero $\beta$. Thus, there does not exist a non-zero $\beta$ such that $A(X)\beta = 0$. Hence, $A(X)$ has full row rank.
This implies that there exists a $32 \times 32$ submatrix $A'(X)$ of $A(X)$ whose determinant is non-zero.
Thus, there exists an $X'$ such that determinant of $A'(X')$ is non-zero.
Thus, $A(X')$ has rank $32$.
Since determinant of $A'(X)$ is a non-zero polynomial in the challenge $X$, it is non-zero with high probability for a random challenge. Hence, for a random $X$, rank of $A(X) = 32$ with high probability.

##### The simulator

The simulator proceeds as follows.

- Choose a valid dummy op-queue arbitrarily. This determines the fixed part $c_{\mathrm{dummy}}$ without the random non-ops.
- Sample challenges $\kappa, u, u', z$ using the same distribution as in the real protocol.
- Sample $r_{\mathrm{sim}} \in \mathbb{F}^{40}$ uniformly at random.
- Compute the corresponding simulated openings $v_{\mathrm{sim}} = A r_{\mathrm{sim}} + c_{\mathrm{dummy}}$.
- Build the simulated polynomials as follows.

    - Build simulated polynomials $L_j^{\mathrm{sim}}, R_j^{\mathrm{sim}}$ whose coefficients match $r_{\mathrm{sim}}$ in positions corresponding to random non-ops and the dummy op-queue elsewhere.
    - Build the polynomial $M_j^{\mathrm{sim}}(X) = L_j^{\mathrm{sim}}(X) + X^{\ell}R_j^{\mathrm{sim}}(X)$.
    - Build the degree check polynomial as $G^{\mathrm{sim}}(X) = X^{\ell-1} \cdot \sum_{i=1}^{4} \alpha_i L_i^{\mathrm{sim}}(X^{-1})$.
    - Build the Shplonk quotient polynomial $Q^{\mathrm{sim}}$ as per the honest protocol using the simulated openings.
    - In this way,
        $L_j^{\mathrm{sim}}(\kappa),
        R_j^{\mathrm{sim}}(\kappa),
        R_j^{\mathrm{sim}}(u),
        M_j^{\mathrm{sim}}(u'),
        M_{j,\mathrm{shift}}^{\mathrm{sim}}(u'),
        G^{\mathrm{sim}}(\kappa^{-1}),
        Q^{\mathrm{sim}}(z)$
        are consistent with the corresponding entries in $v_{\mathrm{sim}}$.
- Run the commitment protocol honestly on the simulated polynomials to compute the commitments $[L_j^{\mathrm{sim}}], [R_j^{\mathrm{sim}}], [M_j^{\mathrm{sim}}], [G^{\mathrm{sim}}]$ and $[Q^{\mathrm{sim}}]$. Construct the opening proofs at the points $\kappa,\kappa^{-1},u,u',z$ to match $v_{\mathrm{sim}}$.

###### Indistinguishability
In the real world, the prover samples a vector $r_{\mathrm{real}} \in \mathbb{F}^{40}$ uniformly at random, corresponding to the random non-ops.
The observable opened values satisfy $v_{\mathrm{real}} = A(\kappa, u,u',z)  r_{\mathrm{real}} + c_{\mathrm{real}}$,  where $A(\kappa,u,u',z)$ depends only on the protocol structure and challenges, and $c_{\mathrm{real}}$ is the fixed part determined by the real op-queue.
In the simulated world we have $v_{\mathrm{sim}} = A(\kappa,u,u',z)  r_{\mathrm{sim}} + c_{\mathrm{dummy}}$, with $r_{\mathrm{sim}}$ uniform in $\mathbb{F}^{40}$ and $c_{\mathrm{dummy}}$ the fixed part for the dummy op-queue.

$A(\kappa,u,u',z)$ is the same in both worlds and does not depend on the op-queue. Moreover, rows of $A(\kappa,u,u',z)$ are linearly independent, as discussed earlier.
$r_{\mathrm{real}}$ and $r_{\mathrm{sim}}$ are both sampled uniformly at random from $\mathbb{F}^{40}$.
$c_{\mathrm{real}}$ and $c_{\mathrm{dummy}}$ are fixed vectors.
Therefore, $v_{\mathrm{real}} = A r_{\mathrm{real}} + c_{\mathrm{real}}$ and $v_{\mathrm{sim}} = A r_{\mathrm{sim}} + c_{\mathrm{dummy}}$ have the same distribution.
Further, in both worlds, commitments and opening proofs are generated by running the protocols honestly. Hence, the distributions of the observable values in both the real and simulated world are indistinguishable.




**Conclusion:** 3 + 2 random non-ops are sufficient for hiding.

**Implementation references:**
- `ECCOpQueue::construct_zk_columns()` (batch-merge ZK prefix: 1 no-op + 3 random + 1 hiding op)
- `Chonk::hide_op_queue_content_in_hiding()` (2 random non-ops appended in the hiding kernel)
- `ECCOpQueue::random_op_ultra_only()`

## References

1. **Shplonk**: [Paper](https://eprint.iacr.org/2020/081)
2. **KZG Commitments**: [Paper](https://www.iacr.org/archive/asiacrypt2010/6477178/6477178.pdf)
3. **Stackproofs**: [Paper](https://eprint.iacr.org/2024/1281)
4. <a name="ref-thakur"></a>**Thakur - Batching Non-Membership Proofs with Bilinear Accumulators**: [Paper](https://eprint.iacr.org/2019/1147.pdf), Section 6.2 (Degree Check Protocol)
5. **A note on the soundness of an optimized gemini variant**: [Paper](https://eprint.iacr.org/2025/1793.pdf)

## Merge Flow Through CHONK

### Overview

Op-queue merges in Chonk are **delayed**. Circuits are accumulated one at a time, each contributing a
subtable of ECC ops; no merge proof runs per kernel. Instead:

1. **Per kernel — running hash.** Each kernel extends a running Poseidon2 hash over the `ecc_op_wire`
   column commitments of the circuits it recursively verifies (`BatchMergeRecursiveVerifier::ecc_op_hash_step`),
   propagated through `KernelIO.ecc_op_hash`. This is the only op-queue work a non-final kernel does.
2. **After the tail — batch merge.** Once the tail circuit has been accumulated, a single
   [Batch Merge Protocol](./BATCH_MERGE_PROTOCOL.md) proves that the whole accumulated table equals the
   concatenation of all per-circuit subtables, preceded by a zero-knowledge prefix
   $T_{\text{zk}}$: $T_{\text{zk}} \Vert T_1 \Vert \cdots \Vert T_N = T_{\text{tail}}$. The hiding
   kernel recursively verifies this proof (`Goblin::recursively_verify_batch_merge`), checking the
   prover's column commitments against the running hash, and outputs $[T_{\text{tail},j}]$ in
   `HidingKernelIO.ecc_op_tables`.
3. **Final (latest) merge — this protocol.** In `Chonk::prove`, after the hiding kernel's own subtable
   has been added, `Goblin::prove_merge` appends it to $T_{\text{tail}}$ at the fixed location:
   $$M_j = L_j + X^\ell R_j, \qquad L_j = T_{\text{tail},j}, \quad R_j = t_{\text{hiding},j}.$$
   The Chonk verifier recursively verifies this single APPEND step using $[L_j]$ from
   `HidingKernelIO.ecc_op_tables` and $[R_j]$ from the hiding kernel's MegaZK Oink commitments.

So this protocol is invoked exactly once per IVC. The cumulative concatenation across all circuits is
the batch merge's job; the final pairwise append is this protocol's job.

#### Final Op Queue Structure

Reading from low to high degree, the final merged table is

$$T_j = \big[  \underbrace{T_{\text{zk},j}}_{\text{ZK prefix}} \mid T_{1,j} \mid T_{2,j} \mid \cdots \mid T_{\text{tail},j} \mid \text{zero padding} \mid \underbrace{t_{\text{hiding},j}}_{\text{fixed offset}}  \big]$$

- $T_{\text{zk},j}$ — the batch-merge ZK prefix (`ZK_ULTRA_OPS` rows): 1 no-op, 3 random Ultra-only ops, 1 valid hiding op.
- $T_{1,j}, \ldots, T_{\text{tail},j}$ — the per-circuit subtables, in accumulation (chronological) order, concatenated by the batch merge.
- $t_{\text{hiding},j}$ — the hiding kernel's subtable, ending in 2 random non-ops, appended by this protocol at a **fixed** offset so the total table size is constant.

The zero padding between $T_{\text{tail}}$ and the fixed offset makes the merged table size independent
of transaction complexity (see [Constant Merged Table Size](../chonk/README.md#constant-merged-table-size-for-zk)).

#### Mathematical Formula for the Final Table

The batch merge establishes the aggregate up to the tail. With $s_0 = $ `ZK_ULTRA_OPS` the prefix size
and $k_i = s_0 + \sum_{m<i} s_m$ the running offset of subtable $i$:

$$T_{\text{tail},j}(X) = T_{\text{zk},j}(X) + \sum_{i=1}^{N} X^{k_i}  T_{i,j}(X).$$

The final (latest) merge then appends the hiding subtable at the fixed offset $\ell$:

$$M_j(X) = T_{\text{tail},j}(X) + X^{\ell}\, t_{\text{hiding},j}(X), \qquad
\ell = \texttt{ZK\_ULTRA\_OPS} + \texttt{append\_offset} \cdot \texttt{NUM\_ROWS\_PER\_OP}.$$

The concatenation and degree checks that establish $T_{\text{tail}}$ live in the
[Batch Merge Protocol](./BATCH_MERGE_PROTOCOL.md); this document's checks establish the final append.

#### Final Goblin Proof Generation

The Goblin part of the Chonk proof comprises three protocols over the shared transcript
(`Goblin` + `Chonk::prove`):

1. **MERGE PROTOCOL** (this protocol) — the final APPEND of the hiding kernel's subtable:
   - $L = T_{\text{tail}}$ (the batch-merged aggregate, including the ZK prefix);
   - $R = t_{\text{hiding}}$ (the hiding kernel's subtable, ending in 2 random non-ops);
   - proves $M = L + X^\ell R$ and $\deg(L) < \ell$.

2. **ECCVM PROTOCOL** — proves the ECC operations executed correctly. It covers the real ops plus the
   single valid hiding op, and excludes the random Ultra-only non-ops (which are not pushed to the
   ECCVM table).

3. **TRANSLATOR PROTOCOL** — proves BN254 ↔ Grumpkin translation correctness. It reuses the merged
   table commitments $[M_j]$ and enforces the cumulative
   degree bound below.

In Chonk these are produced jointly with the hiding kernel's MegaZK proof; see the
[Batched Honk + Translator README](../chonk/batched_honk_translator/README.md).

#### Degree Checks: Merge vs Translator

The merge degree check bounds the size of $L$ for the final append; it does **not** bound the
cumulative size of all accumulated operations. That cumulative bound — which prevents the prover from
accumulating more ops than the Translator circuit can handle at its fixed size — is enforced by the
Translator:

- **Critical constraint**: $\deg(M_j) <$ `MINI_CIRCUIT_SIZE` for Translator soundness.
- Enforced by `TranslatorZeroConstraintsRelationImpl` (`translator_extra_relations_impl.hpp`) together
  with $M_j$ being opened at a random point, which forces it to be zero outside the Translator circuit
  bounds (see [A note on the soundness of an optimized gemini variant](https://eprint.iacr.org/2025/1793.pdf)).

### Consistency Enforcement

The op-queue history is bound across circuits without per-kernel merges:

- **Running ECC-op hash.** Each kernel folds the `ecc_op_wire` commitments of the circuits it verifies
  into a running Poseidon2 hash (`BatchMergeRecursiveVerifier::ecc_op_hash_step`) and propagates it via
  `KernelIO.ecc_op_hash`. The hiding kernel passes the final hash to the batch merge verifier, which
  checks the prover's per-subtable commitments against it. (`KernelIO` carries the running hash, not
  per-kernel merged-table commitments.)
- **Subtable reset.** A kernel's own ECC-op subtable begins with an eq-and-reset
  (`circuit.queue_ecc_eq()`) so the preceding circuit's subtable cannot bleed into the kernel's ECC-op
  accumulator.
- **Final-merge inputs.** The latest merge's $[L_j] = [T_{\text{tail},j}]$ come from
  `HidingKernelIO.ecc_op_tables` (the batch-merge output, bound to the hiding kernel proof), and
  $[R_j] = [t_{\text{hiding},j}]$ are the hiding kernel's `ecc_op_wire` commitments from MegaZK Oink.
  Both are bound to the shared transcript before merge verification, so they cannot be substituted.
- **Fiat–Shamir / VK binding.** All challenges depend on the VK hash and prior transcript state, so any
  tampering invalidates the proof.

### Final Chonk Verification

`Chonk::verify` / `ChonkVerifier::reduce_to_triple_ipa_opening` verify the proof on a shared transcript in this
order:

1. **MegaZK Oink** of the hiding kernel → extracts `HidingKernelIO` (pairing points, kernel
   return-data commitment, `ecc_op_tables` $= [T_{\text{tail}}]$).
2. **Databus consistency** check on the hiding kernel.
3. **Merge** (this protocol) — final APPEND of the hiding kernel's subtable onto $[T_{\text{tail}}]$.
4. **ECCVM** → reduces to a deferred TripleIPA opening (one Grumpkin IPA claim after the eq/shift/pow batching) and yields the translation challenges.
5. **Translator Oink + joint sumcheck + joint PCS**.
6. **Pairing aggregation** over the public-input, merge, and batched-PCS pairing points; the IPA claim
   is carried for deferred verification.

See the [Chonk README](../chonk/README.md) for the full verifier walkthrough.
