---
name: vm2-audit-t0-opcode-gas-dynamics
description: Audit VM2/AVM opcode dynamic gas costs for cross-layer consistency. Verifies that dynamic gas costs scale correctly with operand values (e.g., CALLDATACOPY scales with copy size, EMITUNENCRYPTEDLOG scales with log length).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Gas Dynamics Audit

Audit for dynamic gas cost implementation across documentation, simulation, and PIL.

## When to Use
- Auditing opcodes with variable gas costs
- Checking dynamic gas multiplier correctness
- Reviewing scaling operand identification
- Investigating gas undercharging for large operations
- Verifying new opcodes with dynamic gas

## Severity Assessment

- **High**: Dynamic gas not applied → large operations undercharged
- **High**: Wrong scaling operand → gas based on wrong value
- **Medium**: Multiplier incorrect → over/undercharging
- **Low**: Documentation unclear about scaling formula

## Background: Dynamic Gas

Some operations have gas that scales with input size:
- Copy operations: Gas proportional to bytes copied
- Log emissions: Gas proportional to log length
- Hashing: Gas proportional to input size

Formula:
```
Total Gas = Base Gas + (Dynamic Multiplier × Scaling Value)
```

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/*.md    # Gas Costs "Scales with" column
yarn-project/simulator/docs/avm/gas.md          # Dynamic gas explanation
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/common/instruction_spec.cpp   # dyn_gas_id, dyn_l2, dyn_da
barretenberg/cpp/src/barretenberg/vm2/common/aztec_constants.hpp    # Dynamic gas constants
barretenberg/cpp/src/barretenberg/vm2/simulation/gas_tracker.cpp    # Gas computation
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/gas_trace.cpp
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp
```

### PIL
```
barretenberg/cpp/pil/vm2/execution/gas.pil
```

## Opcodes with Dynamic Gas

| Opcode | Scales With | Doc Column |
|--------|-------------|------------|
| CALLDATACOPY | `copySize` | L2 Dynamic |
| RETURNDATACOPY | `copySize` | L2 Dynamic |
| EMITUNENCRYPTEDLOG | `logLength` | L2 + DA Dynamic |
| TORADIXBE | Output size | L2 Dynamic |

## GasInfo Structure

```cpp
struct GasInfo {
    uint16_t opcode_gas = 0;    // Base L2 gas
    uint16_t base_da = 0;       // Base DA gas
    uint16_t dyn_l2 = 0;        // Dynamic L2 gas per unit
    uint16_t dyn_da = 0;        // Dynamic DA gas per unit
};

// dyn_gas_id specifies WHICH operand to use as scaling value
uint32_t dyn_gas_id = 0;
```

## Workflow

### Step 1: Identify Dynamic Gas Opcodes
```bash
grep -l "Scales with" yarn-project/simulator/docs/avm/opcodes/*.md
```

### Step 2: Extract Documentation
```bash
cat yarn-project/simulator/docs/avm/opcodes/<opcode>.md
```

Look for "Scales with" in Gas Costs table:
```markdown
| Component | Value | Scales with |
|-----------|-------|-------------|
| L2 Base | 100 | - |
| L2 Dynamic | 5 | copySize |
| DA Base | 0 | - |
| DA Dynamic | 10 | copySize |
```

### Step 3: Verify Instruction Spec
```bash
grep -A 15 "ExecutionOpCode::<OPCODE>," src/barretenberg/vm2/common/instruction_spec.cpp
```

Check:
```cpp
.gas_cost = {
    .opcode_gas = 100,     // Base L2
    .base_da = 0,          // Base DA
    .dyn_l2 = 5,           // Dynamic L2 per unit
    .dyn_da = 10           // Dynamic DA per unit
},
.dyn_gas_id = DynGasId::COPY_SIZE,  // Which operand
```

### Step 4: Verify Dynamic Gas ID
```bash
grep -n "DynGasId\|dyn_gas_id" src/barretenberg/vm2/common/instruction_spec.hpp
```

Check that `dyn_gas_id` maps to correct operand:
- `COPY_SIZE`: The size operand for copy operations
- `LOG_LENGTH`: The length operand for log emissions

### Step 5: Verify Gas Calculation
```bash
grep -n "dynamic\|dyn_" src/barretenberg/vm2/simulation/gas_tracker.cpp
```

Verify formula:
```cpp
uint64_t compute_gas() {
    uint64_t l2 = base_l2 + dyn_l2 * scaling_value;
    uint64_t da = base_da + dyn_da * scaling_value;
    return l2 + da;
}
```

### Step 6: Verify PIL Constraints
```bash
grep -n "dyn\|dynamic" pil/vm2/execution/gas.pil
```

Check:
- Dynamic gas columns populated
- Scaling value captured from operand
- Total gas = base + dynamic × scaling

### Step 7: Cross-Reference Findings

| Opcode | Doc Scales | dyn_gas_id | dyn_l2 | dyn_da | Match? |
|--------|------------|------------|--------|--------|--------|
| CALLDATACOPY | copySize | COPY_SIZE | 5 | 0 | Y |
| EMITUNENCRYPTEDLOG | logLength | LOG_LENGTH | 3 | 10 | Y |

## Common Mismatch Patterns

### 1. Missing Dynamic Gas
```markdown
Doc: "Scales with copySize"
Spec: .dyn_l2 = 0, .dyn_da = 0  // No dynamic!
```
**Severity**: High - large operations undercharged

### 2. Wrong Scaling Operand
```cpp
// CALLDATACOPY: should scale with copySize
.dyn_gas_id = DynGasId::DST_OFFSET  // WRONG!
```
**Severity**: High - gas based on wrong value

### 3. Wrong Multiplier
```markdown
Doc: L2 Dynamic = 5
Spec: .dyn_l2 = 3  // WRONG!
```
**Severity**: Medium - over/undercharging

### 4. Dynamic Gas Only for L2, Not DA
```markdown
Doc: Both L2 and DA scale with logLength
Spec: .dyn_l2 = 5, .dyn_da = 0  // Missing DA!
```
**Severity**: High - DA cost not scaling

### 5. PIL Not Constraining Dynamic Gas
```pil
// Only base gas constrained
gas_consumed = base_l2_gas;  // Missing + dyn_l2 * scaling!
```
**Severity**: High - prover can undercharge

### 6. Scaling Value Not Captured
```cpp
// Tracegen doesn't record scaling value
// PIL can't verify dynamic gas
```
**Severity**: High - dynamic gas unverifiable

## Dynamic Gas Calculation Examples

### CALLDATACOPY
```
Total L2 = 100 + 5 * copySize
Total DA = 0

If copySize = 1000:
  Total = 100 + 5 * 1000 = 5100 L2 gas
```

### EMITUNENCRYPTEDLOG
```
Total L2 = 200 + 3 * logLength
Total DA = 50 + 10 * logLength

If logLength = 256:
  L2 = 200 + 3 * 256 = 968
  DA = 50 + 10 * 256 = 2610
```

## FALSE POSITIVE FILTERING

### 1. Base Gas Only (No Scaling)
If "Scales with" column shows "-", the opcode has no dynamic gas. Don't report missing dynamic gas.

### 2. Implicit Scaling via Instruction Size
Some opcodes (SET) have larger instruction for larger immediates. This isn't dynamic gas.

### 3. Addressing Gas
Addressing gas (3 per indirect/relative) is separate from dynamic gas. Don't confuse them.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-gas-dynamics` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-gas-dynamics-{opcode}-{issue}`
- **Severity**: High / Medium / Low
- **Opcode**: `{opcode name}`
- **Expected Scaling**: `{documented scaling}`
- **Actual**: `{implementation}`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-gas-dynamics.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-gas-dynamics",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["CALLDATACOPY", "EMITUNENCRYPTEDLOG"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-gas-dynamics-calldatacopy-dynl2",
    "severity": "high",
    "opcode": "CALLDATACOPY",
    "expected_scaling": "L2 Dynamic = 5 * copySize",
    "actual": "dyn_l2 = 0",
    "file": "src/barretenberg/vm2/common/instruction_spec.cpp",
    "line": 580,
    "description": "Dynamic L2 gas not configured for copy operation",
    "fix": "Set .dyn_l2 = 5 and .dyn_gas_id = DynGasId::COPY_SIZE"
  }]
}
```
