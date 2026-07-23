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
  generateRustConstants,
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
    `// GENERATED FILE - DO NOT EDIT
export const MAX_FIELD_VALUE = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
export const MAX_ETH_ADDRESS_VALUE = 1461501637330902918203684832716283019655932542975n;
export const ARCHIVE_HEIGHT = 30;
export enum DomainSeparator {
  MERKLE_HASH = 2982624097,
}`,
  );
});

test('generates C++ constants and domain separators', () => {
  const output = generateToString(generateCppConstants);

  assert.match(output, /#define MAX_FIELD_VALUE/);
  assert.match(output, /#define MAX_ETH_ADDRESS_VALUE "0x0{24}f{40}"/);
  assert.match(output, /#define ARCHIVE_HEIGHT 30/);
  assert.match(output, /#define DOM_SEP__MERKLE_HASH 2982624097UL/);
});

test('generates PIL constants and domain separators', () => {
  const output = generateToString(generatePilConstants);

  assert.match(
    output,
    /pol MAX_FIELD_VALUE = 21888242871839275222246405745257275088548364400416034343698204186575808495616;/,
  );
  assert.match(output, /pol MAX_ETH_ADDRESS_VALUE = 1461501637330902918203684832716283019655932542975;/);
  assert.match(output, /pol ARCHIVE_HEIGHT = 30;/);
  assert.match(output, /pol DOM_SEP__MERKLE_HASH = 2982624097;/);
});

test('generates Rust constants', () => {
  const output = generateToString(generateRustConstants);

  assert.match(output, /pub const ARCHIVE_HEIGHT: u128 = 30;/);
  assert.match(
    output,
    /pub const MAX_ETH_ADDRESS_VALUE: &str = "0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff";/,
  );
  assert.match(
    output,
    /pub const MAX_FIELD_VALUE: &str = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000";/,
  );
  assert.match(output, /pub const DOM_SEP__MERKLE_HASH: u128 = 2982624097;/);
});

test('generates Solidity constants', () => {
  const output = generateToString(generateSolidityConstants);

  assert.match(
    output,
    /uint256 internal constant MAX_FIELD_VALUE = 21888242871839275222246405745257275088548364400416034343698204186575808495616;/,
  );
  assert.match(output, /uint256 internal constant ARCHIVE_HEIGHT = 30;/);
});

test('the CLI generates one output per invocation with its selection', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-codegen-cli-'));
  const inputPath = join(tempDir, 'constants.nr');
  const includedInputPath = join(tempDir, 'additional.nr');
  const typescriptSelectionPath = join(tempDir, 'typescript-selection.json');
  const cppSelectionPath = join(tempDir, 'cpp-selection.json');
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
    writeFileSync(typescriptSelectionPath, JSON.stringify(['ARCHIVE_HEIGHT', 'INCLUDED_CONSTANT']));
    writeFileSync(cppSelectionPath, JSON.stringify(['MAX_ETH_ADDRESS_VALUE', 'DOM_SEP__MERKLE_HASH']));
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
        '--selection',
        typescriptSelectionPath,
      ],
      { stdio: 'pipe' },
    );
    execFileSync(process.execPath, [cliPath, '--input', inputPath, '--cpp', cppPath, '--selection', cppSelectionPath], {
      stdio: 'pipe',
    });

    assert.match(readFileSync(typescriptPath, 'utf8'), /export const ARCHIVE_HEIGHT = 30;/);
    assert.match(readFileSync(typescriptPath, 'utf8'), /export const INCLUDED_CONSTANT = 31;/);
    assert.doesNotMatch(readFileSync(typescriptPath, 'utf8'), /MAX_ETH_ADDRESS_VALUE/);
    assert.doesNotMatch(readFileSync(typescriptPath, 'utf8'), /EXCLUDED_CONSTANT/);
    assert.match(readFileSync(cppPath, 'utf8'), /#define MAX_ETH_ADDRESS_VALUE/);
    assert.match(readFileSync(cppPath, 'utf8'), /#define DOM_SEP__MERKLE_HASH 2982624097UL/);
    assert.doesNotMatch(readFileSync(cppPath, 'utf8'), /ARCHIVE_HEIGHT/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('the CLI rejects more than one output option', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-codegen-cli-'));
  const inputPath = join(tempDir, 'constants.nr');
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.ts');

  try {
    writeFileSync(inputPath, noirFixture);

    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            cliPath,
            '--input',
            inputPath,
            '--typescript',
            join(tempDir, 'constants.ts'),
            '--cpp',
            join(tempDir, 'constants.hpp'),
          ],
          { encoding: 'utf8', stdio: 'pipe' },
        ),
      error => error instanceof Error && error.message.includes('exactly one output option is required'),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('the CLI rejects unknown selected symbols', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-codegen-cli-'));
  const inputPath = join(tempDir, 'constants.nr');
  const selectionPath = join(tempDir, 'selection.json');
  const outputPath = join(tempDir, 'constants.ts');
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.ts');

  try {
    writeFileSync(inputPath, noirFixture);
    writeFileSync(selectionPath, JSON.stringify(['UNKNOWN_CONSTANT']));

    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [cliPath, '--input', inputPath, '--typescript', outputPath, '--selection', selectionPath],
          { encoding: 'utf8', stdio: 'pipe' },
        ),
      error => error instanceof Error && error.message.includes("unknown symbol 'UNKNOWN_CONSTANT'"),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('the CLI defaults --input to the monorepo constants.nr', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-codegen-cli-'));
  const typescriptPath = join(tempDir, 'constants.ts');
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.ts');

  try {
    execFileSync(process.execPath, [cliPath, '--typescript', typescriptPath], { stdio: 'pipe' });
    assert.match(readFileSync(typescriptPath, 'utf8'), /export const ARCHIVE_HEIGHT = \d+;/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
