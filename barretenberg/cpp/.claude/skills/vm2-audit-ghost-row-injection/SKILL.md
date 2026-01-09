---
name: vm2-audit-ghost-row-injection
description: Test if a selector-outside-active vulnerability is exploitable via ghost row injection. When a sub-selector can fire a PERMUTATION from inactive rows, test if an attacker can create legitimate destination rows to match the ghost source. This is the attack that succeeded against sstore.pil.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Ghost Row Injection Attack Audit

## When to Use This Skill

Use this skill when:
1. The `vm2-audit-selector-outside-active` skill found a missing implication constraint
2. The unconstrained sub-selector fires a **PERMUTATION** (not lookup)
3. You need to determine if the vulnerability is actually exploitable

**This skill tests the specific attack pattern that succeeded against sstore.pil.**

## The Attack Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    GHOST ROW INJECTION ATTACK                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SOURCE TRACE (e.g., execution/sstore)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Row N: main_sel=0, sub_sel=1  ← GHOST ROW               │    │
│  │        Fires permutation with arbitrary values           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           │ PERMUTATION                          │
│                           ▼                                      │
│  DESTINATION TRACE (e.g., public_data_check)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Row M: sel=1, dest_sel=1  ← LEGITIMATE ROW              │    │
│  │        Created via simulation gadgets                    │    │
│  │        All cryptographic constraints satisfied           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  RESULT: Permutation matches! Attack succeeds.                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why "Destination Protection" Fails

Common misconception: "The destination has `write * (1 - sel) = 0`, so ghost rows can't match."

**WRONG.** This constraint only prevents ghost DESTINATIONS (sel=0). It does NOT prevent:
- Ghost SOURCES (source_sel=0) matching legitimate DESTINATIONS (dest_sel=1)
- Attackers creating legitimate destination rows via simulation

## Step-by-Step Attack Test

### Step 1: Identify the Permutation

Find the permutation fired by the unconstrained sub-selector:

```bash
# In the source PIL file, find permutations using the sub-selector
grep -n "sub_selector.*is\|sub_selector {" pil/vm2/source.pil
```

Example from sstore.pil:
```pil
#[STORAGE_WRITE]
sel_write_public_data {
    register[0], contract_address, register[1], discard,
    prev_public_data_tree_root, public_data_tree_root,
    prev_public_data_tree_size, public_data_tree_size,
    precomputed.clk
} is public_data_check.non_protocol_write {
    value, address, slot, discard,
    root, write_root,
    tree_size_before_write, tree_size_after_write,
    clk
};
```

### Step 2: Identify the Destination Trace

Find the destination trace and its simulation gadget:

```bash
# Find the destination trace builder
ls src/barretenberg/vm2/tracegen/*trace*.cpp | xargs grep -l "destination_name"

# Find the simulation gadget that creates events
ls src/barretenberg/vm2/simulation/gadgets/*.hpp | xargs grep -l "DestinationEvent"
```

### Step 3: Check if Destination Can Be Legitimately Populated

**Key question**: Can simulation gadgets create events with attacker-controlled values?

```bash
# Look at the gadget's public methods
grep -n "public:" -A 50 src/barretenberg/vm2/simulation/gadgets/destination_gadget.hpp
```

If the gadget has methods like `write()`, `insert()`, `check()` that accept arbitrary values, the answer is YES.

### Step 4: Write the Full Attack Test

