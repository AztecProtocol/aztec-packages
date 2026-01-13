---
name: vm2-audit-t0-opcode-control-flow
description: Audit VM2/AVM control flow opcodes for cross-layer consistency. Verifies that JUMP, JUMPI, CALL, STATICCALL, RETURN, REVERT, INTERNALCALL, and INTERNALRETURN correctly update PC, manage contexts, and handle the call stack.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Opcode Control Flow Audit

Audit for control flow bugs across documentation, simulation, tracegen, and PIL layers. Control flow bugs can lead to arbitrary code execution or context escape.

## When to Use
- Auditing JUMP, CALL, RETURN family opcodes
- Checking PC update correctness
- Reviewing context creation/destruction
- Verifying call stack integrity
- Investigating execution flow anomalies

## Severity Assessment

- **Critical**: PC can be set to arbitrary value → code injection
- **Critical**: Context escape → access other contract's memory
- **High**: Call stack corruption → incorrect return addresses
- **Medium**: Off-by-one in PC calculation
- **Low**: Documentation differs but execution correct

## Background: Control Flow in AVM

### Program Counter (PC)
- Points to next instruction to execute
- Normal flow: `PC' = PC + instruction_length`
- JUMP: `PC' = target`
- JUMPI: `PC' = condition ? target : PC + instruction_length`

### Execution Contexts
- Each CALL/STATICCALL creates a new context
- Context has: memory space, PC, gas allocation, msg_sender, address
- RETURN/REVERT destroys context, returns to parent

### Internal Call Stack
- INTERNALCALL pushes return address to stack
- INTERNALRETURN pops and jumps to return address
- Stack overflow/underflow must be detected

## Reference Files

### Documentation
```
yarn-project/simulator/docs/avm/opcodes/jump.md
yarn-project/simulator/docs/avm/opcodes/jumpi.md
yarn-project/simulator/docs/avm/opcodes/call.md
yarn-project/simulator/docs/avm/opcodes/staticcall.md
yarn-project/simulator/docs/avm/opcodes/return.md
yarn-project/simulator/docs/avm/opcodes/revert.md
yarn-project/simulator/docs/avm/opcodes/internalcall.md
yarn-project/simulator/docs/avm/opcodes/internalreturn.md
yarn-project/simulator/docs/avm/execution-lifecycle.md
yarn-project/simulator/docs/avm/external-calls.md
```

### Simulation
```
barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/execution.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/context.cpp
barretenberg/cpp/src/barretenberg/vm2/simulation/context_stack.cpp
```

### Tracegen
```
barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp
```

### PIL
```
barretenberg/cpp/pil/vm2/execution.pil           # PC constraints, context transitions
barretenberg/cpp/pil/vm2/opcodes/internal_call.pil
barretenberg/cpp/pil/vm2/execution/pc.pil        # PC constraints
```

## Control Flow Opcodes

| Opcode | PC Update | Context | Stack | Key Constraint |
|--------|-----------|---------|-------|----------------|
| JUMP | PC' = target | Same | - | target in bounds |
| JUMPI | conditional | Same | - | condition is boolean |
| CALL | PC' = 0 (new ctx) | Create | - | gas allocation |
| STATICCALL | PC' = 0 (new ctx) | Create (static) | - | is_static flag |
| RETURN | PC' = parent_PC+1 | Destroy | - | context hierarchy |
| REVERT | PC' = parent_PC+1 | Destroy | - | discard flag |
| INTERNALCALL | PC' = target | Same | Push | stack limit |
| INTERNALRETURN | PC' = pop() | Same | Pop | stack underflow |

## Workflow

### Step 1: Select Target Opcode
```bash
cat yarn-project/simulator/docs/avm/opcodes/call.md
```

Extract:
1. PC update rule
2. Context behavior
3. Error conditions
4. Gas handling

### Step 2: Verify PC Update in Simulation

Find opcode handler:
```bash
grep -A 50 "void Execution::jump\|void Execution::call" src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

Check PC update:
```cpp
// JUMP
context.set_pc(target);

// Normal instruction
context.set_pc(context.get_pc() + instruction_length);
```

### Step 3: Verify Context Management

For CALL/STATICCALL:
```bash
grep -n "create_context\|push_context\|ContextStack" src/barretenberg/vm2/simulation/
```

Check:
1. New context created with correct parameters
2. Parent context preserved
3. Gas allocation correct
4. is_static flag propagated for STATICCALL

For RETURN/REVERT:
```bash
grep -n "pop_context\|destroy_context" src/barretenberg/vm2/simulation/
```

Check:
1. Current context destroyed
2. Return to correct parent
3. Return data copied correctly
4. REVERT sets failure flag

### Step 4: Verify Internal Call Stack

```bash
grep -n "internal_call_stack\|push\|pop" src/barretenberg/vm2/simulation/gadgets/execution.cpp
```

Check:
1. INTERNALCALL pushes return address (PC + instruction_length)
2. INTERNALRETURN pops and sets PC
3. Stack overflow detected (limit check)
4. Stack underflow detected (empty check)

### Step 5: Verify Tracegen

```bash
grep -n "sel_enter_call\|sel_exit_call\|next_pc" src/barretenberg/vm2/tracegen/execution_trace.cpp
```

Check:
1. `next_pc` computed correctly
2. `sel_enter_call` set for CALL/STATICCALL
3. `sel_exit_call` set for RETURN/REVERT
4. Context ID transitions tracked

### Step 6: Verify PIL Constraints

PC constraints:
```bash
grep -n "next_pc\|pc'" pil/vm2/execution.pil pil/vm2/execution/pc.pil
```

Example constraints:
```pil
// Normal PC advance
sel_normal_flow * (next_pc - pc - instr_length) = 0;

