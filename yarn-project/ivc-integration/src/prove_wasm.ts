import { ungzip } from 'pako';

function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export async function proveThenVerifyAztecClient(
  bytecodes: string[],
  witnessStack: Uint8Array[],
  threads?: number,
): Promise<boolean> {
  const { AztecClientBackend } = await import('@aztec/bb.js');
  const backend = new AztecClientBackend(
    bytecodes.map(base64ToUint8Array).map((arr: Uint8Array) => ungzip(arr)),
    { threads },
  );
  try {
    // These are optional - easier not to pass them.
    const emptyVks = witnessStack.map(_ => Buffer.from([]));
    const [proof, vk] = await backend.prove(
      witnessStack.map((arr: Uint8Array) => ungzip(arr)),
      emptyVks,
    );
    const verified = await backend.verify(proof, vk);
    return verified;
  } finally {
    await backend.destroy();
  }
}
