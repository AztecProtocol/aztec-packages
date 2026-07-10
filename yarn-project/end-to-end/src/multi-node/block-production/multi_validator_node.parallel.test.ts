import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Signature } from '@aztec/foundation/eth-signature';
import { retryUntil } from '@aztec/foundation/retry';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { CheckpointAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { jest } from '@jest/globals';
import { getContract } from 'viem';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MultiNodeTestContext,
  NO_REORG_SUBMISSION_EPOCHS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

const VALIDATOR_COUNT = 5;
const COMMITTEE_SIZE = VALIDATOR_COUNT - 2;

// Tests that a single AztecNodeService hosting multiple validator keys correctly signs attestations
// and filters signing to only active committee members. One node, 5 validators staked, committee
// size 3. Uses MultiNodeTestContext on the mock-gossip bus: all 5 validators on a single physical
// node, ethSlot=8s, aztecSlot=16s, epoch=2, proofSubEpochs=NO_REORG_SUBMISSION_EPOCHS. Each it is an isolated CI job
// (parallel convention).
describe('multi-node/block-production/multi_validator_node', () => {
  jest.setTimeout(15 * 60 * 1000);

  let test: MultiNodeTestContext;
  let validatorNode: AztecNodeService;
  let ownerAddress: AztecAddress;
  let wallet: TestWallet;

  const validatorAddresses: `0x${string}`[] = [];

  beforeEach(async () => {
    const validators = buildMockGossipValidators(VALIDATOR_COUNT);
    for (const v of validators) {
      validatorAddresses.push(v.attester.toString() as `0x${string}`);
    }

    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      initialValidators: validators,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      aztecEpochDuration: 2,
      ethereumSlotDuration: 8,
      aztecSlotDuration: 16,
      aztecProofSubmissionEpochs: NO_REORG_SUBMISSION_EPOCHS,
      anvilSlotsInAnEpoch: 4,
      blockDurationMs: 2000,
      minTxsPerBlock: 0,
      inboxLag: 2,
    });

    // All 5 validators in a single physical node.
    const allKeys = validators.map(v => v.privateKey);
    validatorNode = await test.createValidatorNode(allKeys);

    wallet = test.context.wallet as TestWallet;
    // The hardcoded account is pre-deployed via genesis by MultiNodeTestContext when
    // skipInitialSequencer is set; no on-chain deploy needed.
    ownerAddress = test.context.accounts[0];
  });

  afterEach(async () => {
    await test.teardown();
  });

  const deployContractAndGetAttestedCheckpoint = async () => {
    const { config, deployL1ContractsValues } = test.context;
    const deployer = new ContractDeployer(StatefulTestContractArtifact, wallet);
    test.logger.info(`Deploying contract from ${ownerAddress}`);
    const { receipt: tx } = await deployer
      .deploy([ownerAddress, 1], { salt: new Fr(BigInt(1)) })
      .send({ from: ownerAddress });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = validatorNode.getBlockSource() as Archiver;
    const blockData = await dataStore.getBlockData({ number: BlockNumber(tx.blockNumber!) });
    // The receipt turns mined as soon as the block is built locally, but the archiver only stores the
    // published checkpoint (with its attestations) once it syncs the L1 propose tx, so poll for it.
    const publishedCheckpoint = await retryUntil(
      async () => (await dataStore.getCheckpoints({ from: blockData!.checkpointNumber, limit: 1 }))[0],
      `archiver indexes checkpoint ${blockData!.checkpointNumber}`,
      120,
      0.5,
    );
    const signatureContext = {
      chainId: config.l1ChainId,
      rollupAddress: deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    };
    const payload = ConsensusPayload.fromCheckpoint(publishedCheckpoint.checkpoint, signatureContext);
    const attestations = publishedCheckpoint.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new CheckpointAttestation(payload, a.signature, Signature.empty()));

    return { attestations, publishedCheckpoint };
  };

  // Deploys a contract and reads the published checkpoint attestations from the archiver.
  // Asserts that quorum (≥ 2/3+1) attestations were collected and that all signers belong to the
  // staked validator set.
  it('should build blocks & attest with multiple validator keys', async () => {
    const { attestations } = await deployContractAndGetAttestedCheckpoint();
    expect(attestations.length).toBeGreaterThanOrEqual((COMMITTEE_SIZE * 2) / 3 + 1);
    const signers = attestations.map(att => att.getSender()!.toString());
    expect(signers.every(s => validatorAddresses.includes(s))).toBe(true);
  });

  // Initiates withdrawal for two validators (reducing effective committee to 3), advances epochs
  // past the validator-set lag, then deploys a contract and verifies that attestation signers are
  // limited to the active committee (not the withdrawn validators).
  it('should attest ONLY with the correct validator keys', async () => {
    const { config, deployL1ContractsValues, cheatCodes } = test.context;
    const initialValidatorPrivateKeys = buildMockGossipValidators(VALIDATOR_COUNT).map(v => v.privateKey);
    const rollupAddress = deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString();

    const rollupContract1 = getContract({
      address: rollupAddress,
      abi: RollupAbi,
      client: createExtendedL1Client(config.l1RpcUrls, initialValidatorPrivateKeys[VALIDATOR_COUNT - 1]),
    });
    await rollupContract1.write.initiateWithdraw([
      validatorAddresses[VALIDATOR_COUNT - 1],
      validatorAddresses[VALIDATOR_COUNT - 1],
    ]);

    const rollupContract2 = getContract({
      address: rollupAddress,
      abi: RollupAbi,
      client: createExtendedL1Client(config.l1RpcUrls, initialValidatorPrivateKeys[VALIDATOR_COUNT - 2]),
    });
    await rollupContract2.write.initiateWithdraw([
      validatorAddresses[VALIDATOR_COUNT - 2],
      validatorAddresses[VALIDATOR_COUNT - 2],
    ]);

    await cheatCodes.rollup.advanceToEpoch(
      EpochNumber.fromBigInt(
        BigInt(await cheatCodes.rollup.getEpoch()) + BigInt(config.lagInEpochsForValidatorSet + 1),
      ),
    );

    const committee = await test.rollup.getCurrentEpochCommittee();
    expect(committee?.length).toBe(COMMITTEE_SIZE);

    const { attestations, publishedCheckpoint } = await deployContractAndGetAttestedCheckpoint();
    expect(attestations.length).toBeGreaterThanOrEqual((COMMITTEE_SIZE * 2) / 3 + 1);

    const signers = attestations.map(att => att.getSender()!.toString().toLowerCase());
    const validatorAddressesLower = validatorAddresses.map(a => a.toLowerCase());
    expect(signers.every(s => validatorAddressesLower.includes(s))).toBe(true);

    const committeeAtCheckpoint = await test.rollup.getCommitteeAt(publishedCheckpoint.checkpoint.header.timestamp);
    expect(committeeAtCheckpoint?.length).toBe(COMMITTEE_SIZE);
    const committeeAtCheckpointLower = committeeAtCheckpoint!.map(a => a.toString().toLowerCase());
    expect(signers.every(s => committeeAtCheckpointLower.includes(s))).toBe(true);
  });
});
