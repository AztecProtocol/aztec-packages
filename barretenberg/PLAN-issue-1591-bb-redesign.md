# Implementation Plan: bb CLI and bb.js API Redesign for Noir Backend

**GitHub Issue:** https://github.com/AztecProtocol/barretenberg/issues/1591

## Executive Summary

This plan redesigns the bb CLI and bb.js API to prioritize their role as a Noir backend, making common workflows simpler while clearly separating advanced Aztec-specific features.

---

## Phase 1: CLI Flag Simplification & Naming Improvements

### 1.1 Add User-Friendly Flag Aliases

**File:** `barretenberg/cpp/src/barretenberg/bb/cli.cpp`

Add intuitive aliases for the `--oracle_hash` option that clearly communicate intent:

| Current | New Alias | Purpose |
|---------|-----------|---------|
| `--oracle_hash poseidon2` | `--recursive` | Proofs for recursive verification in circuits |
| `--oracle_hash keccak` | `--solidity` or `--evm` | Proofs for Solidity/EVM verification |
| `--oracle_hash starknet` | `--starknet` | (already clear) |

**Implementation:**
```cpp
// In add_oracle_hash_option lambda, add:
->envname("BB_ORACLE_HASH")
->transform(CLI::CheckedTransformer(std::map<std::string, std::string>{
    {"recursive", "poseidon2"},
    {"solidity", "keccak"},
    {"evm", "keccak"},
}, CLI::ignore_case));
```

### 1.2 Change Default to Solidity-Friendly

Currently `poseidon2` is the default for `--oracle_hash`. For most Noir users targeting Solidity verification, `keccak` would be more appropriate as the default.

**Trade-off analysis:**
- Pro: Most Noir users want Solidity verification
- Con: Breaking change for existing workflows
- Recommendation: Add prominent documentation and consider a deprecation warning before changing defaults

### 1.3 Reorganize Help Output

**File:** `barretenberg/cpp/src/barretenberg/bb/cli11_formatter.hpp`

Group flags into categories in help output:

```
COMMON OPTIONS:
  -b, --bytecode_path    Path to ACIR bytecode (default: ./target/program.json)
  -w, --witness_path     Path to witness (default: ./target/witness.gz)
  -o, --output_path      Output path
  --solidity             Generate Solidity-verifiable proof (keccak hash)
  --recursive            Generate recursion-friendly proof (poseidon2 hash)

ADVANCED OPTIONS (Aztec/Power Users):
  --scheme               Proving scheme: ultra_honk, chonk, avm
  --oracle_hash          Raw hash type: poseidon2, keccak, starknet
  --ipa_accumulation     Enable IPA accumulation
  --verifier_type        VK type: standalone, standalone_hiding, ivc
  --disable_zk           Disable zero-knowledge
  --vk_policy            VK validation: default, check, recompute, rewrite
  --slow_low_memory      Enable low memory mode
  --storage_budget       Memory budget for FileBackedMemory
```

### 1.4 Hide Aztec-Specific Commands by Default

Already partially done (AVM commands use `->group("")`). Ensure consistency:

```cpp
// Commands to hide from default help:
aztec_process->group("Aztec");  // Show in "Aztec" group
avm_*->group("");               // Already hidden
msgpack_command->group("");     // Already hidden for internal use
```

---

## Phase 2: bb.js API Simplification

### 2.1 Create High-Level Convenience Functions

**File:** `barretenberg/ts/src/index.ts` (new exports)

Add simple, purpose-built functions for common Noir workflows:

```typescript
// New file: barretenberg/ts/src/noir/index.ts

import { Barretenberg, UltraHonkBackend, Crs } from '../index.js';

/**
 * Simple proof generation for Noir programs targeting Solidity verification.
 * This is the recommended entry point for most Noir users.
 */
export async function proveForSolidity(
  acirBytecode: string,
  witness: Uint8Array
): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(acirBytecode, api);
  const result = await backend.generateProof(witness, { keccak: true });
  await api.destroy();
  return result;
}

/**
 * Simple proof generation for recursive verification in circuits.
 */
export async function proveForRecursion(
  acirBytecode: string,
  witness: Uint8Array
): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(acirBytecode, api);
  const result = await backend.generateProof(witness); // poseidon2 default
  await api.destroy();
  return result;
}

/**
 * Generate a Solidity verifier contract for a circuit.
 */
export async function generateSolidityVerifier(
  acirBytecode: string
): Promise<string> {
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(acirBytecode, api);
  const vk = await backend.getVerificationKey({ keccak: true });
  const solidity = await backend.getSolidityVerifier(vk, { keccak: true });
  await api.destroy();
  return solidity;
}

/**
 * Verify a proof in JavaScript/TypeScript.
 */
export async function verifyProof(
  acirBytecode: string,
  proof: Uint8Array,
  publicInputs: string[],
  options?: { keccak?: boolean }
): Promise<boolean> {
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(acirBytecode, api);
  const result = await backend.verifyProof({ proof, publicInputs }, options);
  await api.destroy();
  return result;
}
```

