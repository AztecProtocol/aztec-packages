import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const NOIR_CONSTANTS_FILE = '../../../../noir-projects/noir-protocol-circuits/crates/types/src/constants.nr';
const TS_CONSTANTS_FILE = '../constants.gen.ts';
const CPP_AZTEC_CONSTANTS_FILE = '../../../../barretenberg/cpp/src/barretenberg/vm/aztec_constants.hpp';
const PIL_AZTEC_CONSTANTS_FILE = '../../../../barretenberg/cpp/pil/avm/constants_gen.pil';
const SOLIDITY_CONSTANTS_FILE = '../../../../l1-contracts/src/core/libraries/ConstantsGen.sol';

// Whitelist of constants that will be copied to aztec_constants.hpp.
// We don't copy everything as just a handful are needed, and updating them breaks the cache and triggers expensive bb builds.
const CPP_CONSTANTS = [
  'TOTAL_FEES_LENGTH',
  'GAS_FEES_LENGTH',
  'GAS_LENGTH',
  'CONTENT_COMMITMENT_LENGTH',
  'GLOBAL_VARIABLES_LENGTH',
  'APPEND_ONLY_TREE_SNAPSHOT_LENGTH',
  'PARTIAL_STATE_REFERENCE_LENGTH',
  'STATE_REFERENCE_LENGTH',
  'HEADER_LENGTH',
  'CALL_CONTEXT_LENGTH',
  'PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH',
  'READ_REQUEST_LENGTH',
  'MAX_ENQUEUED_CALLS_PER_TX',
  'MAX_NOTE_HASHES_PER_TX',
  'MAX_NULLIFIERS_PER_TX',
  'MAX_L2_TO_L1_MSGS_PER_TX',
  'MAX_UNENCRYPTED_LOGS_PER_TX',
  'MAX_NOTE_HASH_READ_REQUESTS_PER_CALL',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX',
  'MAX_UNENCRYPTED_LOGS_PER_TX',
  'MAX_NULLIFIER_READ_REQUESTS_PER_CALL',
  'MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL',
  'MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL',
  'CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL',
  'CONTRACT_STORAGE_READ_LENGTH',
  'PUBLIC_INNER_CALL_REQUEST_LENGTH',
  'MAX_PUBLIC_DATA_READS_PER_CALL',
  'MAX_ENQUEUED_CALLS_PER_CALL',
  'NOTE_HASH_LENGTH',
  'MAX_NOTE_HASHES_PER_CALL',
  'NULLIFIER_LENGTH',
  'MAX_NULLIFIERS_PER_CALL',
  'L2_TO_L1_MESSAGE_LENGTH',
  'MAX_L2_TO_L1_MSGS_PER_CALL',
  'LOG_HASH_LENGTH',
  'MAX_UNENCRYPTED_LOGS_PER_CALL',
  'HEADER_LENGTH',
  'GLOBAL_VARIABLES_LENGTH',
  'AZTEC_ADDRESS_LENGTH',
  'START_NOTE_HASH_EXISTS_WRITE_OFFSET',
  'START_NULLIFIER_EXISTS_OFFSET',
  'START_NULLIFIER_NON_EXISTS_OFFSET',
  'START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET',
  'START_SSTORE_WRITE_OFFSET',
  'START_SLOAD_WRITE_OFFSET',
  'START_EMIT_NOTE_HASH_WRITE_OFFSET',
  'START_EMIT_NULLIFIER_WRITE_OFFSET',
  'START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET',
  'START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET',
  'SENDER_KERNEL_INPUTS_COL_OFFSET',
  'ADDRESS_KERNEL_INPUTS_COL_OFFSET',
  'CHAIN_ID_KERNEL_INPUTS_COL_OFFSET',
  'VERSION_KERNEL_INPUTS_COL_OFFSET',
  'BLOCK_NUMBER_KERNEL_INPUTS_COL_OFFSET',
  'TIMESTAMP_KERNEL_INPUTS_COL_OFFSET',
  'FEE_PER_DA_GAS_KERNEL_INPUTS_COL_OFFSET',
  'FEE_PER_L2_GAS_KERNEL_INPUTS_COL_OFFSET',
  'IS_STATIC_CALL_KERNEL_INPUTS_COL_OFFSET',
  'DA_START_GAS_KERNEL_INPUTS_COL_OFFSET',
  'L2_START_GAS_KERNEL_INPUTS_COL_OFFSET',
  'DA_END_GAS_KERNEL_INPUTS_COL_OFFSET',
  'L2_END_GAS_KERNEL_INPUTS_COL_OFFSET',
  'TRANSACTION_FEE_KERNEL_INPUTS_COL_OFFSET',
  'MEM_TAG_U1',
  'MEM_TAG_U8',
  'MEM_TAG_U16',
  'MEM_TAG_U32',
  'MEM_TAG_U64',
  'MEM_TAG_U128',
  'MEM_TAG_FF',
  'MAX_L2_GAS_PER_TX_PUBLIC_PORTION',
  'MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS',
  'CANONICAL_AUTH_REGISTRY_ADDRESS',
  'DEPLOYER_CONTRACT_ADDRESS',
  'REGISTERER_CONTRACT_ADDRESS',
  'MULTI_CALL_ENTRYPOINT_ADDRESS',
  'FEE_JUICE_ADDRESS',
  'ROUTER_ADDRESS',
];

