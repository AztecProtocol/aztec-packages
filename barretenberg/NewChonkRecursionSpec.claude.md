# New Chonk Recursion: Shrinking Client Proof Size

> This document restates `NewChonkRecursionSpec.md` for use as context by Claude when
> implementing or reasoning about this project. It maps the cryptographic design to
> concrete code in barretenberg and spells out assumptions that a human reader would
> infer from domain knowledge.

---

## 1. Background: What a Client Proof Is Today

A "client proof" is the final artifact a user produces to prove correct execution of
an Aztec protocol transaction. It is verified by the rollup (recursively, inside
another circuit) and ultimately checked on Ethereum L1.

Today a client proof consists of three sub-proofs bundled into a `ChonkProof`
(defined in `cpp/src/barretenberg/chonk/chonk_proof.hpp`):

| Sub-proof | Curve | What it proves | Verifier code |
|-----------|-------|----------------|---------------|
| **MegaZK proof** (the "IVC proof") | BN254 | Correct folding/execution of the full app + kernel circuit chain, output as a hiding-kernel proof | `UltraVerifier_<MegaZKFlavor>` in `cpp/src/barretenberg/ultra_honk/ultra_verifier.hpp` |
| **Translator proof** | BN254 | Consistency between the ECCVM's Grumpkin-field batched evaluation and the Mega circuit's BN254-field representation of the same ECC operations | `TranslatorVerifier_` in `cpp/src/barretenberg/translator_vm/translator_verifier.hpp` |
| **ECCVM proof** | Grumpkin | Correct execution of all elliptic-curve operations accumulated in the op queue | `ECCVMVerifier_` in `cpp/src/barretenberg/eccvm/eccvm_verifier.hpp` |

(There is also a Merge proof verified by `MergeVerifier` in `cpp/src/barretenberg/goblin/merge_verifier.hpp`,
bundled inside the `GoblinProof` alongside ECCVM + Translator.)

The current `ChonkVerifier` (in `cpp/src/barretenberg/chonk/chonk_verifier.hpp`)
verifies all of the above and produces a `ReductionResult` containing aggregated
pairing points (BN254) and an IPA claim (Grumpkin) for deferred verification.

### The Problem

The three sub-proofs are large. We want to **shrink the client proof dramatically**
by adding a thin recursive verification layer on the client side, producing only two
small MEGA proofs with minimal public inputs.

### Why Can't We Just Recursively Verify Everything in One BN254 Circuit?

The current recursive `ChonkVerifier` (the one that runs *inside* a circuit, i.e.
`ChonkVerifier</*IsRecursive=*/true>`) costs ~1 million constraints. This is because:

- Verifying the **Translator** and **MegaZK/IVC** proofs requires **non-native
  elliptic-curve scalar multiplications** -- BN254 curve operations verified inside a
  BN254 circuit are native, but the verifier must also handle commitments and do
  group operations that involve non-native arithmetic.
- Verifying the **ECCVM proof** requires a large amount of **non-native field
  arithmetic** -- the ECCVM operates over the Grumpkin scalar field, but we're
  verifying inside a BN254-native circuit, so every Grumpkin-field multiply becomes
  expensive bigfield work (see `cpp/src/barretenberg/stdlib/primitives/bigfield/`).

The key insight: **if we split the verification work across two circuits -- one over
BN254 and one over Grumpkin -- each circuit can do its expensive operations
*natively*, slashing the constraint count.**

---

## 2. The Solution: Two New Circuits (Chonk_B and Chonk_G)

We introduce two new intermediate circuits:

| Circuit | Native field | Curve for native EC ops | Role |
|---------|-------------|------------------------|------|
| **Chonk_B** (BN254 circuit) | Fr (BN254 scalar field) | BN254 | Hash checks + field arithmetic for the IVC & Translator proofs; Grumpkin-native EC group operations for the ECCVM proof |
| **Chonk_G** (Grumpkin circuit) | Fq (Grumpkin scalar field = BN254 base field) | Grumpkin | Hash checks + field arithmetic for the ECCVM proof; BN254-native EC group operations for the IVC & Translator proofs |

The assignment of work follows a simple principle: **do group (EC point) operations
where they are native, and do field arithmetic where it is native.**

Specifically:

