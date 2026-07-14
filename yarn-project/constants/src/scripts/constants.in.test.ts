import { jest } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  type ParsedContent,
  evaluateExpressions,
  generateCppConstants,
  generatePilConstants,
  generateSolidityConstants,
  generateTypescriptConstants,
  parseNoirFile,
} from './constants.in.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const noirConstantsPath = join(
  scriptDir,
  '../../../../noir-projects/noir-protocol-circuits/crates/types/src/constants.nr',
);

function parseCurrentNoirConstants(): ParsedContent {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const { constantsExpressions, domainSeparatorEnum } = parseNoirFile(readFileSync(noirConstantsPath, 'utf8'));
    return { constants: evaluateExpressions(constantsExpressions), domainSeparatorEnum };
  } finally {
    warning.mockRestore();
  }
}

function generateToString(generate: (content: ParsedContent, targetPath: string) => void): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-codegen-'));
  const targetPath = join(tempDir, 'output');
  try {
    generate(parseCurrentNoirConstants(), targetPath);
    return readFileSync(targetPath, 'utf8');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function normalizeCppFormatting(content: string): string {
  return content
    .replace(/\\\r?\n\s*/g, ' ')
    .split('\n')
    .map(line => line.trim().replaceAll(/\s+/g, ' '))
    .join('\n')
    .trim();
}

function normalizeSolidityFormatting(content: string): string {
  return content
    .replaceAll(/(?<=\d)_(?=\d)/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

describe('current constants generator', () => {
  it('reproduces the checked-in TypeScript output', () => {
    const generated = generateToString(generateTypescriptConstants);
    const checkedIn = readFileSync(join(scriptDir, '../constants.gen.ts'), 'utf8');

    expect(generated).toBe(checkedIn);
  });

  it('reproduces the checked-in C++ symbols and values', () => {
    const generated = generateToString(generateCppConstants);
    const checkedIn = readFileSync(
      join(scriptDir, '../../../../barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp'),
      'utf8',
    );

    expect(normalizeCppFormatting(generated)).toBe(normalizeCppFormatting(checkedIn));
  });

  it('reproduces the checked-in PIL output', () => {
    const generated = generateToString(generatePilConstants);
    const checkedIn = readFileSync(join(scriptDir, '../../../../barretenberg/cpp/pil/vm2/constants_gen.pil'), 'utf8');

    expect(generated).toBe(checkedIn);
  });

  it('reproduces the checked-in Solidity symbols and values', () => {
    const generated = generateToString(generateSolidityConstants);
    const checkedIn = readFileSync(
      join(scriptDir, '../../../../l1-contracts/src/core/libraries/ConstantsGen.sol'),
      'utf8',
    );

    expect(normalizeSolidityFormatting(generated)).toBe(normalizeSolidityFormatting(checkedIn));
  });
});
