# AVM vs EVM

A quick reference for developers familiar with the Ethereum Virtual Machine (EVM).

## Key Differences at a Glance

**If you remember three things:**
1. **Tagged memory** — Type-safe memory with runtime tag checking (vs EVM's raw 256-bit words)
2. **Field arithmetic** — BN254 scalar field (vs EVM's 256-bit integer arithmetic)
3. **Two-dimensional gas** — L2 gas + DA gas (vs EVM's single gas dimension)

## Execution Context

The AVM executes **public** contract logic only. In Aztec:
- **Private execution** happens client-side and is proven with separate circuits
- **Public execution** happens on the sequencer and is proven with the AVM

This means the AVM is analogous to the EVM's role in Ethereum, but only for the public portion of a transaction.

## Memory Model

| Aspect | EVM | AVM |
|--------|-----|-----|
| Memory cells | 256-bit words | Field elements with type tags |
| Type safety | None (raw bytes) | Runtime tag checking |
| Access pattern | Word-addressed | Offset-addressed with tags |

**Gotcha**: AVM memory operations fail with `TAG_MISMATCH` if types don't match. EVM has no equivalent—you can freely reinterpret bytes.

## Arithmetic and Types

| Aspect | EVM | AVM |
|--------|-----|-----|
| Native type | `uint256` | BN254 field element (`FIELD`) |
| Integer overflow | Wraps at 2^256 | Wraps at field prime *p* |
| Integer types | Single 256-bit type | Multiple: `UINT8`, `UINT16`, `UINT32`, `UINT64`, `UINT128`, `FIELD` |
| Bitwise ops | Native, cheap | Available but may be expensive |
| Signed integers | Two's complement convention | Not natively supported |

**Gotchas**:
- Field arithmetic operates modulo *p* ≈ 2^254, not 2^256
- Bitwise operations exist but are constrained differently
- Type conversions require explicit `CAST` instruction

## Gas Model

| Aspect | EVM | AVM |
|--------|-----|-----|
| Dimensions | Single (`gas`) | Two: `l2Gas` (computation) + `daGas` (data availability) |
| Refunds | Supported | Supported for unused nested call gas |
| Metering | Per-opcode | Per-opcode for both dimensions |

**Gotcha**: You must budget for both dimensions. Running out of either causes `OUT_OF_GAS`.

## Storage

| Aspect | EVM | AVM |
|--------|-----|-----|
| Slot size | 256 bits | Field element |
| Access opcodes | `SLOAD`, `SSTORE` | `SLOAD`, `SSTORE` (similar semantics) |
| Layout | Developer-controlled | Developer-controlled |

Storage operations are conceptually similar, but don't assume EVM packing patterns transfer directly.

## Calls and Execution

| Feature | EVM | AVM | Notes |
|---------|-----|-----|-------|
| `CALL` | Supported | Supported | Similar semantics |
| `STATICCALL` | Supported | Supported | Read-only calls |
| `DELEGATECALL` | Supported | **Not supported** | Use Contract Classes instead |
| `CREATE` / `CREATE2` | Supported | **Not supported** | Deployment is protocol-level |
| `SELFDESTRUCT` | Supported | **Not supported** | No equivalent |
| Value transfer | `msg.value` | **Not supported** | Use token contracts |

**Why no DELEGATECALL?** Aztec uses a Contract Class / Instance model for code reuse and upgradeability instead of the proxy pattern. Contract Classes define reusable code that multiple Contract Instances can reference.

**Why no value transfer?** The AVM doesn't have a native currency. Asset transfers use token contracts with explicit transfer calls.

## Logs and Events

| Aspect | EVM | AVM |
|--------|-----|-----|
| Opcodes | `LOG0`–`LOG4` | `EMITUNENCRYPTEDLOG` |
| Topics | Up to 4 indexed topics | Different indexing model |
| Visibility | Public | Public (unencrypted logs) |

The AVM also supports other side effects like nullifiers and note hashes that have no EVM equivalent.

---
← Previous: [Wire Formats](./wire-format.md) | Next: [Tooling and Compilation](./tooling.md) →
