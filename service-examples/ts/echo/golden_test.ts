/**
 * Golden file wire compatibility test (TypeScript).
 *
 * Verifies that TypeScript can correctly deserialize msgpack data produced by
 * the Rust reference implementation (the golden files). This is the critical
 * cross-language compatibility check — if TS can read Rust's output, and the
 * round-trip tests show Rust can read TS's output, wire compat is proven.
 *
 * Usage: npx tsx golden_test.ts
 * Exits 0 if all pass, 1 on failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Decoder } from 'msgpackr';

const decoder = new Decoder({ useRecords: false });
const goldenDir = path.join(import.meta.dirname!, '../../echo-schema', 'golden');

let pass = 0;
let fail = 0;

function assertEqual(actual: any, expected: any, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

function bufEqual(a: Uint8Array, b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function checkGoldenRequest(name: string, expectedCmdName: string, validate: (fields: any) => void) {
  try {
    const golden = fs.readFileSync(path.join(goldenDir, name));
    const decoded = decoder.unpack(golden) as any[];
    // Request format: [[commandName, {fields}]]
    assertEqual(decoded.length, 1, `${name} array length`);
    const [cmdName, fields] = decoded[0];
    assertEqual(cmdName, expectedCmdName, `${name} command name`);
    validate(fields);
    console.log(`  PASS: ${name}`);
    pass++;
  } catch (e: any) {
    console.log(`  FAIL: ${name}: ${e.message}`);
    fail++;
  }
}

function checkGoldenResponse(name: string, expectedRespName: string, validate: (fields: any) => void) {
  try {
    const golden = fs.readFileSync(path.join(goldenDir, name));
    const decoded = decoder.unpack(golden) as any[];
    // Response format: [responseName, {fields}]
    assertEqual(decoded.length, 2, `${name} array length`);
    const [respName, fields] = decoded;
    assertEqual(respName, expectedRespName, `${name} response name`);
    validate(fields);
    console.log(`  PASS: ${name}`);
    pass++;
  } catch (e: any) {
    console.log(`  FAIL: ${name}: ${e.message}`);
    fail++;
  }
}

console.log('Golden file deserialization tests (TypeScript):\n');

// Request golden files
checkGoldenRequest('echo_bytes_request.msgpack', 'EchoBytes', (f) => {
  if (!bufEqual(f.data, [0xDE, 0xAD, 0xBE, 0xEF, 0x42])) {
    throw new Error('data mismatch');
  }
});

checkGoldenRequest('echo_fields_request.msgpack', 'EchoFields', (f) => {
  assertEqual(f.a, 42, 'a');
  assertEqual(f.b, 999999, 'b');
  assertEqual(f.name, 'hello wire compat', 'name');
});

checkGoldenRequest('echo_nested_request.msgpack', 'EchoNested', (f) => {
  assertEqual(f.inner.flag, true, 'flag');
  assertEqual(f.inner.values.length, 2, 'values length');
  if (!bufEqual(f.inner.values[0], [1, 2, 3])) throw new Error('values[0] mismatch');
  if (!bufEqual(f.inner.values[1], [4, 5])) throw new Error('values[1] mismatch');
});

// Response golden files
checkGoldenResponse('echo_bytes_response.msgpack', 'EchoBytesResponse', (f) => {
  if (!bufEqual(f.data, [0xDE, 0xAD, 0xBE, 0xEF, 0x42])) {
    throw new Error('data mismatch');
  }
});

checkGoldenResponse('echo_fields_response.msgpack', 'EchoFieldsResponse', (f) => {
  assertEqual(f.a, 42, 'a');
  assertEqual(f.b, 999999, 'b');
  assertEqual(f.name, 'hello wire compat', 'name');
});

checkGoldenResponse('echo_nested_response.msgpack', 'EchoNestedResponse', (f) => {
  assertEqual(f.inner.flag, true, 'flag');
  assertEqual(f.inner.values.length, 2, 'values length');
  if (!bufEqual(f.inner.values[0], [1, 2, 3])) throw new Error('values[0] mismatch');
  if (!bufEqual(f.inner.values[1], [4, 5])) throw new Error('values[1] mismatch');
});

console.log(`\nResults: ${pass}/${pass + fail} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
