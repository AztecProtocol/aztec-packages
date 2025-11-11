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

### Native vs In-Circuit Modes

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

The mode is set at compile-time.


### Phase and Round Tracking

The transcript maintains state for correct tag assignment:

```cpp
size_t round_index = 0;       // Current protocol round (for origin tags)
bool reception_phase = true;  // Currently receiving data (true) or generating challenges (false)
```

#### Phase Transitions

**When adding/receiving data** (`send_to_verifier`, `receive_from_prover`, `add_to_hash_buffer`):
```cpp
if (!reception_phase) {
    reception_phase = true;  // Switch back to reception
    round_index++;           // Move to next round
}
// Tag assigned: OriginTag(transcript_index, round_index, is_submitted=true)
```

**When generating challenges** (`get_challenge`, `get_challenges`):
```cpp
if (reception_phase) {
    reception_phase = false;  // Switch to challenge generation
    // round_index stays the same - challenges belong to the current round
}
// Tag assigned: OriginTag(transcript_index, round_index, is_submitted=false)
```

**Key insight**: `round_index` increments when returning FROM challenge generation TO data reception, not when generating challenges. This ensures challenges and the round's data share the same round number.

---

## Core Concepts

### Duplex Sponge Construction

Challenge generation uses a duplex construction:

```
c_next = H(c_prev || round_data)
```

- First challenge: `c_0 = H(round_0_data)`
- Subsequent: `c_i = H(c_{i-1} || round_i_data)`
- Generates pairs: `[128-bit, 126-bit, 128-bit, 126-bit, ...]`

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

The transcript's Fiat-Shamir state (`transcript_index` and `round_index`) is **security-critical** and kept private. Access is controlled via a friend function:

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
FF vk_hash = vk->hash_with_origin_tagging(domain_separator, *transcript);
transcript->add_to_hash_buffer("vk_hash", vk_hash);

// Now challenges will depend on the VK hash
auto alpha = transcript->get_challenge<FF>("alpha");
```

**Key point**: Data added here becomes part of the transcript state and **affects all subsequent challenge generation**.

**Use cases**:
- Public inputs (verifier reconstructs, must hash for Fiat-Shamir)
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
  - **Point-at-infinity detection**: `check_point_at_infinity()` used during point reconstruction
- Assigns and validates origin tag (in-circuit mode)

### Challenge Generation

Note that "by default", challenges are `BN254` (`fr`/`field_t`) scalar field elements. However, there are two special cases.

 - When we're verifying proofs where commitments are Grumpkin points (`ECCVMRecursiveVerifier`), the challenges are `fq`/`bigfield` elements.
 - `KeccakTranscript` uses `uint256_t` challenges.

#### `get_challenge<ChallengeType>(const std::string& label) -> ChallengeType`
Generate a single challenge by hashing accumulated round data.

```cpp
auto alpha = transcript->get_challenge<FF>("alpha");
```

**Behavior**:
- Hashes `previous_challenge || current_round_data`
- Clears `current_round_data`
- Increments `round_number`
- Assigns origin tag with `is_submitted=false`

#### `get_challenges<ChallengeType>(std::span<const std::string> labels) -> std::vector<ChallengeType>`
Generate multiple challenges efficiently.

```cpp
auto [beta, gamma] = transcript->get_challenges<FF>({"beta", "gamma"});
```

**Behavior**:
- Generates challenges in pairs `[128-bit, 126-bit]`
- Uses iterative duplex hashing for subsequent pairs
- All challenges from same round get the same origin tag

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

**Use case**: Multiple provers sharing a transcript (e.g., OINK → Decider)

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
    size_t parent_tag;           // Which transcript instance created this value
    numeric::uint256_t child_tag; // Which protocol rounds contributed to this value
    bool instant_death;          // Poison flag - abort on any arithmetic
};
```

#### Parent Tag - Transcript Isolation

Each transcript instance gets a unique ID from the global atomic counter `unique_transcript_index`:

```cpp
// In BaseTranscript constructor (in-circuit mode only)
transcript_index = unique_transcript_index.fetch_add(1);
```