### 2.2 Improve UltraHonkBackendOptions Naming

**File:** `barretenberg/ts/src/barretenberg/backend.ts`

Rename options to be more descriptive:

```typescript
export type UltraHonkBackendOptions = {
  /**
   * Target platform for proof verification.
   * - 'solidity': Optimized for Ethereum smart contract verification (keccak, non-ZK)
   * - 'solidityZK': Solidity verification with zero-knowledge
   * - 'recursive': Optimized for recursive proof verification in circuits (poseidon2)
   * - 'starknet': Optimized for Starknet verification via Garaga
   * - 'starknetZK': Starknet verification with zero-knowledge
   */
  target?: 'solidity' | 'solidityZK' | 'recursive' | 'starknet' | 'starknetZK';

  // Deprecated - use 'target' instead
  /** @deprecated Use target: 'solidity' instead */
  keccak?: boolean;
  /** @deprecated Use target: 'solidityZK' instead */
  keccakZK?: boolean;
  /** @deprecated Use target: 'starknet' instead */
  starknet?: boolean;
  /** @deprecated Use target: 'starknetZK' instead */
  starknetZK?: boolean;
};
```

### 2.3 Add TypeScript JSDoc Documentation

Enhance all public APIs with comprehensive JSDoc comments explaining:
- What the function does
- When to use it (use case)
- Example usage
- Parameter descriptions
- Return value descriptions

---

## Phase 3: Example Applications

### 3.1 JavaScript Native Verification Example

**File:** `barretenberg/ts/examples/js-verification/`

```
examples/js-verification/
├── README.md
├── package.json
├── circuit/
│   ├── src/main.nr      # Simple Noir circuit
│   └── Nargo.toml
├── src/
│   ├── generate-proof.ts
│   ├── verify-proof.ts
│   └── index.ts
└── test/
    └── verification.test.ts
```

**README.md content:**
- Prerequisites (Node.js, Nargo)
- Step-by-step: compile circuit → generate witness → prove → verify
- Code walkthrough

### 3.2 Solidity Verification Example

**File:** `barretenberg/ts/examples/solidity-verification/`

```
examples/solidity-verification/
├── README.md
├── package.json
├── circuit/
│   ├── src/main.nr
│   └── Nargo.toml
├── contracts/
│   └── (generated verifier goes here)
├── scripts/
│   ├── generate-verifier.ts
│   ├── generate-proof.ts
│   └── deploy-and-verify.ts
├── hardhat.config.ts
└── test/
    └── verifier.test.ts
```

**README.md content:**
- Full workflow: Noir → proof → Solidity verifier → deploy → verify on-chain
- Hardhat/Foundry integration
- Gas cost analysis

### 3.3 Recursive Verification Example

**File:** `barretenberg/ts/examples/recursive-verification/`

```
examples/recursive-verification/
├── README.md
├── package.json
├── circuits/
│   ├── inner/
│   │   ├── src/main.nr
│   │   └── Nargo.toml
│   └── outer/
│       ├── src/main.nr   # Verifies inner proof
│       └── Nargo.toml
├── src/
│   ├── prove-inner.ts
│   ├── prove-outer.ts
│   └── full-recursion.ts
└── test/
    └── recursion.test.ts
```

**README.md content:**
- What is recursive proving and why use it
- Inner/outer circuit pattern
- How to pass proof artifacts between circuits
- Performance considerations

---

## Phase 4: Documentation Overhaul

### 4.1 Update barretenberg/ts/README.md

**File:** `barretenberg/ts/README.md`

Restructure to lead with Noir backend use cases:

```markdown
# bb.js - Barretenberg JavaScript/TypeScript Library

The official JavaScript/TypeScript library for the Barretenberg proving system,
primarily used as a backend for [Noir](https://noir-lang.org/).

## Quick Start

### For Solidity Verification (Most Common)
\`\`\`typescript
import { proveForSolidity, generateSolidityVerifier } from '@aztec/bb.js/noir';

// Generate proof
const { proof, publicInputs } = await proveForSolidity(circuit, witness);

// Generate verifier contract
const solidityCode = await generateSolidityVerifier(circuit);
\`\`\`

### For Recursive Proof Verification
\`\`\`typescript
import { proveForRecursion } from '@aztec/bb.js/noir';

const { proof, publicInputs } = await proveForRecursion(circuit, witness);
// Use proof artifacts in another Noir circuit...
\`\`\`

## Examples
- [JavaScript Verification](./examples/js-verification/)
- [Solidity Verification](./examples/solidity-verification/)
- [Recursive Verification](./examples/recursive-verification/)

## Advanced Usage
For Aztec-specific features (AVM, Chonk IVC, etc.), see [Advanced Documentation](./docs/advanced.md).
```

