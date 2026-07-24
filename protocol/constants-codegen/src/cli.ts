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

function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      input: { type: 'string' },
      selection: { type: 'string' },
      typescript: { type: 'string' },
      cpp: { type: 'string' },
      pil: { type: 'string' },
      solidity: { type: 'string' },
      rust: { type: 'string' },
    },
    strict: true,
  });

  // The default input is embedded by scripts/embed-inputs.sh: prepack ships it in the published
  // tarball, while in-repo callers pass --input (via scripts/generate.sh).
  const defaultInput = fileURLToPath(new URL('../inputs/constants.nr', import.meta.url));
  const input = values.input ?? (existsSync(defaultInput) ? defaultInput : undefined);
  if (!input) {
    throw new Error('--input is required when the package has no embedded inputs');
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
