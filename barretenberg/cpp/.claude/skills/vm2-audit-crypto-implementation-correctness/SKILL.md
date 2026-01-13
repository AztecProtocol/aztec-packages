---
name: vm2-audit-crypto-implementation-correctness
description: Audit VM2/AVM cryptographic operation implementations for semantic correctness. Soundness issues where inputs are transposed, endianness is wrong, or algorithm variants differ from specification, producing wrong outputs that still satisfy constraints.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Crypto Implementation Correctness Audit

## Purpose
Find semantic bugs where crypto operations produce wrong outputs despite satisfying constraints: transposed inputs, wrong endianness, algorithm variant mismatches.

## When to Use
- Auditing cryptographic operation implementations (keccak, sha256, poseidon2, etc.)
- Reviewing code that interfaces with external crypto libraries
- Checking input/output ordering and formatting

## Severity
**Soundness**: Wrong crypto outputs that satisfy constraints allow malicious provers to produce invalid proofs. **Critical** for hash functions used in Merkle proofs or commitments.

## Common Bug Patterns

| Pattern | Example | Impact |
|---------|---------|--------|
| **Input transposition** | Swap (a,b) → (b,a) | Wrong hash output |
| **Wrong endianness** | Big vs little endian | Different bytes |
| **Column ordering** | Memory layout mismatch | Wrong state |
| **Algorithm variant** | Keccak vs SHA3 | Different padding |
| **Block size mismatch** | 32 vs 64 byte blocks | Wrong chunking |

## Workflow

### Step 1: Identify Crypto Operations
```bash
grep -rn "keccak\|sha256\|poseidon\|pedersen\|merkle" pil/vm2/ --include="*.pil"
grep -rn "keccak\|sha256\|poseidon\|pedersen\|merkle" src/barretenberg/vm2/ --include="*.cpp"
```

### Step 2: Check Input Ordering

For each crypto call, verify:
1. **Parameter order matches spec**: Is `(a, b, c)` in correct order?
2. **Memory layout matches**: Row vs column major for 2D inputs?
3. **State array indexing**: `state[i][j]` vs `state[j][i]`?

```cpp
// VULNERABLE: Transposed inputs
keccak_f(input[1], input[0]);  // Should be (input[0], input[1])

// VULNERABLE: Wrong matrix access
for (int x = 0; x < 5; x++)
    for (int y = 0; y < 5; y++)
        state[x][y] = ...;  // Keccak spec uses state[x,y] = state[y][x]!
```

### Step 3: Check Endianness

```bash
grep -rn "swap\|reverse\|endian\|htobe\|htole\|be\|le" src/barretenberg/vm2/ --include="*.cpp"
```

Verify byte order matches specification:
- Hash inputs: Usually big-endian
- Field elements: Little-endian (Montgomery form)
- Memory addresses: Platform-dependent

### Step 4: Compare Against Reference

For each crypto function:
1. Find the reference specification (FIPS, NIST, etc.)
2. Check parameter conventions
3. Verify test vectors pass

```bash
# Find test vectors
grep -rn "test_vector\|expected\|0x" src/barretenberg/vm2/test/ --include="*.cpp"
```

### Step 5: Check PIL-Tracegen Consistency

Verify tracegen uses same ordering as PIL expects:
```bash
# PIL column definitions
grep -rn "input_0\|input_1\|state\[" pil/vm2/<component>.pil
# Tracegen assignments
grep -rn "row.input_0\|row.input_1\|row.state" src/barretenberg/vm2/tracegen/<component>*.cpp
```

## Real Bug Example

**PR #18489 - Keccak Input Transposition**:
```cpp
// BEFORE: Inputs transposed relative to Keccak specification
// C++ code had different coordinate convention than standard Keccak
state_matrix[x][y] = ...;  // Wrong: should be state_matrix[y][x]

// AFTER: Correct ordering
state_matrix[y][x] = ...;
```
**Impact**: Keccak outputs completely wrong, but constraints satisfied because tracegen and PIL both use same (wrong) convention.

## Checklist

For each crypto operation:
- [ ] Input order matches spec?
- [ ] Endianness matches spec?
- [ ] 2D array indexing matches spec (row/column order)?
- [ ] Algorithm variant correct (e.g., Keccak-f vs SHA3)?
- [ ] Test vectors from spec pass?
- [ ] PIL and tracegen use same conventions?

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-crypto-implementation-correctness` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-crypto-implementation-correctness-{file}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON File (REQUIRED)

Write to output directory as `vm2-audit-crypto-implementation-correctness.json`:

```json
{
  "skill": "vm2-audit-crypto-implementation-correctness",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-crypto-implementation-correctness-keccak-123-transpose",
      "severity": "critical",
      "file": "src/barretenberg/vm2/simulation/keccak.cpp",
      "line": 123,
      "description": "Keccak state matrix indices transposed: state[x][y] should be state[y][x]",
      "exploitability": "high",
      "fix": "Swap indices to match Keccak-f specification"
    }
  ]
}
```
