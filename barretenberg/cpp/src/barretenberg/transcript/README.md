# Transcript

An implementation of the Fiat-Shamir transform for interactive proofs, supporting both **native** (prover/verifier) and **in-circuit** (recursive verification) execution modes.

## Table of Contents
- [Overview](#overview)
- [Native vs In-Circuit Modes](#native-vs-in-circuit-modes)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Origin Tag Security Mechanism](#origin-tag-security-mechanism)
- [In-circuit Transcript Flow](#in-circuit-transcript-flow-recursive-verification)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Implementation Notes](#implementation-notes)

---

## Overview

The `BaseTranscript` class implements the Fiat-Shamir transform, converting interactive proof protocols into non-interactive ones. It manages:

- **Proof data serialization and deserialization**: Prover messages are added to the proof and retrieved from the proof with necessary checks/constraints
- **Challenge generation**: Challenges derived via hashing
- **Round management**: Tracks protocol rounds and phase transitions
- **Security tracking**: Origin tags for in-circuit execution (recursive verification)

### Key Template Parameters

```cpp
template <typename Codec_, typename HashFunction>
class BaseTranscript
```

- **Codec**: Serialization/deserialization gadget (`FrCodec`,  `StdlibCodec`, `U256Codec`).
- **HashFunction**: Hash function for challenge generation (Poseidon2, Keccak)

### Common Instantiations

```cpp
// Native transcript using Poseidon2 hash
using NativeTranscript = BaseTranscript<FrCodec, crypto::Poseidon2<...>>;

// Native transcript using Keccak hash (to be verified by Solidity verifiers)
using KeccakTranscript = BaseTranscript<U256Codec, crypto::Keccak>;

// In-circuit transcript for recursive verification
template <typename Builder>
using StdlibTranscript = BaseTranscript<stdlib::StdlibCodec<field_t<Builder>>, stdlib::poseidon2<Builder>>;

// Builder-specific in-circuit transcripts
using UltraStdlibTranscript = BaseTranscript<stdlib::StdlibCodec<field_t<UltraCircuitBuilder>>,
                                              stdlib::poseidon2<UltraCircuitBuilder>>;
using MegaStdlibTranscript = BaseTranscript<stdlib::StdlibCodec<field_t<MegaCircuitBuilder>>,
                                             stdlib::poseidon2<MegaCircuitBuilder>>;
```

---

## Native vs In-Circuit Modes

The transcript operates in two fundamentally different modes:

#### Native Mode
- **Purpose**: Used for proving and out-of-circuit verification
- **DataType**: Native types (`bb::fr`, `grumpkin::fr`, `uint256_t`)
- **ChallengeType**: Native types
- **Origin Tags**: Disabled

#### In-Circuit Mode (Recursive Verification)
- **Purpose**: Verifying proofs in-circuit (recursive proofs)
- **DataType**: Circuit field elements (`field_t<Builder>`)
- **ChallengeType**: `field_t` or `bigfield`
- **Origin Tags**: **Enabled** to detect Fiat-Shamir violations

The mode is set at compile time by `static constexpr bool in_circuit = InCircuit<DataType>;` (`transcript.hpp`): the transcript is in-circuit when the Codec's `DataType` is a stdlib type. So `StdlibCodec` gives in-circuit mode, and `FrCodec`/`U256Codec` give native mode.

Origin tags are compiled in unless `AZTEC_NO_ORIGIN_TAGS` is defined. No build preset or CMake file defines it, so the checks are active in every build.


### Phase and Round Tracking

The transcript maintains state for correct tag assignment and manifest tracking:

```cpp
size_t round_index = 0;                  // Current protocol round (for both tags and manifest)
bool challenge_generation_phase = false; // Currently generating challenges (true) vs proof processing (false)
```

#### Phase Transitions

**When processing proof data** (`send_to_verifier`, `receive_from_prover`, `add_to_hash_buffer`):
```cpp
if (challenge_generation_phase) {
    challenge_generation_phase = false;  // Switch to proof processing phase
    round_index++;                        // Move to next round
}
// Tag assigned: OriginTag(transcript_index, round_index, is_submitted=true)
```

**When generating challenges** (`get_challenge`, `get_challenges`):
```cpp
if (!challenge_generation_phase) {
    challenge_generation_phase = true;  // Switch to challenge generation phase
    // round_index stays the same - challenges belong to the current round
}
// Tag assigned: OriginTag(transcript_index, round_index, is_submitted=false)
```

---

## Core Concepts

### Duplex Sponge Construction

Challenge generation uses a duplex construction:

```
c_next = H(c_prev || round_data)
```

- First challenge: `c_0 = H(round_0_data)`
- Subsequent: `c_i = H(c_{i-1} || round_i_data)`
- `get_challenge(s)`: one full field element (~254 bits) per hash. This is the default.
- `get_short_challenge(s)`: two 127-bit challenges per hash.

### Hash Buffer and State Management

#### `current_round_data` - Fiat-Shamir Transcript
- **Purpose**: Accumulates data for Fiat-Shamir challenge generation
- **How to add**: `send_to_verifier()`, `receive_from_prover()`, `add_to_hash_buffer()`
- **When cleared**: After `get_challenge()` or `get_challenges()` is called
- **Effect**: All data here influences subsequent challenges

**Usage pattern**:
```cpp
transcript->add_to_hash_buffer("vk_hash", vk_hash);     // Add to Fiat-Shamir
transcript->receive_from_prover<Commitment>("comm");    // Add to Fiat-Shamir
auto alpha = transcript->get_challenge<FF>("alpha");    // Depends on above data, clears buffer
```

#### Secure Access to Transcript State

The transcript's Fiat-Shamir state (`transcript_index` and `round_index`) is kept private. Access is controlled via a friend function:

```cpp
// Securely extract origin tag context from transcript
OriginTag tag = bb::extract_transcript_tag(transcript);
// Returns: OriginTag(transcript.transcript_index, transcript.round_index, is_submitted=true)
```

This ensures the transcript's internal round tracking cannot be accidentally exposed or modified, while still allowing necessary access for origin tag assignment in VK/committed instance hashing.

---

## API Reference

### Core Methods

#### `send_to_verifier<T>(const std::string& label, const T& element)`
Serialize element, add to proof, and update transcript state.


**Effects**:
- Serializes `element` to field elements
- Appends to `proof_data`
- Adds to `current_round_data` for next challenge
- Assigns origin tag (in-circuit mode)

#### `add_to_hash_buffer<T>(const std::string& label, const T& element)`
Add element to the Fiat-Shamir transcript (affects challenge generation).

```cpp
// Add VK hash to the Fiat-Shamir transcript
FF vk_hash = vk->hash_with_origin_tagging(*transcript);
transcript->add_to_hash_buffer("vk_hash", vk_hash);

// Now challenges will depend on the VK hash
auto alpha = transcript->get_challenge<FF>("alpha");
```

**Key point**: Data added here becomes part of the transcript state and **affects all subsequent challenge generation**.

**Use cases**:
- VK or claim hashes
- Metadata that should influence challenges

#### `receive_from_prover<T>(const std::string& label) -> T`
Deserialize and extract element from proof, update transcript state.

```cpp
auto commitment = transcript->receive_from_prover<Commitment>("wire_commitments");
```

**Effects**:
- Reads `calc_num_fields<T>()` field elements from proof
- Advances read position
- Adds to `current_round_data`
- Deserializes via `Codec::deserialize_from_fields<T>()` which enforces:
  - **Curve checks** (for point types): `validate_on_curve()` called during deserialization
  - **Range constraints** (for `bigfield` with UltraCircuitBuilder): Limb bounds enforced
  - **Point-at-infinity detection**: auto-detected from (0, 0) coordinates during point reconstruction
- Assigns and validates origin tag (in-circuit mode)

### Challenge Generation

Challenges are BN254 `fr`/`field_t` elements, except:

 - Grumpkin-commitment verifiers (`ECCVMRecursiveVerifier`) get `fq`/`bigfield` challenges.
 - `KeccakTranscript` returns `uint256_t` challenges.

#### `get_challenge<ChallengeType>(const std::string& label) -> ChallengeType`
Generate a single full-width (~254-bit) challenge by hashing accumulated round data.

```cpp
auto alpha = transcript->get_challenge<FF>("alpha");
```

**Behavior**:
- Hashes `previous_challenge || current_round_data`
- Clears `current_round_data`
- Assigns origin tag with `is_submitted=false`

#### `get_challenges<ChallengeType>(std::span<const std::string> labels) -> std::vector<ChallengeType>`
Generate multiple challenges efficiently.

```cpp
auto [beta, gamma] = transcript->get_challenges<FF>({"beta", "gamma"});
```

**Behavior**:
- Generates one full-width (~254-bit) challenge per hash, one hash per label
- Uses iterative duplex hashing for subsequent challenges
- All challenges from same round get the same origin tag

#### `get_short_challenge` / `get_short_challenges`
Generate 127-bit challenges: each hash is split into two 127-bit limbs, so one hash gives two challenges. Use them where scalar size matters, e.g. HyperNova batching (`hypernova_batching_challenges.hpp`).

```cpp
auto [a, b] = transcript->get_short_challenges<FF>(std::array<std::string, 2>{ "a", "b" });
```

#### `get_dyadic_powers_of_challenge<ChallengeType>(const std::string& label, size_t num_challenges) -> std::vector<ChallengeType>`
Generate a challenge and compute powers `[δ, δ², δ⁴, ..., δ^(2^(num_challenges-1))]`.

```cpp
// Used for gate separators in Sumcheck
auto gate_challenges = transcript->get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);
// Returns [δ, δ², δ⁴, δ⁸, ...] (log_n elements)
```

**Why squared powers?**
The powers-of-2 exponent pattern `[δ, δ², δ⁴, δ⁸, ...]` is used in `pow`-polynomial to separate gate contributions in the sumcheck protocol.

### Proof Management

#### `export_proof() -> std::vector<DataType>`
Extract proof slice written since last export.

```cpp
auto proof = transcript->export_proof();
// Moves proof_start forward, resets num_frs_written
```

**Use case**: Multiple provers sharing a transcript (e.g., HyperNova folding → decider)

#### `load_proof(const std::vector<DataType>& proof)`
Load proof data for verification.

```cpp
transcript->load_proof(proof);
```


## Origin Tag Security Mechanism

### Why Origin Tags?

In recursive verification, all transcript values are circuit variables (witnesses). Without tracking their provenance, bugs or malicious code could violate Fiat-Shamir protocol structure:

1. **Cross-round contamination**: Values from different protocol rounds mixing without proper challenge separation
2. **Transcript isolation violation**: Values from different transcript instances interacting
3. **Free witness injection**: Unconstrained witnesses bypassing protocol logic

Origin tags prevent these violations by **tainting** each value with metadata tracking its source.

### Origin Tag Structure

```cpp
struct OriginTag {
    uint64_t tag_id;                     // Per-object id printed in merge errors
    size_t transcript_index;             // Which transcript instance created this value
    numeric::uint512_t round_provenance; // Which protocol rounds contributed to this value
    bool instant_death;                  // Poison flag - abort on any arithmetic
};
```

#### transcript_index - Transcript Isolation

Each transcript instance gets a unique ID from the global atomic counter `unique_transcript_index`:

```cpp
// In BaseTranscript constructor (in-circuit mode only)
transcript_index = unique_transcript_index.fetch_add(1);
```

**Special Values**:
- `CONSTANT = size_t(-1)`: Pure compile-time constants (safe everywhere)
- `FREE_WITNESS = size_t(-2)`: Witnesses not derived from transcript (potentially unsafe)

**Enforcement**: Tags with different `transcript_index` values cannot merge (except constants). This prevents mixing values from independent protocol executions.

#### round_provenance - Round Tracking Bitmask

A 512-bit value split into two 256-bit halves:

```
[Upper 256 bits: Challenges] [Lower 256 bits: Submitted Values]
```

- **Bit `i` in lower 256 bits**: This value uses data submitted in round `i`
- **Bit `i` in upper 256 bits**: This value uses a challenge generated in round `i`

**Construction**:
```cpp
// SINGLE BIT EXAMPLES - Values from one round only

// Submitted value in round 3
round_provenance = (1 << 3);  // 0x0000...0008 (bit 3 in lower 256 bits)

// Challenge from round 5
round_provenance = (1 << (5 + 256));  // 0x0020...0000 (bit 5 in upper 256 bits)
```

**How multiple bits get set**: When values combine through arithmetic operations (`a + b`, `a * b`), their round_provenances merge using **bitwise OR**:
```cpp
// Example: combining values from different rounds
auto a = transcript->receive_from_prover<FF>("a");  // round 0: round_provenance = 0x...0001
auto beta = transcript->get_challenge<FF>("beta");  // round 1: round_provenance = 0x0002...0000
auto c = transcript->receive_from_prover<FF>("c");  // round 2: round_provenance = 0x...0004

auto result = a * beta + c;
// result.round_provenance = 0x...0001 | 0x0002...0000 | 0x...0004 = 0x0002...0005
// → Tracks that result depends on: data from rounds 0,2 and challenge from round 1
```

#### Instant Death

Values marked with `instant_death = true` abort on any arithmetic operation.

### Tag Merging

When circuit values combine arithmetically (`a + b`, `a * b`, etc.), their origin tags **merge** via the `OriginTag(tag_a, tag_b)` constructor. This is how tags propagate through computations.

**Merge algorithm** (from `origin_tag.cpp`):

```cpp
OriginTag::OriginTag(const OriginTag& tag_a, const OriginTag& tag_b)
{
    // 1. Check for poisoned values
    if (tag_a.instant_death || tag_b.instant_death) {
        throw_or_abort("Touched an element that should not have been touched");
    }

    // 2. Handle constants (constants can combine with anything)
    if (tag_a.transcript_index == CONSTANT) {
        *this = tag_b;  // Use tag_b entirely
        return;
    }
    if (tag_b.transcript_index == CONSTANT) {
        *this = tag_a;  // Use tag_a entirely
        return;
    }

    // 3. Handle free witnesses (cannot mix with tracked values)
    if (tag_a.is_free_witness() && !tag_b.is_free_witness() && !tag_b.is_empty()) {
        throw_or_abort("A free witness element should not interact with an element that has an origin");
    }
    // (Similar check for tag_b being free witness)

    // 4. Check transcript isolation (different transcripts cannot interact)
    if (tag_a.transcript_index != tag_b.transcript_index) {
        throw_or_abort("Tags from different transcripts were involved in the same computation");
    }

    // 5. Check cross-round contamination
    check_round_provenance(tag_a.round_provenance, tag_b.round_provenance);

    // 6. Merge the tags
    transcript_index = tag_a.transcript_index;
    round_provenance = tag_a.round_provenance | tag_b.round_provenance;  // Bitwise OR combines round info
}
```

**Key points**:
- Constants merge transparently (don't affect the other tag)
- Free witnesses cannot mix with transcript-derived values
- Parent tags must match (same transcript instance)
- Child tags OR together, accumulating all rounds involved
- **Cross-round check prevents invalid protocol patterns**

### How Origin Tags Work

#### 1. Tag Assignment

In recursive verification (in-circuit mode), values receive origin tags when the verifier extracts them from the proof or generates challenges:

```cpp
// Recursive verifier receives wire commitment from proof (round 0)
auto comm = transcript->receive_from_prover<Commitment>("wire_comm");
// comm.get_origin_tag() = OriginTag(transcript_id, round=0, is_submitted=true)
//   → round_provenance = 0x0000...0001 (bit 0 set in lower 256 bits)

// Verifier generates challenge after round 0 data
auto beta = transcript->get_challenge<FF>("beta");
// beta.get_origin_tag() = OriginTag(transcript_id, round=0, is_submitted=false)
//   → round_provenance = 0x0001...0000 (bit 0 set in upper 256 bits)
```

**Tag construction** (in `origin_tag.hpp:OriginTag` constructor):
```cpp
OriginTag(size_t parent_index, size_t child_index, bool is_submitted = true)
    : transcript_index(parent_index)
    , round_provenance((static_cast<uint512_t>(1) << (child_index + (is_submitted ? 0 : 256))))
```

- Submitted values: bit shifted by `child_index` (lower 256 bits)
- Challenges: bit shifted by `child_index + 256` (upper 256 bits)

#### 2. The Cross-Round Check

The check in `check_round_provenance()`:

```cpp
void check_round_provenance(const uint512_t& provenance_a, const uint512_t& provenance_b)
{
    // Lower 256 bits = submitted rounds, Upper 256 bits = challenge rounds
    const uint256_t& submitted_a = provenance_a.lo;
    const uint256_t& submitted_b = provenance_b.lo;

    // Nothing to check if either has no submitted data or both are from the same round(s)
    if (submitted_a == 0 || submitted_b == 0 || submitted_a == submitted_b) {
        return;
    }

    // VIOLATION: max challenge round must be >= max submitted round, otherwise the submitted
    // values from different rounds were combined without a challenge that binds the later round.
    const int max_challenge_round = highest_set_bit_256(provenance_a.hi | provenance_b.hi);
    const int max_submitted_round = highest_set_bit_256(submitted_a | submitted_b);
    if (max_challenge_round < max_submitted_round) {
        throw_or_abort("Round provenance check failed: max challenge round < max submitted round");
    }
}
```

**What this prevents**:
```cpp
// Round 0: Prover submits A
transcript->send_to_verifier("A", a);  // a has round_provenance = 0x...01 (lower)

// Round 1: After challenges, prover submits B
transcript->send_to_verifier("B", b);  // b has round_provenance = 0x...02 (lower)

// INVALID: Directly combining A and B without involving challenges
auto result = a + b;  // aborts: different round submitted values, no challenges
```

**Why this matters**: In Fiat-Shamir protocols, data from different rounds should only interact through challenges. Direct interaction violates protocol structure and may enable attacks.

**Valid pattern**:
```cpp
auto beta = transcript->get_challenge<FF>("beta");  // round_provenance = 0x0001...0000 (upper)
auto mixed = a * beta;   // OK: has challenge bit set
auto result = mixed + b; // OK: mixed has challenge bit, prevents violation
```

`check_round_provenance` reports the two round numbers. The other merge aborts (free witness, poisoned value, different transcripts) name the `tag_id` of both tags, so you can trace which field elements were involved.

#### Testing tags

`STANDARD_TESTING_TAGS` (`origin_tag.hpp`) defines tags reused in tests, for example `submitted_value_origin_tag` (round 0), `challenge_origin_tag` (round 0), merged tags that combine several rounds, and `instant_death_tag` (poisoned).

#### Not checked

The mechanism does not check whether a challenge meets a submitted value from a following round. That interaction can also be dangerous.



## In-Circuit Transcript Flow (Recursive Verification)

The table shows the first Oink rounds of a recursive Honk verifier with origin tag tracking. The tag `(r, submitted)` is `OriginTag(transcript_index, r, is_submitted=true)`; `(r, challenge)` uses `is_submitted=false`.

| Call | `round_index` | Tag | Buffer effect |
|---|---|---|---|
| `vk->hash_with_origin_tagging(*transcript)` | 0 | VK commitments get `extract_transcript_tag` = `(0, submitted)` via `tag_and_serialize`; FREE_WITNESS tags are unset before hashing | none; returns `vk_hash` |
| `add_to_hash_buffer("vk_hash", vk_hash)` | 0 | `(0, submitted)` | appends; the VK hash must be the first element in the transcript |
| `receive_from_prover("public_input_i")` | 0 | `(0, submitted)` | reads from proof, appends |
| `receive_from_prover("Gemini:masking_poly_comm")` (Gemini-masking flavors only) | 0 | `(0, submitted)` | reads from proof, appends |
| `receive_from_prover` for `w_l`, `w_r`, `w_o` | 0 | `(0, submitted)` | reads from proof, appends |
| `get_challenges({"eta", "rom_logup_gamma"})` (only if `Flavor::HasMemory`) | 0 | `(0, challenge)` | sets FREE_WITNESS tags in `current_round_data` to CONSTANT, hashes, clears; `eta_two`, `eta_three` are powers of `eta` |
| `receive_from_prover` for `lookup_read_counts`, `lookup_read_tags`, `w_4` | 1 (phase switch increments it) | `(1, submitted)` | reads from proof, appends |
| `get_challenges({"beta", "gamma"})` | 1 | `(1, challenge)` | sanitizes, hashes, clears |
| `receive_from_prover` for `lookup_inverses`, `z_perm` | 2 | `(2, submitted)` | reads from proof, appends |
| `get_challenge("alpha")` | 2 | `(2, challenge)` | sanitizes, hashes, clears |

Combining `eta * w_l + w_4` aborts: the largest challenge round (0) is smaller than the largest submitted round (1). `beta * w_l + w_4` passes, because `beta` is a round-1 challenge.

---

## Usage Examples

### Standard Prover/Verifier Pattern

```cpp
// === PROVER ===
auto prover_transcript = std::make_shared<NativeTranscript>();

// Round 1: Send wire commitments
for (auto& comm : wire_commitments) {
    prover_transcript->send_to_verifier("wire_comm", comm);
}

// Round 2: Receive challenge, send derived commitments
auto [beta, gamma] = prover_transcript->get_challenges<FF>({"beta", "gamma"});
compute_grand_product_polynomials(beta, gamma);
for (auto& z_comm : z_commitments) {
    prover_transcript->send_to_verifier("z_comm", z_comm);
}

auto proof = prover_transcript->export_proof();

// === VERIFIER ===
auto verifier_transcript = std::make_shared<NativeTranscript>();
verifier_transcript->load_proof(proof);

// Mirror prover's exact sequence
for (size_t i = 0; i < num_wires; i++) {
    auto comm = verifier_transcript->receive_from_prover<Commitment>("wire_comm");
    // Verifier stores commitments...
}

auto [beta, gamma] = verifier_transcript->get_challenges<FF>({"beta", "gamma"});

for (size_t i = 0; i < num_relations; i++) {
    auto z_comm = verifier_transcript->receive_from_prover<Commitment>("z_comm");
    // Verifier stores z commitments...
}
```

### Handling Public Inputs

Honk sends public inputs through `send_to_verifier`, so they are part of the proof (`OinkProver::send_vk_hash_and_public_inputs`). The VK hash goes in via `add_to_hash_buffer`.

```cpp
FF vk_hash = honk_vk->hash_with_origin_tagging(*transcript);
transcript->add_to_hash_buffer("vk_hash", vk_hash);
for (size_t i = 0; i < num_public_inputs; ++i) {
    transcript->send_to_verifier("public_input_" + std::to_string(i), public_inputs[i]);
}
```


### Shared Transcript Between Prover Stages

HyperNova folding and the HyperNova decider share one transcript (see `chonk/chonk.cpp`). Each stage exports its own proof slice:

```cpp
auto transcript = std::make_shared<NativeTranscript>();
HypernovaFoldingProver folding_prover(transcript);

// One proof slice (Oink + Sumcheck) per circuit; accumulate_instance calls export_proof()
HonkProof instance_proof = folding_prover.accumulate_instance<InstanceFlavor>(prover_instance, honk_vk);

// Batch the cached claims into one accumulator
auto [batching_proof, accumulator] = folding_prover.finalize(std::move(previous_accumulator));

// Decider continues on the same transcript
HypernovaDeciderProver decider_prover(transcript);
HonkProof decider_proof = decider_prover.construct_proof(accumulator);
```

`OinkProver` takes three arguments: `(prover_instance, honk_vk, transcript)`.

---

## Best Practices

### 1. **In-Circuit: Unset Free Witness Tags Carefully**

**What unsetting does**: The `unset_free_witness_tag()` method changes a value's origin tag from `FREE_WITNESS` to `CONSTANT`, allowing it to bypass the free witness security check that normally prevents unconstrained witnesses from mixing with transcript-derived values.

```cpp
// Before: transcript_index = FREE_WITNESS (triggers security checks)
// After:  transcript_index = CONSTANT (can mix with any value)
value.unset_free_witness_tag();
```

In recursive verification, you may need to bypass free witness checks:

```cpp
// Only do this if you're CERTAIN the value is safe
commitment.unset_free_witness_tag();

// Better: Ensure values come from transcript with proper origin tags
auto commitment = transcript->receive_from_prover<Commitment>("comm");
// No need to unset - it has a proper origin tag
```

**When unsetting is needed**:

- **VK commitments**: In recursive verification, verification key commitments are provided as circuit witnesses (not from the proof transcript). These are **public constants** known to both prover and verifier, so treating them as constants is safe. However, they must be assigned proper origin tags via `tag_and_serialize()` before hashing to ensure correct provenance tracking. The typical flow is:
  ```cpp
  // 1. VK commitments start as FREE_WITNESS (they're circuit witnesses)
  // 2. tag_and_serialize() assigns proper origin tags for tracking
  // 3. unset_free_witness_tags() converts to CONSTANT before hashing
  ```
  This is safe because VK commitments are public data, not secret prover values that could violate Fiat-Shamir security.

- **Fixed constants reconstructed in-circuit**: Similar to VK commitments, these are publicly known values reconstructed as witnesses in the circuit.

- **Multi-scalar multiplications (e.g. `batch_mul` in biggroup)**: The Strauss MSM algorithm uses windowing and precomputation, which internally computes combinations of input points (e.g., `P_0 + P_1`) to build lookup tables. These intermediate point operations can trigger cross-round tag violations even though the final weighted result is cryptographically secure. To avoid false positives from these algorithmic optimizations, `batch_mul` temporarily clears all tags, computes the MSM, then assigns the correctly merged tag to the final result (biggroup_impl.hpp).

### 2. **Use `hash_with_origin_tagging()` for VK/Instance Hashing**

Always use the dedicated method for hashing verification keys and verifier instances:

```cpp
// OK: proper origin tag assignment
FF vk_hash = vk->hash_with_origin_tagging(*transcript);
transcript->add_to_hash_buffer("vk_hash", vk_hash);

// Wrong: no origin tags in recursive verification
FF vk_hash = vk->hash();
transcript->add_to_hash_buffer("vk_hash", vk_hash);
```

**Why**: `hash_with_origin_tagging()` uses `extract_transcript_tag()` and `tag_and_serialize()` to ensure all VK commitments get proper origin tags as a side effect of hashing.

### 3. **Test-Specific Utilities**

The transcript class provides test-specific methods for proof manipulation. These should **only** be used in test code:

```cpp
// Test utility for proof tampering
transcript->test_set_proof_parsing_state(0, proof_length);

// Test utility for validation
auto proof_start = transcript->test_get_proof_start();
```

These methods provide controlled access to private proof parsing state without compromising security in production code.

---

## Implementation Notes

### Challenge Buffer Size

`CHALLENGE_BUFFER_SIZE` feeds only the short-challenge path, which splits one hash into two 127-bit challenges:

```cpp
static constexpr size_t CHALLENGE_BUFFER_SIZE = 2;
```

A short challenge is 127 bits (254/2). That is above the BN254 security level stated in [ultra_honk/README.md](../ultra_honk/README.md#security-model).

### Manifest (Testing Only)

For transcript debugging, enable the manifest:

```cpp
transcript->enable_manifest();
// ... run protocol ...
transcript->print();  // Shows all transcript interactions
```

**Note**: Only used in tests, disabled in production for performance.

