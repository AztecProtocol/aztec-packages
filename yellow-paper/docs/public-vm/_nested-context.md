A nested contract call's execution environment and machine state are derived from the caller's context and the call instruction's arguments.

```jsx
// contract being called into
contract = callingContext.worldState.contracts[M[addrOffset]]

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

The nested call's execution context is then initialized.
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
