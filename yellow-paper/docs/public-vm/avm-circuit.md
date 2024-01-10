---
sidebar_position: 1
---

# AVM Circuit

The AVM circuit's purpose is to prove execution of the correct sequence of instructions for a public execution request. Regardless of whether execution succeeds or reverts, the circuit always generates a valid proof of execution.

## Call pointer
Each message call processed within a single VM circuit execution is assigned a unique **call pointer**. There is certain information that must be tracked by the VM circuit on a per-call basis. For example, each call will correspond to the execution of a different contract's bytecode, and each call will access call-specific memory. As a per-call unique identifier, call pointer enables bytecode and memory lookups, among other things, on a per-call basis.

Call pointers are assigned based on execution order. A request's initial message call is assigned call pointer of `1`. The first nested message call encountered during execution is assigned call pointer of `2`. The VM circuit tracks the highest call pointer assigned thus far, and whenever a nested call instruction is encountered, it increments that value and assigns the result to that call.

### "Input" and "output" call pointers
It is important to note that the initial call's pointer is `1`, not `0`. The zero call pointer is a special case known as the "input" call pointer.

As expanded on later, the VM circuit memory table has a separate section for each call pointer. The memory table section for the **input call pointer** is reserved for the initial call's `AvmContext.calldata`. This will be expanded on later.

## Bytecode table and instruction fetching
The VM circuit's primary purpose is to prove execution of the correct sequence of instructions given a message call's bytecode and inputs. The circuit will prove correct execution of any nested message calls as well. Each nested call will have its own bytecode and inputs, but will be processed within the same circuit.

Thus, a vector is assembled to contain the bytecode for all of a request's message calls (initial and nested). If a request's execution contains message calls to contracts A, B, C, and D (in that order), the VM circuit's bytecode vector will contain A's bytecode, followed by B's, C's, and finally D's. Each one will be zero-padded to some constant length `CONTRACT_BYTECODE_MAX_LENGTH`.

Each entry in the bytecode vector will be paired with a call pointer and program counter. The circuit structure that pairs each instruction with its call pointer and program counter is coined the **bytecode table**.

The circuit's **instruction fetch** mechanism makes use of the bytecode table to determine which instruction to execute next based on the the current call pointer and the next program counter. Each instruction fetch corresponds to a circuit lookup to enforce that the correct instruction is processed for a given contract and program counter.

Each contract's public bytecode is committed to during contract deployment. As part of the AVM circuit verification algorithm, the bytecode vector (as a concatenation of all relevant contract bytecodes) is verified against the corresponding bytecode commitments. This is expanded on in ["Bytecode Validation Circuit"](./bytecode-validation-circuit.md). While the AVM circuit enforces that the correct instructions are executed according to its bytecode table, the verifier checks that bytecode table against the previously validated bytecode commitments.

## Instruction decoding and sub-operations
An instruction (its opcode, flags, and arguments) represents some high-level VM operation. For example, an `ADD` instruction says "add two items from memory and store the result in memory". The VM circuit's **instruction decoder** decodes instructions into sub-operations. A **sub-operation** aligns with some purpose-built VM circuitry. By decoding an instruction into sub-operations, the VM circuit translates high-level instructions into smaller achievable tasks. To continue with the `ADD` example, it would translate "add two items from memory and store the result in memory" to "load an item from memory, load another item from memory, add them, and store the result to memory."

For simple instructions (like `ADD`), the instruction can be fetched and all sub-operations can be processed in a single clock cycle. Since the VM circuit has limited resources, some complex instructions (like `CALLDATACOPY`) involve too many sub-operations to be processed in one clock cycle.
> Note: a "clock cycle" in the AVM circuit represents the smallest subdivision of time during which some parallel operations can be performed. A clock cycle corresponds to a row in the circuit's **operations trace**. Simple instructions correspond to only a single row in this trace, but complex instructions span multiple rows. A `CLK` column tracks the clock cycle for each row and its sub-operations.

User code itself (AVM bytecode) has no concept of "registers", and so instructions often operate directly on user memory. The VM circuit's **memory controller** uses _internal_ registers to stage data between memory and sub-operation chiplets (more on chiplets later). Three internal registers exist: `Ia`, `Ib`, and `Ic`.
> Refer to ["AVM State Model"](./state-model) for more details on the absence of "external registers" in the AVM.

When decoded, instructions that operate on memory map to some memory controller sub-operations. A memory read maps to a `LOAD` sub-operation which loads a word from memory into an internal register. The memory offset for this sub-operation is generally specified by an instruction argument. Similarly, a memory write maps to a `STORE` sub-operation which stores a word from an internal register to memory.

