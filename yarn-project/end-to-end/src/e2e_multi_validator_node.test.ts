import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import {
  type AztecNode,
  ContractDeployer,
  EthAddress,
  Fr,
  type Logger,
  type Wallet,
  retryUntil,
  waitForProven,
} from '@aztec/aztec.js';
import type { CheatCodes } from '@aztec/aztec.js/testing';
import {
  type DeployL1ContractsReturnType,
  RollupContract,
  createExtendedL1Client,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { BlockAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

const VALIDATOR_COUNT = 5;
const COMMITTEE_SIZE = VALIDATOR_COUNT - 2;

describe('e2e_multi_validator_node', () => {
  let initialValidatorPrivateKeys: `0x${string}`[];
  let validatorAddresses: `0x${string}`[];
  let teardown: () => Promise<void>;
  let owner: Wallet;
  let aztecNode: AztecNode;
  let config: AztecNodeConfig;
  let logger: Logger;
  let deployL1ContractsValues: DeployL1ContractsReturnType;
  let rollup: RollupContract;
  let cheatCodes: CheatCodes;
  const artifact = StatefulTestContractArtifact;

  beforeEach(async () => {
    initialValidatorPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i)!.toString('hex')}` as `0x${string}`,
    );
    const publisherPrivateKey = new SecretValue(initialValidatorPrivateKeys[0]);
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
      };
    });
    const { aztecSlotDuration: _aztecSlotDuration } = getL1ContractsConfigEnvVars();

    ({
      teardown,
      logger,
      wallets: [owner],
      aztecNode,
      config,
      deployL1ContractsValues,
      cheatCodes,
    } = await setup(1, {
      initialValidators,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      publisherPrivateKey,
      minTxsPerBlock: 1,
      archiverPollingIntervalMS: 200,
      transactionPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      startProverNode: true,
    }));

    rollup = new RollupContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
    );

    // We jump to the next epoch such that the committee can be setup.
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

  it('should build blocks & attest with multiple validator keys', async () => {
    const deployer = new ContractDeployer(artifact, owner);

    const ownerAddress = owner.getCompleteAddress().address;
    const sender = ownerAddress;
    logger.info(`Deploying contract from ${sender}`);
    const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
      contractAddressSalt: new Fr(BigInt(1)),
      skipClassPublication: true,
      skipInstancePublication: true,
    });
    const tx = await provenTx.send().wait();
    await waitForProven(aztecNode, tx, {
      provenTimeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
    });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = ((aztecNode as AztecNodeService).getBlockSource() as Archiver).dataStore;
    const [block] = await dataStore.getPublishedBlocks(tx.blockNumber!, tx.blockNumber!);
    const payload = ConsensusPayload.fromBlock(block.block);
    const attestations = block.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new BlockAttestation(block.block.number, payload, a.signature));

    expect(attestations.length).toBeGreaterThanOrEqual((COMMITTEE_SIZE * 2) / 3 + 1);

    const signers = attestations.map(att => att.getSender().toString());

    expect(signers.every(s => validatorAddresses.includes(s))).toBe(true);
  });
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

    await cheatCodes.rollup.advanceToNextEpoch();
    await cheatCodes.rollup.advanceToNextEpoch();

    // check that the committee is undefined
    const committee = await rollup.getCurrentEpochCommittee();
    expect(committee?.length).toBe(COMMITTEE_SIZE);

    // new aztec transaction
    const ownerAddress = owner.getCompleteAddress().address;
    const sender = ownerAddress;

    logger.info(`Deploying contract from ${sender}`);
    const deployer = new ContractDeployer(artifact, owner);
    const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
      contractAddressSalt: new Fr(BigInt(1)),
      skipClassPublication: true,
      skipInstancePublication: true,
    });
    const tx = await provenTx.send().wait();
    await waitForProven(aztecNode, tx, {
      provenTimeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
    });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = ((aztecNode as AztecNodeService).getBlockSource() as Archiver).dataStore;
    const [block] = await dataStore.getPublishedBlocks(tx.blockNumber!, tx.blockNumber!);
    const payload = ConsensusPayload.fromBlock(block.block);
    const attestations = block.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new BlockAttestation(block.block.number, payload, a.signature));

    expect(attestations.length).toBeGreaterThanOrEqual((COMMITTEE_SIZE * 2) / 3 + 1);

    const signers = attestations.map(att => att.getSender().toString());

    expect(signers).toEqual(expect.arrayContaining(validatorAddresses.slice(0, COMMITTEE_SIZE)));
  });
});
