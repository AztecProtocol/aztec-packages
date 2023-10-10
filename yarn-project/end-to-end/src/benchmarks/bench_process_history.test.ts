import { AztecNodeService } from '@aztec/aztec-node';
import { Fr, GrumpkinScalar } from '@aztec/circuits.js';
import { sleep } from '@aztec/foundation/sleep';
import { elapsed } from '@aztec/foundation/timer';
import { BenchmarkingContract } from '@aztec/noir-contracts/types';
import { SequencerClient } from '@aztec/sequencer-client';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/types';

import { EndToEndContext } from '../fixtures/utils.js';
import { benchmarkSetup, sendTxs, waitNewPXESynced, waitRegisteredAccountSynced } from './utils.js';

const BLOCK_SIZE = process.env.BLOCK_SIZE ? +process.env.BLOCK_SIZE : 32;
const CHAIN_LENGTHS = process.env.CHAIN_LENGTHS ? process.env.CHAIN_LENGTHS.split(',').map(Number) : [10, 20, 50];
const MAX_CHAIN_LENGTH = CHAIN_LENGTHS[CHAIN_LENGTHS.length - 1];
const SETUP_BLOCK_COUNT = 2; // deploy account + deploy contract

describe('benchmarks/process_history', () => {
  let context: EndToEndContext;
  let contract: BenchmarkingContract;
  let sequencer: SequencerClient;

  beforeEach(async () => {
    ({ context, contract, sequencer } = await benchmarkSetup({ maxTxsPerBlock: BLOCK_SIZE }));
  }, 60_000);

  it(
    `processes chain history of ${MAX_CHAIN_LENGTH} with ${BLOCK_SIZE}-tx blocks`,
    async () => {
      // Ensure each block has exactly BLOCK_SIZE txs
      sequencer.updateSequencerConfig({ minTxsPerBlock: BLOCK_SIZE });
      let lastBlock = 0;

      for (const chainLength of CHAIN_LENGTHS) {
        // Send enough txs to move the chain to the next block number checkpoint
        const txCount = (chainLength - lastBlock) * BLOCK_SIZE;
        const sentTxs = await sendTxs(txCount, context, contract);
        await sentTxs[sentTxs.length - 1].wait({ timeout: 5 * 60_000 });
        await sleep(100);

        // Create a new node and measure how much time it takes it to sync
        const [nodeSyncTime, node] = await elapsed(async () => {
          const node = await AztecNodeService.createAndSync({ ...context.config, disableSequencer: true });
          await node.getTreeRoots();
          return node;
        });

        const blockNumber = await node.getBlockNumber();
        expect(blockNumber).toEqual(chainLength + SETUP_BLOCK_COUNT);

        context.logger(`Node synced chain up to block ${chainLength}`, {
          eventName: 'node-synced-chain-history',
          txCount: BLOCK_SIZE * chainLength,
          txsPerBlock: BLOCK_SIZE,
          duration: nodeSyncTime,
          blockNumber,
          blockCount: chainLength,
        });

        // Create a new pxe and measure how much time it takes it to sync with failed and successful decryption
        // Skip the first two blocks used for setup (create account contract and deploy benchmarking contract)
        context.logger(`Starting new pxe`);
        const pxe = await waitNewPXESynced(node, contract, INITIAL_L2_BLOCK_NUM + SETUP_BLOCK_COUNT);

        // Register the owner account and wait until it's synced so we measure how much time it took
        context.logger(`Registering owner account on new pxe`);
        const partialAddress = context.wallet.getCompleteAddress().partialAddress;
        const privateKey = context.wallet.getEncryptionPrivateKey();
        await waitRegisteredAccountSynced(pxe, privateKey, partialAddress);

        // Repeat for another account that didn't receive any notes for them, so we measure trial-decrypts
        context.logger(`Registering fresh account on new pxe`);
        await waitRegisteredAccountSynced(pxe, GrumpkinScalar.random(), Fr.random());

        // Stop the external node and pxe
        await pxe.stop();
        await node.stop();

        lastBlock = chainLength;
      }

      await context.teardown();
    },
    60 * 60_000,
  );
});
