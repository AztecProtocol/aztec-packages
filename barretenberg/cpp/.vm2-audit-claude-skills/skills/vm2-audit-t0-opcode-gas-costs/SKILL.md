---
name: vm2-audit-t0-opcode-gas-costs
description: Audit VM2/AVM opcode gas costs for cross-layer consistency. Verifies that documented gas costs (L2 Base, DA Base, addressing overhead) match the constants in aztec_constants.hpp, instruction_spec.cpp, and PIL gas constraints.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Gas Costs Audit

Audit for gas cost mismatches between documentation and implementation across simulation and PIL layers.

## When to Use
- Auditing gas costs for specific opcodes
- Checking gas constant alignment after spec changes
- Reviewing new opcodes for correct gas configuration
- Investigating gas-related test failures

## Severity Assessment

- **Soundness** (malicious prover exploits): High based on exploitability
- **Completeness** (honest prover fails): Critical if reachable via canonical simulation on valid inputs
- **Key principle**: Completeness bugs reachable via canonical tracegen on valid inputs are **Critical**.

- **High**: Documented gas differs from implementation → economic model broken
- **Medium**: Gas constant defined but not used correctly
- **Low**: Documentation unclear but implementation consistent internally

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report bugs.

**RULE 1 — Report first, dismiss later.** Every discrepancy between spec/docs and implementation is a PRELIMINARY FINDING. Report ALL of them first, then only remove in a final filtering pass using the strict criteria below.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if:
  - (a) **Spec explicitly documents the behavior**: The spec/docs explicitly state this behavior is intentional (quote the exact spec text).
  - (b) **Equivalent by algebraic identity**: The PIL and tracegen compute the same value via different but provably equivalent formulas (show the algebraic equivalence concretely).
  - (c) **Dead code**: The code path is provably unreachable because a prior constraint makes the condition impossible (quote the blocking constraint with file:line).
  You MUST NOT construct novel "it's probably fine because..." arguments.

**RULE 3 — Quote or report.** For ANY dismissal, quote the EXACT evidence (spec text, constraint file:line, or algebraic proof). If you cannot quote specific evidence, REPORT.

**RULE 4 — Severity floor.** When in doubt, report as **High**. Only downgrade with quoted evidence proving limited impact.

## Background: Gas Model

