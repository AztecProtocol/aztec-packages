---
name: vm2-audit-fiat-shamir-transcript
description: Audit VM2/AVM and proving system for Fiat-Shamir and transcript security issues. Critical soundness issue where the Fiat-Shamir transformation is incorrectly implemented, allowing arbitrary proofs to be forged through missing VK commitment, uncommitted public inputs, or prover-controlled challenges.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Fiat-Shamir and Transcript Security Audit Skill

## Overview

This skill audits the Fiat-Shamir transformation and transcript handling in VM2/AVM and the proving system. Issues with Fiat-Shamir can completely break cryptographic security, allowing arbitrary proofs to be forged.

## Why This is Critical

This is the **most severe** vulnerability class because:
- Fiat-Shamir converts interactive proofs to non-interactive
- If broken, **any statement can be "proven"**
- Affects the entire proving system, not just VM
- Complete protocol break

## Fiat-Shamir Overview

The Fiat-Shamir heuristic:
1. Prover commits to values (transcript)
2. Challenges derived from transcript hash
3. Prover cannot influence challenges after commitment

If prover can control challenges or omit commitments, security breaks.

## Audit Instructions

> **Note**: This skill applies to proving system code, not just PIL files.

### Step 1: Check VK Commitment

```bash
# Find transcript operations
grep -rn "transcript.*commit\|transcript.*send" barretenberg/cpp/src/barretenberg/ --include="*.cpp"

# Look for VK in transcript
grep -rn "verification_key\|vk" barretenberg/cpp/src/barretenberg/ --include="*.cpp" | grep -i transcript
```

Verify:
- Verification key is hashed into transcript
- Before any challenges are derived

### Step 2: Check Public Inputs Commitment

```bash
# Find public input handling
grep -rn "public_input" barretenberg/cpp/src/barretenberg/ --include="*.cpp" | grep -i transcript
```

Verify:
- All public inputs in transcript
- Before challenges that depend on them

### Step 3: Check Challenge Derivation

```bash
# Find challenge generation
grep -rn "get_challenge\|derive_challenge" barretenberg/cpp/src/barretenberg/ --include="*.cpp"

# Find challenge usage
grep -rn "challenge" barretenberg/cpp/src/barretenberg/vm2/ --include="*.cpp"
```

Verify:
- All challenges derived from transcript
- No externally provided challenges
- No challenges from previous prover stages passed directly

### Step 4: Check Witness Constraints

```bash
# Find witness handling
grep -rn "add_variable\|witness" barretenberg/cpp/src/barretenberg/ --include="*.cpp"
```

Verify:
- All witness values constrained
- No "free" witnesses that affect verification

### Step 5: Verify Transcript Sharing

```bash
# Find transcript branching/merging
grep -rn "branch\|merge\|fork" barretenberg/cpp/src/barretenberg/ --include="*.cpp" | grep -i transcript
```

Verify:
- Prover and verifier use same transcript state
- Correct transcript branching/merging

### Step 6: Check Recursive Verification

```bash
# Find recursive verification
grep -rn "recursive\|inner.*proof\|RecursiveVerifier" barretenberg/cpp/src/barretenberg/ --include="*.cpp"
```

Verify:
- Inner proof transcript properly absorbed
- No shortcuts in transcript handling

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Missing VK in Transcript

```cpp
// VULNERABLE: Verification key not hashed
transcript.commit("public_inputs", public_inputs);
auto challenge = transcript.get_challenge("challenge");
```

### Vulnerable Pattern: Public Inputs Not Committed

```cpp
// VULNERABLE: Public inputs verified outside Fiat-Shamir
auto challenge = transcript.get_challenge("challenge");
```

### Vulnerable Pattern: Challenge Passed Instead of Derived

```cpp
// VULNERABLE: Challenge received from previous prover
auto challenge = previous_prover.get_challenge();
```

### Vulnerable Pattern: Free Witness Variables

```cpp
// VULNERABLE: Witness used without commitment
auto witness = get_witness(builder);  // Not constrained!
transcript.commit("witness", witness);
```

### Secure Pattern: Complete Fiat-Shamir

```cpp
// SECURE: Complete Fiat-Shamir
void prove() {
    transcript.commit("vk", verification_key);
    transcript.commit("public_inputs", public_inputs);
    transcript.commit("witness_commitments", commitments);
    auto challenge = transcript.get_challenge("challenge");
}
```

### Secure Pattern: Derive Challenges Locally

```cpp
// SECURE: Verifier derives challenge from transcript
void verify() {
    auto challenge = transcript.get_challenge("x");
}
```

## Historical Examples

### Example 1: VK Not Hashed (PR #14452)

```cpp
// BEFORE: VK not in Fiat-Shamir
// Prover could use different VK for each proof attempt

// AFTER: VK hashed in Oink protocol
transcript.commit("verification_key", vk);
```
**Impact**: Complete protocol break.

### Example 2: Public Inputs Not Committed (PR #16641)

```cpp
// BEFORE: Public inputs verified via multilinear polynomial evaluation
// But not included in Fiat-Shamir transcript!

// AFTER: Public inputs properly committed
transcript.commit("public_inputs", public_inputs);
```
**Impact**: Prover can claim arbitrary public outputs.

### Example 3: Challenge Propagation (PR #12051)

```cpp
// BEFORE: evaluation_challenge_x sent from Prover to Verifier
TranslatorVerifier verifier(evaluation_challenge_x);  // Prover-controlled!

// AFTER: Verifier derives from ECCVMVerifier
auto challenge = eccvm_verifier.get_evaluation_challenge_x();
```
**Impact**: Prover controls challenge, can pass verification.

### Example 4: Unconstrained Padding (PR #13488)

```cpp
// BEFORE: Padding indicator is free witness
auto is_padding = builder.add_variable(padding_value);

// AFTER: Range constrained and derived
auto log_circuit_size = constrain_log_circuit_size(builder, circuit_size);
```
**Impact**: Prover controls padding decisions.

### Example 5: Transcript Index Bug (PR #16641)

```cpp
// BEFORE: Incorrect transcript_index from branch_transcript()
auto index = transcript.branch();  // Wrong index!

// AFTER: Correct transcript management
// Proper transcript branching and merging
```
**Impact**: Challenges derived from wrong state.

## Fix Patterns

### Fix 1: Add VK to Transcript

```cpp
void Oink::prove() {
    // First thing: commit VK
    transcript.commit("verification_key", vk);
    // ... rest of protocol
}
```

### Fix 2: Commit Public Inputs

```cpp
void prove() {
    transcript.commit("public_inputs", public_inputs);
    // Derive challenges after
    auto challenge = transcript.get_challenge("alpha");
}
```

### Fix 3: Derive Challenges Locally

```cpp
// BEFORE:
TranslatorVerifier(prover.get_challenge())

// AFTER:
TranslatorVerifier() {
    auto challenge = transcript.get_challenge("x");
}
```

### Fix 4: Constrain Witnesses

```cpp
// BEFORE:
auto witness = builder.add_variable(value);

// AFTER:
auto witness = builder.add_variable(value);
builder.create_range_constraint(witness, num_bits);
// Or derive from constrained values
```

## References

- See PR history for examples

---

**Output Format**: See [_shared/OUTPUT_FORMAT.md](../_shared/OUTPUT_FORMAT.md) for required output structure.