### 4.2 Add bb/bb.js Documentation to Main Docs

**Location:** `docs/docs/developers/docs/` (new section)

Create a new documentation section for bb CLI and bb.js:

```
docs/docs/developers/docs/bb/
├── index.md                    # Overview of bb CLI and bb.js
├── cli_reference.md            # Full CLI command reference
├── js_api.md                   # bb.js API reference
├── common_workflows.md         # Step-by-step guides for common tasks
└── advanced.md                 # Aztec-specific advanced features
```

This integrates with the existing Aztec documentation structure and will be discoverable
alongside aztec-cli, aztec-js, and aztec-nr documentation.

**Note:** The existing glossary at `docs/docs/developers/docs/resources/glossary.md`
already has entries for "Barretenberg" and "bb / bb.js" - these should be updated to
link to the new documentation section.

### 4.3 CLI Help Improvements

Add a `--examples` flag or `bb examples` subcommand that prints common usage patterns:

```
$ bb examples

COMMON WORKFLOWS:

1. Prove and verify a Noir circuit for Solidity:
   $ bb prove -b ./target/program.json -w ./target/witness.gz --solidity -o ./proof
   $ bb write_vk -b ./target/program.json --solidity -o ./vk
   $ bb write_solidity_verifier -k ./vk -o ./Verifier.sol

2. Prove for recursive verification:
   $ bb prove -b ./target/program.json -w ./target/witness.gz --recursive -o ./proof

3. Quick circuit check (debugging):
   $ bb check -b ./target/program.json -w ./target/witness.gz

4. Get circuit size:
   $ bb gates -b ./target/program.json
```

---

## Phase 5: API Cleanup & Deprecations

### 5.1 Deprecate Confusing Exports

Mark low-level APIs that shouldn't be used directly by Noir users:

```typescript
// In index.ts, add deprecation notices:

/**
 * @deprecated For Noir users: Use proveForSolidity() or proveForRecursion() instead.
 * This class is for advanced users who need direct access to the proving API.
 */
export { Barretenberg } from './barretenberg/index.js';
```

### 5.2 Create Separate Entry Points

**File:** `barretenberg/ts/package.json`

Add subpath exports for clearer imports:

```json
{
  "exports": {
    ".": {
      "require": "./dest/node-cjs/index.js",
      "browser": "./dest/browser/index.js",
      "default": "./dest/node/index.js"
    },
    "./noir": {
      "require": "./dest/node-cjs/noir/index.js",
      "browser": "./dest/browser/noir/index.js",
      "default": "./dest/node/noir/index.js"
    },
    "./advanced": {
      "default": "./dest/node/index.js"
    }
  }
}
```

This allows:
```typescript
// Simple Noir usage
import { proveForSolidity } from '@aztec/bb.js/noir';

// Advanced/Aztec usage
import { Barretenberg, AztecClientBackend } from '@aztec/bb.js/advanced';
```

---

## Implementation Order & Dependencies

```
Phase 1 (CLI) ──────────────────────────────────────────────────────────
  │
  ├── 1.1 Add flag aliases (--solidity, --recursive)
  │     └── Modify: cli.cpp
  │
  ├── 1.2 Document default change (defer actual change)
  │     └── Add: deprecation notice in help text
  │
  ├── 1.3 Reorganize help output
  │     └── Modify: cli11_formatter.hpp
  │
  └── 1.4 Group Aztec commands
        └── Modify: cli.cpp

Phase 2 (bb.js API) ────────────────────────────────────────────────────
  │
  ├── 2.1 Create convenience functions
  │     └── Add: src/noir/index.ts
  │
  ├── 2.2 Improve option naming
  │     └── Modify: src/barretenberg/backend.ts
  │
  └── 2.3 Add JSDoc documentation
        └── Modify: src/barretenberg/backend.ts, src/index.ts

Phase 3 (Examples) ─────────────────────────────────────────────────────
  │
  ├── 3.1 JS verification example
  │     └── Add: examples/js-verification/
  │
  ├── 3.2 Solidity verification example
  │     └── Add: examples/solidity-verification/
  │
  └── 3.3 Recursive verification example
        └── Add: examples/recursive-verification/

Phase 4 (Documentation) ────────────────────────────────────────────────
  │
  ├── 4.1 Update README.md
  │
  ├── 4.2 Create advanced docs
  │     └── Add: docs/advanced.md
  │
  └── 4.3 Add CLI examples command
        └── Modify: cli.cpp

Phase 5 (Cleanup) ──────────────────────────────────────────────────────
  │
  ├── 5.1 Add deprecation notices
  │
  └── 5.2 Create subpath exports
        └── Modify: package.json, tsconfig files
```

