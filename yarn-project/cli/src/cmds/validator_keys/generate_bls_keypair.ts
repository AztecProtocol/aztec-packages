import { deriveBlsPrivateKey } from '@aztec/foundation/crypto';
import type { LogFn } from '@aztec/foundation/log';

import { writeFile } from 'fs/promises';

import { computeBlsPublicKeyCompressed, withValidatorIndex } from './shared.js';

export type GenerateBlsKeypairOptions = {
  mnemonic?: string;
  ikm?: string;
  blsPath?: string;
  g2?: boolean;
  compressed?: boolean;
  json?: boolean;
  out?: string;
};

export async function generateBlsKeypair(options: GenerateBlsKeypairOptions, log: LogFn) {
  const { mnemonic, ikm, blsPath, compressed = true, json, out } = options;
  const path = withValidatorIndex(blsPath ?? 'm/12381/3600/0/0/0', 0);
  const priv = deriveBlsPrivateKey(mnemonic, ikm, path);
  const pub = await computeBlsPublicKeyCompressed(priv);
  const result = { path, privateKey: priv, publicKey: pub, format: compressed ? 'compressed' : 'uncompressed' };
  if (out) {
    await writeFile(out, JSON.stringify(result, null, 2), { encoding: 'utf-8' });
    if (!json) {
      log(`Wrote BLS keypair to ${out}`);
    }
  }
  if (json || !out) {
    log(JSON.stringify(result, null, 2));
  }
}