const CPP_GENERATORS: string[] = [
  'PARTIAL_ADDRESS',
  'CONTRACT_ADDRESS_V1',
  'CONTRACT_LEAF',
  'PUBLIC_KEYS_HASH',
  'NOTE_HASH_NONCE',
  'UNIQUE_NOTE_HASH',
  'SILOED_NOTE_HASH',
  'OUTER_NULLIFIER',
  'PUBLIC_LEAF_INDEX',
];

const PIL_CONSTANTS = [
  'MAX_NOTE_HASH_READ_REQUESTS_PER_CALL',
  'MAX_NULLIFIER_READ_REQUESTS_PER_CALL',
  'MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL',
  'MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL',
  'MAX_PUBLIC_DATA_READS_PER_CALL',
  'MAX_ENQUEUED_CALLS_PER_CALL',
  'MAX_NOTE_HASHES_PER_CALL',
  'MAX_NULLIFIERS_PER_CALL',
  'MAX_L2_TO_L1_MSGS_PER_CALL',
  'MAX_UNENCRYPTED_LOGS_PER_CALL',
  'START_NOTE_HASH_EXISTS_WRITE_OFFSET',
  'START_NULLIFIER_EXISTS_OFFSET',
  'START_NULLIFIER_NON_EXISTS_OFFSET',
  'START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET',
  'START_SSTORE_WRITE_OFFSET',
  'START_SLOAD_WRITE_OFFSET',
  'START_EMIT_NOTE_HASH_WRITE_OFFSET',
  'START_EMIT_NULLIFIER_WRITE_OFFSET',
  'START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET',
  'START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET',
  'SENDER_KERNEL_INPUTS_COL_OFFSET',
  'ADDRESS_KERNEL_INPUTS_COL_OFFSET',
  'CHAIN_ID_KERNEL_INPUTS_COL_OFFSET',
  'VERSION_KERNEL_INPUTS_COL_OFFSET',
  'BLOCK_NUMBER_KERNEL_INPUTS_COL_OFFSET',
  'TIMESTAMP_KERNEL_INPUTS_COL_OFFSET',
  'FEE_PER_DA_GAS_KERNEL_INPUTS_COL_OFFSET',
  'FEE_PER_L2_GAS_KERNEL_INPUTS_COL_OFFSET',
  'IS_STATIC_CALL_KERNEL_INPUTS_COL_OFFSET',
  'DA_START_GAS_KERNEL_INPUTS_COL_OFFSET',
  'L2_START_GAS_KERNEL_INPUTS_COL_OFFSET',
  'DA_END_GAS_KERNEL_INPUTS_COL_OFFSET',
  'L2_END_GAS_KERNEL_INPUTS_COL_OFFSET',
  'TRANSACTION_FEE_KERNEL_INPUTS_COL_OFFSET',
  'MEM_TAG_U1',
  'MEM_TAG_U8',
  'MEM_TAG_U16',
  'MEM_TAG_U32',
  'MEM_TAG_U64',
  'MEM_TAG_U128',
  'MEM_TAG_FF',
  'MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS',
];

/**
 * Parsed content.
 */
interface ParsedContent {
  /**
   * Constants of the form "CONSTANT_NAME: number_as_string".
   */
  constants: { [key: string]: string };
  /**
   * GeneratorIndexEnum.
   */
  generatorIndexEnum: { [key: string]: number };
}

/**
 * Processes a collection of constants and generates code to export them as TypeScript constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as TypeScript constants.
 */
function processConstantsTS(constants: { [key: string]: string }): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    code.push(`export const ${key} = ${+value > Number.MAX_SAFE_INTEGER ? value + 'n' : value};`);
  });
  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as cpp constants.
 * Required to ensure consistency between the constants used in pil and used in the vm witness generator.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as cpp constants.
 */
