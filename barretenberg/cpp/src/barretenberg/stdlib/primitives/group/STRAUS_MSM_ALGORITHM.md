# Straus Multi-Scalar Multiplication: Precise Mathematical Description

This document describes the exact step-by-step mathematics of the Straus MSM algorithm as
implemented in `cycle_group` (`cycle_group.cpp`). All notation is made concrete so that every
formula corresponds to an exact line of code.

---

## 1. Problem Statement

Given $N$ elliptic curve points $P_0, P_1, \ldots, P_{N-1}$ on the Grumpkin curve and $N$
scalars $s_0, s_1, \ldots, s_{N-1}$ in the Grumpkin scalar field
$\mathbb{F}_r$ (equivalently, the BN254 base field), compute in-circuit the multi-scalar
multiplication (MSM):

$$\text{MSM} = \sum_{j=0}^{N-1} s_j \cdot P_j$$

---

## 2. Parameters

| Symbol               | Value                        | Source                   |
| -------------------- | ---------------------------- | ------------------------ |
| $\texttt{NUM\_BITS}$ | $254$                        | `cycle_scalar::NUM_BITS` |
| $\texttt{LO\_BITS}$  | $128$                        | `cycle_scalar::LO_BITS`  |
| $\texttt{HI\_BITS}$  | $126$                        | `cycle_scalar::HI_BITS`  |
| $w$                  | $4$                          | `ROM_TABLE_BITS`         |
| $R$                  | $\lceil 254 / 4 \rceil = 64$ | `num_rounds`             |
| $T$                  | $2^w = 16$                   | table size per point     |

---

## 3. Scalar Representation (`cycle_scalar`)

Each 254-bit scalar $s \in \mathbb{F}_r$ is split into two **limbs**:

$$s = s_{\text{lo}} + 2^{128} \cdot s_{\text{hi}}$$

where $s_{\text{lo}} \in [0, 2^{128})$ is a 128-bit integer and $s_{\text{hi}} \in [0, 2^{126})$
is a 126-bit integer. Both limbs are represented as native `field_t` circuit elements. Crucially,
the range constraints on these limbs are **deferred** to the MSM algorithm — `cycle_scalar`
alone does not add range-constraint gates.

---

## 4. Scalar Decomposition into $w$-Bit Slices (`straus_scalar_slices`)

Each limb is independently decomposed into $w = 4$ bit slices via `create_limbed_range_constraint`,
which simultaneously performs the decomposition and enforces the range constraint in-circuit.

### 4.1 Lo-limb slices

$s_{\text{lo}}$ (128 bits, exactly divisible by 4) is split into $128/4 = 32$ slices:

$$s_{\text{lo},k} = \left\lfloor \frac{s_{\text{lo}}}{16^k} \right\rfloor \bmod 16, \quad k = 0, 1, \ldots, 31$$

Each slice satisfies $s_{\text{lo},k} \in \{0,\ldots,15\}$. The lo-limb is reconstructed as:

$$s_{\text{lo}} = \sum_{k=0}^{31} s_{\text{lo},k} \cdot 16^k$$

### 4.2 Hi-limb slices

$s_{\text{hi}}$ (126 bits, $126 = 31 \cdot 4 + 2$) is split into 32 slices:

$$s_{\text{hi},k} = \left\lfloor \frac{s_{\text{hi}}}{16^k} \right\rfloor \bmod 16, \quad k = 0, 1, \ldots, 30$$
$$s_{\text{hi},31} = \left\lfloor \frac{s_{\text{hi}}}{16^{31}} \right\rfloor \bmod 4 \quad\text{(2-bit slice)}$$

All slices $s_{\text{hi},k} \in \{0,\ldots,15\}$ for $k \le 30$; the final slice $s_{\text{hi},31} \in \{0,1,2,3\}$.
The hi-limb is reconstructed as:

$$s_{\text{hi}} = \sum_{k=0}^{31} s_{\text{hi},k} \cdot 16^k$$

### 4.3 Unified slice vector

The two decompositions are concatenated into a single vector of $R = 64$ slices:

$$\sigma[k] = \begin{cases} s_{\text{lo},k} & 0 \le k \le 31 \\ s_{\text{hi},k-32} & 32 \le k \le 63 \end{cases}$$

The full scalar reconstruct identity is:

