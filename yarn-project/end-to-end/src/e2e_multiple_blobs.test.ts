import type { AztecNode, FunctionArtifact, Logger, Wallet } from '@aztec/aztec.js';
import { broadcastPrivateFunction, broadcastUtilityFunction, publishContractClass } from '@aztec/aztec.js/deployment';
import { FIELDS_PER_BLOB } from '@aztec/constants';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { setup } from './fixtures/utils.js';

describe('e2e_multiple_blobs', () => {
  const contractArtifact = TestContract.artifact;

  let logger: Logger;
  let wallet: Wallet;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let teardown: () => Promise<void>;

  const broadcastFunction = async (artifact: FunctionArtifact) => {
    const selector = await FunctionSelector.fromNameAndParameters(artifact);
    return artifact.functionType == FunctionType.PRIVATE
      ? await broadcastPrivateFunction(wallet, contractArtifact, selector)
      : await broadcastUtilityFunction(wallet, contractArtifact, selector);
  };

  beforeAll(async () => {
    let maybeAztecNodeAdmin: AztecNodeAdmin | undefined;
    ({
      logger,
      wallet,
      aztecNode,
      aztecNodeAdmin: maybeAztecNodeAdmin,
      wallets: [wallet],
      teardown,
    } = await setup(1));
    aztecNodeAdmin = maybeAztecNodeAdmin!;
  });

  afterAll(() => teardown());

  it('includes multiple txs in a block that produces multiple blobs', async () => {
    const privateFunctions = contractArtifact.functions.filter(fn => fn.functionType == FunctionType.PRIVATE);
    const utilityFunctions = contractArtifact.functions.filter(fn => fn.functionType == FunctionType.UTILITY);

    const provenTxs = [
      // 1 contract deployment tx.
      await publishContractClass(wallet, contractArtifact),
      // 2 private function broadcast txs.
      await broadcastFunction(privateFunctions[0]),
      await broadcastFunction(privateFunctions[1]),
      // 1 utility function broadcast tx.
      await broadcastFunction(utilityFunctions[0]),
    ];

    // Increase the minimum number of txs per block so that all txs will be mined in the same block.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: provenTxs.length });

    // Send them simultaneously to be picked up by the sequencer
    const receipts = await Promise.all(provenTxs.map(tx => tx.send({ from: wallet.getAddress() }).wait()));

    // Check that all txs are in the same block.
    const blockNumber = receipts[0].blockNumber!;
    expect(receipts.every(r => r.blockNumber === blockNumber)).toBe(true);

    const block = (await aztecNode.getBlock(blockNumber))!;

    const numBlobFields = block.body.toBlobFields().length;
    const numBlobs = Math.ceil(numBlobFields / FIELDS_PER_BLOB);
    logger.info(
      `Block ${blockNumber} has ${provenTxs.length} txs, which produce ${numBlobFields} blob fields in ${numBlobs} blobs.`,
    );

    expect(numBlobs).toBeGreaterThan(1);
  });
});
