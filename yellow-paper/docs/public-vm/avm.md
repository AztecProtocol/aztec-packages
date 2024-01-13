# Aztec Virtual Machine

:::note reference
Many terms and definitions here are borrowed from the [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf).
:::

## Introduction

An Aztec transaction may include one or more **public execution requests**. A public execution request is a request to execute a specified contract's public bytecode given some arguments. Execution of a contract's public bytecode is performed by the **Aztec Virtual Machine (AVM)**.

In order to execute public contract bytecode, the AVM requires some context. An **execution context** includes all information necessary to initiate AVM execution along with all state maintained by the AVM. The execution context structure is fully specified in ["Execution Context"](#execution-context). A **contract call** initializes a new context and triggers AVM execution within that context.

Instruction-by-instruction, the AVM [executes](#execution) the bytecode specified in its context. An **instruction** is a bytecode entry that, when executed, modifies the AVM's execution context according to the instruction's definition in the ["AVM Instruction Set"](./instruction-set).

During execution, additional contract calls may be made. While an **initial contract call** initializes a new execution context directly from a public execution request, a **nested contract call** occurs _during_ AVM execution and is triggered by a **contract call instruction** ([`CALL`](./instruction-set/#isa-section-call), [`STATICCALL`](./instruction-set/#isa-section-call), or `DELEGATECALL`). It initializes a new execution context (**nested context**) from the current one (the **calling context**) along with the call instruction's arguments. A nested contract call triggers AVM execution in that new context, and returns execution to the calling context upon completion.

This document contains the following sections:

- [**Public contract bytecode**](#public-contract-bytecode) (aka AVM bytecode)
- [**Execution context**](#execution-context), outlining the AVM's environment and state
- [**Execution**](#execution), outlining control flow, gas tracking, halting, and reverting
- [**Initial contract calls**](#initial-contract-calls), outlining the initiation of a contract call from a public execution request
- [**Nested contract calls**](#nested-contract-calls), outlining the initiation of a contract call from an instruction as well as the processing of nested execution results, gas refunds, and state reverts

For details on the AVM's "tagged" memory model, refer to the **["AVM Memory Model"](./state-model.md)**.

> Note: The Aztec Virtual Machine, while designed with a SNARK implementation in mind, is not strictly tied to any particular implementation and therefore is defined without SNARK or circuit-centric verbiage. That being said, considerations for a SNARK implementation are raised or linked when particularly relevant or helpful.

## Public contract bytecode

A contract's public bytecode is a series of execution instructions for the AVM. When a call is made to a contract, the AVM retrieves the corresponding bytecode and triggers execution of the first instruction.

The entirety of a contract's public code is represented as a single block of bytecode with a maximum of `MAX_PUBLIC_INSTRUCTIONS_PER_CONTRACT` ($2^15 = 32768$) instructions. The mechanism used to distinguish between different functions in an AVM bytecode program is left as a higher-level abstraction (_e.g._ similar to Solidity's concept of a function selector).

> Note: See the [Bytecode Validation Circuit](./bytecode-validation-circuit.md) to see how a contract's bytecode can be validated and committed to.

Refer to ["Bytecode"](/docs/bytecode) for more information.

## Execution Context

:::note REMINDER
Many terms and definitions here are borrowed from the [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf).
:::

An **execution context** includes the information necessary to initiate AVM execution along with the state maintained by the AVM throughout execution:

```
AvmContext {
    environment: ExecutionEnvironment,
    machineState: MachineState,
    worldState: WorldState,
    journal: Journal,
    accruedSubstate: AccruedSubstate,
    results: ContractCallResults,
}
```

The first two entries, **execution environment** and **machine state**, share the same lifecycle. They contain information pertaining to a single contract call and are initialized prior to the start of a call's execution.

> When a nested contract call is made, a new environment and machine state are initialized by the caller. In other words, a nested contract call has its own environment and machine state which are _partially_ derived from the caller's context.

The **execution environment** is fully specified by a contract call's execution agent and remains constant throughout a call's execution.

```
ExecutionEnvironment {
    address,
    storageAddress,
    origin,
    l1GasPrice,
    l2GasPrice,
    daGasPrice,
    sender,
    portal,
    blockHeader: BlockHeader,
    globalVariables: PublicGlobalVariables,
    contractCallDepth,
    isStaticCall,
    isDelegateCall,
    calldata: [],
    bytecode: [],
}
```

**Machine state** is partially specified by the execution agent, and otherwise begins as empty or uninitialized for each contract call. This state is transformed on an instruction-per-instruction basis.

```
MachineState {
    l1GasLeft,
    l2GasLeft,
    daGasLeft,
    pc,
    internalCallStack: [],
    memory: offset => value // all entries are zero at start
}
```

**World state** contains persistable VM state. If a contract call succeeds, its world state updates are applied to the calling context (whether that be a parent call's context or the transaction context). If a contract call reverts, its world state updates are rejected by its caller. When a _transaction_ succeeds, its world state updates persist into future transactions.

```
WorldState {
    contracts: (address) => {bytecode, portalAddress}, // read-only from within AVM
    blockHeaders: (blockNumber) => BlockHeader,        // read-only from within AVM
    publicStorage: (address, slot) => value,           // read/write
    l1ToL2Messages: (address, key) => message,         // read-only from within AVM
    l2ToL1Messages: [],                                // append-only (no reads) from within AVM
    noteHashes: [],                                    // append-only (no reads) from within AVM
    nullifiers: [],                                    // append-only (no reads) from within AVM
}
```
> Note: the notation `key => value` describes a mapping from `key` to `value`.

> Note: `contracts` is read-only because contract deployments are not handled by the AVM

**Journal** tracks all world state accesses (reads and writes) that have taken place thus far during a contract call's execution.
```
Journal {
    calledContracts: [],
    blockHeaderReads: [],
    publicStorageAccesses: [],
    l1ToL2MessageReads: [],
    newL2ToL1Messages: [],
    newNoteHashes: [],
    newNullifiers: [],
}
```

The **accrued substate**, as coined in the [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper), contains information that is accrued throughout transaction execution to be "acted upon immediately following the transaction." These are append-only arrays containing state that is not relevant to other calls or transactions. Similar to world state, if a contract call succeeds, its substate is appended to its calling context, but if it fails its substate is dropped by its caller.

```
AccruedSubstate {
    unencryptedLogs: [],
}
```

Finally, when a contract call halts, it sets the context's **contract call results** to communicate results to the caller.

```
ContractCallResults {
    reverted: boolean,
    output: [] | undefined,
}
```

## Execution

With an initialized context (and therefore an initial program counter of 0), the AVM can execute a contract call starting with the very first instruction in its bytecode.

### Program Counter and Control Flow

The program counter (machine state's `pc`) determines which instruction to execute (`instr = environment.bytecode[pc]`). Each instruction's state transition function updates the program counter in some way, which allows the VM to progress to the next instruction at each step.

Most instructions simply increment the program counter by 1. This allows VM execution to flow naturally from instruction to instruction. Some instructions ([`JUMP`](./instruction-set#isa-section-jump), [`JUMPI`](./instruction-set#isa-section-jumpi), `INTERNALCALL`) modify the program counter based on inputs.

The `INTERNALCALL` pushes `pc+1` to `machineState.internalCallStack` and then updates `pc` to the instruction's destination argument (`instr.args.loc`). The `INTERNALRETURN` instruction pops a destination from `machineState.internalCallStack` and assigns the result to `pc`.

> An instruction will never assign program counter a value from memory (`machineState.memory`). A `JUMP`, `JUMPI`, or `INTERNALCALL` instruction's destination is a constant from the program bytecode. This property allows for easier static program analysis.

### Gas limits and tracking
> Note: see ["Gas and Fees"](../gas-and-fees) for a deeper dive into Aztec's gas model and for definitions of each type of gas.

Each instruction has an associated `l1GasCost`, `l2GasCost`, and `daGasCost`. Before an instruction is executed, the VM enforces that there is sufficient gas remaining via the following assertions:
```
assert machineState.l1GasLeft - instr.l1GasCost > 0
assert machineState.l2GasLeft - instr.l2GasCost > 0
assert machineState.daGasLeft - instr.daGasCost > 0
```

> Note: many instructions (like arithmetic operations) have 0 `l1GasCost`. Instructions only incur an L1 cost if they modify world state or accrued substate.

If these assertions pass, the machine state's gas left is decreased prior to the instruction's core execution:

```
machineState.l1GasLeft -= instr.l1GasCost
machineState.l2GasLeft -= instr.l2GasCost
machineState.daGasLeft -= instr.daGasCost
```

If either of these assertions _fail_ for an instruction, this triggers an exceptional halt. The gas left is set to 0 and execution reverts.

```
machineState.l1GasLeft = 0
machineState.l2GasLeft = 0
machineState.daGasLeft = 0
```

> Reverting and exceptional halts are covered in more detail in the ["Halting" section](#halting).

### Gas cost notes and examples

An instruction's gas cost is meant to reflect the computational cost of generating a proof of its correct execution. For some instructions, this computational cost changes based on inputs. Here are some examples and important notes:
- [`JUMP`](./instruction-set/#isa-section-jump) is an example of an instruction with constant gas cost. Regardless of its inputs, the instruction always incurs the same `l1GasCost`, `l2GasCost`, and `daGasCost`.
- The [`SET`](./instruction-set/#isa-section-set) instruction operates on a different sized constant (based on its `dst-type`). Therefore, this instruction's gas cost increases with the size of its input.
- Instructions that operate on a data range of a specified "size" scale in cost with that size. An example of this is the [`CALLDATACOPY`](./instruction-set/#isa-section-calldatacopy) argument which copies `copySize` words from `environment.calldata` to `machineState.memory`.
- The [`CALL`](./instruction-set/#isa-section-call)/[`STATICCALL`](./instruction-set/#isa-section-call)/`DELEGATECALL` instruction's gas cost is determined by its `*Gas` arguments, but any gas unused by the triggered contract call is refunded after its completion ([more on this later](#updating-the-calling-context-after-nested-call-halts)).
- An instruction with "offset" arguments (like [`ADD`](./instruction-set/#isa-section-add) and many others), has increased cost for each offset argument that is flagged as "indirect".

> Implementation detail: an instruction's gas cost will roughly align with the number of rows it corresponds to in the SNARK execution trace including rows in the sub-operation table, memory table, chiplet tables, etc.

> Implementation detail: an instruction's gas cost takes into account the costs of associated downstream computations. An instruction that triggers accesses to the public data tree (`SLOAD`/`SSTORE`) incurs a cost that accounts for state access validation in later circuits (public kernel or rollup). An instruction that triggers a nested contract call (`CALL`/`STATICCALL`/`DELEGATECALL`) incurs a cost accounting for the contract call's complete execution as well as any work required by the public kernel circuit for this additional call.

## Halting

A contract call's execution can end with a **normal halt** or **exceptional halt**. A halt ends execution within the current context and returns control flow to the calling context.

### Normal halting

A normal halt occurs when the VM encounters an explicit halting instruction ([`RETURN`](./instruction-set/#isa-section-return) or [`REVERT`](./instruction-set/#isa-section-revert)). Such instructions consume gas normally and optionally initialize some output data before finally halting execution within the current context.

```
machineState.l1GasLeft -= instr.l1GasCost
machineState.l2GasLeft -= instr.l2GasCost
machineState.daGasLeft -= instr.daGasCost
// results.reverted remains false
results.output = machineState.memory[instr.args.retOffset:instr.args.retOffset+instr.args.retSize]
```

> Definitions: `retOffset` and `retSize` here are arguments to the [`RETURN`](./instruction-set/#isa-section-return) and [`REVERT`](./instruction-set/#isa-section-revert) instructions. If `retSize` is 0, the context will have no output. Otherwise, these arguments point to a region of memory to output.

> Note: `results.output` is only relevant when the caller is a contract call itself. When a public execution request's initial contract call halts normally, its `results.output` is ignored.

### Exceptional halting

An exceptional halt is not explicitly triggered by an instruction but instead occurs when one of the following halting conditions is met:

1. **Insufficient gas**
    ```
    assert machineState.l1GasLeft - instr.l1GasCost > 0
    assert machineState.l2GasLeft - instr.l2GasCost > 0
    assert machineState.daGasLeft - instr.l2GasCost > 0
    ```
1. **Invalid instruction encountered**
    ```
    assert environment.bytecode[machineState.pc].opcode <= MAX_AVM_OPCODE
    ```
1. **Failed memory tag check**
    - Defined per-instruction in the [Instruction Set](./instruction-set)
1. **Jump destination past end of bytecode**
    ```
    assert environment.bytecode[machineState.pc].opcode not in {JUMP, JUMPI, INTERNALCALL}
        OR instr.args.loc < environment.bytecode.length
    ```
1. **World state modification attempt during a static call**
    ```
    assert !environment.isStaticCall
        OR environment.bytecode[machineState.pc].opcode not in WS_MODIFYING_OPS
    ```
    > Definition: `WS_MODIFYING_OPS` represents the list of all opcodes corresponding to instructions that modify world state.
1. **Maximum contract call depth (1024) exceeded**
    ```
    assert environment.contractCallDepth <= 1024
    assert environment.bytecode[machineState.pc].opcode not in {CALL, STATICCALL, DELEGATECALL}
        OR environment.contractCallDepth < 1024
    ```
1. **Maximum internal call depth (1024) exceeded**
    ```
    assert machineState.internalCallStack.length <= 1024
    assert environment.bytecode[machineState.pc].opcode != INTERNALCALL
        OR environment.contractCallDepth < 1024
    ```
1. **Maximum memory index ($2^32$) exceeded**
    ```
    for offset in instr.args.*Offset:
        assert offset < 2^32
    ```
1. **Maximum world state updates (1024) exceeded**
    ```
    assert publicStorageAccesses.length <= 1024
        AND l1ToL2MessagesReads.length <= 1024
        AND newNoteHashes.length <= 1024
        AND newNullifiers.length <= 1024
        AND l2ToL1Messages.length <= 1024

    // Storage
    assert environment.bytecode[machineState.pc].opcode not in {SLOAD, SSTORE}
        OR publicStorageAccesses.length < 1024

    // L1 to L2 messages
    assert environment.bytecode[machineState.pc].opcode != GETL1TOL2MSG
        OR l1ToL2MessagesReads.length < 1024

    // Note hashes
    assert environment.bytecode[machineState.pc].opcode != EMITNOTEHASH
        OR newNoteHashes.length < 1024

    // Nullifiers
    assert environment.bytecode[machineState.pc].opcode != EMITNULLIFIER
        OR newNullifiers.length < 1024

    // L2 to L1 messages
    assert environment.bytecode[machineState.pc].opcode != SENDL2TOL1MSG
        OR l2ToL1Messages.length < 1024
    ```
    > Definition: `WS_MODIFYING_OPS` represents the list of all opcodes corresponding to instructions that modify world state.

When an exceptional halt occurs, the context is flagged as consuming all off its allocated gas and marked as `reverted` with no output data, and then execution within the current context ends.

```
machineState.l1GasLeft = 0
machineState.l2GasLeft = 0
machineState.daGasLeft = 0
results.reverted = true
// results.output remains undefined
```

## Initial contract calls

An **initial contract call** initializes a new execution context from a public execution request.

> A public execution request may originate from one of the following:
>   - a public call enqueued by a transaction's private segment ([`enqueuedPublicFunctionCalls`](../calls/enqueued-calls.md))
>   - a [public fee preparation or fee distribution](../gas-and-fees) call

### Context initialization for initial call

This section outlines AVM context initialization specifically for a **public execution request's initial contract call** (_i.e._ not a nested contract call). Context initialization for nested contract calls is explained [in a later section](#context-initialization-for-a-nested-call).
When AVM execution is initiated for a public execution request, the AVM context is initialized as follows:

```
context = AvmContext {
    environment = INITIAL_EXECUTION_ENVIRONMENT,
    machineState = INITIAL_MACHINE_STATE,
    accruedSubstate = empty,
    worldState = <latest world state>,
    results = INITIAL_MESSAGE_CALL_RESULTS,
}
```

> Note: Since world state persists between transactions, the latest state is injected into a new AVM context.

Given a `PublicCallRequest` and its parent `TxRequest`, these above-listed "`INITIAL_*`" entries are defined as follows:

```
INITIAL_EXECUTION_ENVIRONMENT = ExecutionEnvironment {
    address = PublicCallRequest.contractAddress,
    storageAddress = PublicCallRequest.CallContext.storageContractAddress,
    origin = TxRequest.origin,
    l1GasPrice = TxRequest.l1GasPrice,
    l2GasPrice = TxRequest.l2GasPrice,
    daGasPrice = TxRequest.daGasPrice,
    sender = PublicCallRequest.CallContext.msgSender,
    portal = PublicCallRequest.CallContext.portalContractAddress,
    blockHeader = <latest block header>,
    globalVariables = <latest global variable values>
    contractCallDepth = 0,
    isStaticCall = PublicCallRequest.CallContext.isStaticCall,
    isDelegateCall = PublicCallRequest.CallContext.isDelegateCall,
    calldata = PublicCallRequest.args,
    bytecode = worldState.contracts[PublicCallRequest.contractAddress],
}

INITIAL_MACHINE_STATE = MachineState {
    l1GasLeft = TxRequest.l1GasLimit,
    l2GasLeft = TxRequest.l2GasLimit,
    daGasLeft = TxRequest.daGasLimit,
    pc = 0,
    internalCallStack = [],
    memory = <all entries are zero>,
}

INITIAL_MESSAGE_CALL_RESULTS = ContractCallResults {
    reverted = false,
    output = undefined,
}
```

## Nested contract calls

To review, a **nested contract call** occurs _during_ AVM execution and is triggered by a contract call instruction ([`CALL`](./instruction-set/#isa-section-call), [`STATICCALL`](./instruction-set/#isa-section-call), or `DELEGATECALL`). It initializes a new execution context from the current one (the **calling context**) along with the call instruction's arguments. A nested contract call triggers AVM execution in that new context, and returns execution to the calling context upon completion.

### Context initialization for a nested call

Initiation of a nested call requires the creation of a new context (or **sub-context**).

```
subContext = AvmContext {
    environment: nestedExecutionEnvironment, // defined below
    machineState: nestedMachineState,        // defined below
    worldState: callingContext.worldState,
    accruedSubstate: empty,
    results: INITIAL_MESSAGE_CALL_RESULTS,
}
```

While some context members are initialized as empty (as they are for an initial contract call), other entries are derived from the calling context or from the contract call instruction's arguments (`instr.args`).

The world state is forwarded as-is to the sub-context. Any updates made to the world state before this contract call instruction was encountered are carried forward into the sub-context.

The environment and machine state for the new sub-context are initialized as shown below. Here, the `callingContext` refers to the context in which the nested contract call instruction was encountered.

```
// some assignments reused below
isStaticCall = instr.opcode == STATICCALL_OP
isDelegateCall = instr.opcode == DELEGATECALL_OP
contract = callingContext.worldState.contracts[instr.args.addr]
calldataStart = instr.args.argsOffset
calldataEnd = calldataStart + instr.args.argsSize

nestedExecutionEnvironment = ExecutionEnvironment {
    address: instr.args.addr,
    storageAddress: isDelegateCall ? callingContext.environment.storageAddress : instr.args.addr,
    origin: callingContext.origin,
    l1GasPrice: callingContext.l1GasPrice,
    l2GasPrice: callingContext.l2GasPrice,
    daGasPrice: callingContext.daGasPrice,
    sender: callingContext.address,
    portal: contract.portal,
    blockHeader: callingContext.blockHeader,
    globalVariables: callingContext.globalVariables,
    contractCallDepth: callingContext.contractCallDepth + 1,
    isStaticCall: isStaticCall,
    isDelegateCall: isDelegateCall,
    calldata: callingContext.memory[calldataStart:calldataEnd],
    bytecode: contract.bytecode,
}

nestedMachineState = MachineState {
    l1GasLeft: callingContext.machineState.memory[instr.args.gasOffset],
    l2GasLeft: callingContext.machineState.memory[instr.args.gasOffset+1],
    daGasLeft: callingContext.machineState.memory[instr.args.gasOffset+2],
    pc: 0,
    internalCallStack: empty,
    memory: empty,
}
```
> Note: the sub-context machine state's `*GasLeft` is initialized based on the call instruction's `gasOffset` argument. The caller allocates some amount of L1, L2, and DA gas to the nested call. It does so using the instruction's `gasOffset` argument. In particular, prior to the contract call instruction, the caller populates `M[gasOffset]` with the sub-context's initial `l1GasLeft`. Likewise it populates `M[gasOffset+1]` with `l2GasLeft` and `M[gasOffset+2]` with `daGasLeft`.

> Note: recall that `INITIAL_MESSAGE_CALL_RESULTS` is the same initial value used during [context initialization for a public execution request's initial contract call](#context-initialization-for-initial-call).
> `STATICCALL_OP` and `DELEGATECALL_OP` refer to the 8-bit opcode values for the `STATICCALL` and `DELEGATECALL` instructions respectively.

### Updating the calling context after nested call halts

When a contract call's execution encounters an instruction that itself triggers a contract call, the nested call executes until it reaches a halt. At that point, control returns to the caller, and the calling context is updated based on the sub-context and the contract call instruction's transition function. The components of that transition function are defined below.

The success or failure of the nested call is captured into memory at the offset specified by the call instruction's `successOffset` input:

```
context.machineState.memory[instr.args.successOffset] = !subContext.results.reverted
```

Recall that a nested call is allocated some gas. In particular, the call instruction's `gasOffset` input points to an L1, L2, and DA gas allocation for the nested call. As shown in the [section above](#context-initialization-for-a-nested-call), a nested call's `subContext.machineState.l1GasLeft` is initialized to `context.machineState.memory[instr.args.gasOffset]`. Likewise, `l2GasLeft` is initialized from `gasOffset+1` and `daGasLeft` from `gasOffset+2`.

As detailed in [the gas section above](#gas-cost-notes-and-examples), every instruction has an associated `instr.l1GasCost`, `instr.l2GasCost`, and `instr.daGasCost`. A nested call instruction's cost is the same as its initial `*GasLeft`. Prior to the nested call's execution, this cost is subtracted from the calling context's remaining gas.

When a nested call completes, any of its allocated gas that remains unused is refunded to the caller.

```
context.l1GasLeft += subContext.machineState.l1GasLeft
context.l2GasLeft += subContext.machineState.l2GasLeft
context.daGasLeft += subContext.machineState.daGasLeft
```

If a nested call halts normally with a [`RETURN`](./instruction-set/#isa-section-return) or [`REVERT`](./instruction-set/#isa-section-revert), it may have some output data (`subContext.results.output`). The caller's `retOffset` and `retSize` arguments to the nested call instruction specify a region in memory to place output data when the nested call returns.

```
if instr.args.retSize > 0:
    context.memory[instr.args.retOffset:instr.args.retOffset+instr.args.retSize] = subContext.results.output
```

As long as a nested call has not reverted, its updates to the world state and accrued substate will be absorbed into the calling context.

```
if !subContext.results.reverted AND instr.opcode != STATICCALL_OP:
    context.worldState = subContext.worldState
    context.accruedSubstate.append(subContext.accruedSubstate)
```

> Reminder: a nested call cannot make updates to the world state or accrued substate if it is a [`STATICCALL`](./instruction-set/#isa-section-staticcall).
