# Aztec Builder

The Aztec builder generates type-safe TypeScript interfaces from Noir smart contracts compiled for the Aztec network. It transforms Noir compilation artifacts into fully-typed contract wrapper classes that integrate seamlessly with the Aztec SDK.

## Features

- **Type-Safe Contract Interfaces**: Automatically generates TypeScript classes with typed method signatures
- **Multiple Deployment Patterns**: Standard deployment, custom public keys, and advanced deployment options
- **Event Support**: Type definitions for contract events with typed fields
- **Storage Layout**: Exposes contract storage information for debugging and advanced use cases
- **Incremental Builds**: Smart caching system to avoid regenerating unchanged contracts
- **Full ABI Export**: Access to complete contract artifacts for advanced tooling

## Installation

```bash
yarn add @aztec/builder
```

## CLI Usage

### Basic Usage

Generate TypeScript wrappers for Noir contracts:

```bash
# Generate from a single contract artifact
aztec-builder codegen path/to/contract.json -o ./src

# Generate from a directory of artifacts
aztec-builder codegen path/to/artifacts/ -o ./src

# Force regeneration (bypass cache)
aztec-builder codegen path/to/artifacts/ -o ./src --force
```

### Command Options

- `<noir-abi-path>` - Path to a Noir compilation artifact (.json) or directory
- `-o, --outdir <path>` - Output directory for generated TypeScript files (defaults to input directory)
- `-f, --force` - Force regeneration even when artifacts haven't changed

## Programmatic Usage

```typescript
import { generateCode } from '@aztec/builder';

// Generate TypeScript contracts from artifacts
const generatedFiles = await generateCode(
  './src/contracts',      // Output directory
  './artifacts',          // Input directory with .json files
  { force: false }        // Options
);

console.log('Generated:', generatedFiles);
```

## Generated Contract Structure

Each contract artifact generates a TypeScript class with the following structure:

```typescript
export class ContractNameContract extends ContractBase {
  // Static factory methods
  static deploy(wallet: Wallet, ...constructorArgs)
  static deployWithPublicKeys(publicKeys: PublicKeys, wallet: Wallet, ...constructorArgs)
  static deployWithOpts(opts: DeployOptions, ...args)
  static async at(address: AztecAddress, wallet: Wallet)

  // Static metadata accessors
  static get artifact(): ContractArtifact
  static get storage(): ContractStorageLayout
  static get events(): EventsMetadata

  // Instance methods for contract functions
  methods: {
    functionName: (param1: Type1, param2: Type2) => ContractFunctionInteraction
  }
}
```

## Type Mapping

Noir types are converted to TypeScript types as follows:

| Noir Type | TypeScript Type | Description |
|-----------|-----------------|-------------|
| `Field` | `FieldLike` | Field element (accepts `Fr`, `bigint`, `number`, `string`) |
| `bool` | `boolean` | Boolean value |
| `u8`, `u32`, `u64` | `bigint \| number` | Unsigned integers |
| `str<N>` | `string` | Fixed-length string |
| `[T; N]` | `T[]` | Fixed-length array |
| `AztecAddress` | `AztecAddressLike` | Aztec address (accepts `AztecAddress` or string) |
| `EthAddress` | `EthAddressLike` | Ethereum address |
| `FunctionSelector` | `FunctionSelectorLike` | Function selector |
| Custom structs | `{ field1: Type1, field2: Type2 }` | Object literal |

The `-Like` suffix indicates types that accept multiple input formats for developer convenience.

## Usage Examples

### Deploying a Contract

```typescript
import { TokenContract } from './contracts/Token';
import { createWallet } from '@aztec/aztec.js';

const wallet = await createWallet();

// Standard deployment
const token = await TokenContract.deploy(
  wallet,
  'My Token',  // name
  'MTK',       // symbol
  18           // decimals
).send().deployed();

console.log('Token deployed at:', token.address.toString());
```

### Connecting to Existing Contract

```typescript
import { TokenContract } from './contracts/Token';
import { AztecAddress } from '@aztec/aztec.js';

const address = AztecAddress.fromString('0x123...');
const token = await TokenContract.at(address, wallet);

// Now you can call methods
const balance = await token.methods.balance_of(owner).simulate();
```

### Calling Contract Methods

```typescript
// Simulate (doesn't send transaction)
const balance = await token.methods.balance_of(owner).simulate();
console.log('Balance:', balance);

// Send transaction
const tx = token.methods.transfer(recipient, amount).send();
const receipt = await tx.wait();
console.log('Transfer confirmed:', receipt.txHash);

// Estimate gas before sending
const simulation = await token.methods.complexOperation(args)
  .simulate({ estimateGas: true });
console.log('Estimated gas:', simulation.estimatedGas);
```

### Advanced Deployment

```typescript
// Deploy with custom public keys
const publicKeys = PublicKeys.from({ /* ... */ });
const contract = await TokenContract.deployWithPublicKeys(
  publicKeys,
  wallet,
  'My Token',
  'MTK',
  18
).send().deployed();

// Deploy with specific constructor method
const contract = await TokenContract.deployWithOpts(
  {
    wallet,
    method: 'public_constructor',
    publicKeys: PublicKeys.default()
  },
  constructorArg1,
  constructorArg2
).send().deployed();
```

### Accessing Contract Metadata

```typescript
// Get contract artifact
const artifact = TokenContract.artifact;
console.log('Contract name:', artifact.name);
console.log('Functions:', artifact.functions);

// Get storage layout
const storage = TokenContract.storage;
console.log('Balance slot:', storage.balances.slot);

// Get event metadata
const events = TokenContract.events;
console.log('Transfer event selector:', events.Transfer.eventSelector);
```

## Integration with noir-contracts.js

This builder is used by `@aztec/noir-contracts.js` during its build process:

1. Noir contracts are compiled using `nargo`
2. Compilation produces JSON artifacts in the `target/` directory
3. Builder generates TypeScript wrappers from these artifacts
4. Generated files are exported from the package
5. Developers import typed contract classes in their applications

Example integration script:

```bash
#!/bin/bash
# Part of noir-contracts.js build process

# Compile Noir contracts
cd noir-contracts && nargo compile

# Generate TypeScript wrappers
cd ../noir-contracts.js
aztec-builder codegen ../noir-contracts/target -o ./src
```

## Caching

The builder uses SHA-256 file hashing to detect changes and avoid unnecessary regeneration:

- Cache is stored in `codegenCache.json` in the working directory
- Tracks file hashes and contract names
- Automatically updated after each generation
- Use `--force` flag to bypass cache when needed

Example cache structure:

```json
{
  "token_contract-abc123.json": {
    "contractName": "Token",
    "hash": "a7b8c9d..."
  }
}
```

## Architecture

### Code Generation Pipeline

```
Noir Contract (.nr)
  ↓ [nargo compile]
Compilation Artifact (.json)
  ↓ [loadContractArtifact]
Aztec ContractArtifact
  ↓ [generateTypescriptContractInterface]
TypeScript Contract Class (.ts)
```

### Key Components

1. **codegen.ts** - Main entry point, handles file I/O and caching
2. **typescript.ts** - TypeScript code generation logic
3. **Type mapping** - Converts Noir types to TypeScript equivalents
4. **Template generation** - Creates contract class structure

## Contributing

See the main [Aztec monorepo](https://github.com/AztecProtocol/aztec-packages) for contribution guidelines.

## License

Apache-2.0 or MIT