**Special Values**:
- `CONSTANT = size_t(-1)`: Pure compile-time constants (safe everywhere)
- `FREE_WITNESS = size_t(-2)`: Witnesses not derived from transcript (potentially unsafe)

**Enforcement**: Tags with different `parent_tag` values cannot merge (except constants). This prevents mixing values from independent protocol executions.

#### Child Tag - Round Tracking Bitmask

A 256-bit value split into two 128-bit halves:

```
[Upper 128 bits: Challenges] [Lower 128 bits: Submitted Values]
```

- **Bit `i` in lower 128 bits**: This value uses data submitted in round `i`
- **Bit `i` in upper 128 bits**: This value uses a challenge generated in round `i`

**Construction**:
```cpp
// SINGLE BIT EXAMPLES - Values from one round only

// Submitted value in round 3
child_tag = (1 << 3);  // 0x0000...0008 (bit 3 in lower 128 bits)

// Challenge from round 5
child_tag = (1 << (5 + 128));  // 0x0020...0000 (bit 5 in upper 128 bits)


// MULTIPLE BITS EXAMPLES - Values combined from multiple rounds

// Value depending on submitted data from BOTH round 0 AND round 2
child_tag = (1 << 0) | (1 << 2);  // 0x0000...0005 (bits 0 and 2 in lower 128)
// Meaning: "This value incorporates data submitted in rounds 0 AND 2"

// Value depending on challenges from BOTH round 1 AND round 3
child_tag = (1 << (1 + 128)) | (1 << (3 + 128));  // 0x000A...0000 (bits 1 and 3 in upper 128)
// Meaning: "This value incorporates challenges from rounds 1 AND 3"

// Value depending on submitted data (round 0) AND challenge (round 0)
child_tag = (1 << 0) | (1 << (0 + 128));  // 0x0001...0001 (bit 0 in both halves)
// Meaning: "This value uses both the data submitted in round 0 AND the challenge from round 0"

// Complex example: submitted data from rounds 0,1 and challenges from rounds 0,2
child_tag = (1 << 0) | (1 << 1) | (1 << (0 + 128)) | (1 << (2 + 128));
//          0x0005...0003
// Meaning: "This value's computation involved:
//          - Submitted values from rounds 0 and 1
//          - Challenges from rounds 0 and 2"
```

**How multiple bits get set**: When values combine through arithmetic operations (`a + b`, `a * b`), their child_tags merge using **bitwise OR**:
```cpp
// Example: combining values from different rounds
auto a = transcript->receive_from_prover<FF>("a");  // round 0: child_tag = 0x...0001
auto beta = transcript->get_challenge<FF>("beta");  // round 1: child_tag = 0x0002...0000
auto c = transcript->receive_from_prover<FF>("c");  // round 2: child_tag = 0x...0004

auto result = a * beta + c;
// result.child_tag = 0x...0001 | 0x0002...0000 | 0x...0004 = 0x0002...0005
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
    if (tag_a.parent_tag == CONSTANT) {
        *this = tag_b;  // Use tag_b entirely
        return;
    }
    if (tag_b.parent_tag == CONSTANT) {
        *this = tag_a;  // Use tag_a entirely
        return;
    }

    // 3. Handle free witnesses (cannot mix with tracked values)
    if (tag_a.is_free_witness() && !tag_b.is_free_witness() && !tag_b.is_empty()) {
        throw_or_abort("A free witness element should not interact with an element that has an origin");
    }
    // (Similar check for tag_b being free witness)

    // 4. Check transcript isolation (different transcripts cannot interact)
    if (tag_a.parent_tag != tag_b.parent_tag) {
        throw_or_abort("Tags from different transcripts were involved in the same computation");
    }

    // 5. Check cross-round contamination (the critical security check)
    check_child_tags(tag_a.child_tag, tag_b.child_tag);

    // 6. Merge the tags
    parent_tag = tag_a.parent_tag;
    child_tag = tag_a.child_tag | tag_b.child_tag;  // Bitwise OR combines round info
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
//   → child_tag = 0x0000...0001 (bit 0 set in lower 128 bits)

// Verifier generates challenge after round 0 data
auto beta = transcript->get_challenge<FF>("beta");
// beta.get_origin_tag() = OriginTag(transcript_id, round=0, is_submitted=false)
//   → child_tag = 0x0001...0000 (bit 0 set in upper 128 bits)
```

