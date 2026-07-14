#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import {
  type ParsedContent,
  generateCppConstants,
  generatePilConstants,
  generateSolidityConstants,
  generateTypescriptConstants,
  parseNoirFile,
} from './generator.js';

type GenerateOutput = (content: ParsedContent, targetPath: string) => void;

interface RequestedOutput {
  path: string;
  generate: GenerateOutput;
}

function run(args: string[]): void {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      input: { type: 'string' },
      typescript: { type: 'string' },
      cpp: { type: 'string' },
      pil: { type: 'string' },
      solidity: { type: 'string' },
    },
    strict: true,
  });

  if (!values.input) {
    throw new Error('--input is required');
  }

  const outputs = [
    values.typescript ? { path: values.typescript, generate: generateTypescriptConstants } : undefined,
    values.cpp ? { path: values.cpp, generate: generateCppConstants } : undefined,
    values.pil ? { path: values.pil, generate: generatePilConstants } : undefined,
    values.solidity ? { path: values.solidity, generate: generateSolidityConstants } : undefined,
  ].filter((output): output is RequestedOutput => output !== undefined);

  if (outputs.length === 0) {
    throw new Error('at least one output option is required');
  }

  const parsedContent = parseNoirFile(readFileSync(values.input, 'utf8'));

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
