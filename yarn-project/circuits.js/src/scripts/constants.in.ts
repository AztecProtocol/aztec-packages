import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const NOIR_CONSTANTS_FILE = '../../../../noir-projects/noir-protocol-circuits/crates/types/src/constants.nr';
const TS_CONSTANTS_FILE = '../constants.gen.ts';
const CPP_AZTEC_CONSTANTS_FILE = '../../../../barretenberg/cpp/src/barretenberg/vm/avm_trace/aztec_constants.hpp';
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
  'PUBLIC_CONTEXT_INPUTS_LENGTH',
  'PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH',
  'READ_REQUEST_LENGTH',
  'MAX_NULLIFIER_READ_REQUESTS_PER_CALL',
  'MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL',
  'CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH',
  'MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL',
  'CONTRACT_STORAGE_READ_LENGTH',
  'MAX_PUBLIC_DATA_READS_PER_CALL',
  'MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL',
  'NOTE_HASH_LENGTH',
  'MAX_NEW_NOTE_HASHES_PER_CALL',
  'NULLIFIER_LENGTH',
  'MAX_NEW_NULLIFIERS_PER_CALL',
  'L2_TO_L1_MESSAGE_LENGTH',
  'MAX_NEW_L2_TO_L1_MSGS_PER_CALL',
  'LOG_HASH_LENGTH',
  'MAX_UNENCRYPTED_LOGS_PER_CALL',
  'HEADER_LENGTH',
  'GLOBAL_VARIABLES_LENGTH',
  'AZTEC_ADDRESS_LENGTH',
  'GAS_LENGTH',
];

/**
 * Parsed content.
 */
interface ParsedContent {
  /**
   * Constants.
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
function processConstantsCpp(constants: { [key: string]: string }): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    // We exclude large numbers
    if (CPP_CONSTANTS.includes(key) && !(value.startsWith('0x') || value.includes('0_0'))) {
      code.push(`const size_t ${key} = ${value};`);
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
    code.push(`  uint256 internal constant ${prefix}${key} = ${value};`);
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
function generateCppConstants({ constants }: ParsedContent, targetPath: string) {
  const resultCpp: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in circuits.js
#pragma once
#include <cstddef>

${processConstantsCpp(constants)}
\n`;

  fs.writeFileSync(targetPath, resultCpp);
}

/**
 * Generate the constants file in Solidity.
 */
function generateSolidityConstants({ constants }: ParsedContent, targetPath: string) {
  const resultSolidity: string = `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in circuits.js
// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title Constants Library
 * @author Aztec Labs
 * @notice Library that contains constants used throughout the Aztec protocol
 */
library Constants {
  // Prime field modulus
  uint256 internal constant P =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;
  uint256 internal constant MAX_FIELD_VALUE = P - 1;

${processConstantsSolidity(constants)}
}\n`;

  fs.writeFileSync(targetPath, resultSolidity);
}

/**
 * Parse the content of the constants file in Noir.
 */
function parseNoirFile(fileContent: string): ParsedContent {
  const constants: { [key: string]: string } = {};
  const generatorIndexEnum: { [key: string]: number } = {};

  fileContent.split('\n').forEach(l => {
    const line = l.trim();
    if (!line || line.match(/^\/\/|^\s*\/?\*/)) {
      return;
    }

    const [, name, _type, value] = line.match(/global\s+(\w+)(\s*:\s*\w+)?\s*=\s*(.+?);/) || [];

    if (!name || !value) {
      // eslint-disable-next-line no-console
      console.warn(`Unknown content: ${line}`);
      return;
    }

    const [, indexName] = name.match(/GENERATOR_INDEX__(\w+)/) || [];
    if (indexName) {
      generatorIndexEnum[indexName] = +value;
    } else {
      constants[name] = value;
    }
  });

  return { constants, generatorIndexEnum };
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

  // Solidity
  const solidityTargetPath = join(__dirname, SOLIDITY_CONSTANTS_FILE);
  fs.mkdirSync(dirname(solidityTargetPath), { recursive: true });
  generateSolidityConstants(parsedContent, solidityTargetPath);
}

main();
