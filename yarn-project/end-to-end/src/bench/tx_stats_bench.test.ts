import { type AztecAddress, EthAddress, ProvenTx, Tx, sleep } from '@aztec/aztec.js';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { Timer } from '@aztec/foundation/timer';
import type { IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';

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

describe('transaction benchmarks', () => {
  const REAL_PROOFS = !parseBooleanEnv(process.env.FAKE_PROOFS);
  const COINBASE_ADDRESS = EthAddress.random();
  const t = new FullProverTest('full_prover', 1, COINBASE_ADDRESS, REAL_PROOFS);

  let { provenAssets, accounts, logger } = t;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  const results: any[] = [];

  let publicProvenTx: ProvenTx;
  let privateProvenTx: ProvenTx;

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
    const [publicTx, privateTx] = await Promise.all([publicInteraction.prove(), privateInteraction.prove()]);

    publicProvenTx = publicTx;
    privateProvenTx = privateTx;

    // Verify them
    logger.info(`Verifying txs`);
    await expect(t.circuitProofVerifier?.verifyProof(publicProvenTx)).resolves.not.toThrow();
    await expect(t.circuitProofVerifier?.verifyProof(privateProvenTx)).resolves.not.toThrow();
  }, TIMEOUT);

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
      const compressTx = (
        txAsBuffer: Buffer,
        compress: (data: Buffer) => Buffer,
        uncompress: (data: Buffer) => Buffer,
        name: string,
        txType: string,
      ) => {
        logger.info(`Compressing ${txType} tx with ${name}`);
        const numIterations = 50;
        const uncompressed: Buffer[] = Array.from({ length: numIterations }, () => Buffer.alloc(0));
        const compressed: Buffer[] = Array.from({ length: numIterations }, () => Buffer.alloc(0));
        const compressionTimer = new Timer();
        for (let i = 0; i < numIterations; i++) {
          compressed[i] = compress(txAsBuffer);
        }
        const compressionDuration = compressionTimer.ms() / numIterations;
        const decompressionTimer = new Timer();
        for (let i = 0; i < numIterations; i++) {
          uncompressed[i] = uncompress(compressed[i]);
        }
        const decompressionDuration = decompressionTimer.ms() / numIterations;

        // Comparing these buffers takes some time, so we compare one in full and the others we compare length
        expect(uncompressed[0]).toEqual(txAsBuffer);
        for (let i = 0; i < numIterations; i++) {
          expect(uncompressed[i].length).toEqual(txAsBuffer.length);
          expect(compressed[0].length).toEqual(compressed[i].length);
        }

        logger.info(
          `Compressed tx size (${name}): ${compressed.length}, compression time: ${compressionDuration}ms, decompression time: ${decompressionDuration}ms`,
        );

        results.push({
          name: `Tx Compression/${txType}/${name}/Compression Duration`,
          value: compressionDuration,
          unit: 'ms',
        });
        results.push({
          name: `Tx Compression/${txType}/${name}/Decompression Duration`,
          value: decompressionDuration,
          unit: 'ms',
        });
        results.push({
          name: `Tx Compression/${txType}/${name}/Compressed Size`,
          value: compressed[0].length,
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

  const runSingleProofVerificationTest = async (tx: ProvenTx, type: 'Private' | 'Public') => {
    const numIterations = 20;
    const resultsArray: (IVCProofVerificationResult | undefined)[] = Array.from({ length: numIterations }).map(
      x => undefined,
    );
    // Verify proof serially and take an average
    for (let i = 0; i < numIterations; i++) {
      const result = await t.circuitProofVerifier?.verifyProof(tx);
      resultsArray[i] = result;
    }
    resultsArray.forEach(result => expect(result?.valid ?? false).toBe(true));
    const durations = resultsArray.filter(result => result !== undefined).map(result => result.durationMs);
    const totalDurations = resultsArray.filter(result => result !== undefined).map(result => result.totalDurationMs);
    results.push({
      name: `Tx IVC Verification/Single ${type} Transaction/IVC Verification Time`,
      value: durations.reduce((a, b) => a + b, 0) / numIterations,
      unit: 'ms',
    });
    results.push({
      name: `Tx IVC Verification/Single ${type} Transaction/Total Verification Time (includes serde)`,
      value: totalDurations.reduce((a, b) => a + b, 0) / numIterations,
      unit: 'ms',
    });
  };

  it(
    'verifies a single private transaction',
    async () => {
      await runSingleProofVerificationTest(privateProvenTx, 'Private');
    },
    TIMEOUT,
  );

  it(
    'verifies a single public transaction',
    async () => {
      await runSingleProofVerificationTest(publicProvenTx, 'Public');
    },
    TIMEOUT,
  );

  it(
    'verifies transactions at 10 TPS',
    async () => {
      const seconds = 60;
      const proofsPerSecond = 10;
      const totalNumProofs = seconds * proofsPerSecond;
      const promises = [];

      // Push proofs onto the verification queue at the required per second rate
      const timer = new Timer();
      for (let i = 0; i < totalNumProofs; i++) {
        promises.push(t.circuitProofVerifier?.verifyProof(i % 2 === 0 ? privateProvenTx : publicProvenTx));
        await sleep(1000 / proofsPerSecond);
      }
      // Wait for all of the proofs to verify
      const resultsArray = await Promise.all(promises);
      const totalDuration = timer.ms();
      resultsArray.forEach(result => expect(result?.valid ?? false).toBe(true));
      const durations = resultsArray.filter(result => result !== undefined).map(result => result.durationMs);
      const totalDurations = resultsArray.filter(result => result !== undefined).map(result => result.totalDurationMs);
      results.push({
        name: `Tx IVC Verification/${seconds} Seconds @${proofsPerSecond}TPS/Avg IVC Verification Time`,
        value: durations.reduce((a, b) => a + b, 0) / totalNumProofs,
        unit: 'ms',
      });
      results.push({
        name: `Tx IVC Verification/${seconds} Seconds @${proofsPerSecond}TPS/Min IVC Verification Time`,
        value: Math.min(...durations),
        unit: 'ms',
      });
      results.push({
        name: `Tx IVC Verification/${seconds} Seconds @${proofsPerSecond}TPS/Max IVC Verification Time`,
        value: Math.max(...durations),
        unit: 'ms',
      });
      results.push({
        name: `Tx IVC Verification/${seconds} Seconds @${proofsPerSecond}TPS/Avg Total Verification Time (includes serde)`,
        value: totalDurations.reduce((a, b) => a + b, 0) / totalNumProofs,
        unit: 'ms',
      });
      results.push({
        name: `Tx IVC Verification/${seconds} Seconds @${proofsPerSecond}TPS/Min Total Verification Time  (includes serde)`,
        value: Math.min(...totalDurations),
        unit: 'ms',
      });
      results.push({
        name: `Tx IVC Verification/${seconds} Seconds @${proofsPerSecond}TPS/Max Total Verification Time  (includes serde)`,
        value: Math.max(...totalDurations),
        unit: 'ms',
      });
      results.push({
        name: `Tx IVC Verification/${seconds} Seconds @${proofsPerSecond}TPS/Overall Tx Verification Time`,
        value: totalDuration,
        unit: 'ms',
      });
    },
    TIMEOUT,
  );
});