| Verification task | Field arithmetic (hashes, scalar ops) | EC group operations (scalar muls, point additions) |
|-------------------|--------------------------------------|---------------------------------------------------|
| IVC + Translator proofs (BN254 proofs) | Done in **Chonk_B** (native BN254 field) | Done in **Chonk_G** (BN254 points are native in a Grumpkin circuit*) |
| ECCVM proof (Grumpkin proof) | Done in **Chonk_G** (native Grumpkin field) | Done in **Chonk_B** (Grumpkin points are native in a BN254 circuit*) |

(*) This works because BN254 and Grumpkin form a **cycle of curves**: BN254's base
field = Grumpkin's scalar field and vice versa. So a BN254 circuit can natively
represent Grumpkin curve points, and a Grumpkin circuit can natively represent BN254
curve points.

### The Data Transfer Problem

Both Chonk_B and Chonk_G need access to some of the same data (proof elements, challenges,
intermediate values). We need a way to prove that witness values shared between the
two circuits are identical, without making them all public inputs (which would bloat
proof size back up).

Three options were considered:

1. **Public inputs**: Make shared witnesses public inputs of both circuits, let the
   external verifier check equality. **Rejected** -- too many public inputs, proof
   size equivalent to the original.

2. **Field-agnostic hash**: Both circuits hash the shared witnesses and expose the
   hash as a public input. **Rejected** -- a hash that works efficiently in both
   BN254 and Grumpkin circuits doesn't exist; it would be too expensive.

3. **Polynomial equivalence check**: **Chosen approach.** This is essentially the
   same technique already used by the Translator circuit to bridge BN254 and Grumpkin
   fields (see `cpp/src/barretenberg/translator_vm/`), but simpler because the
   polynomial is small and fixed.

### The Polynomial Equivalence Protocol (Data Transfer Sub-protocol)

Given shared witnesses w_1, ..., w_n that must be equal in both Chonk_B and Chonk_G:

**Step 1 -- Commit to the witnesses (independently in each circuit):**
- In Chonk_B: compute a SNARK-friendly hash H_b(w_1, ..., w_n) = h_b. Expose h_b as a
  public input.
- In Chonk_G: compute a SNARK-friendly hash H_g(w_1, ..., w_n) = h_g. Expose h_g as a
  public input.

**Step 2 -- Generate a random evaluation challenge:**
- The external verifier (the entity that receives proofs from Chonk_B and Chonk_G) computes
  alpha = H(h_g, h_b) using a hash. Alpha is provided as a public input to both
  circuits.