```cpp
#include "barretenberg/vm2/simulation/gadgets/destination_gadget.hpp"
#include "barretenberg/vm2/tracegen/destination_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

TEST(SourceTest, NegativeGhostRowInjectionAttack)
{
    // ========== STEP 1: Set up simulation gadgets ==========
    // Use the same setup as legitimate integration tests
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockMerkleCheck> merkle_check;

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const auto& inputs) {
        return RawPoseidon2::hash(inputs);
    });
    EXPECT_CALL(field_gt, ff_gt(_, _)).WillRepeatedly([](const FF& a, const FF& b) {
        return static_cast<uint256_t>(a) > static_cast<uint256_t>(b);
    });
    EXPECT_CALL(merkle_check, write).WillRepeatedly(
        [](FF, FF new_leaf, uint64_t idx, std::span<const FF> path, FF) {
            return unconstrained_root_from_path(new_leaf, idx, path);
        });

    // ========== STEP 2: Create destination events with MALICIOUS values ==========
    EventEmitter<DestinationEvent> emitter;
    DestinationGadget gadget(poseidon2, merkle_check, field_gt, emitter);

    // ATTACKER-CONTROLLED values
    FF malicious_slot = 666;
    FF malicious_value = 999;
    AztecAddress malicious_address = 0xDEADBEEF;

    // Create legitimate events (same as honest prover would)
    auto result = gadget.write(malicious_slot, malicious_address, malicious_value, ...);

    // ========== STEP 3: Build destination trace (LEGITIMATE rows) ==========
    TestTraceContainer trace;
    DestinationTraceBuilder dest_builder;
    dest_builder.process(emitter.dump_events(), trace);

    // ========== STEP 4: Find destination row placement ==========
    uint32_t dest_row = 0;
    FF dest_clk = 0;
    for (uint32_t row = 0; row < 100; row++) {
        if (trace.get(C::destination_perm_selector, row) == 1) {
            dest_row = row;
            dest_clk = trace.get(C::destination_clk, row);
            break;
        }
    }
    std::cout << "Destination row at " << dest_row << " with clk=" << dest_clk << std::endl;

    // ========== STEP 5: Inject GHOST source row ==========
    // Place ghost row where precomputed_clk matches destination clk
    uint32_t ghost_row = static_cast<uint32_t>(static_cast<uint64_t>(dest_clk));
    std::cout << "Placing ghost source at row " << ghost_row << std::endl;

    // GHOST ROW: main selector OFF, sub-selector ON
    trace.set(C::source_main_sel, ghost_row, 0);      // NOT executing legitimately
    trace.set(C::source_sub_selector, ghost_row, 1);  // But firing the permutation!

    // Set permutation tuple values to match destination
    trace.set(C::source_value, ghost_row, malicious_value);
    trace.set(C::source_slot, ghost_row, malicious_slot);
    trace.set(C::source_address, ghost_row, malicious_address);
    // ... other permutation columns ...

    // Set precomputed columns
    trace.set(C::precomputed_clk, ghost_row, ghost_row);

    // ========== STEP 6: Verify attack ==========
    std::cout << "\n=== CHECKING ATTACK ===" << std::endl;

    // Source relation should PASS (this is the vulnerability)
    std::cout << "Source relation: ";
    check_relation<SourceRelation>(trace);
    std::cout << "PASSED (vulnerability confirmed)" << std::endl;

    // Destination relation should PASS (legitimate rows)
    std::cout << "Destination relation: ";
    check_relation<DestinationRelation>(trace);
    std::cout << "PASSED" << std::endl;

    // Permutation - this is the critical check
    std::cout << "Permutation: ";
    bool attack_succeeded = false;
    try {
        check_permutation<SourceTraceBuilder, perm_settings>(trace);
        attack_succeeded = true;
        std::cout << "PASSED" << std::endl;
    } catch (const std::exception& e) {
        std::cout << "FAILED - " << e.what() << std::endl;
    }

    // ========== STEP 7: Report result ==========
    std::cout << "\n=== ATTACK RESULT ===" << std::endl;
    if (attack_succeeded) {
        std::cout << "CRITICAL: Ghost row injection SUCCEEDED!" << std::endl;
        std::cout << "Attacker can inject arbitrary operations." << std::endl;
        std::cout << "\nRequired fix in source.pil:" << std::endl;
        std::cout << "  #[SUB_SELECTOR_REQUIRES_MAIN_SEL]" << std::endl;
        std::cout << "  sub_selector * (1 - main_sel) = 0;" << std::endl;

        // Test documents vulnerability - expect success until fixed
        EXPECT_TRUE(attack_succeeded);
    } else {
        std::cout << "Attack blocked." << std::endl;
        EXPECT_FALSE(attack_succeeded);
    }
}
```

### Step 5: Run the Test

```bash
# Build
ninja vm2_tests

# Run
./bin/vm2_tests --gtest_filter="*GhostRowInjection*"
```

## Interpreting Results

| Source Relation | Dest Relation | Permutation | Result |
|-----------------|---------------|-------------|--------|
| PASS | PASS | PASS | **CRITICAL** - Attack succeeds |
| PASS | PASS | FAIL | Blocked by clk mismatch - try aligning clk values |
| PASS | FAIL | - | Blocked by destination constraints - check which failed |
| FAIL | - | - | No vulnerability (constraint exists) |

## Common Blocking Factors

### CLK Mismatch
The permutation tuple often includes clock values:
- Source uses `precomputed.clk` (row number)
- Destination uses committed `clk` column

**Solution**: Place ghost row at row N where N equals the destination's clk value.

### START_CONDITION
Some traces have: `sel' * (1 - sel) * (1 - first_row) = 0`

This requires trace continuity. The destination trace builder handles this automatically.

