import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  type ParsedContent,
  evaluateExpressions,
  generateCppConstants,
  generatePilConstants,
  generateSolidityConstants,
  generateTypescriptConstants,
  parseNoirFile,
} from './generator.ts';

const noirFixture = `
pub global MAX_FIELD_VALUE: Field =
    21888242871839275222246405745257275088548364400416034343698204186575808495616;
pub global MAX_ETH_ADDRESS_VALUE: Field = 0xffffffffffffffffffffffffffffffffffffffff;
pub global ARCHIVE_HEIGHT: u32 = 30;
pub global DOM_SEP__MERKLE_HASH: u32 = 2982624097;
`;

function generateToString(generate: (content: ParsedContent, targetPath: string) => void): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-codegen-'));
  const targetPath = join(tempDir, 'output');
  try {
    const { constantsExpressions, domainSeparatorEnum } = parseNoirFile(noirFixture);
    generate({ constants: evaluateExpressions(constantsExpressions), domainSeparatorEnum }, targetPath);
    return readFileSync(targetPath, 'utf8');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('generates TypeScript constants and domain separators', () => {
  assert.equal(
    generateToString(generateTypescriptConstants),
    `// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants
export const MAX_FIELD_VALUE = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
export const MAX_ETH_ADDRESS_VALUE = 1461501637330902918203684832716283019655932542975n;
export const ARCHIVE_HEIGHT = 30;
export enum DomainSeparator {
  MERKLE_HASH = 2982624097,
}`,
  );
});

test('generates the existing C++ subset', () => {
  const output = generateToString(generateCppConstants);

  assert.match(output, /#define MAX_ETH_ADDRESS_VALUE "0x0{24}f{40}"/);
  assert.match(output, /#define ARCHIVE_HEIGHT 30/);
  assert.match(output, /#define DOM_SEP__MERKLE_HASH 2982624097UL/);
  assert.doesNotMatch(output, /MAX_FIELD_VALUE/);
});

test('generates the existing PIL subset', () => {
  const output = generateToString(generatePilConstants);

  assert.match(output, /pol MAX_ETH_ADDRESS_VALUE = 1461501637330902918203684832716283019655932542975;/);
  assert.match(output, /pol DOM_SEP__MERKLE_HASH = 2982624097;/);
  assert.doesNotMatch(output, /ARCHIVE_HEIGHT/);
});

test('generates the existing Solidity subset', () => {
  const output = generateToString(generateSolidityConstants);

  assert.match(
    output,
    /uint256 internal constant MAX_FIELD_VALUE = 21888242871839275222246405745257275088548364400416034343698204186575808495616;/,
  );
  assert.doesNotMatch(output, /ARCHIVE_HEIGHT/);
});

test('the CLI generates multiple requested outputs', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-codegen-cli-'));
  const inputPath = join(tempDir, 'constants.nr');
  const includedInputPath = join(tempDir, 'additional.nr');
  const typescriptPath = join(tempDir, 'typescript', 'constants.ts');
  const cppPath = join(tempDir, 'cpp', 'constants.hpp');
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.ts');

  try {
    writeFileSync(inputPath, noirFixture);
    writeFileSync(
      includedInputPath,
      `pub global INCLUDED_CONSTANT: u32 = ARCHIVE_HEIGHT + 1; // selected for export
pub global EXCLUDED_CONSTANT: u32 = 100;
`,
    );
    execFileSync(
      process.execPath,
      [
        cliPath,
        '--input',
        inputPath,
        '--include',
        `${includedInputPath}:INCLUDED_CONSTANT`,
        '--typescript',
        typescriptPath,
        '--cpp',
        cppPath,
      ],
      { stdio: 'pipe' },
    );

    assert.match(readFileSync(typescriptPath, 'utf8'), /export const ARCHIVE_HEIGHT = 30;/);
    assert.match(readFileSync(typescriptPath, 'utf8'), /export const INCLUDED_CONSTANT = 31;/);
    assert.doesNotMatch(readFileSync(typescriptPath, 'utf8'), /EXCLUDED_CONSTANT/);
    assert.match(readFileSync(cppPath, 'utf8'), /#define ARCHIVE_HEIGHT 30/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
