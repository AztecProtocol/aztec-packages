# Tooling and Compilation

This document provides a high-level overview of the AVM compilation pipeline.

## Compilation Flow

Public code in Aztec contracts is generally written in Noir and compiled to AVM bytecode:

```
Noir source (.nr)
       ↓
   nargo compile
       ↓
    Brillig
       ↓
  AVM Transpiler
       ↓
  AVM Bytecode
```

**Stages**:
1. **Noir source**: Contract code written in Noir
2. **nargo compile**: The Noir compiler produces ACIR (for private functions) and Brillig (for public functions)
3. **AVM Transpiler**: Converts Brillig to AVM bytecode for public execution

Private functions use ACIR and are proven client-side. Public functions use AVM bytecode and are proven by the AVM circuit.

## Bytecode

AVM bytecode is a sequence of instructions that can be executed and eventually proven in Aztec's VM for public execution.

See [Wire Format](wire-format.md) for instruction encoding details.

## Artifacts

The compilation process produces:
- Contract artifact containing AVM bytecode for public functions
- Function metadata (selectors, names, parameters)
- Deployment information (class ID, address derivation)

## Versioning

AVM bytecode format may evolve between protocol versions. Bytecode produced by a compiler version must match the protocol's expected format.

---
← Previous: [AVM vs EVM](./avm-vs-evm.md)
