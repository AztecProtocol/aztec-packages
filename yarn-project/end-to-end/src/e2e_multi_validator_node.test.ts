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
import {
  type DeployL1ContractsReturnType,
  type ExtendedViemWalletClient,
  RollupContract,
  createExtendedL1Client,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { BlockAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

const VALIDATOR_COUNT = 5;

describe('e2e_multi_validator_node', () => {
  let initialValidatorPrivateKeys: `0x${string}`[];
  let validatorAddresses: `0x${string}`[];
  let teardown: () => Promise<void>;
  let owner: Wallet;
  let aztecNode: AztecNode;
  let config: AztecNodeConfig;
  let logger: Logger;
  let deployL1ContractsValues: DeployL1ContractsReturnType;
  let l1Client: ExtendedViemWalletClient;
  let rollup: RollupContract;
  let ethCheatCodes: EthCheatCodesWithState;
  const artifact = StatefulTestContractArtifact;

  const progressTimeBySlot = async (slotsToJump = 1n) => {
    const currentTime = (await l1Client.getBlock()).timestamp;
    const currentSlot = await rollup.getSlotNumber();
    const timestamp = await rollup.getTimestampForSlot(currentSlot + slotsToJump);
    if (timestamp > currentTime) {
      await ethCheatCodes.warp(Number(timestamp));
    }
  };

  beforeEach(async () => {
    initialValidatorPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i)!.toString('hex')}` as `0x${string}`,
    );
    const publisherPrivateKey = initialValidatorPrivateKeys[0];
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
    } = await setup(1, {
      initialValidators,
      publisherPrivateKey,
      minTxsPerBlock: 1,
      archiverPollingIntervalMS: 200,
      transactionPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      startProverNode: true,
    }));

    ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls);
    l1Client = deployL1ContractsValues.l1Client;
    rollup = new RollupContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
    );

    // We jump to the next epoch such that the committee can be setup.
    const timeToJump = (await rollup.getEpochDuration()) * 2n;
    await progressTimeBySlot(timeToJump);
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
      skipClassRegistration: true,
      skipPublicDeployment: true,
    });
    const tx = await provenTx.send().wait();
    await waitForProven(aztecNode, tx, {
      provenTimeout: config.aztecProofSubmissionWindow * config.aztecSlotDuration,
    });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = ((aztecNode as AztecNodeService).getBlockSource() as Archiver).dataStore;
    const [block] = await dataStore.getPublishedBlocks(tx.blockNumber!, tx.blockNumber!);
    const payload = ConsensusPayload.fromBlock(block.block);
    const attestations = block.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new BlockAttestation(block.block.number, payload, a.signature));

    expect(attestations.length).toBeGreaterThanOrEqual(4); // Math.floor((5 * 2) / 3) + 1

    const signers = attestations.map(att => att.getSender().toString());

    expect(signers).toEqual(expect.arrayContaining(validatorAddresses));
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

    const timeToJump = (await rollup.getEpochDuration()) * 2n;
    await progressTimeBySlot(timeToJump);

    // check that the committee is the correct size now
    const committee = await rollup.getCurrentEpochCommittee();
    expect(committee.length).toBe(VALIDATOR_COUNT - 2);

    // new aztec transaction
    const ownerAddress = owner.getCompleteAddress().address;
    const sender = ownerAddress;

    logger.info(`Deploying contract from ${sender}`);
    const deployer = new ContractDeployer(artifact, owner);
    const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
      contractAddressSalt: new Fr(BigInt(1)),
      skipClassRegistration: true,
      skipPublicDeployment: true,
    });
    const tx = await provenTx.send().wait();
    await waitForProven(aztecNode, tx, {
      provenTimeout: config.aztecProofSubmissionWindow * config.aztecSlotDuration,
    });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = ((aztecNode as AztecNodeService).getBlockSource() as Archiver).dataStore;
    const [block] = await dataStore.getPublishedBlocks(tx.blockNumber!, tx.blockNumber!);
    const payload = ConsensusPayload.fromBlock(block.block);
    const attestations = block.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new BlockAttestation(block.block.number, payload, a.signature));

    expect(attestations.length).toBeGreaterThanOrEqual(3); // Math.floor((3 * 2) / 3) + 1

    const signers = attestations.map(att => att.getSender().toString());

    expect(signers).toEqual(expect.arrayContaining(validatorAddresses.slice(0, VALIDATOR_COUNT - 2)));
  });
});
