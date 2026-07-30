import * as fs from 'node:fs';

/**
 * Parsed content.
 */
export interface ParsedContent {
  /**
   * Constants of the form "CONSTANT_NAME: number_as_string".
   */
  constants: { [key: string]: string };
  /**
   * DomainSeparatorEnum.
   */
  domainSeparatorEnum: { [key: string]: number };
}

/**
 * Raw expressions parsed from a Noir file, prior to evaluation. Keeping expressions unevaluated lets callers merge
 * constants from multiple files and resolve cross-file references in a single evaluation pass.
 */
export interface ParsedExpressions {
  /** Ordered list of constant name and expression pairs. */
  constantsExpressions: [string, string][];
  /** DomainSeparatorEnum members. */
  domainSeparatorEnum: { [key: string]: number };
}

/**
 * Processes a collection of constants and generates code to export them as TypeScript constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @returns A string containing code that exports the constants as TypeScript constants.
 */
export function processConstantsTS(constants: { [key: string]: string }): string {
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
export function processConstantsCpp(
  constants: { [key: string]: string },
  generatorIndices: { [key: string]: number },
): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (BigInt(value) <= 2n ** 31n - 1n) {
      code.push(`#define ${key} ${value}`);
    } else if (BigInt(value) <= 2n ** 64n - 1n) {
      code.push(`#define ${key} 0x${BigInt(value).toString(16)}`); // hex literals
    } else {
      code.push(`#define ${key} "0x${BigInt(value).toString(16).padStart(64, '0')}"`); // stringify large numbers
    }
  });
  Object.entries(generatorIndices).forEach(([key, value]) => {
    code.push(`#define DOM_SEP__${key} ${value}UL`);
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
export function processConstantsPil(
  constants: { [key: string]: string },
  generatorIndices: { [key: string]: number },
): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    code.push(`    pol ${key} = ${value};`);
  });
  Object.entries(generatorIndices).forEach(([key, value]) => {
    code.push(`    pol DOM_SEP__${key} = ${value};`);
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
export function processEnumTS(enumName: string, enumValues: { [key: string]: number }): string {
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
 * @param generatorIndices - An object containing key-value pairs representing domain separator indices.
 * @param prefix - A prefix to add to the constant names.
 * @returns A string containing code that exports the constants as Noir constants.
 */
export function processConstantsSolidity(
  constants: { [key: string]: string },
  generatorIndices: { [key: string]: number },
  prefix = '',
): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    code.push(`  uint256 internal constant ${prefix}${key} = ${value};`);
  });
  Object.entries(generatorIndices).forEach(([key, value]) => {
    code.push(`  uint256 internal constant ${prefix}DOM_SEP__${key} = ${value};`);
  });
  return code.join('\n');
}

/**
 * Processes a collection of constants and generates code to export them as Rust constants.
 *
 * @param constants - An object containing key-value pairs representing constants.
 * @param generatorIndices - An object containing key-value pairs representing domain separator indices.
 * @returns A string containing code that exports the constants as Rust constants.
 */
export function processConstantsRust(
  constants: { [key: string]: string },
  generatorIndices: { [key: string]: number },
): string {
  const code: string[] = [];
  Object.entries(constants).forEach(([key, value]) => {
    if (BigInt(value) <= 2n ** 128n - 1n) {
      code.push(`pub const ${key}: u128 = ${value};`);
    } else {
      // Field-sized values exceed u128, so they are emitted as hex strings.
      code.push(`pub const ${key}: &str = "0x${BigInt(value).toString(16).padStart(64, '0')}";`);
    }
  });
  Object.entries(generatorIndices).forEach(([key, value]) => {
    code.push(`pub const DOM_SEP__${key}: u128 = ${value};`);
  });
  return code.join('\n');
}

/**
 * Generate the constants file in Typescript.
 */
export function generateTypescriptConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const result = [
    '// GENERATED FILE - DO NOT EDIT',
    processConstantsTS(constants),
    processEnumTS('DomainSeparator', domainSeparatorEnum),
  ].join('\n');

  fs.writeFileSync(targetPath, result);
}

/**
 * Generate the constants file in C++.
 */
