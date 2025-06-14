import { type AztecAddress, EthAddress } from '@aztec/aztec.js';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { Timer } from '@aztec/foundation/timer';

import '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { compressSync, uncompressSync } from 'snappy';
import {
  brotliCompressSync,
  brotliDecompressSync,
  deflateSync,
  inflateSync,
  zstdCompressSync,
  zstdDecompressSync,
} from 'zlib';

import { FullProverTest } from '../fixtures/e2e_prover_test.js';

// Set a 2 minute timeout.
const TIMEOUT = 120_000;

describe('transaction compression', () => {
  const REAL_PROOFS = !parseBooleanEnv(process.env.FAKE_PROOFS);
  const COINBASE_ADDRESS = EthAddress.random();
  const t = new FullProverTest('full_prover', 1, COINBASE_ADDRESS, REAL_PROOFS);

  let { provenAssets, accounts, logger } = t;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  const results: any[] = [];

  const toPrettyString = () => {
    let pretty = '';
    for (const result of results) {
      pretty += `${result.name}: ${result.value} ${result.unit}\n`;
    }
    return pretty;
  };
  const toGithubActionBenchmarkJSON = (indent = 2) => {
    return JSON.stringify(results, null, indent);
  };

  beforeAll(async () => {
    t.logger.warn(`Running suite with ${REAL_PROOFS ? 'real' : 'fake'} proofs`);

    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();

    ({ provenAssets, accounts, logger } = t);
    [sender, recipient] = accounts.map(a => a.address);
  }, 120_000);

  afterAll(async () => {
    await t.teardown();
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      await writeFile(process.env.BENCH_OUTPUT_MD, toPrettyString());
    } else {
      logger.info(`\n`); // sometimes jest tests obscure the last line(s)
      logger.info(toPrettyString());
      logger.info(`\n`);
    }
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it(
    'makes both public and private transfers',
    async () => {
      // Create the two transactions
      const privateBalance = await provenAssets[0].methods.balance_of_private(sender).simulate();
      const privateSendAmount = privateBalance / 10n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAssets[0].methods.transfer(recipient, privateSendAmount);

      const publicBalance = await provenAssets[1].methods.balance_of_public(sender).simulate();
      const publicSendAmount = publicBalance / 10n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = provenAssets[1].methods.transfer_in_public(sender, recipient, publicSendAmount, 0);

      // Prove them
      logger.info(`Proving txs`);
      const [publicProvenTx, privateProvenTx] = await Promise.all([
        publicInteraction.prove(),
        privateInteraction.prove(),
      ]);

      // Verify them
      logger.info(`Verifying txs`);
      await expect(t.circuitProofVerifier?.verifyProof(publicProvenTx)).resolves.not.toThrow();
      await expect(t.circuitProofVerifier?.verifyProof(privateProvenTx)).resolves.not.toThrow();

      const compressTx = (
        txAsBuffer: Buffer,
        compress: (data: Buffer) => Buffer,
        uncompress: (data: Buffer) => Buffer,
        name: string,
        txType: string,
      ) => {
        const numIterations = 50;
        let uncompressed: Buffer = Buffer.alloc(0);
        let compressed: Buffer = Buffer.alloc(0);
        const timer = new Timer();
        for (let i = 0; i < numIterations; i++) {
          compressed = compress(txAsBuffer);
          uncompressed = uncompress(compressed);
        }
        const duration = timer.ms() / numIterations;
        expect(uncompressed).toEqual(txAsBuffer);

        logger.info(`Compressed tx size (${name}): ${compressed.length}, timer: ${duration}`);

        results.push({
          name: `Tx Compression/${txType}/${name}-duration`,
          value: duration,
          unit: 'ms',
        });
        results.push({
          name: `Tx Compression/${txType}/${name}-size`,
          value: compressed.length,
          unit: 'bytes',
        });
      };

      const privateTxAsBuffer = privateProvenTx.toBuffer();

      compressTx(
        privateTxAsBuffer,
        compressSync,
        (data: Buffer) => uncompressSync(data) as Buffer,
        'Snappy',
        'Private Transfer',
      );
      compressTx(privateTxAsBuffer, zstdCompressSync, zstdDecompressSync, 'Zstd', 'Private Transfer');
      compressTx(privateTxAsBuffer, deflateSync, inflateSync, 'Deflate', 'Private Transfer');
      compressTx(privateTxAsBuffer, brotliCompressSync, brotliDecompressSync, 'Brotli', 'Private Transfer');

      const publicTxAsBuffer = publicProvenTx.toBuffer();

      compressTx(
        publicTxAsBuffer,
        compressSync,
        (data: Buffer) => uncompressSync(data) as Buffer,
        'Snappy',
        'Public Transfer',
      );
      compressTx(publicTxAsBuffer, zstdCompressSync, zstdDecompressSync, 'Zstd', 'Public Transfer');
      compressTx(publicTxAsBuffer, deflateSync, inflateSync, 'Deflate', 'Public Transfer');
      compressTx(publicTxAsBuffer, brotliCompressSync, brotliDecompressSync, 'Brotli', 'Public Transfer');
    },
    TIMEOUT,
  );
});
