---
sidebar_position: 1
---

# AVM Circuit

## Memory
**VM memory** refers to the VM circuit's top-level memory structure. Since the VM circuit executes an entire public execution request, VM memory contains a dedicated region for each of a request's message calls.

**Call memory** refers to a message call's dedicated memory region. Each call's memory region is of the same size `CALL_MEMORY_SIZE` and starts at offset `callMemoryOffset = callPointer * CALL_MEMORY_SIZE`.

### Protected memory and user memory
A call's memory is further divided into protected memory and user memory subregions.

**Protected memory** refers to the subsection of a call's memory region that is not explicitly addressable by user code. Dedicated instructions (like `ADDRESS`, or `JUMP`) can read or write protected memory, but when user code performs an explicit memory access like `M[offset]`, it will never touch protected memory.

**User memory** (otherwise known as `MachineState.memory`) is explicitly addressable by user code. Explicit memory accesses like `M[offset]` performed by user code are accesses of user memory.

#### Protected memory offsets
Protected memory lives at the start of a call's memory region (`callProtectedMemoryOffset = callMemoryOffset + 0`). Protected memory for any call has size `PROTECTED_MEMORY_SIZE`.

A call's `ExecutionEnvironment` and `MachineState` (except for `MachineState.memory`) reside in protected memory, and so each of their members has a dedicated offset. These offsets are referred to according to the following pattern:
- `ENVIRONMENT_ADDRESS_OFFSET`: offset to `ExecutionEnvironment.address` within a call's protected memory subregion
- `ENVIRONMENT_L1GASPRICE`: offset to `ExecutionEnvironment.l1GasPrice` within a call's protected memory subregion
- `MACHINESTATE_L1GASLEFT`: offset to `MachineState.l1GasLeft` within a call's protected memory subregion
- `MACHINESTATE_PC`: offset to `MachineState.pc` within a call's protected memory subregion
- `MACHINESTATE_INTERNALCALLSTACK`: offset to `MachineState.internalCallStack` within a call's protected memory subregion

> Note: A call's `ExecutionEnvironment.bytecode` and `ExecutionEnvironment.calldata` are not included in the protected memory region because they are handled in a special manner. This will be expanded on in a later section.
> For complete definitions of `ExecutionEnvironment` and `MachineState` see the [AVM's high level specification](./avm.md).

#### User memory offsets
User memory comes after protected memory in a call's region (`callUserMemoryOffset = callMemoryOffset + PROTECTED_MEMORY_SIZE`). User memory for any call has size `USER_MEMORY_SIZE`.

A call's user memory is its `MachineState.memory`. When an instruction makes an explicit memory access like `M[userOffset]` (which can also be expressed as `MachineState.memory[userOffset]`), the user code offset translates to an internal memory offset of `userOffset + callUserMemoryOffset`.

#### Protected memory and user memory examples
An instruction like `ADDRESS` serves as great example because it performs a read from protected memory and a write to user memory: `M[dstOffset] = ExecutionEnvironment.address` (see [Instruction Set](./InstructionSet) for more details). Below, this operation is deconstructed into its two memory accesses:
1. `ExecutionEnvironment.address`: a read from VM memory offset `ENVIRONMENT_ADDRESS_OFFSET + callProtectedMemoryOffset`
1. `M[dstOffset] =`: a write to `dstOffset + callUserMemoryOffset`