**Tag construction** (in `origin_tag.hpp:OriginTag` constructor):
```cpp
OriginTag(size_t parent_index, size_t child_index, bool is_submitted = true)
    : parent_tag(parent_index)
    , child_tag((static_cast<uint256_t>(1) << (child_index + (is_submitted ? 0 : 128))))
```

- Submitted values: bit shifted by `child_index` (lower 128 bits)
- Challenges: bit shifted by `child_index + 128` (upper 128 bits)

#### 2. Tag Merging Example

With the merge mechanism in place, let's see it in action:

```cpp
auto combined = comm * beta;
// Internally: combined.origin_tag = OriginTag(comm.origin_tag, beta.origin_tag)
//
// Result:
//   parent_tag = transcript_id (must match for both)
//   child_tag = 0x0000...0001 | 0x0001...0000 = 0x0001...0001
//   → Tracks both submitted value (bit 0 lower) and challenge (bit 0 upper) from round 0
```

This merged tag now carries the full provenance: it depends on data submitted in round 0 AND a challenge from round 0.

#### 3. The Cross-Round Check

The critical security check in `check_child_tags()`:

```cpp
void check_child_tags(const uint256_t& tag_a, const uint256_t& tag_b)
{
    const uint128_t* challenges_a = (const uint128_t*)(&tag_a.data[2]);  // Upper 128 bits
    const uint128_t* submitted_a = (const uint128_t*)(&tag_a.data[0]);   // Lower 128 bits

    // Similar for tag_b...

    // VIOLATION: Two submitted values from different rounds mixing without challenges
    if (*challenges_a == 0 && *challenges_b == 0 &&     // Neither has challenge bits set
        *submitted_a != 0 && *submitted_b != 0 &&        // Both have submitted bits set
        *submitted_a != *submitted_b) {                  // From different rounds
        throw_or_abort("Submitted values from 2 different rounds are mixing without challenges");
    }
}
```

**What this prevents**:
```cpp
// Round 0: Prover submits A
transcript->send_to_verifier("A", a);  // a has child_tag = 0x...01 (lower)

// Round 1: After challenges, prover submits B
transcript->send_to_verifier("B", b);  // b has child_tag = 0x...02 (lower)

// INVALID: Directly combining A and B without involving challenges
auto result = a + b;  // ❌ ABORTS - different round submitted values, no challenges
```

**Why this matters**: In Fiat-Shamir protocols, data from different rounds should only interact through challenges. Direct interaction violates protocol structure and may enable attacks.

**Valid pattern**:
```cpp
auto beta = transcript->get_challenge<FF>("beta");  // child_tag = 0x0001...0000 (upper)
auto mixed = a * beta;   // ✅ OK - has challenge bit set
auto result = mixed + b; // ✅ OK - mixed has challenge bit, prevents violation
```



## In-Circuit Transcript Flow (Recursive Verification)

The following diagram illustrates the complete flow of the Poseidon2 in-circuit transcript with origin tag tracking:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECURSIVE VERIFIER (IN-CIRCUIT)                          │
│                    transcript_id = 42 (from global atomic counter)          │
└─────────────────────────────────────────────────────────────────────────────┘

ROUND 0 - PREAMBLE (reception_phase=true, round_index=0)
═══════════════════════════════════════════════════════
** VK hash MUST be the first element added to transcript **

┌──────────────────────────────────────────────┐
│ vk->hash_with_origin_tagging(...)             │──► Internally:
│                                              │    1. extract_transcript_tag(transcript)
│ Returns: vk_hash                             │    2. tag_and_serialize() all VK components
└──────────────────────────────────────────────┘    3. Hash the serialized elements
         │                                          Side effect: Tags all VK commitment witnesses
         ▼                                          (Critical for recursive verification!)
