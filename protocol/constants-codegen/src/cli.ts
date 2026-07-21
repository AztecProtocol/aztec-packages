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

type GenerateOutput = (content: ParsedContent, targetPath: string) => void;

interface RequestedOutput {
  path: string;
  generate: GenerateOutput;
}

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

  const outputs = [
    values.typescript ? { path: values.typescript, generate: generateTypescriptConstants } : undefined,
    values.cpp ? { path: values.cpp, generate: generateCppConstants } : undefined,
    values.pil ? { path: values.pil, generate: generatePilConstants } : undefined,
    values.solidity ? { path: values.solidity, generate: generateSolidityConstants } : undefined,
    values.rust ? { path: values.rust, generate: generateRustConstants } : undefined,
  ].filter((output): output is RequestedOutput => output !== undefined);

  if (outputs.length === 0) {
    throw new Error('at least one output option is required');
  }

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

  for (const output of outputs) {
    mkdirSync(dirname(output.path), { recursive: true });
    output.generate(parsedContent, output.path);
  }
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`constants-codegen: ${message}`);
  process.exitCode = 1;
}