**Step 3 -- Evaluate a polynomial at the challenge point:**
- Define P(X) = w_1 + w_2 * X + w_3 * X^2 + ... + w_n * X^(n-1)
- In Chonk_G: evaluate r = P(alpha) using **native** field arithmetic (cheap).
- In Chonk_B: evaluate r = P(alpha) using **non-native** field arithmetic (more
  expensive, but this is a small polynomial so it's manageable).
- Both circuits expose r as a public input.

**Step 4 -- External verifier checks:**
- r from Chonk_B == r from Chonk_G (polynomial evaluation matches)
- alpha was correctly derived from h_b and h_g

By the Schwartz-Zippel lemma, if P_b(alpha) = P_g(alpha) for a random alpha, then
with overwhelming probability the witness vectors are identical.

**Design choice**: The polynomial evaluation is done over the Grumpkin scalar field
(= BN254 base field). This means Chonk_G evaluates it natively and Chonk_B does non-native
field work. This is preferred because we want to minimize the Grumpkin circuit size
(it may incur additional IPA opening costs).

**Note on "External Verifier"**: This refers to whatever currently verifies the
ChonkProof -- either the native verifier or the recursive rollup verifier. After this
project, it will verify proofs from Chonk_B and Chonk_G instead of the raw sub-proofs.

---

## 3. Expected Costs

| Cost component | Estimated constraints | Notes |
|---------------|----------------------|-------|
| Native EC scalar multiplications | ~76,800 - 115,200 | 200-300 scalar muls at ~384 constraints each (BN254 muls in Chonk_G, Grumpkin muls in Chonk_B) |
| Native field multiplications | ~10,000 | Replacing ~300k constraints of non-native field muls |
| Hashing | ~20,000 - 30,000 | Equivalent to existing verifier hash work |
| Polynomial equivalence check | ~25,000 | ~300 shared field elements => ~600 non-native field muls at ~40 constraints each |
| **Total (both circuits combined)** | **< 200,000** | Down from ~1,000,000 in current recursive verifier |

### Additional Benefits

- **Smaller client proof**: Output is just 2 MEGA proofs with minimal public inputs.
  No extra chonk commitments, data bus columns, or ECC transcript columns.
- **Faster rollup verification**: The rollup-side work to verify a client proof
  shrinks dramatically, improving rollup prover times.
- **ZK optimization opportunity**: We could remove ZK from ECCVM, Translator, and the
  final IVC layer, and add ZK only to Chonk_B and Chonk_G. Since these circuits are much
  smaller, overall ZK overhead decreases.

---

## 4. Implementation Roadmap

### Current State

`ChonkVerifier` currently takes:
1. A `MegaZKProof` of the hiding kernel
2. A `GoblinProof` (containing Merge + ECCVM + IPA + Translator proofs)

### Target State

A new pair of circuits (Chonk_B, Chonk_G) takes those same inputs, performs the same
verification work as ChonkVerifier but more efficiently by exploiting native
arithmetic. A new "SplitChonkVerifier" then verifies proofs of Chonk_B and Chonk_G.

**Constraint: There should be NO non-native field or group operations in Chonk_B or Chonk_G,
with the single exception of the polynomial equivalence check in Chonk_B (non-native
Grumpkin-field evaluation as part of the data transfer sub-protocol).**

### Phases (Sequential)

#### Phase 1: Split Translator Verification Across Chonk_B and Chonk_G

**Goal**: Define the two new circuits and get them working end-to-end for Translator
proof verification only.

- **Chonk_B responsibilities**: All hash computations and field arithmetic from the
  Translator verifier (these are BN254-native operations).
- **Chonk_G responsibilities**: All BN254 elliptic-curve group operations from the
  Translator verifier (BN254 point operations are native in a Grumpkin circuit).
- Define the interface between Chonk_B and Chonk_G: what witness data is shared.

**Key files to study/modify**:
- `cpp/src/barretenberg/translator_vm/translator_verifier.hpp` (current Translator verifier)
- `cpp/src/barretenberg/translator_vm/translator_verifier.cpp`
- Translator relations in `cpp/src/barretenberg/relations/translator_vm/`

#### Phase 2: Implement the Data Transfer Sub-protocol

**Goal**: Implement the polynomial equivalence check so that Chonk_B and Chonk_G can prove
they share identical witness values.

- Implement the SNARK-friendly hashing of shared witnesses in both circuits.
- Implement polynomial evaluation (native in Chonk_G, non-native in Chonk_B).
- Define the public input interface: h_b, h_g, alpha, r.
- The external verifier derives alpha from (h_b, h_g) and checks r equality.

**Key files to study**:
- `cpp/src/barretenberg/stdlib/primitives/bigfield/` (for non-native field arithmetic in Chonk_B)
- `cpp/src/barretenberg/translator_vm/` (existing polynomial equivalence pattern to reference)

#### Phase 3: Create the SplitChonk Verifier

**Goal**: Build a new verifier that verifies proofs of Chonk_B and Chonk_G (instead of
verifying the raw sub-proofs directly).

- This verifier receives two MEGA proofs (from Chonk_B and Chonk_G) plus their public inputs.
- It checks the polynomial equivalence protocol (alpha derivation, r equality).
- It aggregates pairing points from both proofs.

**Key files to study/modify**:
- `cpp/src/barretenberg/chonk/chonk_verifier.hpp` (current ChonkVerifier to base the new one on)
- `cpp/src/barretenberg/chonk/chonk_verifier.cpp`

#### Phase 4: Add ECCVM Verification to Chonk_B and Chonk_G

**Goal**: Extend the circuits to also verify the ECCVM proof.

- **Chonk_G responsibilities (new)**: All hash computations and field arithmetic from the
  ECCVM verifier (these are Grumpkin-native operations).
- **Chonk_B responsibilities (new)**: All Grumpkin elliptic-curve group operations from
  the ECCVM verifier (Grumpkin point operations are native in a BN254 circuit).
- Extend the shared witness set and polynomial equivalence check accordingly.

**Key files to study/modify**:
- `cpp/src/barretenberg/eccvm/eccvm_verifier.hpp` (current ECCVM verifier)
- `cpp/src/barretenberg/eccvm/eccvm_verifier.cpp`

#### Phase 5: Add IVC (MegaZK) Verification to Chonk_B and Chonk_G

**Goal**: Extend the circuits to also verify the MegaZK/IVC proof.

- This is the hiding-kernel proof. Similar decomposition: field work in Chonk_B, group
  work in Chonk_G.
- Extend shared witnesses and polynomial equivalence check.

**Key files to study/modify**:
- `cpp/src/barretenberg/ultra_honk/ultra_verifier.hpp` (MegaZK verifier)
- `cpp/src/barretenberg/ultra_honk/ultra_verifier.cpp`
- `cpp/src/barretenberg/special_public_inputs/special_public_inputs.hpp` (HidingKernelIO)

#### Phase 6: Create the New ChonkVerifier

**Goal**: Replace the current ChonkVerifier with one that verifies Chonk_B and Chonk_G proofs.

- The new ChonkVerifier's output type (`ReductionResult`) must contain the same data
  as the current one after all changes are applied. This ensures the rollup
  verification pipeline is unaffected.
- The current `ReductionResult` contains:
  - `PairingPoints pairing_points` (aggregated from 4 sources)
  - `IPAClaim ipa_claim`
  - `IPAProof ipa_proof`
  - `bool all_checks_passed`

**Key files to modify**:
- `cpp/src/barretenberg/chonk/chonk_verifier.hpp`
- `cpp/src/barretenberg/chonk/chonk_verifier.cpp`
- `cpp/src/barretenberg/chonk/chonk_proof.hpp` (proof structure will change)

---

## 5. Glossary for Claude

| Term | Meaning |
|------|---------|
| **BN254** | A pairing-friendly elliptic curve. Its scalar field is Fr. Its base field is Fq. Used for KZG commitments. |
| **Grumpkin** | An elliptic curve forming a cycle with BN254. Its scalar field = BN254's base field (Fq). Its base field = BN254's scalar field (Fr). Used for IPA commitments. |
| **Cycle of curves** | BN254 and Grumpkin share fields: BN254.Fq = Grumpkin.Fr and BN254.Fr = Grumpkin.Fq. This means a circuit over one curve can natively do point arithmetic on the other curve. |
| **Native arithmetic** | Field or group operations where the operands are elements of the circuit's native field. Cheap (~1 constraint per multiply). |
| **Non-native arithmetic** | Field or group operations where the operands are from a *different* field than the circuit's native field. Expensive (~40+ constraints per multiply via bigfield decomposition). |
| **MEGA proof** | A proof in the MegaHonk/MegaZK proving system (UltraHonk with additional features like databus, ECC op queue). |
| **KZG** | Kate-Zaverucha-Goldberg polynomial commitment scheme. Used over BN254. Verification reduces to a pairing check. |
| **IPA** | Inner Product Argument polynomial commitment scheme. Used over Grumpkin. Verification is more expensive than KZG. |
| **Pairing points** | The accumulated inputs to a BN254 pairing check. Multiple KZG verification results can be batched into a single pairing check by aggregating pairing points. |
| **IPA claim** | An opening claim for an IPA commitment. Can be accumulated across multiple proofs and verified once. |
| **Op queue** | A log of all elliptic-curve operations (point additions, scalar multiplications) that circuits request. The ECCVM proves these were executed correctly. |
| **Shplemini / Shplonk** | Batching techniques used inside proof verification that combine multiple polynomial opening claims into fewer claims, reducing verifier work. |
| **Bigfield** | The stdlib class (`stdlib/primitives/bigfield/`) that implements non-native field arithmetic by decomposing elements into 4x 68-bit limbs and using CRT. |
| **Schwartz-Zippel lemma** | If two polynomials of degree d agree at a random point, they are identical with probability >= 1 - d/|F|. This is why the polynomial equivalence check works. |
| **ChonkProof** | The current client proof bundle: MegaZK proof + GoblinProof (Merge + ECCVM + IPA + Translator). |
| **SplitChonk** | The proposed new structure: proofs of Chonk_B and Chonk_G replace the raw sub-proofs. |
| **Data transfer sub-protocol** | The polynomial equivalence mechanism that proves shared witnesses are identical across Chonk_B and Chonk_G without making them all public inputs. |
| **Hiding kernel** | The final circuit in the IVC chain that adds ZK properties. Its proof is the MegaZK component of ChonkProof. |
