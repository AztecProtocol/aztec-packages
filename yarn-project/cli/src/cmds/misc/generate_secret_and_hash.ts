import { computePrivateContentHash } from '@aztec/aztec.js/crypto';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LogFn } from '@aztec/foundation/log';

export async function generateSecretAndHash(log: LogFn) {
  const secret = Fr.random();

  const privateContent = [secret];
  const privateContentHash = await computePrivateContentHash(privateContent);

  log(`
    Secret: ${secret}
    Private content hash: ${privateContentHash}
  `);
}
