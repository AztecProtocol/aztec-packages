import { retryUntil, sleep } from '@aztec/aztec.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { RemoteSigner } from '@aztec/node-keystore';

import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createWeb3SignerKeystore(dir: string, ...privateKeys: string[]) {
  const yaml = privateKeys
    .map(
      pk => `\
type: file-raw
keyType: SECP256K1
privateKey: ${pk}`,
    )
    .join('\n---\n');

  // NOTE: nodejs stdlib can only create temp directories, not temp files!
  // this write uses wx (write-exclusive) so it'll throw if the file already exists
  const path = join(dir, `keystore-${randomBytes(4).toString('hex')}.yaml`);
  await writeFile(path, yaml, { flag: 'wx' });
}

export async function refreshWeb3Signer(url: string, ...expectedAddresses: string[]) {
  await fetch(new URL('reload', url), { method: 'POST' });

  if (expectedAddresses.length > 0) {
    await retryUntil(
      async () => {
        try {
          await RemoteSigner.validateAccess(url, expectedAddresses);
          return true;
        } catch {
          return false;
        }
      },
      'web3signer refresh',
      10,
      0.5,
    );
  } else {
    await sleep(1000);
  }
}

export function getWeb3SignerTestKeystoreDir(): string {
  if (process.env.WEB3_SIGNER_TEST_KEYSTORE_DIR) {
    mkdirSync(process.env.WEB3_SIGNER_TEST_KEYSTORE_DIR, { recursive: true });
    return process.env.WEB3_SIGNER_TEST_KEYSTORE_DIR;
  } else {
    throw new Error('Web3signer not running');
  }
}

export function getWeb3SignerUrl(): string {
  if (process.env.WEB3_SIGNER_URL) {
    return process.env.WEB3_SIGNER_URL;
  } else {
    throw new Error('Web3signer not running');
  }
}