$$s = \sum_{k=0}^{63} \sigma[k] \cdot 16^k$$

because:

$$\sum_{k=0}^{63} \sigma[k] \cdot 16^k = \sum_{k=0}^{31} s_{\text{lo},k} \cdot 16^k + \sum_{k=0}^{31} s_{\text{hi},k} \cdot 16^{k+32} = s_{\text{lo}} + 2^{128} \cdot s_{\text{hi}} = s$$

At step $i$ of the Straus loop (0-indexed, MSB-first), the slice accessed is:

$$\sigma_{\text{round}(i)} = \sigma[R - 1 - i] = \sigma[63 - i]$$

so round $i = 0$ processes the **most significant** slice $\sigma[63]$, and round $i = 63$ processes
the **least significant** slice $\sigma[0]$.

---

## 5. Lookup Table Construction

For each point $P_j$ with associated offset generator $G_{j+1}$, a lookup table $\mathcal{T}_j$ of
size $T = 16$ is precomputed:

$$\mathcal{T}_j[v] = G_{j+1} + v \cdot P_j, \quad v = 0, 1, \ldots, 15$$

The offset generator $G_{j+1}$ is drawn from a domain-separated hash-to-curve
(`"cycle_group_offset_generator"`) and is linearly independent of all $P_j$ and of each other.
It ensures $\mathcal{T}_j[0] = G_{j+1} \ne \mathcal{O}$, preventing the point-at-infinity edge
case when a slice value is zero.

Two implementations exist with different circuit costs:

| Implementation                        | Table stored as                           | Construction cost                                           | Read cost              |
| ------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| `straus_lookup_table` (variable-base) | ROM array (witnesses)                     | $15$ `unconditional_add` gates per table + ROM finalization | 1 ROM gate per read    |
| `straus_plookup_table` (fixed-base)   | Plookup `BasicTable` (proving polynomial) | **0 gates** (table data is not in the trace)                | 1 lookup gate per read |

### 5.1 Full Table Structure for $w = 4$ bits

For a single base point $P$ and offset generator $G$, the table $\mathcal{T}$ has $2^4 = 16$ entries.

**Construction (projective arithmetic, then batch-normalize):**

$$\mathcal{T}[0] = G, \quad \mathcal{T}[v] = \mathcal{T}[v-1] + P \text{ for } v = 1, \ldots, 15$$

**Complete 16-entry table ($w = 4$):**

| Index $v$ | Binary $v_3 v_2 v_1 v_0$ | Table entry $\mathcal{T}[v] = G + v \cdot P$ |
| --------- | ------------------------- | --------------------------------------------- |
| 0         | `0000`                    | $G$                                           |
| 1         | `0001`                    | $G + P$                                       |
| 2         | `0010`                    | $G + 2P$                                      |
| 3         | `0011`                    | $G + 3P$                                      |
| 4         | `0100`                    | $G + 4P$                                      |
| 5         | `0101`                    | $G + 5P$                                      |
| 6         | `0110`                    | $G + 6P$                                      |
| 7         | `0111`                    | $G + 7P$                                      |
| 8         | `1000`                    | $G + 8P$                                      |
| 9         | `1001`                    | $G + 9P$                                      |
| 10        | `1010`                    | $G + 10P$                                     |
| 11        | `1011`                    | $G + 11P$                                     |
| 12        | `1100`                    | $G + 12P$                                     |
| 13        | `1101`                    | $G + 13P$                                     |
| 14        | `1110`                    | $G + 14P$                                     |
| 15        | `1111`                    | $G + 15P$                                     |

**`BasicTable` column mapping (as stored in the proving polynomial):**

$$\texttt{column\_1}[v] = v, \quad \texttt{column\_2}[v] = \mathcal{T}[v].x, \quad \texttt{column\_3}[v] = \mathcal{T}[v].y$$

Concretely, with affine coordinates $(x_v, y_v) = \mathcal{T}[v]$:

| `column_1` (key) | `column_2` ($x$-coordinate) | `column_3` ($y$-coordinate) |
| ---------------- | --------------------------- | --------------------------- |
| 0                | $x_0 = G_x$                 | $y_0 = G_y$                 |
| 1                | $x_1$                       | $y_1$                       |
| 2                | $x_2$                       | $y_2$                       |
| $\vdots$         | $\vdots$                    | $\vdots$                    |
| 15               | $x_{15}$                    | $y_{15}$                    |

