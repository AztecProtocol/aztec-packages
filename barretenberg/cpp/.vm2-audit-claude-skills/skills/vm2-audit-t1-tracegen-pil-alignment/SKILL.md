---
name: vm2-audit-t1-tracegen-pil-alignment
description: Audit VM2/AVM for tracegen-PIL alignment issues. Completeness issue where trace generation code does not match PIL constraints, causing valid executions to fail verification due to missing column assignments, incorrect value computation, or event handling mismatches.
version: 2.0.0
---

# VM2 Tracegen-PIL Alignment Audit

## Purpose
Find completeness bugs where tracegen doesn't match PIL constraints, causing valid executions to fail verification.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report misalignments.

**RULE 1 — Report first, dismiss later.** Every mismatch between PIL formula and tracegen assignment is a PRELIMINARY FINDING. If a PIL column uses `flag * expr` but tracegen assigns `expr` unconditionally, report it. If tracegen doesn't set a committed column, report it. Only remove findings in a final pass.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if:
  - (a) **Values are provably equivalent on all paths**: The tracegen assignment produces the EXACT same value as the PIL formula for ALL possible inputs, including edge cases (explain the algebraic equivalence concretely — not "it works because the invariant holds").
  - (b) **Column is assigned in a different tracegen file**: You found the assignment in another file (quote the exact file:line).
  - (c) **Column is `pol constant`** (precomputed, not committed) — these don't need tracegen assignment.
  - (d) **Implicit zero is correct**: The column's PIL formula evaluates to 0 under the conditions where tracegen doesn't set it, AND zero is the default value (explain the specific condition, quote the PIL formula).
  For (d), you MUST verify this is true — do NOT assume "implicit zero is probably fine." Check the PIL formula and confirm 0 satisfies it.

**RULE 3 — Quote or report.** For ANY dismissal, quote BOTH the PIL formula (file:line) AND the tracegen assignment (file:line) proving they match. If you cannot quote both, REPORT.

**RULE 4 — Severity floor.** When in doubt, report as **High**. Completeness bugs reachable via canonical simulation on valid inputs are **Critical**. Only downgrade with concrete evidence the mismatch is unreachable.

## Severity
**Completeness bugs reachable via canonical simulation on valid inputs are Critical.**

## Misalignment Types

| Type | What to look for |
|------|-----------------|
| **Missing Column** | `pol commit X` in PIL but tracegen never sets `C::component_X` |
| **Wrong Computation** | Tracegen uses integer math / `static_cast` where PIL expects field arithmetic |
| **Conditional Missing** | PIL has `col = flag * expr` but tracegen assigns `col = expr` unconditionally |
| **Edge Case Unhandled** | Tracegen doesn't handle size==0, out-of-bounds, or error paths that PIL expects |
| **Discard Not Gated** | PIL multiplies by `(1 - discard)` but tracegen ignores discard flag |
| **Wrong Partition** | `sel = A + B + C` in PIL but tracegen computes sub-selectors with wrong boolean logic |
| **C++ Reference Bug** | Event key/struct uses `const &` that dangles, causing wrong deduplication |
| **Array Size Mismatch** | PIL declares `col[N]` but tracegen only populates N-1 entries |

### Partition Derivation (Type 6)
For `sel = A + B + C`, derive algebraically:
```
sel = double_op + add_op + INFINITY_PRED
double_op = x_match * y_match
INFINITY_PRED = x_match * (1 - y_match)
=> add_op = sel - x_match (NOT the intuitive guess of !x_match && !y_match!)
```

## Component Mapping

These are ALL (PIL, tracegen) pairs. Use this table — do NOT spend time discovering components.

**Core components (HIGH PRIORITY — complex state machines):**

