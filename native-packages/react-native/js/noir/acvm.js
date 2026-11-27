// The ACVM service (@aztec-labs/acvm) on its native library, linked into the app and reached through ipc-runtime's
// JSI binding: what the app's acvm_js and noirc_abi (./acvm_js.js, ./noirc_abi.js, which withAztec resolves those
// packages to) run on, since Hermes has no WebAssembly.
import { createJsiFfiBackend, createJsiFfiBackendSync } from '@aztec-foundation/ipc-runtime/react-native';
import { AsyncApi, SyncApi } from '@aztec-labs/acvm';
import { handleRequest } from '@aztec-labs/acvm-oracle';

const FFI = { ffiName: 'acvm', library: 'libaztec_acvm.so' };

let syncApi;

/** The service on the JavaScript thread, for the commands that make no foreign calls. */
export function acvmSync() {
  syncApi ??= new SyncApi(createJsiFfiBackendSync(FFI));
  return syncApi;
}

let nextExecutionId = 1;

/**
 * Runs `run` on an instance of the service on a native thread of its own, whose foreign calls `foreignCall`
 * answers on the JavaScript thread. Each execution has an instance of its own, so executions run in parallel.
 */
export async function withExecution(foreignCall, run) {
  const executionId = nextExecutionId++;
  const backend = createJsiFfiBackend({
    ...FFI,
    hostCall: { oracle: request => handleRequest({ foreignCall }, request) },
  });
  try {
    return await run(new AsyncApi(backend), executionId);
  } finally {
    await backend.destroy();
  }
}

/** acvm_js's field: 0x and 64 hex digits. */
export function fieldToHex(bytes) {
  let hex = '0x';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** A field, as acvm_js takes it (hex, with or without 0x, at most 64 digits), as 32 big-endian bytes. */
export function fieldFromHex(value) {
  const hex = String(value).replace(/^0x/i, '');
  if (hex.length > 64 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error(`Invalid hex string: '${value}'`);
  }
  const padded = hex.padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(padded.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

/** WitnessMap (Map<number, string>) to the service's witness entries. */
export function witnessToWire(witness) {
  const entries = [];
  for (const [index, value] of witness) {
    entries.push({ index, value: fieldFromHex(value) });
  }
  return entries;
}

/** The service's witness entries to a WitnessMap. */
export function witnessFromWire(entries) {
  return new Map(entries.map(({ index, value }) => [index, fieldToHex(value)]));
}

export function stackToWire(stack) {
  return stack.map(({ index, witness }) => ({ index, witness: witnessToWire(witness) }));
}

export function stackFromWire(items) {
  return items.map(({ index, witness }) => ({ index, witness: witnessFromWire(witness) }));
}

export function bytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
