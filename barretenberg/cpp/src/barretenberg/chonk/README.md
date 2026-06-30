# Chonk: Client-side Highly Optimized ploNK

![chonk](https://hackmd.io/_uploads/BkpsblXEgg.jpg)

Aztec's goal is to enable private verifiable execution of smart contracts. This motivates a proving system design where:

- **Low memory proving**: Proofs can be generated on a phone or browser
- **Efficient recursion**: Proofs can incorporate many layers of recursion, as contract execution naturally involves function calls to other functions

Efficient recursion supports low memory proving - statements can be decomposed via recursion into smaller statements that require less prover memory.

## Design Principles

CHONK builds on PlonK [[2](#ref-plonk)], sharing its foundation:
- Elliptic curves and pairings
- Circuit constraints via selector polynomials and copy constraints

Its deviations from PlonK are motivated by the goals above:

1. **Proving sequences of circuits**: Contract execution translates to multiple circuits (different contract functions), with Aztec's *Kernel circuits* handling bookkeeping between them. See the [Aztec documentation](https://docs.aztec.network) and the Stackproofs paper [[3](#ref-stackproofs)].

2. **Sumcheck instead of univariate quotienting**: Eliminates FFTs, reducing prover time and memory at the expense of proof length. This approach follows HyperPlonk [[4](#ref-hyperplonk)].

3. **Folding schemes**: Enable cheaper recursion than standard recursive proofs. We use sumcheck-based folding similar to HyperNova [[5](#ref-hypernova)], adapted to folding non-uniform PlonK circuits.

4. **Goblin Plonk**: Though folding reduces recursion cost, in-circuit non-native EC scalar multiplications remain expensive. Goblin Plonk [[6](#ref-goblin-hackmd)] [[7](#ref-goblin-paper)] defers these operations to a queue, then proves them on the Grumpkin curve where they're native. This curve-switch approach was initiated by BCTV [[8](#ref-bctv)]; a modern comparison is CycleFold [[9](#ref-cyclefold)]. *Note: The linked documents use older terminology and omit some details (e.g., ZK handling) that have since evolved in the implementation.*

5. **Mega flavor**: Chonk circuits use [MegaFlavor](../flavor/mega_flavor.hpp), which combines UltraHonk's custom gates with Goblin's ECC op queue. [MegaZKFlavor](../flavor/mega_zk_flavor.hpp) is the ZK variant, used for the final [hiding kernel](#circuit-structure) proof.

*For a video presentation, see [[10](#ref-video)].*

### References

1. <a name="ref-shplemini"></a>**A note on the soundness of an optimized gemini variant** (Ariel Gabizon, Nishat Koti): [Paper](https://eprint.iacr.org/2025/1793.pdf#6)
2. <a name="ref-plonk"></a>**PlonK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge** (Ariel Gabizon, Zachary J. Williamson, Oana Ciobotaru): [Paper](https://eprint.iacr.org/2019/953)
3. <a name="ref-stackproofs"></a>**Stackproofs: Private proofs of stack and contract execution using Protogalaxy** (Liam Eagen, Ariel Gabizon): [Paper](https://eprint.iacr.org/2024/1281)
4. <a name="ref-hyperplonk"></a>**HyperPlonk: Plonk with Linear-Time Prover and High-Degree Custom Gates** (Binyi Chen, Benedikt Bünz, Dan Boneh, Zhenfei Zhang): [Paper](https://eprint.iacr.org/2022/1355)
5. <a name="ref-hypernova"></a>**HyperNova: Recursive arguments for customizable constraint systems** (Abhiram Kothapalli, Srinath Setty): [Paper](https://eprint.iacr.org/2023/573)
6. <a name="ref-goblin-hackmd"></a>**Goblin Plonk** (Aztec): [HackMD](https://hackmd.io/@aztec-network/BkGNaHUJn/%2FGfNR5SE5ShyXXmLxNCsg3g)
7. <a name="ref-goblin-paper"></a>**One-Shot Native Proofs of Non-Native Operations in Incrementally Verifiable Computations** (Tohru Kohrita, Patrick Towa, Zachary J. Williamson): [Paper](https://eprint.iacr.org/2024/1651)
8. <a name="ref-bctv"></a>**Scalable Zero Knowledge via Cycles of Elliptic Curves** (Eli Ben-Sasson, Alessandro Chiesa, Eran Tromer, Madars Virza): [Paper](https://eprint.iacr.org/2014/595.pdf)
9. <a name="ref-cyclefold"></a>**CycleFold: Folding-scheme-based recursive arguments over a cycle of elliptic curves** (Abhiram Kothapalli, Srinath Setty): [Paper](https://eprint.iacr.org/2023/1192)
10. <a name="ref-video"></a>**ZK10: How to build a modern SNARK - Zac Williamson**: [YouTube](https://www.youtube.com/watch?v=j6wlamEPKlE)

---

## Overview

Chonk implements Repeated Computation with Global state (RCG) as defined in the Stackproofs paper [[3](#ref-stackproofs)]. It combines HyperNova folding with Goblin to produce a single succinct proof.

### RCG vs IVC

Unlike Incrementally Verifiable Computation (IVC), RCG has the following properties:

- **Deferred proving**: Witness generation for all circuits completes before proving starts
- **Global consistency**: Supports global consistency checks across the whole computation (not just local state transitions)
- **Space efficient**: Maintains prover space efficiency comparable to IVC despite proving global properties

This makes RCG well-suited for private smart contract execution where global constraints (like nullifier uniqueness or public state consistency) must be verified across all circuits.

### Circuit Structure

Circuits are accumulated in alternating pairs:

```
App₀ → Kernel₀ → App₁ → Kernel₁ → ... → Appₙ → Reset → Tail → Hiding
```

- **App circuits**: User-defined private functions
- **Kernel circuits**: Contain recursive verification logic for previous app and kernel
- **Reset kernel**: Squashes transient note hash-nullifier pairs and validates read requests; can occur at any point in the sequence, not just at the end
- **Tail kernel**: Sorts and transforms data to final rollup format; also adds masking for op queue
- **Hiding kernel**: Verifies final folding and decider proofs; masks op queue end and is proven using MegaZK for full ZK

### Proof Structure

A Chonk proof (`ChonkProof_<IsRecursive>`) contains five segments produced on a shared Fiat-Shamir transcript:

```cpp
template <bool IsRecursive>
struct ChonkProof_ {
    HonkProof hiding_oink_proof; // MegaZK Oink (pre-sumcheck commitments for the hiding kernel)
    HonkProof merge_proof;       // Merge proof for hiding kernel's ECC op subtable
    HonkProof eccvm_proof;       // ECCVM proof
    HonkProof ipa_proof;         // IPA opening proof (separate transcript)
    HonkProof joint_proof;       // Translator Oink + joint sumcheck + joint PCS
};
```

**Proof components:**

1. **Hiding Oink proof**: Pre-sumcheck phase of the hiding kernel's MegaZK circuit (wire commitments, permutation grand products, relation parameters). Produces the `HidingKernelIO` public inputs.

2. **Merge proof**: Proves correct APPEND-mode merging of the hiding kernel's ECC op subtable into the global op queue.

3. **ECCVM proof**: Proves correctness of all accumulated EC operations on the Grumpkin curve. Produces translation parameters (`evaluation_input_x`, `batching_challenge_v`, `accumulated_result`) used by the translator. See [ECCVM README](../eccvm/README.md).

4. **IPA proof**: Inner product argument opening proof for the ECCVM (Grumpkin curve, separate transcript).

5. **Joint proof**: The translator's Oink phase followed by a **joint sumcheck and joint PCS** that batches the MegaZK hiding kernel and translator circuits together. The joint sumcheck runs for 17 rounds (the translator's fixed circuit size); the MegaZK circuit contributes via extension-by-zero for virtual rounds beyond its own `log_n`. A single Shplemini/KZG reduction covers polynomial openings from both circuits. See [Batched Honk + Translator README](batched_honk_translator/README.md) for the full protocol.

**Key optimization**: By batching the MegaZK and translator sumcheck+PCS into a single joint protocol, the proof avoids two independent Honk proofs and reduces overall proof size.

**Verification Architecture:**

The Chonk verifier performs verification on a shared transcript:

```
MegaZK Oink → Merge → ECCVM → Translator Oink + Joint Sumcheck + Joint PCS → Pairing Check
```

Concretely (`ChonkVerifier::reduce_to_triple_ipa_opening` / `ChonkVerifier::verify`):

1. **MegaZK Oink verification**: `BatchedHonkTranslatorVerifier::verify_mega_zk_oink` processes the hiding kernel's pre-sumcheck proof and extracts `HidingKernelIO` (pairing points, kernel return data commitment, ECC op wire commitments)
2. **Databus consistency check**: Asserts the hiding kernel's kernel calldata commitment equals the `kernel_return_data` commitment contained it its public inputs
3. **Merge verification**: Verifies the hiding kernel's APPEND-mode merge proof using the ECC op wire commitments from step 1 and `ecc_op_tables` from `HidingKernelIO`
4. **ECCVM verification**: Reduces to a deferred TripleIPA opening; extracts translator input parameters (`v`, `x`, `accumulated_result`)
5. **Joint verification**: `BatchedHonkTranslatorVerifier::verify` processes the translator Oink, runs the 17-round joint sumcheck, and performs the joint Shplemini/KZG PCS reduction
6. **Pairing aggregation**: Aggregates 3 pairing point sets using `aggregate_multiple`:
   - Public Input (PI) pairing points from `HidingKernelIO`
   - Merge protocol pairing points
   - Batched PCS pairing points (covering both MegaZK and translator polynomials)
7. **Native mode**: Immediately verifies aggregated pairing points and IPA claim
8. **Recursive mode**: Returns `ChonkVerifier::ReductionResult` with aggregated pairing points and IPA claim for deferred verification

**Note on deferred verification**: IPA claims and pairing points are propagated through the rollup:
- **IPA claims** (Grumpkin): originate from ECCVM verification when Chonk or AVM proofs are recursively verified. Carried in `RollupIO` public inputs through tx_merge → block_merge → checkpoint_root → checkpoint_merge. At each level, claims from child proofs are accumulated via `IPA::accumulate`. Finally verified **in-circuit in the root rollup** via `IPA::full_verify_recursive`.
- **Pairing points** (BN254): aggregated at each rollup level, verified **on L1** via the EVM's ecPairing precompile

This amortizes the cost of IPA verification across many proofs.

---

## Background: From Naive Recursion to Chonk

*This section explains the motivation behind Chonk's design. Skip if you're familiar with the problem.*

**Assumption**: All circuits have fixed size $N = 2^{21}$ from the verifier's perspective.

### Naive Recursive UltraHonk Verification

In a standard recursive verification setup, each circuit must verify the previous circuit's proof. A Honk verifier performs:

1. **Sumcheck verification**: 21 rounds, each receiving univariate polynomials and computing challenges. Relatively cheap in-circuit.

2. **PCS (Polynomial Commitment Scheme) verification via Shplemini** [[1](#ref-shplemini)]: This is where the cost explodes. The verifier must:
   - Batch all polynomial commitments into opening claims
   - Run Shplemini to reduce multivariate claims to univariate
   - Perform KZG verification

The commitment batching *can* be slightly optimized to use short scalars (Fiat-Shamir challenges are ~127 bits) but **recursive verifier circuit size exceeds 512K gates** - too large for practical use.

### Adding Goblin: EC Operation Delegation

Goblin improves the naive approach by delegating non-native EC operations to a separate ECCVM circuit. Instead of performing scalar muls directly in-circuit (expensive), we:

1. Record EC operations in an **op queue**
2. Prove correct execution via ECCVM (native Grumpkin operations)
3. Use Translator to bridge BN254 ↔ Grumpkin

**Cost reduction**: EC operations become "free" in the main circuit - just op queue entries. However, each recursive verification still adds significant work to the op queue:

- **55 + 5 short scalar muls** for commitment batching (using ~127-bit challenges) - `NUM_UNSHIFTED_ENTITIES` + `NUM_SHIFTED_ENTITIES` for MegaFlavor
- **21 full scalar muls** for Shplemini's Gemini fold commitments ($\log N$), which amounts to **42** short scalar muls in ECCVM
- **Merge protocol ops**: Each circuit's op queue subtable must be merged into the global table, requiring additional EC operations

In ECCVM terms, full scalar muls cost ~2× the rows of short scalar muls. So each recursive verification effectively adds **~100+ ECCVM ops**.

Note: The Merge protocol's ECCVM cost is present in both the naive Goblin approach and in Chonk - it's inherent to maintaining the op queue across circuits.

For a chain of $k$ circuits, ECCVM must handle $O(k \cdot ($ `NUM_UNSHIFTED_ENTITIES` + `NUM_SHIFTED_ENTITIES`  $+ 2\log N))$ short scalar operations.

### HyperNova Folding: Deferring PCS Verification

The key insight of HyperNova folding is: **we don't need to complete PCS verification at each step**. Instead:

1. **Run Sumcheck** → produces claimed evaluations at a random point $r$
2. **Batch the claims** → combine all evaluation claims into a single "accumulator"
3. **Defer opening proof** → only verify the final accumulated claim at the end

After Sumcheck, the verifier has `NUM_ALL_ENTITIES` evaluation claims (commitment + claimed value at point $r$). These are batched using random challenges $\rho_i, \sigma_j$ into just **two claims**:
- Non-shifted: $([p_{\text{unshifted}}], v_{\text{unshifted}}, r)$
- Shifted: $([p_{\text{shifted}}], v_{\text{shifted}}, r)$

#### The Challenge: Different Evaluation Points

Each circuit's Sumcheck produces claims at a **different random point** $r_i$. We need to reduce individual openings at given points to the opening of a random linear combination at a new random challenge.

The solution is `MultilinearBatchingSumcheck`: a small Sumcheck (only 6 witness columns) that reduces two claims at different points $(r_{\text{acc}}, r_{\text{inst}})$ to a single claim at a **common point** $r_{\text{new}}$. See [HyperNova Folding Details](#hypernova-folding-details) for the full protocol.

#### EC Operations per Fold

In `MultilinearBatchingVerifier::compute_new_claim`:
- `NUM_UNSHIFTED_ENTITIES + 1` short scalar muls (55 + 1 for MegaFlavor) - batching instance commitments + accumulator
- `NUM_SHIFTED_ENTITIES + 1` short scalar muls (5 + 1 for MegaFlavor) - same for shifted
- A few point additions for evaluation updates

**Total: 62 short scalar multiplications per circuit**, versus 55 short + 21 full in naive/Goblin approaches. Crucially:
- **All operations are short scalar** (challenges are ~127 bits, not 254 bits)
- The **Shplemini MSM is deferred** to the final decider proof - eliminating the $\log N$ full scalar muls per circuit

### Summary: Cost Comparison

| Approach | EC Ops per Circuit | Final MSM Size | Notes |
|----------|-------------------|----------------|-------|
| Naive Recursive | 55 + 21 full scalar muls | 78 | Circuit > 512K gates |
| Goblin (no folding) | 60 short + 21 full (op queue) | >102 short | ~100 ECCVM rows/circuit |
| **Chonk (HyperNova + Goblin)** | 62 short scalar muls (op queue) | N/A (deferred) | Shplemini deferred to decider |

Combining `UltraHonk` features such as custom gates with databus mechanism enabling inter-circuit communication with Hypernova sumcheck-based folding boosted by Goblin elliptic curve operation deferral protocol we get a client-friendly RCG that can be run on a mobile phone.

### Memory Efficiency

A key benefit of Chonk's folding approach is that prover memory is bounded by the largest individual circuit, not the total computation size.

**Memory bound**: Peak memory occurs during the first Sumcheck round and is bounded by $1.5 \times \max_i |\text{ProverPolynomials}_i|$, where the max is over all input circuits. Crucially, this bound is independent of the number of circuits being folded.

*Example*: 55 dense polynomials of size $2^{18}$ consume $1.5 \times 55 \times 2^{18} \times 32\text{ bytes} \approx 660\text{ MB}$ (shifted polynomials share memory with unshifted), which serves as a rough upper bound for a Mega circuit's RAM footprint during Chonk.

---

## Components

### HyperNova Folding

Chonk uses HyperNova [[5](#ref-hypernova)] for folding circuits into accumulators. Each circuit goes through Sumcheck to produce evaluation claims, which are batched into an accumulator. The `MultilinearBatchingSumcheck` protocol combines accumulators at different evaluation points into a single accumulator at a common point.

See [HyperNova Folding Details](#hypernova-folding-details) for the full protocol specification.

### Goblin (ECCVM + Translator)

Goblin handles non-native EC operations by deferring them to an op queue, then proving correct execution via:
- **ECCVM**: Proves EC operations on the Grumpkin curve (see [ECCVM README](../eccvm/README.md))
- **Translator**: Bridges BN254 ↔ Grumpkin field elements

### Batched Honk + Translator

`BatchedHonkTranslatorProver`/`BatchedHonkTranslatorVerifier` implement the joint proving and verification of the MegaZK hiding kernel and translator circuits. Both circuits operate over BN254 scalars, so their sumcheck and polynomial openings can be combined into a single protocol. This eliminates two independent Honk proofs and reduces proof size.

The protocol has two phases separated by Merge + ECCVM verification:
- **Phase 1 (MegaZK Oink)**: Pre-sumcheck commitments for the hiding kernel
- **Phase 2 (Joint)**: Translator Oink + 17-round joint sumcheck + single Shplemini/KZG PCS

See [Batched Honk + Translator README](batched_honk_translator/README.md) for the full protocol specification including the joint round univariate, extension-by-zero, and repeated commitments optimization.

### Merge Protocol

Each circuit produces a subtable of ECC operations that must be merged into the global op queue. The Merge protocol proves this was done correctly. See [MERGE_PROTOCOL.md](../goblin/MERGE_PROTOCOL.md) for full details including the degree check and ZK analysis.

**What it proves:** For each of 4 wire columns $j$:

$$M_j(X) = L_j(X) + X^k \cdot R_j(X)$$

where $M_j$ = merged table, $L_j$ = new subtable, $R_j$ = existing table, $k$ = shift.

Commitments to $L_j$ and $R_j$ are reused from the HyperNova transcript, avoiding redundant work.

### Databus

The databus enables data passing between circuits through commitment equality checks.

#### Why Not Traditional Public Inputs?

Traditional public inputs (PI) require the verifier to hash the complete PI data to generate challenges. This hashing must happen in-circuit for recursive verification, and in-circuit hashing is expensive. For large data transfers between circuits (e.g., state reads/writes, function call stacks), this quickly becomes prohibitive.

The databus solves this by using **commitments** instead of raw data. Rather than passing raw public data to the verifier, we commit to the data and perform consistency checks directly on those commitments. The cost to verify a commitment equality is $O(1)$, independent of the data size.

#### Columns

| Column | Purpose |
|--------|---------|
| `kernel_calldata` | Input from previous kernel's return data ($C_i$) |
| `app_calldata[0..2]` | Inputs from up to three apps' return data ($C'_{i,j}$) |
| `return_data` | Output to be consumed by next circuit ($R_i$) |

App circuits only produce `return_data` (no calldata). Kernel circuits receive:
- `kernel_calldata` from the previous kernel's return data
- `app_calldata[0..2]` from the corresponding apps' return data

#### Lookup Relations

Values are read from databus columns using a log-derivative lookup argument. This allows dynamic indexing—circuit logic can access `databus[witness_index]` where the index itself is a witness value.

For a bus column $b$ with read counts $a$, read selector $q_{busread}$, and wires $(w_1, w_2)$ representing (value, index), the lookup identity is:

$$\sum_{i=0}^{n-1}\frac{a_i}{b_i + i\beta + \gamma} - \frac{q_{busread,i}}{w_{1,i} + w_{2,i}\beta + \gamma} = 0$$

In practice, we precompute an inverse polynomial $I$ where:

$$I_i = \frac{1}{(b_i + i\beta + \gamma)(w_{1,i} + w_{2,i}\beta + \gamma)}$$

This allows expressing the lookup as two subrelations:

1. **Inverse correctness** (only checked where $a_i \neq 0$ or $q_{busread,i} = 1$):

$$I_i \cdot (b_i + i\beta + \gamma)(w_{1,i} + w_{2,i}\beta + \gamma) - \varepsilon_i = 0$$

2. **Lookup relation**:

$$\sum_{i=0}^{n-1} a_i \cdot I_i \cdot (w_{1,i} + w_{2,i}\beta + \gamma) - q_{busread,i} \cdot I_i \cdot (b_i + i\beta + \gamma) = 0$$

Inverse correctness is enforced by two separate gating subrelations: $(I \cdot L \cdot T - 1) \cdot \text{is\_read} = 0$ on read rows, and $(I \cdot L \cdot T - 1) \cdot \text{count} = 0$ on write rows. At inactive rows (where both gates are zero), $I$ is unconstrained but the lookup identity contribution is also zero, so the prover gets no free degrees of freedom.

**Multiple columns**: Each bus column (kernel calldata, three app calldata columns, return data) has separate subrelations, distinguished by column-specific selectors $q_j$.

#### Population

The databus columns are populated from ACIR constraints generated by the Noir compiler. When a Noir program uses `call_data` or `return_data` intrinsics, the compiler generates `BlockConstraint` operations that:
1. Initialize the databus columns with witness values via `set_values()`
2. Create read gates connecting main circuit wires to databus columns
3. Assert equality between computed values and databus entries

#### Data Flow

```
App₀ ──return_data [R'₀]──┐
                          ↓
                    Kernel₀ ←─kernel_calldata─── (empty for first kernel)
                            ←─app_calldata[0] [C'₀,0]─── App₀.return_data
                      │
                return_data [R₀]
                      ↓
App₁ ──return_data [R'₁]──┐
                          ↓
                    Kernel₁ ←─kernel_calldata [C₁]─── Kernel₀.return_data
                            ←─app_calldata[0] [C'₁,0]─── App₁.return_data
                      │
                return_data [R₁]
                      ↓
                    ...
```

#### Inter-Circuit Consistency Protocol

**Notation**: πᵢ denotes the proof of folding the i-th kernel, π'ᵢ denotes the proof of folding the i-th app, and PI denotes public inputs.

The key insight: circuit Kᵢ₊₁ verifies the data transfer between Kᵢ₋₁ and Kᵢ. It has access to [Rᵢ₋₁] through public inputs and [Cᵢ] through the proof πᵢ.

**Kernel K₀** (first kernel):
- Initializes C'₀ = R'₀ (from App₀)
- Produces return data R₀
- Extracts π'₀.[R'₀], adds to π₀.PI
- π₀ contains: [R₀], [C'₀]

**Kernel K₁**:
- Sets C₁ = R₀ and C'₁ = R'₁ (private inputs)
- Produces R₁ as a function of C₁, C'₁, and accumulated side effects (note hashes, nullifiers, logs, etc.)
- **Checks**: π₀.[C'₀] = π₀.PI.[R'₀]
- Extracts π₀.[R₀] and π'₁.[R'₁], adds to π₁.PI
- π₁ contains: [C₁], [C'₁], [R₁]

**Kernel Kᵢ** (general case, i ≥ 2):
- Sets Cᵢ = Rᵢ₋₁ and C'ᵢ = R'ᵢ (private inputs)
- Produces Rᵢ as a function of Cᵢ, C'ᵢ, and accumulated side effects
- **Checks**:
  - πᵢ₋₁.[Cᵢ₋₁] = πᵢ₋₁.PI.[Rᵢ₋₂] (kernel chain)
  - πᵢ₋₁.[C'ᵢ₋₁] = πᵢ₋₁.PI.[R'ᵢ₋₁] (app input)
- Extracts πᵢ₋₁.[Rᵢ₋₁] and π'ᵢ.[R'ᵢ], adds to πᵢ.PI
- πᵢ contains: [Cᵢ], [C'ᵢ], [Rᵢ]

**Tail Kernel Kₙ₋₁**:
- Produces `PrivateToRollupKernelCircuitPublicInputs` containing final accumulated data
- **Checks**: Consistency checks for previous kernel

**Hiding Kernel Kₙ**:
- Receives tail kernel's public inputs via databus (`call_data`)
- Verifies the tail kernel proof (type `HN_FINAL`)
- Passes through `PrivateToRollupKernelCircuitPublicInputs` as its public output

This protocol ensures that data passed between circuits is consistent without requiring the verifier to see or hash the actual data—only commitment equality checks on O(1)-sized commitments.

**Chonk Proof Verification**:

There are two verification paths:

1. **Native verification** (`Chonk::verify` / `bb verify --scheme chonk`):
   - Used by **Aztec nodes** in the P2P layer to **reject invalid transactions** before they enter the mempool

2. **Recursive verification** (in-circuit):
   - `PrivateTxBaseRollup`: For private-only txs - verifies Chonk proof + processes tx (updates trees, validates fees, etc.)
   - `PublicChonkVerifier`: For public txs - verifies Chonk proof in parallel with AVM verification

Both verify the Chonk proof: MegaZK Oink + Merge + ECCVM + joint Translator/MegaZK sumcheck+PCS (+ IPA).
Output: `PrivateToRollupKernelCircuitPublicInputs` consumed by the rollup.

---

## Zero-Knowledge

A Chonk proof must reveal nothing about the private execution. ZK is achieved through multiple layers:

### Proof-Level ZK

1. **Joint MegaZK + Translator proof**: The hiding kernel (MegaZKFlavor) and translator circuits are batched into a single joint sumcheck and PCS. ZK is achieved via:
   - ZK Sumcheck with a joint Libra masking polynomial covering both circuits
   - ZK Shplemini with a gemini masking polynomial for the joint PCS reduction

2. **ECCVM proof**: ZK via committed sumcheck and ZK Shplemini

### Op Queue Hiding

The op queue contains EC operations from all circuits and must be hidden:

1. **Batch merge ZK prefix**: `BatchMergeProver` constructs the initial ZK rows used to hide the op queue up to the tail.
2. **`hide_op_queue_content_in_hiding`**: Adds the final random non-ops in the hiding kernel.

### Constant Merged Table Size for ZK

**Problem**: The final merge step appends the hiding kernel table to the accumulated table. If the merged table size varied with transaction complexity, an observer could infer information about the transaction from the proof structure.

**Solution**: We always merge to a **uniform total size** = `OP_QUEUE_SIZE`. In the code, `shift_size` is set to `(OP_QUEUE_SIZE - |hiding_ops|) × NUM_ROWS_PER_OP`, which represents the total degree of the prepended table and places the hiding kernel's ops at fixed positions at the end of the table, regardless of how many ops the actual transaction used.

```
┌─────────────────────────────────────────────────────────────┐
│  M_tail (transaction ops)  │  zero padding  │  hiding ops  │
│  (variable size)           │                │  (fixed pos) │
└─────────────────────────────────────────────────────────────┘
                             ←─ padding_size ─→
```

**Security - Zero Padding is Enforced**: The soundness argument has two parts:
1. The cumulative PREPEND degree checks throughout the kernel chain ensure $[M_{tail}]$ has bounded degree
2. The public input chain ensures the correct $[M_{tail}]$ reaches the final APPEND merge

See [Appendix: Zero Padding Security](#appendix-zero-padding-security) for the detailed M_tail lifecycle and full soundness argument.

### Hiding Kernel

The hiding kernel:
- Recursively verifies the final folding and decider proofs
- Masks sensitive `op_queue` data
- Is then proven using MegaZK to produce the final Chonk proof

---

## Usage

### Initialization

```cpp
// One CircuitKind (App / Kernel / HidingKernel) per circuit, in accumulation order.
// The stack must hold at least 4 circuits, start with an app and end with the hiding kernel.
Chonk ivc(circuit_kinds);
```

### Circuit Accumulation

For each circuit (alternating app/kernel):

```cpp
// Build your circuit
MegaCircuitBuilder circuit;
// ... add constraints ...

// Get or compute verification key
auto vk = precomputed_vk;  // or compute from circuit

// Accumulate
ivc.accumulate(circuit, vk);
```

During accumulation:
1. Circuit is folded into the prover accumulator using HyperNova
2. A folding proof is generated and added to the verification queue
3. Goblin processes any EC operations via the op queue

### Kernel Circuit Completion

Kernels must call `complete_kernel_circuit_logic` after adding user logic:

```cpp
MegaCircuitBuilder kernel;
// ... add kernel constraints ...

// Add recursive verification and databus checks
ivc.complete_kernel_circuit_logic(kernel);

ivc.accumulate(kernel, kernel_vk);
```

This adds:
- Recursive verification of previous app and kernel proofs
- Databus consistency checks between circuits
- Merge proof verification
## HyperNova Folding Details

### Core Classes

| Class | Description |
|-------|-------------|
| `HypernovaFoldingProver` | Prover-side folding operations |
| `HypernovaFoldingVerifier<Flavor>` | Verifier-side folding (native or recursive) |

### Sumcheck to Claim

Each circuit is converted to **claims** via Sumcheck:

1. Prover commits to all polynomials (witnesses + precomputed selectors)
2. Sumcheck protocol produces a random challenge point `r = (r₀, r₁, ..., rₙ₋₁)`
3. Prover evaluates all `NUM_ALL_ENTITIES` entities at `r`
4. Result is `NUM_ALL_ENTITIES` evaluation claims

For MegaFlavor: `NUM_ALL_ENTITIES = 60` evaluations (55 unshifted + 5 shifted).

### Batching Claims into Accumulator

The individual evaluation claims are batched using random linear combinations:

**1. Generate batching scalars:**
- Unshifted: $(1, \rho_1, \rho_2, \ldots, \rho_{N_u-1})$
- Shifted: $(1, \sigma_1, \sigma_2, \ldots, \sigma_{N_s-1})$
where $N_u$ = `NUM_UNSHIFTED_ENTITIES` and $N_s$ = `NUM_SHIFTED_ENTITIES`, and $\rho_i$, $\sigma_i$ are transcript challenges.

**2. Batch polynomials:**

$$p_{\text{unshifted}} = p_0 + \sum_{i=1}^{N_u-1} \rho_i \cdot p_i$$

$$p_{\text{shifted}} = p_0 + \sum_{j=1}^{N_s-1} \sigma_j \cdot p_j$$

**3. Batch evaluations:**

$$v_{\text{unshifted}} = p_0(r) + \sum_{i=1}^{N_u-1} \rho_i \cdot p_i(r)$$

$$v_{\text{shifted}} = p_{0,\text{shifted}}(r) + \sum_{j=1}^{N_s-1} \sigma_j \cdot p_{j,\text{shifted}}(r)$$

**4. Batch commitments:**

$$[p_{\text{unshifted}}] = [p_0] + \sum_{i=1}^{N_u-1} \rho_i \cdot [p_i]$$

$$[p_{\text{shifted}}] = [p_0] + \sum_{j=1}^{N_s-1} \sigma_j \cdot [p_j]$$

The resulting accumulator contains $(r, v_{\text{unshifted}}, v_{\text{shifted}}, [p_{\text{unshifted}}], [p_{\text{shifted}}])$.

### Accumulator Structure

**Prover Accumulator** (`MultilinearBatchingProverClaim`):
```cpp
struct MultilinearBatchingProverClaim {
    std::vector<FF> challenge;           // Evaluation point (r₀, r₁, ...)
    FF non_shifted_evaluation;           // p(r)
    FF shifted_evaluation;               // p_shifted(r)
    Polynomial non_shifted_polynomial;   // Full polynomial p
    Polynomial shifted_polynomial;       // Full shifted polynomial
    Commitment non_shifted_commitment;   // [p]
    Commitment shifted_commitment;       // [p_shifted]
    size_t dyadic_size;
};
```

**Verifier Accumulator** (`MultilinearBatchingVerifierClaim`):
```cpp
struct MultilinearBatchingVerifierClaim {
    std::vector<FF> challenge;           // Evaluation point
    FF non_shifted_evaluation;           // Claimed evaluation p(r)
    FF shifted_evaluation;               // Claimed shifted evaluation
    Commitment non_shifted_commitment;   // [p]
    Commitment shifted_commitment;       // [p_shifted]
};
```

### Folding Operations

**1. Instance to Accumulator** - Convert a circuit instance into an initial accumulator:

```cpp
HypernovaFoldingProver prover(transcript);
auto accumulator = prover.instance_to_accumulator(instance, honk_vk);
```

**2. Fold** - Combine an accumulator with a new instance:

```cpp
auto [folding_proof, folded_accumulator] = prover.fold(accumulator, incoming_instance);
```

The fold operation:

1. **Convert instance to accumulator**: Run Sumcheck on the incoming instance to produce an incoming accumulator claim

2. **Batch the two accumulators**: Use `MultilinearBatchingProver` to fold:
   - Constructs a circuit with 4 batched polynomial columns and 2 eq polynomial columns:
     - `batched_unshifted_accumulator`, `batched_unshifted_instance` - batched polynomials
     - `batched_shifted_accumulator`, `batched_shifted_instance` - batched shifted polynomials
     - `eq_accumulator` = $\text{eq}(X, r_{\text{acc}})$ - selects accumulator evaluation point
     - `eq_instance` = $\text{eq}(X, r_{\text{inst}})$ - selects instance evaluation point

   - Runs Sumcheck on the batching relation which checks (sums are over the Boolean hypercube $\{0,1\}^n$):

   $$\sum_{\mathbf{i} \in \{0,1\}^n} p_{\text{acc}}(\mathbf{i}) \cdot \text{eq}(\mathbf{i}, r_{\text{acc}}) = v_{\text{acc}}$$

   $$\sum_{\mathbf{i} \in \{0,1\}^n} p_{\text{inst}}(\mathbf{i}) \cdot \text{eq}(\mathbf{i}, r_{\text{inst}}) = v_{\text{inst}}$$

   This verifies that the claimed evaluations match the polynomials at the respective challenge points.

3. **Compute folded claim**: Generate batching challenge $\gamma$ and compute:

$$p_{\text{new}} = p_{\text{inst}} + \gamma \cdot p_{\text{acc}}$$

$$[p_{\text{new}}] = [p_{\text{inst}}] + \gamma \cdot [p_{\text{acc}}]$$

$$v_{\text{new}} = v_{\text{inst}} + \gamma \cdot v_{\text{acc}}$$

   (Same formulas apply to shifted polynomials)

4. **Output**: Folding proof (Sumcheck univariates + evaluations) and new accumulator

### Verification

The verifier mirrors the prover operations:

```cpp
HypernovaFoldingVerifier<Flavor> verifier(transcript);

// Convert instance to verifier accumulator
auto [success, verifier_accumulator] = verifier.instance_to_accumulator(instance, proof);

// Verify folding proof
auto [sumcheck1_valid, sumcheck2_valid, folded_accumulator] =
    verifier.verify_folding_proof(incoming_instance, folding_proof);
```

### Final Decider

After all folding, the `HypernovaDeciderProver` produces a final proof:

```cpp
HypernovaDeciderProver decider_prover(transcript);
HonkProof decider_proof = decider_prover.construct_proof(commitment_key, accumulator);
```

The decider consists of:

1. **Shplemini**: Multivariate-to-univariate reduction using Gemini folding
2. **KZG opening proof**: Proves the final univariate evaluation claim

The decider proof is verified recursively in the hiding kernel.

### Transcript Sharing

Transcripts are shared to ensure Fiat-Shamir challenge binding - challenges in later proofs depend on all prior proof elements, preventing a malicious prover from generating sub-proofs independently.

**Prover-side transcript lifecycle**:

1. **Accumulation transcript** (one per kernel-app pair):
   - Created fresh when accumulating kernel $K_i$
   - Shared across: folding proof for $K_i$, folding proof for $A_{i+1}$, Merge proof for $K_i$
   - The decider proof (after tail kernel) also continues this transcript

2. **Final proof transcript**:
   - Shared across: MegaZK Oink, Merge proof, ECCVM proof, Translator Oink + Joint sumcheck + Joint PCS
   - This is the transcript serialized into the Chonk proof

**Verifier-side transcript matching**: The recursive verifier in kernel $K_{i+1}$ reconstructs the same transcript state by processing the same proof elements in the same order, ensuring challenges match.

See [Soundness Mechanisms](#soundness-mechanisms) for how `OriginTag` enforces transcript isolation and prevents unsafe mixing of values.

---

## Soundness Mechanisms

This section describes the key mechanisms that ensure Chonk's soundness: how transcripts bind components together via Fiat-Shamir, how public inputs flow between circuits, and how deferred verification works.

### Transcript Isolation via OriginTag

While [Transcript Sharing](#transcript-sharing) describes *which* components share transcripts, this section explains how we *enforce* that values from different transcripts don't accidentally mix.

Each `BaseTranscript` instantiated in-circuit receives a unique index via an atomic counter (`unique_transcript_index`). Field elements derived from a transcript carry an `OriginTag` that records this index.

**Why isolation matters**: If values from different transcripts were mixed (e.g., using a challenge from transcript A to batch commitments hashed into transcript B), an adversary could manipulate challenges by controlling which proof elements appear where.

The `OriginTag` mechanism enforces several critical security invariants:
1. **Transcript isolation**: Values from different transcript instances cannot interact
2. **Free witness prohibition**: Free witness elements cannot interact with transcript-originated values (prevents adversarial witness construction)
3. **Round separation**: Submitted values from different rounds cannot mix without challenges (enforces proper Fiat-Shamir sequencing)

These checks are active in debug builds and catch bugs during development. For full details, see [Origin Tags Security](../transcript/Origin%20Tags%20Security.md).

**Additional transcripts created per kernel** (beyond the shared accumulation transcript):
- **Pairing points aggregation transcript**: Fresh transcript for `PairingPoints::aggregate_multiple` - generates independent Fiat-Shamir challenges for batching pairing points
- **Hash transcript**: Used to compute `output_hn_accum_hash` which binds the accumulator state to public inputs

### Public Input Structure: KernelIO and HidingKernelIO

Kernel circuits output a structured public input block that carries cross-circuit verification data:

```cpp
// KernelIO (for non-hiding kernels)
struct KernelIO {
    PairingInputs pairing_inputs;      // Accumulated {P0, P1} for deferred pairing check
    G1 kernel_return_data;             // Commitment to this kernel's return data
    std::array<G1, MAX_APPS_PER_KERNEL> app_return_data; // App return data commitments
    FF ecc_op_hash;                    // Running hash over ECC op column commitments
    FF output_hn_accum_hash;           // Hash of the HyperNova accumulator state
};

// HidingKernelIO (for the final hiding kernel - no accumulator hash since folding terminates)
struct HidingKernelIO {
    PairingInputs pairing_inputs;
    G1 kernel_return_data;
    TableCommitments ecc_op_tables;
};
```

**Security**: Public inputs are bound to the circuit via relations checked by HyperNova sumcheck. Tampering with any public input value in a proof causes the recursive sumcheck verification to fail - the relations won't hold for the modified values.

### Accumulator Hash Chain

Each kernel computes a hash of its verifier accumulator and outputs it as `output_hn_accum_hash`. The next kernel:
1. Extracts `output_hn_accum_hash` from the previous kernel's public inputs
2. Computes its own expected hash from the accumulator state
3. Asserts equality in-circuit

```cpp
// In complete_kernel_circuit_logic()
bool accum_hash_match = kernel_input.output_hn_accum_hash.get_value() == prev_accum_hash->get_value();
BB_ASSERT(accum_hash_match);
kernel_input.output_hn_accum_hash.assert_equal(*prev_accum_hash);  // In-circuit constraint
```

**Why this matters**: This creates an unbroken chain from the first kernel to the hiding kernel. If an adversary modifies any accumulator mid-chain, the hash mismatch is detected. The hash also includes `OriginTag` information via `hash_with_origin_tagging()`, binding it to the specific transcript that generated it.

### Databus Consistency Checks

The [Databus](#databus) section explains how circuits pass data via commitment equality checks. Here's the concrete enforcement in `complete_kernel_circuit_logic()`:

```cpp
// Kernel's calldata must match previous kernel's return_data
kernel_input.kernel_return_data.incomplete_assert_equal(witness_commitments.kernel_calldata);

// Each app calldata column must match the corresponding app's return_data
kernel_input.app_return_data[idx].incomplete_assert_equal(*app_calldata_commitments[idx]);
```

The `incomplete_assert_equal` (for non-native G1 points) adds in-circuit constraints that the commitments are equal. Combined with the HyperNova binding of public inputs to proofs, tampering with databus content invalidates the proof.

### ECC Op Table Continuity

The merged op queue table commitments `[M_1]...[M_4]` flow through `KernelIO.ecc_op_tables`:

1. Each kernel runs a recursive Merge verifier that outputs `merged_table_commitments`
2. These are placed in `kernel_output.ecc_op_tables` and become public inputs
3. The next kernel extracts them and uses them as `T_prev_commitments` for its own Merge verification

This chain ensures the op queue history is maintained correctly. The Merge protocol's degree check prevents injection of extra operations.

### Verification Key Binding

**Attack vector**: If the first Fiat-Shamir challenge doesn't depend on the verification key, a malicious prover could generate a valid proof for circuit A, then claim it's a proof for circuit B by presenting a different VK - the challenges would be identical since they don't bind to the VK.

**Defense**: The VK hash is the first value added to the transcript via `add_to_hash_buffer("vk_hash", ...)` before any challenges are derived. This happens in `OinkVerifier::verify()`, which is called by `HypernovaFoldingVerifier` for each incoming instance. All subsequent Fiat-Shamir challenges depend on this hash, binding the proof to exactly one circuit.

```cpp
// In OinkVerifier::verify() (called by HypernovaFoldingVerifier for each instance)
FF vk_hash = vk->hash_with_origin_tagging(*transcript);
transcript->add_to_hash_buffer("vk_hash", vk_hash);
// All subsequent challenges now depend on this hash
```

### Summary: Security Properties

| Property | Enforcement |
|----------|-------------|
| **VK binding** | VK hash first in transcript via `add_to_hash_buffer`; all challenges depend on it |
| **Fiat-Shamir soundness** | `OriginTag` prevents mixing values from different transcripts (debug builds) |
| **Public input integrity** | Bound via sumcheck relations; tampering fails recursive verification |
| **Accumulator chain** | `output_hn_accum_hash` checked via `assert_equal` (value flows through public inputs) |
| **Databus consistency** | Databus lookup relation + `assert_equal` on commitments (flow through public inputs) |
| **ECC op continuity** | ECC op queue relations (copy constraints on subtables) + Merge protocol (degree/concatenation checks) + `ecc_op_tables` flow through public inputs |

---

## Reference

### Type Aliases

| Alias | Description |
|-------|-------------|
| `Flavor` | `MegaFlavor` - the underlying Honk flavor |
| `ClientCircuit` | `MegaCircuitBuilder` - circuit builder type |
| `ProverAccumulator` | HyperNova prover accumulator |
| `VerifierAccumulator` | HyperNova verifier accumulator |
| `RecursiveFlavor` | `MegaRecursiveFlavor_<MegaCircuitBuilder>` |
| `PairingPoints` | Accumulated pairing check points |

### QUEUE_TYPE

This enum has **dual semantics** depending on context:

#### Prover Perspective (`accumulate`)
The type is assigned to the circuit being accumulated based on its position:

| Circuit Position | QUEUE_TYPE | Description |
|-----------------|------------|-------------|
| Circuit 0 | `OINK` | First app - no prior accumulator, just Oink verification |
| Circuits 1..n-4 | `HN` | Apps, inner kernels, reset kernels - standard HyperNova folding |
| Circuit n-3 | `HN_TAIL` | Pre-tail kernel |
| Circuit n-2 | `HN_FINAL` | Tail kernel - final folding + decider verification |
| Circuit n-1 | `MEGA` | Hiding kernel - MegaZK proof, no folding |

#### Verifier Perspective (`complete_kernel_circuit_logic`)
The type indicates which proof is being verified BY the current kernel:

| Verifying Proof Type | Current Kernel Is | Action |
|---------------------|-------------------|---------|
| `OINK` | Init kernel (circuit 1) | Verify first app's Oink proof |
| `HN` | Inner/reset kernel | Verify standard HN folding proof |
| `HN_TAIL` | **Tail kernel** (circuit n-2) | Verify pre-tail kernel's proof |
| `HN_FINAL` | **Hiding kernel** (circuit n-1) | Verify tail kernel's proof + verify batch merge +  decider |

**Key Point**: `HN_TAIL` is the proof FROM circuit n-3, verified BY the tail kernel (n-2). Similarly, `HN_FINAL` is the proof FROM the tail kernel (n-2), verified BY the hiding kernel (n-1).

### Proof Size

```cpp
// Without public inputs
size_t len = ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS();

// With HidingKernelIO public inputs
size_t len = ChonkProof::PROOF_LENGTH();
```

### Serialization

```cpp
// Proof to/from field elements
std::vector<FF> fields = proof.to_field_elements();
ChonkProof proof = ChonkProof::from_field_elements(fields);

// Proof to/from msgpack
msgpack::sbuffer buf = proof.to_msgpack_buffer();
ChonkProof proof = ChonkProof::from_msgpack_buffer(buf);

// Proof to/from file
proof.to_file_msgpack("proof.bin");
ChonkProof proof = ChonkProof::from_file_msgpack("proof.bin");

// VK serialization
std::vector<bb::fr> fields = vk.to_field_elements();
vk.from_field_elements(fields);
```

### Debugging

In debug builds (`NDEBUG` not defined):
- Native verifier accumulator is maintained alongside prover accumulator
- `update_native_verifier_accumulator` tracks verification state
- `debug_incoming_circuit` validates circuits before accumulation

---

## Appendix: Zero Padding Security

This appendix provides the detailed soundness argument for why the merged op queue table cannot contain non-zero values in the padding region.

### M_tail Lifecycle

**Step 1: Tail kernel performs final PREPEND merge**
- Recursive merge verifier runs in K_tail
- Verifies: $M_{tail}(\kappa) = t_{tail}(\kappa) + \kappa^{\ell_{tail}} \cdot T_{prev}(\kappa)$ where $\ell_{tail} = |t_{tail}| \times 2$
- Verifies: $\deg(t_{tail}) < \ell_{tail}$ (Thakur degree check)
- Outputs: `merged_table_commitments` = $[M_{tail,1}], [M_{tail,2}], [M_{tail,3}], [M_{tail,4}]$
- K_tail's public inputs contain these commitments via `kernel_output.ecc_op_tables`

**Step 2: K_tail → Hiding kernel via HyperNova**
- Hiding kernel verifies K_tail's HyperNova folding proof
- This binds K_tail's public inputs (including $[M_{tail}]$) to the proof

**Step 3: Hiding kernel extracts [M_tail] from K_tail's public inputs**
```cpp
KernelIO kernel_input;
kernel_input.reconstruct_from_public(public_inputs);
merge_commitments.T_prev_commitments = std::move(kernel_input.ecc_op_tables);
```
- HyperNova verification ensures `public_inputs` matches K_tail's proven computation
- Result: `T_prev_commitments` contains $[M_{tail}]$ verified to match K_tail's output

**Step 4: Hiding kernel recursively verifies K_tail**
- Verifies K_tail's HyperNova folding proof
- Verifies K_tail's decider proof
- Recursively verifies K_tail's merge proof
- Returns `merged_table_commitments` = $[M_{tail}]$
- **Critical**: Hiding kernel's own ops are NOT merged here - they will be merged by Chonk Verifier
- Public output: `HidingKernelIO{ ..., T_prev_commitments }` where `T_prev_commitments` = $[M_{tail}]$

**Step 5: Chonk verifier extracts [M_tail] from hiding kernel**
```cpp
auto oink_result = batched_verifier.verify_mega_zk_oink(proof.hiding_oink_proof);
HidingKernelIO kernel_io;
kernel_io.reconstruct_from_public(oink_result.public_inputs);
// kernel_io.ecc_op_tables contains [M_tail]
```
- Verifies hiding kernel's MegaZK Oink proof (including its public inputs)
- Extracts `ecc_op_tables` = $[M_{tail}]$ from `HidingKernelIO` public inputs
- MegaZK verification (completed by the joint sumcheck+PCS) ensures `ecc_op_tables` is bound to the hiding kernel's proof

**Step 6: Final merge - merges hiding kernel's ops with constant shift size**

### Key Verifier Guarantees

1. **Step 1**: K_tail outputs $[M_{tail}]$ via verified merge protocol with degree check
2. **Step 2-3**: HyperNova ensures $[M_{tail}]$ from K_tail's public inputs matches proven computation
3. **Step 4**: Hiding kernel uses verified $[M_{tail}]$ and outputs it in public inputs
4. **Step 5**: MegaZK verification ensures hiding kernel's public outputs are bound to its proof
5. **Step 6**: Final merge uses $[M_{tail}]$ from step 5, with degree check proving zero padding