While some instructions (like `MOV` or `SET`) decode into only `LOAD` and `STORE` sub-operations, many instructions (especially arithmetic ones like `ADD`) first load data into internal register(s), perform some computation on those registers, and finally store the results. Such computations are handled by a **chiplet**, which is an independent sub-circuit purpose-built to perform a particular sub-operation.
> Note: the term "chiplet" is borrowed from [Polygon's Miden VM](https://polygon.technology/polygon-miden).

### Example: `ADD` instruction decode and execution
The `ADD` instruction is decoded into two `LOAD` memory controller sub-operations, an `ADD` sub-operation which triggers the ALU chiplet, and a `STORE` memory controller sub-operation.

Take the following `ADD` instruction as an example: `ADD<u32> aOffset bOffset dstOffset`. Assuming this instruction is executed as part of message call with pointer `C`, it is decoded into the following sub-operations:
```
// Load word from call's memory into register Ia (index 0)
LOAD 0 aOffset // Ia = M<C>[aOffset]
// Load word from call's memory into register Ib (index 1)
LOAD 1 bOffset // Ib = M<C>[aOffset]
// Use the ALU chiplet in ADD<32> mode to add registers Ia and Ib
// Place the results in Ic
ADD<u32> // Ic = ALU_ADD<u32>(Ia, Ib)
// Store results of addition from register Ic (index 2) to memory
STORE 2 dstOffset
```

> Note: the `ADD` instruction is an example of a "simple" instruction that can be fully processed in a single clock cycle. All four of the above-listed sub-operations happen in one clock cycle and therefore take up only a single row in the circuit's operations trace.

## Memory
To process a public execution request, the AVM executes the request's initial message call along with any nested calls it encounters. Execution of a message call requires some context including an `AvmContext.ExecutionEnvironment` and `AvmContext.MachineState`. Separate instances of these constructs must exist for each message call.

AVM instructions may read from or write to these constructs (explicitly or indirectly), and therefore it is natural to represent them in the AVM circuit via a memory table. Since each call must have its own `ExecutionEnvironment` and `MachineState`, each entry in the memory table must specify which call it corresponds to. This is accomplished via a `callPointer` column. The memory table is sorted first by `callPointer` and thus all memory accesses for a given message call are grouped.

User code has explicit access to a construct known as **user memory** (`AvmContext.memory` in the high-level specification). When an AVM instruction performs an access like `M[offset]`, it is accessing user memory.

A call's `ExecutionEnvironment` and `MachineState` is not explicitly addressable by user code. This context lives in a construct known as **protected memory** and is accessible only via dedicated instructions (like `ADDRESS`, `JUMP`, `CALL`, etc...).

> Note: the fact that this context is implemented as protected circuit memory is not relevant to user code or even to the high-level AVM specification.

Therefore, for a given call the VM circuit's memory table is subdivided into user and protected memories. This is accomplished via a `userMemory` column which flags each of a call's memory table entries as either a user or protected memory access.

The VM circuit's memory is sorted first by `callPointer` and next by the `userMemory` flag (before standard sorting by memory address, timestamp, etc...). Thus, the memory table is organized as follows:
- VM circuit memory
    - call `0` memory
        - protected memory
        - user memory
    - call `1` memory
        - protected memory
        - user memory
    - ...
    - call `n-1` memory
        - protected memory
        - user memory

### Protected memory offsets
As mentioned above, a call's `ExecutionEnvironment` and `MachineState` reside in protected memory, and so each of their members has a dedicated offset. These offsets are referred to according to the following pattern:
- `ENVIRONMENT_ADDRESS_OFFSET`: offset to `ExecutionEnvironment.address` within a call's protected memory subregion
- `ENVIRONMENT_L1GASPRICE`: offset to `ExecutionEnvironment.l1GasPrice` within a call's protected memory subregion
- `MACHINESTATE_L1GASLEFT`: offset to `MachineState.l1GasLeft` within a call's protected memory subregion
- `MACHINESTATE_PC`: offset to `MachineState.pc` within a call's protected memory subregion
- `MACHINESTATE_INTERNALCALLSTACK`: offset to `MachineState.internalCallStack` within a call's protected memory subregion

> For complete definitions of `ExecutionEnvironment`, `MachineState`, and `AvmContext` see the [AVM's high level specification](./avm.md).

### Protected memory and user memory examples
An instruction like `ADDRESS` serves as great example because it performs a read from protected memory and a write to user memory: `M[dstOffset] = ExecutionEnvironment.address` (see [Instruction Set](./InstructionSet) for more details). Below, this operation is deconstructed into its two memory accesses:
1. `ExecutionEnvironment.address`
    - memory read
    - flags: `callPointer`, `userMemory = 0` (protected memory access)
    - offset: `ENVIRONMENT_ADDRESS_OFFSET`
1. `M[dstOffset] =`
    - memory write
    - flags: `callPointer`, `userMemory = 1` (user memory access)
    - offset: `dstOffset`


## Circuit I/O
### How do "Public Inputs" work in the AVM circuit?
ZK circuit proof systems generally define some mechanism for "public inputs" for which witness values must be communicated in full to a verifier. The AVM proof system defines its own mechanism for public inputs in which it flags certain trace columns as "public input columns". Any public input columns must be communicated in full to a verifier.

### AVM public inputs structure
The VM circuit's I/O is defined as the `AvmPublicInputs` structure detailed below:
```
AvmSideEffects {
    newNoteHashes,
    newNullifiers,
    newL2ToL1Messages,
    unencryptedLogs,
}
AvmPublicInputs {
    initialEnvironment: ExecutionEnvironment & {l1GasLeft, l2GasLeft, daGasLeft},
    calldata: [],
    sideEffects: AvmSideEffects,
    storageAccesses,
    gasResults: {l1GasLeft, l2GasLeft, daGasLeft},
}
```

### AVM public input columns
The `AvmPublicInputs` structure is represented in the VM trace via the following public input columns:
1. `initialEnvironment` has a dedicated column and is used to initialize the initial call's `AvmContext.ExecutionEnvironment` and `AvmContext.MachineState`
1. `calldata` has its own dedicated public input column
1. `sideEffects: AvmSideEffects`
    - This represents the final `AccruedSubstate` of the initial message call
    - There is a separate sub-table (columns) for each side-effect vector
        - Each row in the `newNoteHashes` sub-table contains `{contractAddress, noteHash}`
        - Each row in the `newNullifiers` sub-table contains `{contractAddress, nullifier}`
        - Each row in the `newL2ToL1Messages` sub-table contains `{contractAddress, wordIndex, messageWord}`
            - where a message containing N words takes up N entries with increasing `wordIndex`
        - Each row in the `unencryptedLogs` sub-table contains `{contractAddress, wordIndex, logWord}`
            - where a log containing N words takes up N entries with increasing `wordIndex`
    - Side effects are present in the trace in execution-order
1. `storageAccesses`
    - This contains the first and last public storage access for each slot that is accessed during execution
    - Each row in the `storageAccesses` sub-table contains `{contractAddress, slot, value}`
    - Storage accesses are present in the trace in execution-order
1. `gasResults: AvmGasResults`
    - This is derived from the _final_ `AvmContext.MachineState` of the initial message call

### Initial call's protected memory
Any lookup into protected memory from a request's initial message call must retrieve a value matching the `initialEnvironment` public inputs column\*. To enforce this, an equivalence check is applied between the `initialEnvironment` column and the memory trace for protected memory accesses that use call pointer `1`.

> \* `MachineState` has entries (`pc`, `internalCallStack`) that are not initialized from inputs. Accesses to these entries from the initial message call do _not_ trigger lookups into a public inputs column.

> Note: protected memory is irrelevant for the "input call pointer" itself (`0`). The initial call's protected memory (call pointer `1`) is constructed to match the public inputs column. The "input call pointer" is only relevant for `calldata` as explained next.

### Initial call's calldata
Similarly, any lookup into calldata from a request's initial message call must retrieve a value matching the `calldata` public inputs column. To enforce this, an equivalence check is applied between the `calldata` column and the memory trace for user memory accesses that use "input call pointer".

## Circuit implementation of `AvmContext`
Things not present in the high-level specification.
- ExecutionEnvironment: protected memory
- MachineState: protected memory
- bytecode: bytecode table
- calldata: lives in parent context's user memory
- contracts: contracts table and bytecode table
- storage: storage table and public inputs
- accrued substate: columns and public input columns

Circuit tracks the following additional information:
- The highest `callPointer` used up to any point in execution
- `argsOffset` and `argsSize` from the call instruction that created this context

## Nested calls
The operation performed by a message call instruction ([`CALL`](./InstructionSet/#isa-section-call), [`STATICCALL`](./InstructionSet/#isa-section-staticcall), or `DELEGATECALL`) is detailed in the [AVM's high level specification](./avm.md#nested-calls). The explanation there is mostly sufficient for an understanding of how nested calls are implemented in the AVM circuit.

When a nested call instruction is encountered, a new call pointer is assigned to the nested call. The nested call's protected memory is accessed using this new call pointer, and it is initialized from the calling context (as detailed [here](./avm.md#nested-calls)).

There are a few pieces of nested context initialization that are important to mention in the context of the AVM circuit:
1. `contract.portal` comes from a lookup into a **contracts table** which associates call pointer with `contract.address` and `contract.portal`
1. At a high level, `instr.args.argsOffset` and `instr.args.argsSize` are used to initialize the nested call's `calldata`. At the circuit level, that region in the calling context's memory need not be duplicated for it to become the nested context's `calldata`. Any reads to calldata from the nested context (for example via `CALLDATACOPY` which reads `AvmContext.calldata`) are translated in the VM circuit as follows:
    - ```
      // Instruction & arguments
      CALLDATACOPY cdOffset copySize dstOffset
      // High-level operation
      M[dstOffset:dstOffset+copySize] = calldata[cdOffset:cdOffset+copySize]
      // Circuit-level operation
      context.memory[dstOffset:dstOffset+copySize] = callingContext.memory[callInstr.args.argsOffset+cdOffset:callInstr.args.argsOffset+cdOffset+copySize]
      ```

There is a contracts table that associates a call pointer with a contract address and portal address. This is used for lookups in any instances of `contract.<entry>` like `contract.portal`.
