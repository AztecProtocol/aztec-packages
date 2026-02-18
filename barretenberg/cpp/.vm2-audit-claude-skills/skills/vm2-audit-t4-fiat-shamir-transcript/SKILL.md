---
name: vm2-audit-t4-fiat-shamir-transcript
description: Audit VM2/AVM and proving system for Fiat-Shamir and transcript security issues. Critical soundness issue where the Fiat-Shamir transformation is incorrectly implemented, allowing arbitrary proofs to be forged through missing VK commitment, uncommitted public inputs, or prover-controlled challenges.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Fiat-Shamir and Transcript Security Audit Skill

## Overview

This skill audits the Fiat-Shamir transformation and transcript handling in VM2/AVM and the proving system. Issues with Fiat-Shamir can completely break cryptographic security, allowing arbitrary proofs to be forged.

**Bug Type**: Soundness (primary), Completeness (secondary)
**Severity**: Critical
**Frequency**: Low

**Note on Completeness**: If transcript handling code crashes or fails on valid inputs during proof generation, this is a **Critical completeness bug** - it blocks legitimate transactions. Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

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
// VK not committed - prover can use different VK per proof!
```

### Vulnerable Pattern: Public Inputs Not Committed

```cpp
// VULNERABLE: Public inputs verified outside Fiat-Shamir
auto challenge = transcript.get_challenge("challenge");
// ... proof verification ...
// Public inputs checked separately, not in transcript
// Prover can change public inputs after getting challenge!
```

### Vulnerable Pattern: Challenge Passed Instead of Derived

```cpp
// VULNERABLE: Challenge received from previous prover
auto challenge = previous_prover.get_challenge();
// Should derive from transcript, not receive!
```

### Vulnerable Pattern: Free Witness Variables

```cpp
// VULNERABLE: Witness used without commitment
auto witness = get_witness(builder);  // Not constrained!
transcript.commit("witness", witness);
// Prover controls witness completely
```

### Secure Pattern: Complete Fiat-Shamir

```cpp
// SECURE: Complete Fiat-Shamir
void prove() {
    // 1. Commit verification key
    transcript.commit("vk", verification_key);

    // 2. Commit public inputs
    transcript.commit("public_inputs", public_inputs);

    // 3. Commit all witness polynomials
    transcript.commit("witness_commitments", commitments);

    // 4. Derive challenges from transcript
    auto challenge = transcript.get_challenge("challenge");

    // 5. All subsequent values derived from transcript
    // Never use externally provided challenges
}
```

### Secure Pattern: Derive Challenges Locally

```cpp
// SECURE: Verifier derives challenge from transcript
void verify() {
    // Derive challenge locally from transcript
    auto challenge = transcript.get_challenge("x");
    // Do not accept challenge from prover
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

## Audit Checklist

1. **Verify VK commitment**:
   - [ ] Is verification key hashed into transcript?
   - [ ] Before any challenges are derived?

2. **Verify public inputs commitment**:
   - [ ] All public inputs in transcript?
   - [ ] Before challenges that depend on them?

3. **Check challenge derivation**:
   - [ ] All challenges derived from transcript?
   - [ ] No externally provided challenges?
   - [ ] No challenges from previous prover stages?

4. **Check witness constraints**:
   - [ ] All witness values constrained?
   - [ ] No "free" witnesses that affect verification?

5. **Verify transcript sharing**:
   - [ ] Prover and verifier use same transcript state?
   - [ ] Correct transcript branching/merging?

6. **Check recursive verification**:
   - [ ] Inner proof transcript properly absorbed?
   - [ ] No shortcuts in transcript handling?

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

## Common Locations to Audit

Fiat-Shamir security is critical in:
- **Transcript**: `barretenberg/cpp/src/barretenberg/transcript/`
- **Honk prover/verifier**: `barretenberg/cpp/src/barretenberg/ultra_honk/`
- **Oink protocol**: `barretenberg/cpp/src/barretenberg/honk/proof_system/`
- **Recursive verifier**: `barretenberg/cpp/src/barretenberg/stdlib/recursion/`
- **VM2 proving**: Any VM2 code that uses transcripts

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/20-fiat-shamir-transcript.md)
- [Missing Boolean Selectors Skill](../vm2-audit-missing-boolean/SKILL.md)
- [Zero-Check Violations Skill](../vm2-audit-zero-check/SKILL.md)

---

## Required Output Format

**IMPORTANT**: When running this audit skill, you MUST end your response with this standardized format.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t4-fiat-shamir-transcript` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-t4-fiat-shamir-transcript-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.cpp:line`
- **Description**: Brief description
- **Exploitability**: high / medium / low
- **Fix**: One-line suggestion

### JSON Output (required)

Write `vm2-audit-t4-fiat-shamir-transcript.json` to output directory:

```json
{
  "skill": "vm2-audit-t4-fiat-shamir-transcript",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "vm2-audit-t4-fiat-shamir-transcript-prover-52-VKHASH",
    "severity": "critical",
    "file": "src/barretenberg/vm2/avm/prover.cpp",
    "line": 52,
    "description": "VK hash not added to transcript",
    "exploitability": "high",
    "fix": "Uncomment VK hash commitment"
  }]
}
```

For no findings: `{"skill": "vm2-audit-t4-fiat-shamir-transcript", "status": "COMPLETED_NO_FINDINGS", "findings": []}`