┌──────────────────────────────────┐
│ add_to_hash_buffer("vk_hash", h) │──┐  ** FIRST element in Fiat-Shamir transcript **
└──────────────────────────────────┘  │
                                      │
┌──────────────────────────────────┐  │
│ add_to_hash_buffer("pub_input_0")│──┤
└──────────────────────────────────┘  │
┌──────────────────────────────────┐  ├──► current_round_data: [vk_hash, pub_inputs...]
│ add_to_hash_buffer("pub_input_1")│──┤    Origin tags assigned:
└──────────────────────────────────┘  │    OriginTag(42, 0, is_submitted=true)
         ...                          │    child_tag = 0x0000...0001 (bit 0 lower)
┌──────────────────────────────────┐  │
│ receive_from_prover("w_l")       │──┤    ** Wire commitments received **
└──────────────────────────────────┘  │
┌──────────────────────────────────┐  │
│ receive_from_prover("w_r")       │──┤
└──────────────────────────────────┘  │
┌──────────────────────────────────┐  │
│ receive_from_prover("w_o")       │──┘
└──────────────────────────────────┘
                                           │
                                           │ Phase: reception → challenge generation
                                           ▼
┌──────────────────────────────────┐
│ get_challenges("eta", "eta_two", │──► 1. Sanitize: FREE_WITNESS → CONSTANT (allow hashing)
│                "eta_three")      │    2. Hash: c₀ = Poseidon2(current_round_data)
└──────────────────────────────────┘    3. Split to [128-bit, 126-bit] x3
         │                               4. Clear current_round_data
         │                               5. Set reception_phase = false
         ▼                               6. Assign tag: OriginTag(42, 0, is_submitted=false)
    eta, eta_two, eta_three                child_tag = 0x0001...0000 (bit 0 upper)
    tag = OriginTag(42, 0, false)

    ** All subsequent challenges depend on: H(vk_hash || pub_inputs || wire_comms) **


ROUND 1 - SORTED LIST ACCUMULATOR (reception_phase=false → true, round_index=0 → 1)
════════════════════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────┐
│ receive_from_prover("lookup_read_counts")│──► Phase transition detected!
└──────────────────────────────────────────┘    reception_phase = true
┌──────────────────────────────────────────┐    round_index++ = 1
│ receive_from_prover("lookup_read_tags")  │──┐
└──────────────────────────────────────────┘  │
┌──────────────────────────────────────────┐  ├─► current_round_data: [lookup_comms, w_4...]
│ receive_from_prover("w_4")               │──┘    Origin tag: OriginTag(42, 1, is_submitted=true)
└──────────────────────────────────────────┘       child_tag = 0x0000...0002 (bit 1 lower)
         │
         │ Phase: reception → challenge generation
         ▼
┌──────────────────────────────────┐
│ get_challenges("beta", "gamma")  │──► Generate challenges for log-derivative
└──────────────────────────────────┘    tag = OriginTag(42, 1, is_submitted=false)
         │                               child_tag = 0x0002...0000 (bit 1 upper)
         ▼
    beta, gamma


