import { createLogger } from '@aztec/foundation/log';
import { ClientIvcProof } from '@aztec/stdlib/proofs';

import os from 'os';
import { ungzip } from 'pako';

const logger = createLogger('ivc-integration:prove_wasm');

function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export async function proveClientIVC(
  bytecodes: string[],
  witnessStack: Uint8Array[],
  threads?: number,
): Promise<ClientIvcProof> {
  const { AztecClientBackend } = await import('@aztec/bb.js');
  const backend = new AztecClientBackend(
    bytecodes.map(base64ToUint8Array).map((arr: Uint8Array) => ungzip(arr)),
    { threads: threads || Math.min(os.cpus().length, 16), logger: logger.info },
  );
  try {
    const [proof] = await backend.prove(witnessStack.map((arr: Uint8Array) => ungzip(arr)));
    return new ClientIvcProof(Buffer.from(proof));
  } finally {
    await backend.destroy();
  }
}

export async function proveThenVerifyAztecClient(
  bytecodes: string[],
  witnessStack: Uint8Array[],
  threads?: number,
): Promise<boolean> {
  const { AztecClientBackend } = await import('@aztec/bb.js');
  const backend = new AztecClientBackend(
    bytecodes.map(base64ToUint8Array).map((arr: Uint8Array) => ungzip(arr)),
    { threads: threads || Math.min(os.cpus().length, 16), logger: logger.info },
  );
  try {
    // These are optional - easier not to pass them.
    const [proof, vk] = await backend.prove(witnessStack.map((arr: Uint8Array) => ungzip(arr)));
    const verified = await backend.verify(proof, vk);
    return verified;
  } finally {
    await backend.destroy();
  }
}