**Plookup gate for a single read at index $v$ (witness $w_1$):**

A single lookup gate constrains the triple $(w_1, w_2, w_3)$ to be a valid row $(v,\, x_v,\, y_v)$ of the table:

$$w_1 = v, \quad w_2 = \texttt{column\_2}[v] = x_v, \quad w_3 = \texttt{column\_3}[v] = y_v$$

Gate selectors: $q_{\text{lookup}} = 1$, $q_3 = \texttt{table\_index}$, $q_2 = q_m = q_c = q_1 = q_4 = 0$ (step sizes all zero, indicating a standalone lookup with no chained accumulation).

**Why $\mathcal{T}[0] = G \ne \mathcal{O}$:** The offset generator $G$ is a hash-to-curve output linearly independent of $P$, so $G \ne \mathcal{O}$ by construction. Even when a scalar slice $\sigma[k] = 0$ (which occurs for any scalar whose $k$-th 4-bit chunk is zero — e.g., $s = 16$ has $\sigma[0] = 0$), the table read returns $\mathcal{T}[0] = G \ne \mathcal{O}$, making `unconditional_add` safe.

---

## 6. The Offset Generator Mechanism

### 6.1 Why it is needed

The implementation uses `unconditional_add` for all in-circuit additions, which requires that the
two operand points have **distinct** $x$-coordinates. Without offset generators, two failure modes arise:

1. **Zero slice:** If $\sigma_j[k] = 0$ for some $j, k$, then $\mathcal{T}_j[0] = \mathcal{O}$
   (the point at infinity). Even with non-zero scalars, slices can be zero — e.g.,
   $s = 16$ has $\sigma[0] = 0$.
2. **Accumulator collision:** The rolling accumulator could coincidentally share an
   $x$-coordinate with an upcoming table entry.

### 6.2 Offset generator set

$N + 1$ linearly independent points are used:

$$G_0, G_1, G_2, \ldots, G_N \in E(\mathbb{F}_q)$$

all distinct, hash-to-curve outputs linearly independent of every $P_j$.

- $G_0$: initial accumulator value
- $G_{j+1}$: offset embedded in table $\mathcal{T}_j$

### 6.3 Tracking the total offset

A **native** (non-circuit) parallel computation tracks the accumulated contribution of the offset
generators. Define the offset accumulator $\Delta$, initialised as:

$$\Delta_{\text{init}} = G_0$$

In each round $i$ the same doublings and additions are applied to $\Delta$ as to the main
accumulator, but using the **offset generators** in place of the table reads:

- **Doublings (rounds $i \ge 1$):** $\Delta \leftarrow 2^w \cdot \Delta$ (4 consecutive doublings $= \times 16$)
- **Additions:** $\Delta \leftarrow \Delta + G_{j+1}$ for each $j = 0, \ldots, N-1$

The closed-form value of $\Delta$ after the complete $R = 64$ rounds is derived below.

---

## 7. The Straus Algorithm — Step by Step

### 7.1 Initialisation

$$A \leftarrow G_0, \qquad \Delta \leftarrow G_0$$

### 7.2 Main Loop

For $i = 0, 1, \ldots, R-1$ (i.e., $64$ rounds):

**Step 7.2a — Doublings (skip when $i = 0$):**

If $i \ge 1$, perform $w = 4$ point doublings in-circuit:

$$A \leftarrow 2^4 \cdot A = 16 \cdot A$$

and natively:

$$\Delta \leftarrow 16 \cdot \Delta$$

**Step 7.2b — Table lookups and additions:**

For each point index $j = 0, 1, \ldots, N-1$:

1. Read the scalar slice for this round: $v = \sigma_j[R - 1 - i] = \sigma_j[63 - i]$
2. Look up: $Q \leftarrow \mathcal{T}_j[v] = G_{j+1} + v \cdot P_j$
3. Add in-circuit: $A \leftarrow A + Q$
4. Update offset natively: $\Delta \leftarrow \Delta + G_{j+1}$

(For the variable-base case, step 3 uses a conditional safety check on $x$-coordinates unless the
`unconditional_add` flag is set.)

### 7.3 State at the end of round $i$

