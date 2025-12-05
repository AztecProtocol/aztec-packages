import { getPublicClient } from '@aztec/ethereum';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import type { Anvil } from '@viem/anvil';
import type { Abi } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployL1Contracts } from '../deploy_l1_contracts.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemClient } from '../types.js';
import { RollupContract } from './rollup.js';

describe('Rollup', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;
  let publicClient: ViemClient;
  let cheatCodes: EthCheatCodes;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
  let rollupAddress: `0x${string}`;
  let rollup: RollupContract;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:rollup');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractsHash,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    rollupAddress = deployed.l1ContractAddresses.rollupAddress.toString();
    rollup = new RollupContract(publicClient, rollupAddress);
  });

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('makePendingCheckpointNumberOverride', () => {
    it('creates state override that correctly overrides pending checkpoint number', async () => {
      const testProvenCheckpointNumber = CheckpointNumber(42);
      const testPendingCheckpointNumber = CheckpointNumber(100);
      const newPendingCheckpointNumber = CheckpointNumber(150);

      // Set storage directly using cheat codes
      // The storage slot stores both values: pending (high 128 bits) | proven (low 128 bits)
      const storageSlot = RollupContract.stfStorageSlot;
      const packedValue = (BigInt(testPendingCheckpointNumber) << 128n) | BigInt(testProvenCheckpointNumber);
      await cheatCodes.store(EthAddress.fromString(rollupAddress), BigInt(storageSlot), packedValue);

      // Verify the values were set correctly by calling the getters directly
      const provenCheckpointNumber = await rollup.getProvenCheckpointNumber();
      const pendingCheckpointNumber = await rollup.getCheckpointNumber();

      expect(provenCheckpointNumber).toBe(testProvenCheckpointNumber);
      expect(pendingCheckpointNumber).toBe(testPendingCheckpointNumber);

      // Create the override
      const stateOverride = await rollup.makePendingCheckpointNumberOverride(newPendingCheckpointNumber);

      // Test the override using simulateContract
      const { result: overriddenPendingCheckpointNumber } = await publicClient.simulateContract({
        address: rollupAddress,
        abi: RollupAbi as Abi,
        functionName: 'getPendingCheckpointNumber',
        stateOverride,
      });

      // The overridden value should be the new pending checkpoint number
      expect(overriddenPendingCheckpointNumber).toBe(BigInt(newPendingCheckpointNumber));

      // Verify that the proven checkpoint number is preserved in the override
      const { result: overriddenProvenCheckpointNumber } = await publicClient.simulateContract({
        address: rollupAddress,
        abi: RollupAbi as Abi,
        functionName: 'getProvenCheckpointNumber',
        stateOverride,
      });

      expect(CheckpointNumber.fromBigInt(overriddenProvenCheckpointNumber)).toBe(testProvenCheckpointNumber);

      // Verify the actual storage hasn't changed
      const actualPendingCheckpointNumber = await rollup.getCheckpointNumber();
      expect(actualPendingCheckpointNumber).toBe(testPendingCheckpointNumber);
    });
  });

  describe('getSlashingProposer', () => {
    it('returns a slashing proposer', async () => {
      const slashingProposer = await rollup.getSlashingProposer();
      expect(slashingProposer).toBeDefined();
    });
  });
});