// JUMP
sel_execute_jump * (next_pc - target) = 0;

// JUMPI
sel_execute_jumpi * ((1-condition) * (next_pc - pc - instr_length) + condition * (next_pc - target)) = 0;
```

Context constraints:
```bash
grep -n "sel_enter_call\|sel_exit_call\|parent_id" pil/vm2/execution.pil
```

### Step 7: Cross-Reference Findings

| Opcode | Doc PC | Sim PC | Tracegen PC | PIL PC | Match? |
|--------|--------|--------|-------------|--------|--------|
| JUMP | = target | set_pc(target) | next_pc = target | constrained | Y |
| JUMPI | cond? | ??? | ??? | ??? | ? |

## Common Mismatch Patterns

### 1. PC Off-by-One
```markdown
Doc: PC' = PC + instruction_length (after jump target)
Sim: PC' = target (correct)
But: RETURN sets PC' = parent_PC (should be parent_PC + parent_instr_length)
```
**Severity**: High - returns to wrong instruction

### 2. Missing Target Bounds Check
```markdown
Doc: "target must be within bytecode bounds"
Sim: No bounds check
PIL: No bounds check
```
**Severity**: Critical - can jump to arbitrary code

### 3. JUMPI Condition Not Boolean
```markdown
Doc: "jumps if M[condOffset] != 0"
Sim: Treats any non-zero as true (correct)
PIL: No constraint that condition is actually read from memory
```
**Severity**: High - malicious prover can force arbitrary jumps

### 4. Context ID Not Unique
```markdown
Sim: Creates context with incrementing ID
PIL: No constraint ensuring context_id is unique
```
**Severity**: High - context collision

### 5. Internal Stack Underflow
```markdown
Doc: "INTERNALRETURN errors on empty stack"
Sim: No empty check, returns garbage
```
**Severity**: Critical - arbitrary return address

### 6. STATICCALL Not Propagating is_static
```markdown
Doc: "nested calls inherit static flag"
Sim: New context doesn't set is_static from parent
```
**Severity**: Critical - can modify state in static context

### 7. REVERT Not Setting Discard
```markdown
Doc: "REVERT discards all side effects"
Sim: Sets failure but doesn't propagate discard flag
```
**Severity**: Critical - reverted side effects persist

## Control Flow Security Checks

### JUMP/JUMPI
- [ ] Target within bytecode bounds
- [ ] Target is instruction boundary (not mid-instruction)
- [ ] JUMPI condition from memory read

### CALL/STATICCALL
- [ ] New context isolated from parent
- [ ] Gas correctly allocated (not exceeding available)
- [ ] STATICCALL sets is_static flag
- [ ] Nested static calls remain static

### RETURN/REVERT
- [ ] Returns to correct parent context
- [ ] Return data copied to parent's memory
- [ ] REVERT sets discard flag
- [ ] Context properly destroyed

### INTERNALCALL/INTERNALRETURN
- [ ] Stack overflow check (against MAX_INTERNAL_CALL_DEPTH)
- [ ] Stack underflow check (empty stack)
- [ ] Return address = PC + instruction_length
- [ ] INTERNALRETURN pops correct value

## FALSE POSITIVE FILTERING

### 1. PC Advance Handled Generically
PC advance for normal instructions is handled by default constraint. Don't report as "missing" for individual opcodes.

### 2. Context Creation in Shared Code
Context creation may be in shared context_stack code, not in CALL handler directly.

### 3. Bounds Check at Instruction Fetch
Target bounds may be checked during instruction fetch rather than in JUMP. Verify before reporting.

## Output Format

### Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-t0-opcode-control-flow` |
| Target Opcodes | `{opcode list}` |
| Files Scanned | `{n}` |
| Findings | `{severity counts}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

#### Finding Format
- **ID**: `vm2-audit-t0-opcode-control-flow-{opcode}-{issue}-{layer}`
- **Severity**: Critical / High / Medium / Low
- **Opcode**: `{opcode name}`
- **Expected Behavior**: `{documentation}`
- **Actual Behavior**: `{implementation}`
- **Security Impact**: `{what can go wrong}`
- **File**: `{path}:{line}`
- **Fix**: `{suggestion}`

### JSON File (Required)

Write `vm2-audit-t0-opcode-control-flow.json`:
```json
{
  "skill": "vm2-audit-t0-opcode-control-flow",
  "status": "COMPLETED_WITH_FINDINGS",
  "target_opcodes": ["JUMP", "JUMPI", "CALL", "RETURN"],
  "findings": [{
    "id": "vm2-audit-t0-opcode-control-flow-jump-bounds-sim",
    "severity": "critical",
    "opcode": "JUMP",
    "expected_behavior": "Target within bytecode bounds",
    "actual_behavior": "No bounds check before setting PC",
    "security_impact": "Attacker can jump to arbitrary memory as code",
    "layer": "Simulation",
    "file": "src/barretenberg/vm2/simulation/gadgets/execution.cpp",
    "line": 234,
    "description": "JUMP target not validated against bytecode length",
    "fix": "Add check: if (target >= bytecode.size()) throw OpcodeExecutionException"
  }]
}
```
