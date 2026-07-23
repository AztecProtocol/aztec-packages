#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  type ParsedContent,
  evaluateExpressions,
  generateCppConstants,
  generatePilConstants,
  generateRustConstants,
  generateSolidityConstants,
  generateTypescriptConstants,
  parseNoirFile,
} from './generator.ts';
import { readSymbolSelection, selectSymbols } from './selection.ts';

type GenerateOutput = (content: ParsedContent, targetPath: string) => void;

function parseIncludedConstant(value: string): { path: string; symbol: string } {
  const separatorIndex = value.lastIndexOf(':');
  const path = value.slice(0, separatorIndex);
  const symbol = value.slice(separatorIndex + 1);
  if (separatorIndex <= 0 || !/^\w+$/.test(symbol)) {
    throw new Error(`invalid --include value '${value}', expected <file.nr>:<symbol>`);
  }
  return { path, symbol };
}

function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      input: { type: 'string' },
      include: { type: 'string', multiple: true },
      selection: { type: 'string' },
      typescript: { type: 'string' },
      cpp: { type: 'string' },
      pil: { type: 'string' },
      solidity: { type: 'string' },
      rust: { type: 'string' },
    },
    strict: true,
  });

  // Resolved relative to this file, so it exists only when the package sits inside the
  // aztec-packages monorepo; the published npm package must be given --input explicitly.
  const defaultInput = fileURLToPath(
    new URL('../../../noir-projects/noir-protocol-circuits/crates/types/src/constants.nr', import.meta.url),
  );
  const input = values.input ?? (existsSync(defaultInput) ? defaultInput : undefined);
  if (!input) {
    throw new Error('--input is required when running outside the aztec-packages monorepo');
  }

  const generators: [string | undefined, GenerateOutput][] = [
    [values.typescript, generateTypescriptConstants],
    [values.cpp, generateCppConstants],
    [values.pil, generatePilConstants],
    [values.solidity, generateSolidityConstants],
    [values.rust, generateRustConstants],
  ];
  const outputs = generators.filter(([path]) => path !== undefined);
  if (outputs.length !== 1) {
    throw new Error('exactly one output option is required');
  }
  const [outputPath, generate] = outputs[0] as [string, GenerateOutput];

  const { constantsExpressions, domainSeparatorEnum } = parseNoirFile(readFileSync(input, 'utf8'));
  for (const value of values.include ?? []) {
    const { path, symbol } = parseIncludedConstant(value);
    const { constantsExpressions: includedExpressions } = parseNoirFile(readFileSync(path, 'utf8'), {
      stripLineComments: true,
    });
    const expression = includedExpressions.find(([name]) => name === symbol);
    if (!expression) {
      throw new Error(`constant '${symbol}' not found in ${path}`);
    }
    constantsExpressions.push(expression);
  }

  const parsedContent: ParsedContent = {
    constants: evaluateExpressions(constantsExpressions),
    domainSeparatorEnum,
  };

  const outputContent = values.selection
    ? selectSymbols(parsedContent, readSymbolSelection(values.selection))
    : parsedContent;
  mkdirSync(dirname(outputPath), { recursive: true });
  generate(outputContent, outputPath);
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`constants-codegen: ${message}`);
  process.exitCode = 1;
}