---

## Files to Modify/Create

### Modify
- `barretenberg/cpp/src/barretenberg/bb/cli.cpp`
- `barretenberg/cpp/src/barretenberg/bb/cli11_formatter.hpp`
- `barretenberg/ts/src/barretenberg/backend.ts`
- `barretenberg/ts/src/index.ts`
- `barretenberg/ts/README.md`
- `barretenberg/ts/package.json`
- `barretenberg/ts/tsconfig.esm.json`
- `barretenberg/ts/tsconfig.cjs.json`
- `barretenberg/ts/tsconfig.browser.json`
- `docs/docs/developers/docs/resources/glossary.md` (update bb/bb.js entry with links)

### Create
- `barretenberg/ts/src/noir/index.ts`
- `barretenberg/ts/examples/js-verification/` (directory with files)
- `barretenberg/ts/examples/solidity-verification/` (directory with files)
- `barretenberg/ts/examples/recursive-verification/` (directory with files)
- `docs/docs/developers/docs/bb/index.md`
- `docs/docs/developers/docs/bb/cli_reference.md`
- `docs/docs/developers/docs/bb/js_api.md`
- `docs/docs/developers/docs/bb/common_workflows.md`
- `docs/docs/developers/docs/bb/advanced.md`

---

## Breaking Changes Process

Per [issue #1480](https://github.com/AztecProtocol/barretenberg/issues/1480), any breaking changes must:

1. **Draft migration notes** when the breaking change is merged
2. **Update documentation and examples** in the bb docs

### Breaking vs Non-Breaking Changes in This Plan

| Change | Breaking? | Notes |
|--------|-----------|-------|
| Add `--solidity`, `--recursive` flag aliases | No | Additive, existing flags still work |
| Add `proveForSolidity()` etc. convenience functions | No | Additive, existing APIs unchanged |
| Add `target` option to `UltraHonkBackendOptions` | No | Additive, old options still work |
| Deprecate `keccak`, `keccakZK` options | Soft | Add deprecation warnings, don't remove |
| Change default `--oracle_hash` to keccak | **Yes** | Deferred - requires migration notes |
| Create `/noir` subpath export | No | Additive |

### Recommended Approach

1. **Phase 1-3**: Implement all additive changes first (no breaking changes)
2. **Phase 4**: Document the new APIs and workflows
3. **Phase 5**: Add deprecation warnings (soft deprecation, not removal)
4. **Future**: After sufficient adoption of new APIs, consider:
   - Changing defaults (with migration notes)
   - Removing deprecated options (with migration notes)

### Migration Notes Template

When making breaking changes, add to `docs/docs/developers/docs/resources/migration_notes.md`:

```markdown
## bb CLI / bb.js vX.Y.Z

### Breaking Changes

- **Default oracle hash changed to keccak**: Proofs now default to Solidity-verifiable format.
  - Migration: Add `--recursive` flag for recursive proofs (previously the default)
  - Migration: No change needed for Solidity verification workflows

### Deprecations

- `UltraHonkBackendOptions.keccak` is deprecated. Use `target: 'solidity'` instead.
- `UltraHonkBackendOptions.keccakZK` is deprecated. Use `target: 'solidityZK'` instead.
```

---

## Testing Strategy

1. **CLI Tests:** Verify new aliases work correctly
2. **Integration Tests:** New convenience functions produce valid proofs
3. **Example Tests:** All examples compile and run successfully
4. **Backward Compatibility:** Existing code continues to work with deprecation warnings

---

## Migration Guide (for existing users)

```markdown
## Migrating to the New API

### CLI Changes
- `--oracle_hash poseidon2` → `--recursive` (alias, both work)
- `--oracle_hash keccak` → `--solidity` (alias, both work)

### JavaScript/TypeScript Changes
// Old
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
const api = await Barretenberg.new();
const backend = new UltraHonkBackend(circuit, api);
const proof = await backend.generateProof(witness, { keccak: true });

// New (recommended)
import { proveForSolidity } from '@aztec/bb.js/noir';
const proof = await proveForSolidity(circuit, witness);
```

---

## Success Metrics

1. New users can generate a Solidity-verifiable proof with < 10 lines of code
2. Help output clearly distinguishes common vs advanced options
3. Three working example applications demonstrating core use cases
4. Documentation explicitly guides users to the right API for their use case