export function generateCppConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const resultCpp: string = `// GENERATED FILE - DO NOT EDIT
#pragma once

${processConstantsCpp(constants, domainSeparatorEnum)}
`;

  fs.writeFileSync(targetPath, resultCpp);
}

/**
 * Generate the constants file in PIL.
 */
export function generatePilConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const resultPil: string = `// GENERATED FILE - DO NOT EDIT
namespace constants;
${processConstantsPil(constants, domainSeparatorEnum)}
\n`;

  fs.writeFileSync(targetPath, resultPil);
}

/**
 * Generate the constants file in Solidity.
 */
export function generateSolidityConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const resultSolidity: string = `// GENERATED FILE - DO NOT EDIT
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

${processConstantsSolidity(constants, domainSeparatorEnum)}
}\n`;

  fs.writeFileSync(targetPath, resultSolidity);
}

/**
 * Generate the constants file in Rust.
 */
export function generateRustConstants({ constants, domainSeparatorEnum }: ParsedContent, targetPath: string) {
  const resultRust: string = `// GENERATED FILE - DO NOT EDIT
${processConstantsRust(constants, domainSeparatorEnum)}
`;

  fs.writeFileSync(targetPath, resultRust);
}

/**
 * Parse the content of the constants file in Noir.
 */
export function parseNoirFile(fileContent: string): ParsedExpressions {
  const constantsExpressions: [string, string][] = [];
  const domainSeparatorEnum: { [key: string]: number } = {};

  const emptyExpression = (): { name: string; content: string[] } => ({ name: '', content: [] });
  let expression = emptyExpression();
  fileContent.split('\n').forEach(l => {
    // Line comments are stripped so they never leak into expressions, where they would swallow
    // the rest of the expression when it is later evaluated as JavaScript.
    const line = l.replace(/\/\/.*$/, '').trim();

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
        const [, indexName] = name.match(/DOM_SEP__(\w+)/) || [];
        if (indexName) {
          // Generator index.
          domainSeparatorEnum[indexName] = +value;
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

  return { constantsExpressions, domainSeparatorEnum };
}

/**
 * Converts constants defined as expressions to constants with actual values.
 * @param expressions Ordered list of expressions of the type: "CONSTANT_NAME: expression".
 *   where the expression is a string that can be evaluated to a number.
 *   For example: "CONSTANT_NAME: 2 + 2" or "CONSTANT_NAME: CONSTANT_A * CONSTANT_B".
 * @returns Parsed expressions of the form: "CONSTANT_NAME: number_as_string".
 */
export function evaluateExpressions(expressions: [string, string][]): { [key: string]: string } {
  const constants: { [key: string]: string } = {};

  const knownBigInts = ['AZTEC_EPOCH_DURATION', 'FEE_RECIPIENT_LENGTH'];

  // Create JS expressions. It is not as easy as just evaluating the expression!
  // We basically need to convert everything to BigInts, otherwise things don't fit.
  // However, (1) the bigints need to be initialized from strings; (2) everything needs to
  // be a bigint, even the actual constant values!
  const prelude = expressions
    .map(([name, rhs]) => {
      const guardedRhs = rhs
        // Remove 'as u8', 'as u32' and 'as u64' castings
        .replaceAll(' as u8', '')
        .replaceAll(' as u32', '')
        .replaceAll(' as u64', '')
        // Remove the 'AztecAddress::from_field(...)' pattern.
        // Also copes with the noir formatter re-formatting over multiple lines.
        .replace(/AztecAddress::from_field\(\s*(0x[a-fA-F0-9]+|\d+)\s*,?\s*\)/gs, '$1')
        // We make some space around the parentheses, so that constant numbers are still split.
        .replace(/\(/g, '( ')
        .replace(/\)/g, ' )')
        // We also make some space around common operators
        .replace(/\+/g, ' + ')
        .replace(/(?<!\/)\*(?!\/)/, ' * ')
        // We split the expression into terms...
        .split(/\s+/)
        // ...and then we convert each term to a BigInt if it is a number.
        .map(term => {
          // Remove underscores from numeric literals (e.g., 6_000_000 -> 6000000)
          const termWithoutUnderscores = term.replace(/_/g, '');
          return isNaN(+termWithoutUnderscores) ? term : `BigInt('${termWithoutUnderscores}')`;
        })
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
