import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { CheatCodes } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { Signature } from '@aztec/foundation/eth-signature';
import { retryUntil } from '@aztec/foundation/retry';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { CheckpointAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';
import { TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';

const VALIDATOR_COUNT = 5;
const COMMITTEE_SIZE = VALIDATOR_COUNT - 2;
const PUBLISHER_COUNT = 2;

// Tests that a single AztecNodeService hosting multiple validator keys correctly signs attestations
// and filters signing to only active committee members. One node, 5 validators staked, committee
// size 3. Uses PIPELINING_SETUP_OPTS (ethSlot=4s, aztecSlot=12s) with no gossip (single in-process
// node, no p2p). CI-excluded (commented out in bootstrap.sh test_cmds). Timeout 15 min.
// Time-warp: cheatCodes.rollup.advanceToEpoch for validator set lag.
describe('e2e_multi_validator_node', () => {
  // Each test starts its own multi-validator network and waits for checkpointed L2 transactions.
  jest.setTimeout(15 * 60 * 1000);

  let initialValidatorPrivateKeys: `0x${string}`[];
  let validatorAddresses: `0x${string}`[];
  let teardown: () => Promise<void>;
  let wallet: TestWallet;
  let ownerAddress: AztecAddress;
  let additionallyFundedAccounts: InitialAccountData[];
  let aztecNode: AztecNode;
  let config: AztecNodeConfig;
  let logger: Logger;
  let deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  let rollup: RollupContract;
  let cheatCodes: CheatCodes;
  const artifact = StatefulTestContractArtifact;

  beforeEach(async () => {
    initialValidatorPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i)!.toString('hex')}` as `0x${string}`,
    );
    const publisherPrivateKeys = Array.from(
      { length: PUBLISHER_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i + VALIDATOR_COUNT)!.toString('hex')}` as `0x${string}`,
    );
    validatorAddresses = initialValidatorPrivateKeys.map(pk => {
      const account = privateKeyToAccount(pk);
      return EthAddress.fromString(account.address).toString();
    });
    const initialValidators = initialValidatorPrivateKeys.map(pk => {
      const account = privateKeyToAccount(pk);
      return {
        attester: EthAddress.fromString(account.address),
        withdrawer: EthAddress.fromString(account.address),
        privateKey: pk,
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      };
    });
    const { aztecSlotDuration: _aztecSlotDuration } = getL1ContractsConfigEnvVars();

    ({ teardown, logger, wallet, additionallyFundedAccounts, aztecNode, config, deployL1ContractsValues, cheatCodes } =
      await setup(
        0,
        {
          ...PIPELINING_SETUP_OPTS,
          initialValidators,
          aztecTargetCommitteeSize: COMMITTEE_SIZE,
          sequencerPublisherPrivateKeys: publisherPrivateKeys.map(k => new SecretValue(k)),
          archiverPollingIntervalMS: 200,
          sequencerPollingIntervalMS: 200,
          worldStateBlockCheckIntervalMS: 200,
          blockCheckIntervalMS: 200,
          // We deploy this account ourselves later, so fund it as a regular (deployable) schnorr account.
          additionallyFundedAccounts: await generateSchnorrAccounts(1, 'schnorr'),
        },
        { syncChainTip: 'checkpointed' },
      ));

    rollup = new RollupContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
    );

    // We jump to the next epoch such that the committee can be setup.
    // REFACTOR: retryUntil polling getAttesterView should be replaced with a waitForValidatorActive helper
    await retryUntil(
      async () => {
        const view = await rollup.getAttesterView(validatorAddresses[0]);
        return view.effectiveBalance > 0;
      },
      'attester is attesting',
      config.ethereumSlotDuration * 3,
      1,
    );
  });

  afterEach(async () => {
    await teardown();
  });

  const deployOwnerAccount = async () => {
    const accountData = additionallyFundedAccounts[0];
    const accountManager = await wallet.createSchnorrAccount(
      accountData.secret,
      accountData.salt,
      accountData.signingKey,
    );
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod.send({
      from: NO_FROM,
      wait: {
        waitForStatus: TxStatus.CHECKPOINTED,
        timeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
      },
    });
    await wallet.sync();
    ownerAddress = accountManager.address;
  };

  // Deploys an account and contract, then reads the published checkpoint attestations from the
  // archiver. Asserts that quorum (≥ 2/3+1) attestations were collected and that all signers
  // belong to the staked validator set.
  it('should build blocks & attest with multiple validator keys', async () => {
    await deployOwnerAccount();

    const deployer = new ContractDeployer(artifact, wallet);

    logger.info(`Deploying contract from ${ownerAddress}`);
    const { receipt: tx } = await deployer
      .deploy([ownerAddress, 1], { salt: new Fr(BigInt(1)) })
      .send({ from: ownerAddress });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = (aztecNode as AztecNodeService).getBlockSource() as Archiver;
    const blockData = await dataStore.getBlockData({ number: BlockNumber(tx.blockNumber!) });
    const [publishedCheckpoint] = await dataStore.getCheckpoints({ from: blockData!.checkpointNumber, limit: 1 });
    const signatureContext = {
      chainId: config.l1ChainId,
      rollupAddress: deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    };
    const payload = ConsensusPayload.fromCheckpoint(publishedCheckpoint.checkpoint, signatureContext);
    const attestations = publishedCheckpoint.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new CheckpointAttestation(payload, a.signature, Signature.empty()));

    expect(attestations.length).toBeGreaterThanOrEqual((COMMITTEE_SIZE * 2) / 3 + 1);

    const signers = attestations.map(att => att.getSender()!.toString());

    expect(signers.every(s => validatorAddresses.includes(s))).toBe(true);
  });

  // Initiates withdrawal for two validators (reducing effective committee to 3), advances epochs
  // past the validator-set lag, then deploys a contract and verifies that attestation signers are
  // limited to the active committee (not the withdrawn validators).
  it('should attest ONLY with the correct validator keys', async () => {
    const rollupContract1 = getContract({
      address: deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      abi: RollupAbi,
      client: createExtendedL1Client(config.l1RpcUrls, initialValidatorPrivateKeys[VALIDATOR_COUNT - 1]),
    });
    await rollupContract1.write.initiateWithdraw([
      validatorAddresses[VALIDATOR_COUNT - 1],
      validatorAddresses[VALIDATOR_COUNT - 1],
    ]);

    const rollupContract2 = getContract({
      address: deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
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
    await deployOwnerAccount();

    // check that the committee is undefined
    const committee = await rollup.getCurrentEpochCommittee();
    expect(committee?.length).toBe(COMMITTEE_SIZE);

    // new aztec transaction
    logger.info(`Deploying contract from ${ownerAddress}`);
    const deployer = new ContractDeployer(artifact, wallet);
    const { receipt: tx } = await deployer
      .deploy([ownerAddress, 1], { salt: new Fr(BigInt(1)) })
      .send({ from: ownerAddress });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = (aztecNode as AztecNodeService).getBlockSource() as Archiver;
    const blockData = await dataStore.getBlockData({ number: BlockNumber(tx.blockNumber!) });
    const [publishedCheckpoint] = await dataStore.getCheckpoints({ from: blockData!.checkpointNumber, limit: 1 });
    const signatureContext = {
      chainId: config.l1ChainId,
      rollupAddress: deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    };
    const payload = ConsensusPayload.fromCheckpoint(publishedCheckpoint.checkpoint, signatureContext);
    const attestations = publishedCheckpoint.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new CheckpointAttestation(payload, a.signature, Signature.empty()));

    expect(attestations.length).toBeGreaterThanOrEqual((COMMITTEE_SIZE * 2) / 3 + 1);

    const signers = attestations.map(att => att.getSender()!.toString().toLowerCase());
    const validatorAddressesLower = validatorAddresses.map(a => a.toLowerCase());
    expect(signers.every(s => validatorAddressesLower.includes(s))).toBe(true);

    const committeeAtCheckpoint = await rollup.getCommitteeAt(publishedCheckpoint.checkpoint.header.timestamp);
    expect(committeeAtCheckpoint?.length).toBe(COMMITTEE_SIZE);
    const committeeAtCheckpointLower = committeeAtCheckpoint!.map(a => a.toString().toLowerCase());
    expect(signers.every(s => committeeAtCheckpointLower.includes(s))).toBe(true);
  });
});