After completing round $i$ (both doublings and all $N$ additions), the accumulated value satisfies
the recurrence:

$$A_0 = G_0 + \sum_{j=0}^{N-1} \mathcal{T}_j[\sigma_j[63]]$$

$$A_i = 16 \cdot A_{i-1} + \sum_{j=0}^{N-1} \mathcal{T}_j[\sigma_j[63-i]], \quad i \ge 1$$

Unrolling this recurrence over all 64 rounds yields:

$$A_{63} = 16^{63} \cdot G_0 + \sum_{i=0}^{63} 16^{63-i} \cdot \sum_{j=0}^{N-1} \mathcal{T}_j[\sigma_j[63-i]]$$

Substituting $k = 63 - i$:

$$A_{63} = 16^{63} \cdot G_0 + \sum_{j=0}^{N-1} \sum_{k=0}^{63} 16^{k} \cdot \mathcal{T}_j[\sigma_j[k]]$$

Expanding the table definition $\mathcal{T}_j[v] = G_{j+1} + v \cdot P_j$:

$$A_{63} = 16^{63} \cdot G_0 + \sum_{j=0}^{N-1} \left[ G_{j+1} \cdot \sum_{k=0}^{63} 16^{k} + P_j \cdot \sum_{k=0}^{63} \sigma_j[k] \cdot 16^{k} \right]$$

Using the geometric sum $\displaystyle\sum_{k=0}^{63} 16^k = \frac{16^{64}-1}{15}$ and the scalar reconstruction identity $\displaystyle\sum_{k=0}^{63} \sigma_j[k] \cdot 16^k = s_j$:

$$\boxed{A_{63} = 16^{63} \cdot G_0 + \sum_{j=0}^{N-1} G_{j+1} \cdot \frac{16^{64}-1}{15} + \sum_{j=0}^{N-1} s_j \cdot P_j}$$

### 7.4 Offset accumulator value

Applying the same recurrence to $\Delta$:

$$\Delta_0 = G_0 + \sum_{j=0}^{N-1} G_{j+1}$$
$$\Delta_i = 16 \cdot \Delta_{i-1} + \sum_{j=0}^{N-1} G_{j+1}, \quad i \ge 1$$

This has the closed-form solution:

$$\Delta_{63} = 16^{63} \cdot G_0 + \left(\sum_{j=0}^{N-1} G_{j+1}\right) \cdot \sum_{k=0}^{63} 16^{k} = 16^{63} \cdot G_0 + \left(\sum_{j=0}^{N-1} G_{j+1}\right) \cdot \frac{16^{64}-1}{15}$$

### 7.5 Cancellation

Subtracting the offset:

$$A_{63} - \Delta_{63} = \sum_{j=0}^{N-1} s_j \cdot P_j$$

This is the desired MSM result. $\square$

---

## 8. Outer Function: `batch_mul` / `fixed_batch_mul`

The outer function partitions the $N$ input pairs $(P_j, s_j)$ into categories before calling the
internal algorithm:

| Category    | Condition                                                   | Treatment                                                               |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Case 1**  | $P_j$ constant **and** $s_j$ constant                       | Accumulate natively into `constant_acc` (0 gates)                       |
| **Case 2A** | $P_j$ is one of the two hardcoded generators, $s_j$ witness | Use `_fixed_base_batch_mul_internal` (precomputed plookup multi-tables) |
| **Case 2B** | $P_j$ constant (not a hardcoded generator), $s_j$ witness   | Use `_variable_base_batch_mul_internal` with ROM tables                 |
| **Case 3**  | $P_j$ witness                                               | Use `_variable_base_batch_mul_internal` with ROM tables                 |

`fixed_batch_mul` (new) handles **Case 2B** points using plookup `BasicTable`s instead of ROM
arrays, with an otherwise identical Straus computation.

### 8.1 Result Assembly

Let $C$ = `constant_acc` $= \sum_{\text{Case 1}} s_j \cdot P_j$ (constant, free).

The internal function returns $(A_{63},\, \Delta_{63})$. The outer function computes:

$$\text{Result} = A_{63} - (- C + \Delta_{63}) = A_{63} - \Delta_{63} + C = \sum_j s_j \cdot P_j + C$$

which is the full MSM over all $N$ pairs.

