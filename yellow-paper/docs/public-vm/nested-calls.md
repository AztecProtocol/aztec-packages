# Nested contract calls

## Nested Call Instructions

The AVM supports three types of contract calls: [`CALL`](./instruction-set#isa-section-call), [`STATICCALL`](./instruction-set#isa-section-staticcall), and [`DELEGATECALL`](./instruction-set#isa-section-delegatecall).

These call instructions share the same argument definitions: `gasOffset`, `addrOffset`, `argsOffset`, `argsSize`, `retOffset`, `retSize`, and `successOffset`. These arguments will be referred to via those keywords below, and will often be used in conjunction with the `M[offset]` syntax which is shorthand for `context.machineState.memory[offset]`.

The terms `isStaticCall` and `isDelegateCall` used below simply refer to the call instruction's type (`instr.opcode == STATICCALL`, `instr.opcode == DELEGATECALL`).

## Tracing nested contract calls

Before nested execution begins, the contract call is traced.
```jsx
context.worldStateAccessTrace.contractCalls.append(
    TracedContractCall {
        callPointer: context.worldStateAccessTrace.contractCalls.length + 1,
        address: M[addrOffset],
        storageAddress: M[addrOffset],
        counter: context.worldStateAccessTrace.accessCounter++,
        endLifetime: 0, // The call's end-lifetime will be updated later if it or its caller reverts
    }
)
```

## Context initialization for nested calls

The contract being called into is referenced as `contract` in the following definitions:
```jsx
contract = callingContext.worldState.contracts[M[addrOffset]]
```

A nested contract call's execution environment and machine state are derived from the caller's context and the call instruction's arguments:

```jsx
nestedExecutionEnvironment = ExecutionEnvironment {
    origin: context.origin,
    sender: isDelegateCall ? context.sender : context.address,
    address: M[addrOffset],
    storageAddress: isDelegateCall ? context.storageAddress : M[addrOffset],
    portal: contract.portal,
    feePerL1Gas: context.environment.feePerL1Gas,
    feePerL2Gas: context.environment.feePerL2Gas,
    feePerDaGas: context.environment.feePerDaGas,
    contractCallDepth: context.contractCallDepth + 1,
    contractCallPointer: context.worldStateAccessTrace.contractCalls.length + 1,
    globals: context.globals,
    isStaticCall: isStaticCall,
    isDelegateCall: isDelegateCall,
    calldata: context.memory[M[argsOffset]:M[argsOffset]+argsSize],
    bytecode: contract.bytecode,
}
nestedMachineState = MachineState {
    l1GasLeft: context.machineState.memory[M[gasOffset]],
    l2GasLeft: context.machineState.memory[M[gasOffset+1]],
    daGasLeft: context.machineState.memory[M[gasOffset+2]],
    pc = 0,
    internalCallStack = [], // initialized as empty
    memory = [0, ..., 0],   // all 2^32 entries are initialized to zero
}
```

The nested call's execution context is then initialized:
```jsx
nestedContext = AvmContext {
    environment: nestedExecutionEnvironment,
    machineState: nestedMachineState,
    worldState: context.worldState,
    worldStateAccessTrace: context.worldStateAccessTrace,
    accruedSubstate: { [], ... [], }, // all empty
    results: {reverted: false, output: []},
}
```

## Gas cost of call instruction

A call instruction's gas cost is derived from its `gasOffset` argument. In other words, the caller "allocates" gas for a nested call via its `gasOffset` argument.

| Cost Term   | Value            |
| ---         | ---              |
| `l1GasCost` | `M[gasOffset]`   |
| `l2GasCost` | `M[gasOffset+1]` |
| `daGasCost` | `M[gasOffset+2]` |

As with all instructions, gas is checked and cost is deducted _prior_ to the instruction's execution.
```jsx
assert context.machineState.l1GasLeft - l1GasCost > 0
assert context.machineState.l2GasLeft - l2GasCost > 0
assert context.machineState.daGasLeft - daGasCost > 0
context.l1GasLeft -= l1GasCost
context.l2GasLeft -= l2GasCost
context.daGasLeft -= daGasCost
```

When the nested call halts, it may not have used up its entire gas allocation. Any unused gas is refunded to the caller as expanded on in ["Updating the calling context after nested call halts"](#updating-the-calling-context-after-nested-call-halts).

## Nested execution

Once the execution context is initialized, execution begins in the nested context. Note that this will modify the nested context.
```jsx
execute(nestedContext)
```

## Updating the calling context after nested call halts

The caller checks whether the nested call succeeded, and places the answer in memory.
```jsx
context.machineState.memory[instr.args.successOffset] = !nestedContext.results.reverted
```

Any unused gas is refunded to the caller.
```jsx
context.l1GasLeft += nestedContext.machineState.l1GasLeft
context.l2GasLeft += nestedContext.machineState.l2GasLeft
context.daGasLeft += nestedContext.machineState.daGasLeft
```

If the call instruction specifies non-zero `retSize`, the caller copies any returned output data to its memory.
```jsx
if retSize > 0:
    context.memory[retOffset:retOffset+retSize] = nestedContext.results.output
```

If the nested call succeeded, the caller accepts its world state and accrued substate modifications.
```jsx
if !nestedContext.results.reverted:
    context.worldState = nestedContext.worldState
    context.accruedSubstate.append(nestedContext.accruedSubstate)
```

## Accepting nested call's World State access trace

If the nested call reverted, the caller initializes the "end-lifetime" of all world state accesses made within the nested call.
```jsx
if nestedContext.results.reverted:
    // process all traces (this is shorthand)
    for trace in nestedContext.worldStateAccessTrace:
        for access in trace:
            if access.callPointer >= nestedContext.environment.callPointer:
                // don't override end-lifetime already set by a deeper nested call
                if access.endLifetime == 0:
                    access.endLifetime = nestedContext.worldStateAccessTrace.accessCounter
```

> A world state access that was made in a deeper nested _reverted_ context will already have its end-lifetime initialized. The caller does _not_ overwrite this access' end-lifetime here as it already has a narrower lifetime.

Regardless of whether the nested call reverted, the caller accepts its updated world state access trace (with updated lifetimes).
```jsx
context.worldStateAccessTrace = nestedContext.worldStateAccessTrace
```
