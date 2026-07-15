#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import {
  type ParsedContent,
  evaluateExpressions,
  generateCppConstants,
  generatePilConstants,
  generateSolidityConstants,
  generateTypescriptConstants,
  parseNoirFile,
} from './generator.js';
import { readSymbolSelection, selectSymbols } from './selection.js';

type GenerateOutput = (content: ParsedContent, targetPath: string) => void;

interface RequestedOutput {
  path: string;
  selectionPath: string | undefined;
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
      'typescript-selection': { type: 'string' },
      cpp: { type: 'string' },
      'cpp-selection': { type: 'string' },
      pil: { type: 'string' },
      'pil-selection': { type: 'string' },
      solidity: { type: 'string' },
      'solidity-selection': { type: 'string' },
    },
    strict: true,
  });

  if (!values.input) {
    throw new Error('--input is required');
  }

  const outputs = [
    values.typescript
      ? {
          path: values.typescript,
          selectionPath: values['typescript-selection'],
          generate: generateTypescriptConstants,
        }
      : undefined,
    values.cpp
      ? { path: values.cpp, selectionPath: values['cpp-selection'], generate: generateCppConstants }
      : undefined,
    values.pil
      ? { path: values.pil, selectionPath: values['pil-selection'], generate: generatePilConstants }
      : undefined,
    values.solidity
      ? { path: values.solidity, selectionPath: values['solidity-selection'], generate: generateSolidityConstants }
      : undefined,
  ].filter((output): output is RequestedOutput => output !== undefined);

  const unpairedSelection = [
    ['typescript', values.typescript, values['typescript-selection']],
    ['cpp', values.cpp, values['cpp-selection']],
    ['pil', values.pil, values['pil-selection']],
    ['solidity', values.solidity, values['solidity-selection']],
  ].find(([, output, selection]) => selection && !output);
  if (unpairedSelection) {
    throw new Error(`--${unpairedSelection[0]}-selection requires --${unpairedSelection[0]}`);
  }

  if (outputs.length === 0) {
    throw new Error('at least one output option is required');
  }

  const { constantsExpressions, domainSeparatorEnum } = parseNoirFile(readFileSync(values.input, 'utf8'));
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
    const outputContent = output.selectionPath
      ? selectSymbols(parsedContent, readSymbolSelection(output.selectionPath))
      : parsedContent;
    output.generate(outputContent, output.path);
  }
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`constants-codegen: ${message}`);
  process.exitCode = 1;
}