function processConstantsCpp(
  constants: { [key: string]: string },
  generatorIndices: { [key: string]: number },
): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (CPP_CONSTANTS.includes(key) || (key.startsWith('AVM_') && key !== 'AVM_VK_INDEX')) {
      // stringify large numbers
      code.push(`#define ${key} ${BigInt(value) > 2n ** 31n - 1n ? `"0x${BigInt(value).toString(16)}"` : value}`);
    }
  });
  Object.entries(generatorIndices).forEach(([key, value]) => {
    if (CPP_GENERATORS.includes(key)) {
      code.push(`#define GENERATOR_INDEX__${key} ${value}`);
    }
  });
  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as PIL constants.
 * Required to ensure consistency between the constants used in pil and used in the vm witness generator.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as cpp constants.
 */
function processConstantsPil(constants: { [key: string]: string }): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (PIL_CONSTANTS.includes(key)) {
      code.push(`    pol ${key} = ${value};`);
    }
  });
  return code.join('\n');
}
/**
 * Processes an enum and generates code to export it as a TypeScript enum.
 *
 * @param enumName - The name of the enum.
 * @param enumValues - An object containing key-value pairs representing enum values.
 * @returns A string containing code that exports the enum as a TypeScript enum.
 */
function processEnumTS(enumName: string, enumValues: { [key: string]: number }): string {
  const code: string[] = [];

  code.push(`export enum ${enumName} {`);

  Object.entries(enumValues).forEach(([key, value]) => {
    code.push(`  ${key} = ${value},`);
  });

  code.push('}');

  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as Solidity constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @param prefix - A prefix to add to the constant names.
 * @returns A string containing code that exports the constants as Noir constants.
 */
function processConstantsSolidity(constants: { [key: string]: string }, prefix = ''): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (!key.startsWith('AVM_')) {
      code.push(`  uint256 internal constant ${prefix}${key} = ${value};`);
    }
  });
  return code.join('\n');
}

/**
 * Generate the constants file in Typescript.
 */
function generateTypescriptConstants({ constants, generatorIndexEnum }: ParsedContent, targetPath: string) {
  const result = [
    '/* eslint-disable */\n// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants',
    processConstantsTS(constants),
    processEnumTS('GeneratorIndex', generatorIndexEnum),
  ].join('\n');

  fs.writeFileSync(targetPath, result);
}

/**
 * Generate the constants file in C++.
 */
function generateCppConstants({ constants, generatorIndexEnum }: ParsedContent, targetPath: string) {
  const resultCpp: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in circuits.js
#pragma once

${processConstantsCpp(constants, generatorIndexEnum)}
`;

  fs.writeFileSync(targetPath, resultCpp);
}

/**
 * Generate the constants file in PIL.
 */
function generatePilConstants({ constants }: ParsedContent, targetPath: string) {
  const resultPil: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in circuits.js
namespace constants(256);
${processConstantsPil(constants)}
\n`;

  fs.writeFileSync(targetPath, resultPil);
}

/**
 * Generate the constants file in Solidity.
 */
