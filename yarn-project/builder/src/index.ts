/**
 * @packageDocumentation
 *
 * Aztec Contract Builder - TypeScript Code Generation for Noir Contracts
 *
 * @remarks
 * This package provides tools for generating type-safe TypeScript interfaces from Noir smart contracts
 * compiled for the Aztec network. It's primarily used by the `@aztec/noir-contracts.js` package
 * and other contract development tooling.
 *
 * ## Overview
 *
 * The builder takes Noir compilation artifacts (JSON files) and generates TypeScript wrapper classes
 * that provide:
 * - Type-safe method signatures for all contract functions
 * - Deployment methods with constructor argument validation
 * - Event definitions with typed fields
 * - Storage layout information
 * - Contract artifact exports
 *
 * ## Architecture
 *
 * The code generation pipeline:
 * 1. **Input**: Noir compilation artifacts (`.json` files from `nargo compile`)
 * 2. **Processing**: Parse and validate contract ABIs
 * 3. **Type Mapping**: Convert Noir types to TypeScript equivalents
 * 4. **Code Generation**: Generate contract class extending `ContractBase`
 * 5. **Output**: TypeScript files ready for import
 *
 * ## Generated Contract Structure
 *
 * Each generated contract class includes:
 *
 * ```typescript
 * export class ContractNameContract extends ContractBase {
 *   // Factory methods
 *   static deploy(wallet, ...constructorArgs)
 *   static deployWithPublicKeys(publicKeys, wallet, ...constructorArgs)
 *   static deployWithOpts(opts, ...args)
 *   static async at(address, wallet)
 *
 *   // Metadata accessors
 *   static get artifact(): ContractArtifact
 *   static get storage(): ContractStorageLayout
 *   static get events(): EventsMetadata
 *
 *   // Instance methods
 *   methods: {
 *     functionName: (param1, param2) => ContractFunctionInteraction
 *   }
 * }
 * ```
 *
 * ## CLI Usage
 *
 * The builder can be used via the command line:
 *
 * ```bash
 * # Generate TypeScript for a single contract
 * aztec-builder codegen path/to/contract.json -o ./src
 *
 * # Generate for all contracts in a directory
 * aztec-builder codegen path/to/artifacts/ -o ./src
 *
 * # Force regeneration even if unchanged
 * aztec-builder codegen path/to/artifacts/ -o ./src --force
 * ```
 *
 * ## Programmatic Usage
 *
 * ```typescript
 * import { generateCode } from '@aztec/builder';
 *
 * // Generate TypeScript contracts
 * await generateCode('./src', './artifacts', { force: false });
 * ```
 *
 * ## Type Mapping
 *
 * Noir types are mapped to TypeScript as follows:
 *
 * | Noir Type | TypeScript Type |
 * |-----------|-----------------|
 * | `Field` | `FieldLike` |
 * | `bool` | `boolean` |
 * | `u8`, `u32`, `u64`, etc. | `bigint \| number` |
 * | `str<N>` | `string` |
 * | `[T; N]` | `T[]` |
 * | `AztecAddress` | `AztecAddressLike` |
 * | `EthAddress` | `EthAddressLike` |
 * | `FunctionSelector` | `FunctionSelectorLike` |
 * | Custom structs | `{ field1: Type1, field2: Type2 }` |
 *
 * The `-Like` suffix indicates types that accept multiple input formats
 * (e.g., `FieldLike` accepts `Field`, `Fr`, `bigint`, `number`, or `string`).
 *
 * ## Integration with noir-contracts.js
 *
 * This builder is used by `@aztec/noir-contracts.js` during its build process:
 *
 * 1. Noir contracts are compiled to JSON artifacts
 * 2. Builder generates TypeScript wrappers for each contract
 * 3. Generated files are exported from the package
 * 4. Developers import and use the typed contract classes
 *
 * Example workflow:
 * ```typescript
 * import { TokenContract } from '@aztec/noir-contracts.js/Token';
 *
 * // Deploy
 * const token = await TokenContract.deploy(wallet, 'My Token', 'MTK', 18)
 *   .send()
 *   .deployed();
 *
 * // Interact
 * await token.methods.transfer(recipient, amount).send().wait();
 * ```
 *
 * ## Caching
 *
 * The builder uses SHA-256 file hashing to avoid regenerating unchanged contracts.
 * Cache data is stored in `codegenCache.json` and tracks:
 * - File hashes for change detection
 * - Contract names for file mapping
 *
 * Use `--force` flag to bypass cache and regenerate all contracts.
 *
 * @see {@link https://docs.aztec.network | Aztec Documentation}
 * @see {@link generateCode} for the main code generation function
 */

import type { Command } from 'commander';
import { dirname } from 'path';

/**
 * Injects the codegen command into a Commander.js program.
 *
 * @remarks
 * Adds the `codegen` subcommand which generates TypeScript contract interfaces
 * from Noir compilation artifacts. The command accepts:
 * - A path to a single JSON file or directory of JSON files
 * - An optional output directory (defaults to same as input)
 * - An optional `--force` flag to bypass caching
 *
 * @param program - The Commander.js program instance to inject commands into
 * @returns The modified program with the codegen command added
 *
 * @example
 * ```typescript
 * import { Command } from 'commander';
 * import { injectCommands } from '@aztec/builder';
 *
 * const program = new Command();
 * injectCommands(program);
 * program.parse(process.argv);
 * ```
 */
export function injectCommands(program: Command) {
  program
    .command('codegen')
    .argument('<noir-abi-path>', 'Path to the Noir ABI or project dir.')
    .option('-o, --outdir <path>', 'Output folder for the generated code.')
    .option('-f, --force', 'Force code generation even when the contract has not changed.')
    .description('Validates and generates an Aztec Contract ABI from Noir ABI.')
    .action(async (noirAbiPath: string, { outdir, force }) => {
      const { generateCode } = await import('./contract-interface-gen/codegen.js');
      await generateCode(outdir || dirname(noirAbiPath), noirAbiPath, { force });
    });
  return program;
}