The subtraction is executed as an `unconditional_add` with $-\Delta_{63} + C$ (a constant point)
when $C \ne \mathcal{O}$, or as a full `operator-` otherwise.

---

## 9. Circuit Gate Cost (per Internal Call)

The following counts assume $N$ points, $R = 64$ rounds, $w = 4$ bits.

### 9.1 Scalar decomposition

Each scalar $s_j$ contributes two `create_limbed_range_constraint` calls:

- lo (128 bits, 32 slices of 4 bits): 32 range gates
- hi (126 bits, 32 slices, last is 2-bit): 32 range gates

Total across $N$ scalars: $64N$ range-constraint gates.

### 9.2 Table construction

**Variable-base ROM** (`straus_lookup_table`): for each point $P_j$:

- 15 `unconditional_add` gates to populate $\mathcal{T}_j[1], \ldots, \mathcal{T}_j[15]$
- 2 witness conversions (1 gate each) for $P_j$ and $G_{j+1}$
- ROM finalisation: $O(T \log T)$ sorted-ROM gates per table

Total construction: $\approx 17N + O(16N\log 16)$ gates.

**Fixed-base Plookup** (`straus_plookup_table`): **0 gates**. Table data lives entirely in the
proving polynomial (not in the arithmetic trace).

### 9.3 Main Straus loop

| Operation                                                    | Count                              | Gate cost                   |
| ------------------------------------------------------------ | ---------------------------------- | --------------------------- |
| Doublings                                                    | $(R-1) \cdot w = 63 \cdot 4 = 252$ | 252 gates                   |
| Table reads (ROM or plookup)                                 | $R \cdot N = 64N$                  | $64N$ gates                 |
| `unconditional_add`                                          | $R \cdot N = 64N$                  | $64N$ gates                 |
| $x$-coord batch collision check (variable-base, witness pts) | 1 assertion                        | $\approx 2 \cdot 64N$ gates |

Total Straus loop: $\approx 252 + 128N$ gates (plus collision check if applicable).

### 9.4 Final offset subtraction

1 group subtraction (or `unconditional_add` with negated constant): $\approx 2$–$5$ gates.

### 9.5 Summary comparison (128-point MSM, constant base points)

| Method                      | Table construction                   | ROM finalization      | Straus loop                                           | Total (approx)   |
| --------------------------- | ------------------------------------ | --------------------- | ----------------------------------------------------- | ---------------- |
| `batch_mul` (ROM)           | $\approx 17 \times 128 = 2176$ gates | $\sim 12{,}000$ gates | $\approx 252 + 128 \times 128 \approx 16{,}636$ gates | **41,201 gates** |
| `fixed_batch_mul` (plookup) | **0**                                | **0**                 | $\approx 252 + 128 \times 128 \approx 16{,}636$ gates | **26,083 gates** |

The plookup approach eliminates all table-construction and ROM-finalization gates, reducing the
total by **~37%** for 128 points. At 32,768 SRS points (IPA), the absolute savings are
proportionally larger.

---

## 10. Correctness of the Scalar Reconstruction

**Claim:** $\displaystyle\sum_{k=0}^{63} \sigma_j[k] \cdot 16^k = s_j$ for every scalar $s_j \in [0, 2^{254})$.

**Proof:**

$$\sum_{k=0}^{63} \sigma_j[k] \cdot 16^k = \underbrace{\sum_{k=0}^{31} s_{\text{lo},k} \cdot 16^k}_{= s_{\text{lo}}} + \underbrace{\sum_{k=0}^{31} s_{\text{hi},k} \cdot 16^{k+32}}_{= s_{\text{hi}} \cdot 16^{32} = s_{\text{hi}} \cdot 2^{128}} = s_{\text{lo}} + 2^{128} \cdot s_{\text{hi}} = s_j \qquad \square$$

**Range validity:** The `create_limbed_range_constraint` call on each limb simultaneously decomposes
the limb into $w$-bit slices and proves in-circuit that each slice lies in $\{0,\ldots,2^w - 1\}$.
The final (partial) slice of $s_{\text{hi}}$ has only 2 bits ($s_{\text{hi},31} \in \{0,1,2,3\}$)
and the constraint uses only the 2 valid bits; when used as a $(16$-entry) table index it always
reads a valid entry.