| PIL | Tracegen | Notes |
|-----|----------|-------|
| `execution.pil` + `execution/*.pil` | `execution_trace.cpp` | Main execution loop, addressing, gas, registers, discard |
| `tx.pil`, `tx_context.pil`, `tx_discard.pil` | `tx_trace.cpp` | Transaction phases, public inputs, gas limits, L2-L1 msgs |
| `data_copy.pil` | `data_copy_trace.cpp` | CALLDATACOPY/RETURNDATACOPY with edge cases |
| `context.pil`, `context_stack.pil` | `context_stack_trace.cpp` | Call/return context management |
| `memory.pil` | `memory_trace.cpp` | Memory read/write with permutation selectors |

**Arithmetic/crypto components (MEDIUM PRIORITY):**

| PIL | Tracegen | Notes |
|-----|----------|-------|
| `alu.pil` | `alu_trace.cpp` | ALU ops — watch for integer overflow in shifts |
| `ecc.pil`, `ecc_mem.pil` | `ecc_trace.cpp` | ECC ops — partition derivation is tricky |
| `bitwise.pil` | `bitwise_trace.cpp` | Bitwise — watch for FF truncation in error paths |
| `sha256.pil`, `sha256_mem.pil` | `sha256_trace.cpp` | SHA256 — watch for unreduced sums |
| `poseidon2_hash.pil`, `poseidon2_perm.pil`, `poseidon2_mem.pil` | `poseidon2_trace.cpp` | Poseidon2 |
| `keccakf1600.pil`, `keccak_memory.pil` | `keccakf1600_trace.cpp` | Keccak — watch for state word ordering |
| `to_radix.pil`, `to_radix_mem.pil` | `to_radix_trace.cpp` | ToRadix — check permutation columns on start row |
| `ff_gt.pil` | `field_gt_trace.cpp` | Field GT — check event key types |
| `gt.pil` | `gt_trace.cpp` | Integer GT comparisons |
| `range_check.pil` | `range_check_trace.cpp` | Range checks |
| `scalar_mul.pil` | (uses ecc_trace) | Scalar multiplication |

**Bytecode components:**

| PIL | Tracegen | Notes |
|-----|----------|-------|
| `bytecode/bc_retrieval.pil` | `bytecode_trace.cpp` | Bytecode retrieval |
| `bytecode/bc_hashing.pil` | `bytecode_trace.cpp` | Bytecode hashing |
| `bytecode/bc_decomposition.pil` | `bytecode_trace.cpp` | Bytecode decomposition |
| `bytecode/instr_fetching.pil` | `bytecode_trace.cpp` | Instruction fetching |
| `bytecode/contract_instance_retrieval.pil` | `contract_instance_retrieval_trace.cpp` | Contract instances |
| `bytecode/address_derivation.pil` | `address_derivation_trace.cpp` | Address derivation |
| `bytecode/class_id_derivation.pil` | `class_id_derivation_trace.cpp` | Class ID |

**Opcode-specific components:**

| PIL | Tracegen | Notes |
|-----|----------|-------|
| `opcodes/get_contract_instance.pil` | `opcodes/get_contract_instance_trace.cpp` | Watch for conditional assignment |
| `opcodes/emit_unencrypted_log.pil` | `opcodes/emit_unencrypted_log_trace.cpp` | Log emission |
| `opcodes/emit_nullifier.pil` | `execution_trace.cpp` | In execution trace |
| `opcodes/emit_notehash.pil` | `execution_trace.cpp` | In execution trace |
| `opcodes/sstore.pil` | `execution_trace.cpp` | Storage write |
| `opcodes/sload.pil` | `execution_trace.cpp` | Storage read |
| `opcodes/send_l2_to_l1_msg.pil` | `execution_trace.cpp` | L2-L1 messaging |
| `opcodes/external_call.pil` | `execution_trace.cpp` | External calls |
| `opcodes/get_env_var.pil` | (precomputed + execution) | Environment variables |

**Tree components:**

