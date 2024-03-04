import { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecNode, Fr } from '@aztec/aztec.js';
import { SiblingPath } from '@aztec/circuit-types';
import { DeployL1Contracts, createEthereumChain } from '@aztec/ethereum';
import { openTmpStore } from '@aztec/kv-store/utils';
import { SHA256 } from '@aztec/merkle-tree';
import {
  EmptyRollupProver,
  L1Publisher,
  RealRollupCircuitSimulator,
  SoloBlockBuilder,
  getL1Publisher,
  getVerificationKeys,
} from '@aztec/sequencer-client';
import { MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { setup } from './fixtures/utils.js';

describe('L1Publisher integration', () => {
  const sequencerPK = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';

  let publisher: L1Publisher;

  let builder: SoloBlockBuilder;
  let builderDb: MerkleTreeOperations;

  let teardown: () => void;
  let aztecNode: AztecNode;
  let deployL1ContractsValues: DeployL1Contracts;
  let config: AztecNodeConfig;
  const sha256 = new SHA256();
  let chainId: number;

  beforeEach(async () => {
    ({ teardown, aztecNode, config, deployL1ContractsValues } = await setup(1));
    chainId = createEthereumChain(config.rpcUrl, config.apiKey).chainInfo.id;
    publisher = getL1Publisher({
      rpcUrl: config.rpcUrl,
      apiKey: '',
      requiredConfirmations: 1,
      l1Contracts: deployL1ContractsValues.l1ContractAddresses,
      publisherPrivateKey: sequencerPK,
      l1BlockPublishRetryIntervalMS: 100,
    });

    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    const vks = getVerificationKeys();
    const simulator = new RealRollupCircuitSimulator();
    const prover = new EmptyRollupProver();
    builder = new SoloBlockBuilder(builderDb, vks, simulator, prover);
  }, 100_000);

  afterAll(() => teardown());

  it('Checks the sibling path of the empty setup of two blocks of two empty tx effects each', async () => {
    const blockNumber = await aztecNode.getBlockNumber();

    const block = await aztecNode.getBlock(blockNumber);

    const l2ToL1Messages = block?.body.txEffects.flatMap(txEffect =>
      txEffect.l2ToL1Msgs.map(l2ToL1Message => l2ToL1Message.toBuffer()),
    );

    expect(l2ToL1Messages?.length).toBe(4);

    const siblingPath = await aztecNode.getL2ToL1MessageSiblingPath(blockNumber, Fr.ZERO);

    expect(siblingPath.pathSize).toBe(2);

    const expectedSiblingPath = new SiblingPath(siblingPath.pathSize, [
      Fr.ZERO.toBuffer(),
      sha256.hash(Fr.ZERO.toBuffer(), Fr.ZERO.toBuffer()),
    ]);
    expect(siblingPath.toString()).toBe(expectedSiblingPath.toString());
  }, 36_000);
});