Gas costs have multiple components:
- **L2 Base**: Fixed cost for opcode execution
- **DA Base**: Fixed cost for data availability (side effects)
- **L2 Addressing**: 3 gas per indirect/relative memory offset
- **L2 Dynamic**: Variable cost scaling with operand values
- **DA Dynamic**: Variable DA cost scaling with data size

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Gas Costs section
yarn-project/simulator/docs/avm/gas.md          # Gas metering overview
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/common/aztec_constants.hpp   # AVM_*_BASE_L2_GAS, AVM_*_BASE_DA_GAS
barretenberg/cpp/src/barretenberg/vm2/common/instruction_spec.cpp  # GasInfo struct
barretenberg/cpp/src/barretenberg/vm2/simulation/gas_tracker.cpp   # Gas consumption
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp  # Gas event generation
barretenberg/cpp/src/barretenberg/vm2/tracegen/gas_trace.cpp        # Gas trace
```

### PIL
```
barretenberg/cpp/pil/vm2/execution/gas.pil      # Gas constraints
barretenberg/cpp/pil/vm2/precomputed_columns.cpp # Gas constants in precomputed
```

## Gas Cost Components

| Component | Doc Column | Constant Pattern | Instruction Spec Field |
|-----------|------------|------------------|------------------------|
| L2 Base | L2 Base | `AVM_<OPCODE>_BASE_L2_GAS` | `gas_cost.opcode_gas` |
| DA Base | DA Base | `AVM_<OPCODE>_BASE_DA_GAS` | `gas_cost.base_da` |
| L2 Dynamic | Scales with | `AVM_<OPCODE>_DYN_L2_GAS` | `gas_cost.dyn_l2` |
| DA Dynamic | Scales with | `AVM_<OPCODE>_DYN_DA_GAS` | `gas_cost.dyn_da` |
| Addressing | L2 Addressing | Always 3 per indirect/relative | `AVM_ADDRESSING_COST` |

## Workflow

### Step 0: Enumerate ALL Opcodes and Their Gas Costs (MANDATORY)

> **CRITICAL**: Before analyzing any individual opcode, enumerate ALL opcodes and extract their gas cost components.

```bash
# List ALL opcode documentation files
ls yarn-project/simulator/docs/avm/opcodes/*.md

# Extract gas cost tables from all opcode docs
for f in yarn-project/simulator/docs/avm/opcodes/*.md; do
  echo "=== $(basename $f) ==="; grep -A 5 "Gas Costs\|L2 Base\|DA Base" "$f" 2>/dev/null
done

# List all gas constants in aztec_constants.hpp
grep "AVM_.*_BASE_L2_GAS\|AVM_.*_BASE_DA_GAS\|AVM_.*_DYN" src/barretenberg/vm2/common/aztec_constants.hpp

# List all gas entries in instruction spec
grep -B 2 -A 5 "gas_cost" src/barretenberg/vm2/common/instruction_spec.cpp | head -80
```

Build a master checklist:

| Opcode | Doc L2 | Doc DA | Constant L2 | Constant DA | Checked? | Finding? |
|--------|--------|--------|-------------|-------------|----------|----------|

**You MUST check every opcode's gas costs.** Breadth across all opcodes is more important than depth on any single one.

### Step 1: Select Target Opcode(s)
```bash
# View gas costs in documentation
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Example output:
```markdown
## Gas Costs
| Component | Value | Scales with |
|-----------|-------|-------------|
| L2 Base | 12 | - |
| DA Base | 0 | - |
| L2 Addressing | 3 | 3 L2 gas per indirect memory offset |
```

### Step 2: Extract Documented Values

Parse the Gas Costs table:
- L2 Base: e.g., `12`
- DA Base: e.g., `0` or `512`
- Scales with: e.g., `-` (none) or `copySize`

### Step 3: Verify Constants in aztec_constants.hpp
```bash
grep -n "AVM_<OPCODE>_BASE" src/barretenberg/vm2/common/aztec_constants.hpp
```

Example:
```cpp
#define AVM_ADD_BASE_L2_GAS 12
#define AVM_EMITNOTEHASH_BASE_L2_GAS 19275
#define AVM_EMITNOTEHASH_BASE_DA_GAS 512
```

**Compare**: Document value vs constant value

### Step 4: Verify Instruction Spec
```bash
grep -A 10 "ExecutionOpCode::<OPCODE>," src/barretenberg/vm2/common/instruction_spec.cpp
```

Check `GasInfo` struct:
```cpp
.gas_cost = {
    .opcode_gas = AVM_ADD_BASE_L2_GAS,  // Should match constant
    .base_da = 0,                        // Should match doc DA Base
    .dyn_l2 = 0,                         // Should match doc dynamic
    .dyn_da = 0
},
```

### Step 5: Check PIL Gas Constraints
```bash
grep -n "<OPCODE>\|base_l2_gas\|base_da_gas" pil/vm2/execution/gas.pil
```

Verify:
1. Opcode's gas values are used correctly
2. Dynamic gas multipliers applied if documented
3. Addressing cost added appropriately

### Step 6: Cross-Reference Findings

| Opcode | Doc L2 | Doc DA | Constant L2 | Constant DA | Spec L2 | Spec DA | Match? |
|--------|--------|--------|-------------|-------------|---------|---------|--------|
| ADD | 12 | 0 | 12 | - | 12 | 0 | Y |
| EMITNOTEHASH | 19275 | 512 | 19275 | 512 | 19275 | 512 | Y |

## Common Mismatch Patterns

### 1. Constant Value Mismatch
```markdown
Doc: L2 Base = 12
aztec_constants.hpp: #define AVM_ADD_BASE_L2_GAS 15  // MISMATCH!
```
**Severity**: High - economic model differs from spec

### 2. Missing DA Gas Constant
```markdown
Doc: DA Base = 512
aztec_constants.hpp: (no AVM_OPCODE_BASE_DA_GAS defined)
```
**Severity**: High - DA cost not implemented

### 3. Instruction Spec Not Using Constant
```cpp
.gas_cost = {
    .opcode_gas = 12,  // Hardcoded instead of AVM_ADD_BASE_L2_GAS!
    ...
}
```
**Severity**: Medium - constant defined but not used

### 4. Dynamic Gas Missing
```markdown
Doc: Scales with copySize
instruction_spec.cpp: .dyn_l2 = 0  // Should be non-zero!
```
**Severity**: High - dynamic scaling not implemented

### 5. Wrong dyn_gas_id
```cpp
.dyn_gas_id = DynGasId::COPY_SIZE,  // Should be LOG_LENGTH
```
**Severity**: High - wrong operand used for scaling

## Opcodes by Gas Category

### Simple (L2 only, no dynamic)
- ADD, SUB, MUL, DIV, FDIV: ~10-12 L2
- AND, OR, XOR, NOT, SHL, SHR: ~10-15 L2
- EQ, LT, LTE: ~12-15 L2
- MOV, SET: ~5-10 L2
- JUMP, JUMPI: ~5-10 L2

### Side Effects (L2 + DA)
- EMITNOTEHASH: ~19275 L2, 512 DA
- EMITNULLIFIER: ~22000 L2, 512 DA
- SSTORE: High L2, moderate DA
- SENDL2TOL1MSG: L2 + DA

### Dynamic Scaling
- CALLDATACOPY: Scales with copySize
- RETURNDATACOPY: Scales with copySize
- EMITUNENCRYPTEDLOG: Scales with logLength

### Expensive (Crypto)
- POSEIDON2: ~500+ L2
- SHA256COMPRESSION: ~15000+ L2
- KECCAKF1600: ~10000+ L2
- ECADD: ~9000+ L2

## Addressing Gas

Every opcode with memory operands includes addressing overhead:
```
Total L2 = Base L2 + (3 * num_indirect_operands) + (3 * num_relative_operands)
```

This is documented as "L2 Addressing: 3" in all opcodes.

Verify `AVM_ADDRESSING_COST = 3` in constants.

## FALSE POSITIVE FILTERING

### 1. Addressing Gas is Automatic
Addressing gas is added automatically based on addressing mode bits. Don't report as "missing" if base cost matches and addressing is handled generically.

### 2. Dynamic Gas Multiplier vs ID
`dyn_gas_id` specifies WHICH operand to scale by. The multiplier is separate. Don't confuse these.

### 3. Doc Says "~" or "approximately"
Some documentation uses approximate values. Check if within reasonable tolerance.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-gas-costs` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-gas-costs-{opcode}-{component}-{layer}`
- **Severity**: High / Medium / Low
- **Opcode**: `{opcode name}`
- **Component**: `L2_BASE / DA_BASE / DYN_L2 / DYN_DA`
- **Expected**: `{documented value}`
- **Actual**: `{implementation value}`
- **Layer**: `Constant / InstructionSpec / PIL`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-gas-costs.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-gas-costs",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["ADD", "EMITNOTEHASH"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-gas-costs-add-l2base-constant",
    "severity": "high",
    "opcode": "ADD",
    "component": "L2_BASE",
    "expected": "12",
    "actual": "15",
    "layer": "Constant",
    "file": "src/barretenberg/vm2/common/aztec_constants.hpp",
    "line": 187,
    "description": "L2 base gas constant does not match documentation",
    "fix": "Change AVM_ADD_BASE_L2_GAS to 12"
  }]
}
```