| PIL | Tracegen | Notes |
|-----|----------|-------|
| `trees/nullifier_check.pil` | `nullifier_tree_check_trace.cpp` | Check should_insert derivation |
| `trees/note_hash_tree_check.pil` | `note_hash_tree_check_trace.cpp` | |
| `trees/merkle_check.pil` | `merkle_check_trace.cpp` | |
| `trees/public_data_check.pil` | `public_data_tree_trace.cpp` | |
| `trees/public_data_squash.pil` | `public_data_tree_trace.cpp` | |
| `trees/l1_to_l2_message_tree_check.pil` | `l1_to_l2_message_tree_trace.cpp` | |
| `trees/retrieved_bytecodes_tree_check.pil` | `retrieved_bytecodes_tree_check.cpp` | |
| `trees/written_public_data_slots_tree_check.pil` | `written_public_data_slots_tree_check_trace.cpp` | |

**Other:**

| PIL | Tracegen | Notes |
|-----|----------|-------|
| `calldata.pil`, `calldata_hashing.pil` | `calldata_trace.cpp` | Calldata processing |
| `internal_call_stack.pil` | `internal_call_stack_trace.cpp` | Internal call stack |
| `precomputed.pil` | `precomputed_trace.cpp` | Precomputed tables |
| `public_inputs.pil` | `public_inputs_trace.cpp` | Public inputs |
| `bytecode/update_check.pil` | `update_check_trace.cpp` | Update checks |

## Workflow

> **BUDGET RULE**: You have finite context. Allocate it as: 30% red-flag scans, 50% component analysis, 20% write-up. Do NOT spend more than 3 tool calls on any single component during the scan phase. Keep finding descriptions to 2-4 sentences — focus on the MISMATCH, not elaborate exploit chains.

### Phase 1: Red-Flag Scans (30% of budget)

Run these 5 targeted searches to identify high-priority components. Execute all in parallel:

**Scan A — Conditional PIL formulas** (catches "tracegen assigns unconditionally" bugs):
```bash
grep -rn "= .*\* (" pil/vm2/ --include="*.pil" | grep -v "^.*:.*pol " | grep -v "//" | head -60
```

**Scan B — TODO/FIXME in PIL** (catches incomplete constraints):
```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" pil/vm2/ --include="*.pil"
```

**Scan C — Discard references** (catches missing discard gating):
```bash
grep -rn "discard" pil/vm2/ --include="*.pil" | head -40
grep -rn "discard" src/barretenberg/vm2/tracegen/ --include="*.cpp" | head -40
```

**Scan D — Event struct references** (catches dangling reference bugs):
```bash
grep -rn "const.*&\|const FF&\|const.*ref" src/barretenberg/vm2/simulation/events/ --include="*.hpp" | grep -v "\/\/" | head -40
```

**Scan E — Array declarations vs assignments** (catches size mismatches):
```bash
grep -rn "pol commit.*\[" pil/vm2/ --include="*.pil" | head -30
```

From these scans, identify the TOP 8-10 components with the most red flags. These become your deep-dive targets.

### Phase 2: Component Analysis (50% of budget)

Work through components in priority order from Phase 1. For EACH component:

**Step 2a — Read the PIL file** (focus on):
- `pol commit` declarations — especially columns with conditional formulas (`col = flag * expr`)
- Interaction/permutation tuples — list ALL columns in each `} is` or `} in` block
- Edge case handling — zero-size, out-of-bounds, error selectors

**Step 2b — Read the tracegen file** (focus on):
- Column assignments — does every `pol commit` get assigned?
- Conditional logic — does tracegen check the same conditions as PIL?
- Event field usage — which event fields does tracegen read?

**Step 2c — Compare** (the actual analysis):
For each committed column with a conditional PIL formula:
1. What condition does PIL use? (e.g., `is_valid * (dst + 1)`)
2. What does tracegen set? (e.g., always `dst + 1`)
3. Do they match on ALL paths? (especially error/edge paths)

For each permutation/lookup:
1. List ALL columns in the tuple
2. Are ALL of them assigned in tracegen?
3. Are they assigned on the correct rows? (start row? every row?)

**CRITICAL**: After analyzing each component, immediately write down any findings before moving to the next. Do NOT accumulate findings in memory across many components.

