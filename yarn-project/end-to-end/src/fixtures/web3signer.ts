import { sleep } from '@aztec/aztec.js';
import { randomBytes } from '@aztec/foundation/crypto';

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

export async function refreshWeb3Signer(url: string) {
  await fetch(new URL('reload', url), { method: 'POST' });
  // give the service a chance to load up the new files
  // 1s might not be enough if there are a lot of files to scan
  await sleep(1000);
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