ROUND 2 - LOG DERIVATIVE INVERSE (reception_phase=false → true, round_index=1 → 2)
═══════════════════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────┐
│ receive_from_prover("lookup_inverses")   │──► Origin tag: OriginTag(42, 2, true)
└──────────────────────────────────────────┘    child_tag = 0x0000...0004 (bit 2 lower)

    ** Example: Tag merging with cross-round values **

    combined = eta * lookup_inverses
         │
         │ Tag Merging:
         │  eta.tag            = OriginTag(42, 0, false) → 0x0001...0000
         │  lookup_inv.tag     = OriginTag(42, 2, true)  → 0x0000...0004
         │  combined.tag       = OriginTag(42, parent)   → 0x0001...0004 (OR'd)
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ check_child_tags(eta.tag, lookup_inv.tag)   │
    └─────────────────────────────────────────────┘
         │
         │ CHECK: Submitted values from different rounds?
         │   challenges_eta   = 0x0001...0000 (non-zero) ✓
         │   submitted_eta    = 0x0000...0000 (zero)
         │   challenges_inv   = 0x0000...0000 (zero)
         │   submitted_inv    = 0x0000...0004 (non-zero)
         │
         │ ✓ PASS: eta has challenge bits, prevents cross-round violation
         │
         ▼
    combined (FF witness with merged tag)


ORIGIN TAG VIOLATION EXAMPLE (Cross-Round Contamination)
═════════════════════════════════════════════════════════

    ┌──────────────────────────────────┐
    │ Round 0: w_l (wire commitment)   │ tag = OriginTag(42, 0, true)
    │          child_tag = 0x...0001   │      (bit 0 in lower 128 bits)
    └──────────────────────────────────┘
                                │
                                │ (eta challenges generated)
                                │
    ┌──────────────────────────────────┐
    │ Round 1: w_4 (4th wire)          │ tag = OriginTag(42, 1, true)
    │          child_tag = 0x...0002   │      (bit 1 in lower 128 bits)
    └──────────────────────────────────┘
                                │
                                ▼
                    ❌ VIOLATION: Direct mixing without challenges
                    result = w_l + w_4
                                │
                    check_child_tags() detects:
                      challenges_w_l = 0 (no challenges involved)
                      challenges_w_4 = 0 (no challenges involved)
                      submitted_w_l  = 0x...0001 (from round 0)
                      submitted_w_4  = 0x...0002 (from round 1)
                      submitted_w_l != submitted_w_4  ← DIFFERENT ROUNDS!

                    → throw_or_abort("Submitted values from 2 different
                                      rounds are mixing without challenges")

    ✅ CORRECT: Must use challenge to combine cross-round values
                    result = eta * w_l + w_4
                      │
                      │ eta.tag has challenge bits from round 0
                      │ → Properly binds the two rounds together
                      ▼
                    OK (merged tag tracks both rounds AND challenge)


VK HASHING WITH ORIGIN TAG ASSIGNMENT
═══════════════════════════════════════

┌────────────────────────────────────────────────────────────────┐
│ VK Hash Computation (via hash_with_origin_tagging())            │
└────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────┐
    │ vk->hash_with_origin_tagging(domain, tx)  │
    └──────────────────────────────────────────┘
                    │
                    ▼
    ┌──────────────────────────────────────────┐
    │ tag = extract_transcript_tag(transcript)  │──► Secure extraction:
    └──────────────────────────────────────────┘    OriginTag(42, round_index, is_submitted=true)
                    │
                    ▼
    ┌──────────────────────────────────────────┐
    │ For each VK component:                   │
    │   frs = tag_and_serialize(component,tag) │──► **Side effect**: Tags all VK commitments!
    │   vk_elements.append(frs)                │    Each commitment witness gets proper origin tag
    └──────────────────────────────────────────┘
                    │
                    ▼
    ┌──────────────────────────────────────────┐
    │ unset_free_witness_tags(vk_elements)     │──► Sanitize: FREE_WITNESS → CONSTANT
    └──────────────────────────────────────────┘    (VK commitments are public, safe to treat as constants)
                    │
                    ▼
    ┌──────────────────────────────────────────┐
    │ vk_hash = HashFunction::hash(vk_elements)│──► Hash the tagged elements directly
    └──────────────────────────────────────────┘
                    │
                    ▼
        vk_hash (FF witness)
                    │
                    ▼
    ┌──────────────────────────────────────────┐
    │ add_to_hash_buffer("vk_hash", vk_hash)   │──► Added to main Fiat-Shamir transcript
    └──────────────────────────────────────────┘    current_round_data: [vk_hash_frs...]


TRANSCRIPT STATE TRACKING
══════════════════════════

    transcript_index: 42           // Unique ID for this transcript (PRIVATE)
    round_index:      0 → 1        // Increments when reception_phase: false → true (PRIVATE)
    reception_phase:  true/false   // Receiving data vs generating challenges (PRIVATE)

    current_round_data:            // Main Fiat-Shamir buffer (cleared on challenge)
    previous_challenge:            // For duplex sponge c_next = H(c_prev || data)

    // Security-critical state is private, accessed via extract_transcript_tag()
```

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

Public inputs are typically **not** in the proof (verifier reconstructs them):

```cpp
// PROVER: Hash but don't add to proof
for (auto& input : public_inputs) {
    transcript->add_to_hash_buffer("public_input", input);
}

// VERIFIER: Hash the reconstructed inputs
std::vector<FF> reconstructed_inputs = get_public_inputs_from_context();
for (auto& input : reconstructed_inputs) {
    transcript->add_to_hash_buffer("public_input", input);
}
```


### Shared Transcript Between Prover Stages

```cpp
// Stage 1: OINK prover
auto transcript = std::make_shared<NativeTranscript>();
OinkProver oink_prover(proving_key, transcript);
oink_prover.prove();
auto oink_proof = transcript->export_proof();  // Extract OINK portion

// Stage 2: Decider prover (continues on same transcript)
DeciderProver decider_prover(proving_key, transcript);
decider_prover.prove();
auto decider_proof = transcript->export_proof();  // Extract Decider portion

// Combined proof: concatenate [oink_proof || decider_proof]
```

---

## Best Practices

### 1. **In-Circuit: Unset Free Witness Tags Carefully**

**What unsetting does**: The `unset_free_witness_tag()` method changes a value's origin tag from `FREE_WITNESS` to `CONSTANT`, allowing it to bypass the free witness security check that normally prevents unconstrained witnesses from mixing with transcript-derived values.

```cpp
// Before: parent_tag = FREE_WITNESS (triggers security checks)
// After:  parent_tag = CONSTANT (can mix with any value)
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

### 2. **Public Inputs Should Not Be in Proof**

Public inputs are publicly known and don't need to be in the proof:

```cpp
// ✅ CORRECT
transcript->add_to_hash_buffer("public_input", input);  // Hash only

// ❌ WRONG (wastes proof space)
transcript->send_to_verifier("public_input", input);
```

### 3. **Use `hash_with_origin_tagging()` for VK/Instance Hashing**

Always use the dedicated method for hashing verification keys and verifier instances:

```cpp
// ✅ CORRECT - proper origin tag assignment
FF vk_hash = vk->hash_with_origin_tagging(domain_separator, *transcript);
transcript->add_to_hash_buffer("vk_hash", vk_hash);

// ❌ WRONG - no origin tags in recursive verification
FF vk_hash = vk->hash();
transcript->add_to_hash_buffer("vk_hash", vk_hash);
```

**Why**: `hash_with_origin_tagging()` uses `extract_transcript_tag()` and `tag_and_serialize()` to ensure all VK commitments get proper origin tags as a side effect of hashing.

### 4. **Test-Specific Utilities**

The transcript class provides test-specific methods for proof manipulation. These should **only** be used in test code:

```cpp
// Test utility for proof tampering
transcript->test_set_proof_parsing_state(0, proof_length);

// Test utility for validation
auto proof_start = transcript->test_get_proof_start();
```

These methods provide controlled access to private proof parsing state without compromising security in production code.

### 5. **Origin Tag Violations in Debug Mode**

If you see origin tag assertions in debug builds:

```
BB_ASSERT(elem.get_origin_tag() == expected_tag)
```

**Common causes**:
1. Mixing values from different transcripts
2. Using free witnesses without proper tagging

**Solution**: Trace the value's origin and ensure it follows Fiat-Shamir causality.

---

## Implementation Notes

### Challenge Buffer Size

Challenges are generated in **pairs** with sizes `[128-bit, 126-bit]`:

```cpp
static constexpr size_t CHALLENGE_BUFFER_SIZE = 2;
```

This matches the security level and field size constraints of the curve.

### Manifest (Testing Only)

For transcript debugging, enable the manifest:

```cpp
transcript->enable_manifest();
// ... run protocol ...
transcript->print();  // Shows all transcript interactions
```

**Note**: Only used in tests, disabled in production for performance.