**Move on after at most 5 tool calls per component** in Phase 2. Breadth across 8-10 components beats depth on 2-3.

### Phase 3: Coverage and Write-up (20% of budget)

**3a — Coverage table (MANDATORY)**: List every component from the mapping table above with status:

| Component | PIL files | Tracegen file | Scanned? | Deep-analyzed? | Findings |
|-----------|-----------|--------------|----------|---------------|----------|

**3b — Write findings JSON and report**

## Targeted Check Patterns

Apply these specific patterns during Phase 2 analysis. Each pattern corresponds to a known class of bugs:

### Pattern 1: Conditional-vs-Unconditional Assignment
```
PIL:     member_write_offset = is_valid_writes_in_bounds * (dst_offset + 1);
Tracegen: row.member_write_offset = dst_offset + 1;  // MISSING THE CONDITIONAL!
```
**Where to look**: Any PIL column defined as `flag * expr`. Check if tracegen always assigns `expr`.

### Pattern 2: Edge Case at Zero
```
PIL:     copy_count = sel_perform_copy * write_count;
Tracegen: only handles copy_count > 0 path
```
**Where to look**: data_copy (copy_size==0), get_contract_instance (out-of-bounds), any component with size/count variables.

### Pattern 3: Discard/Revert Not Considered
```
PIL:     sel_should_append = sel_write * (1 - discard);
Tracegen: row.sel_should_append = event.is_write;  // MISSING DISCARD CHECK!
```
**Where to look**: tx.pil (L2-L1 messages, note hashes, nullifiers), execution opcodes with side effects.

### Pattern 4: Permutation Tuple Incomplete
```
PIL:     start { execution_clk, space_id, value } is execution.sel_dispatch { ... }
Tracegen: sets value on start row but NOT execution_clk or space_id
```
**Where to look**: Any permutation (`} is`) — verify EVERY column in the source tuple is assigned in tracegen on the rows where the selector is 1.

### Pattern 5: Event Key/Struct Reference Bugs
```cpp
struct Key { const FF& a; const FF& b; };  // DANGLING after event destroyed!
```
**Where to look**: `src/barretenberg/vm2/simulation/events/*.hpp` — any Key/dedup struct with `const &` fields.

### Pattern 6: Integer Overflow in Tracegen
```cpp
uint128_t result = static_cast<uint128_t>(1) << shift_amount;  // UB if >= 128!
```
**Where to look**: alu_trace.cpp (shifts), bitwise_trace.cpp (FF truncation), sha256_trace.cpp (unreduced sums).

### Pattern 7: Start-Row Column Completeness
```
PIL:     start * (col - expr) = 0;  // Only constrains on start rows
Tracegen: sets col on ALL rows    // Fine — extra assignments don't hurt
```
**BUT if tracegen ONLY sets col on non-start rows, it's a bug.** Check that columns constrained by `start *` are assigned on start rows.

## FALSE POSITIVE FILTERING

**Do NOT report**:
1. Columns that are assigned via `trace.set()` with column enum constants (not `row.col` syntax)
2. Columns assigned in a different tracegen file than expected (check ALL tracegen files before reporting missing)
3. Columns that are `pol constant` (precomputed, not committed) — these don't need tracegen assignment
4. Columns only constrained inside commented-out blocks
5. Dead/placeholder columns with only boolean self-check — report as Low severity only

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-tracegen-pil-alignment` |
| Target | `{path}` |
| Files Scanned | `{n}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### JSON File (Required)
Write `vm2-audit-t1-tracegen-pil-alignment.json`:
```json
{
  "skill": "vm2-audit-t1-tracegen-pil-alignment",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [{
    "id": "...", "severity": "critical",
    "files": ["path/to/pil.pil", "path/to/trace.cpp"],
    "line": 123,
    "description": "2-4 sentence description of the mismatch and impact.",
    "fix": "One-line suggested fix"
  }]
}
```