function generateSolidityConstants({ constants }: ParsedContent, targetPath: string) {
  const resultSolidity: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in circuits.js
// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @title Constants Library
 * @author Aztec Labs
 * @notice Library that contains constants used throughout the Aztec protocol
 */
library Constants {
  // Prime field modulus
  uint256 internal constant P =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

${processConstantsSolidity(constants)}
}\n`;

  fs.writeFileSync(targetPath, resultSolidity);
}

/**
 * Parse the content of the constants file in Noir.
 */
function parseNoirFile(fileContent: string): ParsedContent {
  const constantsExpressions: [string, string][] = [];
  const generatorIndexEnum: { [key: string]: number } = {};

  const emptyExpression = (): { name: string; content: string[] } => ({ name: '', content: [] });
  let expression = emptyExpression();
  fileContent.split('\n').forEach(l => {
    const line = l.trim();

    if (!line) {
      // Empty line.
      return;
    }

    if (line.match(/^\/\/|^\s*\/?\*/)) {
      // Comment.
      return;
    }

    {
      const [, name, _type, value, end] = line.match(/global\s+(\w+)(\s*:\s*\w+)?\s*=\s*([^;]*)(;)?/) || [];
      if (name && value) {
        const [, indexName] = name.match(/GENERATOR_INDEX__(\w+)/) || [];
        if (indexName) {
          // Generator index.
          generatorIndexEnum[indexName] = +value;
        } else if (end) {
          // A single line of expression.
          constantsExpressions.push([name, value]);
        } else {
          // The first line of an expression.
          expression = { name, content: [value] };
        }
        return;
      } else if (name) {
        // This case happens if we have only a name, with the value being on the next line
        expression = { name, content: [] };
        return;
      }
    }

    if (expression.name) {
      // The expression continues...
      const [, content, end] = line.match(/\s*([^;]+)(;)?/) || [];
      expression.content.push(content);
      if (end) {
        // The last line of an expression.
        constantsExpressions.push([expression.name, expression.content.join('')]);
        expression = emptyExpression();
      }
      return;
    }

    if (!line.includes('use crate')) {
      // eslint-disable-next-line no-console
      console.warn(`Unknown content: ${line}`);
    }
  });

  const constants = evaluateExpressions(constantsExpressions);

  return { constants, generatorIndexEnum };
}

/**
 * Converts constants defined as expressions to constants with actual values.
 * @param expressions Ordered list of expressions of the type: "CONSTANT_NAME: expression".
 *   where the expression is a string that can be evaluated to a number.
 *   For example: "CONSTANT_NAME: 2 + 2" or "CONSTANT_NAME: CONSTANT_A * CONSTANT_B".
 * @returns Parsed expressions of the form: "CONSTANT_NAME: number_as_string".
 */
function evaluateExpressions(expressions: [string, string][]): { [key: string]: string } {
  const constants: { [key: string]: string } = {};

  const knownBigInts = ['AZTEC_EPOCH_DURATION', 'FEE_RECIPIENT_LENGTH'];

  // Create JS expressions. It is not as easy as just evaluating the expression!
  // We basically need to convert everything to BigInts, otherwise things don't fit.
  // However, (1) the bigints need to be initialized from strings; (2) everything needs to
  // be a bigint, even the actual constant values!
  const prelude = expressions
    .map(([name, rhs]) => {
      const guardedRhs = rhs
        // Remove 'as u8' and 'as u32' castings
        .replaceAll(' as u8', '')
        .replaceAll(' as u32', '')
        // Remove the 'AztecAddress::from_field(...)' pattern
        .replace(/AztecAddress::from_field\((0x[a-fA-F0-9]+|[0-9]+)\)/g, '$1')
        // We make some space around the parentheses, so that constant numbers are still split.
        .replace(/\(/g, '( ')
        .replace(/\)/g, ' )')
        // We also make some space around common operators
        .replace(/\+/g, ' + ')
        .replace(/(?<!\/)\*(?!\/)/, ' * ')
        // We split the expression into terms...
        .split(/\s+/)
        // ...and then we convert each term to a BigInt if it is a number.
        .map(term => (isNaN(+term) ? term : `BigInt('${term}')`))
        // .. also, we convert the known bigints to BigInts.
        .map(term => (knownBigInts.includes(term) ? `BigInt(${term})` : term))
        // We join the terms back together.
        .join(' ');
      return `var ${name} = ${guardedRhs};`;
    })
    .join('\n');

  // Extract each value from the expressions. Observe that this will still be a string,
  // so that we can then choose to express it as BigInt or Number depending on the size.
  for (const [name, _] of expressions) {
    constants[name] = eval(prelude + `; BigInt(${name}).toString()`);
  }

  return constants;
}

/**
 * Convert the Noir constants to TypeScript and Solidity.
 */
function main(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const noirConstantsFile = join(__dirname, NOIR_CONSTANTS_FILE);
  const noirConstants = fs.readFileSync(noirConstantsFile, 'utf-8');
  const parsedContent = parseNoirFile(noirConstants);

  // Typescript
  const tsTargetPath = join(__dirname, TS_CONSTANTS_FILE);
  generateTypescriptConstants(parsedContent, tsTargetPath);

  // Cpp
  const cppTargetPath = join(__dirname, CPP_AZTEC_CONSTANTS_FILE);
  generateCppConstants(parsedContent, cppTargetPath);

  // PIL
  const pilTargetPath = join(__dirname, PIL_AZTEC_CONSTANTS_FILE);
  generatePilConstants(parsedContent, pilTargetPath);

  // Solidity
  const solidityTargetPath = join(__dirname, SOLIDITY_CONSTANTS_FILE);
  fs.mkdirSync(dirname(solidityTargetPath), { recursive: true });
  generateSolidityConstants(parsedContent, solidityTargetPath);
}

main();