### Cryptographic Constraints
Destinations often require valid hashes/proofs. Using simulation gadgets handles this automatically.

## Real-World Example: SSTORE Attack

```cpp
// From storage_write.test.cpp
TEST(SStoreConstrainingTest, NegativeFullAttackWithAllTraces)
{
    // Uses PublicDataTreeCheck simulation gadget
    // Creates events with malicious slot/value/address
    // Builds public_data_check trace (legitimate rows)
    // Injects ghost sstore row at row 0
    // Result: Attack SUCCEEDED
}
```

**Output**:
```
Ghost sstore row at row 0 with precomputed_clk=0
public_data_check write row at row 1 with clk=0

sstore relation: PASSED
public_data_check relation: PASSED
STORAGE_WRITE permutation: PASSED

CRITICAL: Attack SUCCEEDED!
```

## Fix Pattern

Add the implication constraint to the source PIL:

```pil
// Before (vulnerable):
pol commit sub_selector;
main_sel * (condition - sub_selector) = 0;
// sub_selector unconstrained when main_sel = 0

// After (fixed):
pol commit sub_selector;
main_sel * (condition - sub_selector) = 0;
#[SUB_SELECTOR_REQUIRES_MAIN_SEL]
sub_selector * (1 - main_sel) = 0;
// sub_selector forced to 0 when main_sel = 0
```

## Checklist

- [ ] Identified the permutation fired by unconstrained sub-selector
- [ ] Found the destination trace and simulation gadget
- [ ] Confirmed gadget accepts arbitrary values
- [ ] Wrote full attack test using simulation gadgets
- [ ] Placed ghost row where clk values align
- [ ] Ran test and confirmed attack succeeds/fails
- [ ] If attack succeeds: documented as CRITICAL, proposed fix
- [ ] If attack fails: documented blocking factor

## References

- Parent skill: `vm2-audit-selector-outside-active`
- SSTORE vulnerability: `pil/vm2/claude-audits/selector-outside-active-take2/sstore-vulnerability-analysis.md`
- SSTORE attack test: `src/barretenberg/vm2/constraining/relations/storage_write.test.cpp`

---

## Required Output Format

**IMPORTANT**: When running this audit skill, you MUST end your response with this standardized format.

### Findings Summary

At the end of your audit, provide a summary section:

```markdown
## Audit Results

### Summary
| Item | Value |
|------|-------|
| Skill | vm2-audit-ghost-row-injection |
| Target | [path that was audited] |
| Files Scanned | [number] |
| Findings | [count by severity, e.g., "2 Critical, 1 High, 0 Medium, 0 Low"] |
| Status | COMPLETED_WITH_FINDINGS / COMPLETED_NO_FINDINGS / ERROR |

### Findings

#### Finding vm2-audit-ghost-row-injection-[file]-[line]-[subtype] [SEVERITY]
- **File**: `path/to/file.pil:line`
- **Type**: [specific vulnerability type]
- **Affected Column/Constraint**: [name]
- **Description**: [brief description]
- **Exploitability**: [High/Medium/Low] - [brief rationale]
- **Suggested Fix**: [one-line fix suggestion]

[Repeat for each finding]
```

### Machine-Readable Findings

After the human-readable summary, include a JSON block:

```markdown
<!-- MACHINE-READABLE FINDINGS (do not edit manually) -->
```json
{
  "skill": "vm2-audit-ghost-row-injection",
  "finding_prefix": "vm2-audit-ghost-row-injection",
  "status": "COMPLETED_WITH_FINDINGS | COMPLETED_NO_FINDINGS | ERROR",
  "target": "pil/vm2",
  "files_scanned": 0,
  "findings": [
    {
      "id": "vm2-audit-ghost-row-injection-filename-line-subtype",
      "severity": "critical|high|medium|low",
      "file": "path/to/file.pil",
      "line": 123,
      "type": "specific-vulnerability-type",
      "column": "affected_column_name",
      "description": "Brief description of the issue",
      "exploitability": "high|medium|low",
      "fix": "Suggested fix"
    }
  ]
}
```
<!-- END MACHINE-READABLE FINDINGS -->
```

### Finding ID Convention

- Format: `vm2-audit-ghost-row-injection-[filename]-[line]-[subtype]`
- Example: `vm2-audit-ghost-row-injection-alu-123-SEL`
- Use lowercase for filename (without extension)
- Use CAPS for subtype descriptors

### Status Values

- `COMPLETED_NO_FINDINGS` - Audit completed, no issues found
- `COMPLETED_WITH_FINDINGS` - Audit completed, issues found
- `ERROR` - Audit could not complete (explain in description)
