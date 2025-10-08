import type { ExtendedViemWalletClient, ViemClient } from '@aztec/ethereum';
import {
  DefaultL1ContractsConfig,
  createExtendedL1Client,
  deployL1Contracts,
  getPublicClient,
  tryExtractEvent,
} from '@aztec/ethereum';
import { EthCheatCodes, startAnvil } from '@aztec/ethereum/test';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { SlashFactoryAbi } from '@aztec/l1-artifacts/SlashFactoryAbi';

import type { Anvil } from '@viem/anvil';
import { type TransactionReceipt, decodeFunctionData } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { OffenseType, type ValidatorSlash, type ValidatorSlashOffense } from '../slashing/index.js';
import { SlashFactoryContract, packValidatorSlashOffense, unpackValidatorSlashOffense } from './slash_factory.js';

describe('SlashFactory', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;
  let publicClient: ViemClient;
  let writeClient: ExtendedViemWalletClient;
  let cheatCodes: EthCheatCodes;

  let slashFactoryAddress: EthAddress;
  let slashFactory: SlashFactoryContract;

  const constants: L1RollupConstants & {
    slashingRoundSize: number;
    slashingPayloadLifetimeInRounds: number;
    logsBatchSize: number;
  } = {
    l1StartBlock: 0n,
    l1GenesisTime: BigInt(Math.floor(Date.now() / 1000) - 1000),
    slotDuration: 24,
    epochDuration: 32,
    ethereumSlotDuration: 12,
    proofSubmissionEpochs: 2,
    slashingRoundSize: 100,
    slashingPayloadLifetimeInRounds: 3,
    logsBatchSize: 50,
  };

  beforeAll(async () => {
    logger = createLogger('ethereum:test:slash_factory');
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

    ({ anvil, rpcUrl } = await startAnvil());

    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    writeClient = createExtendedL1Client([rpcUrl], privateKey);
    slashFactoryAddress = deployed.l1ContractAddresses.slashFactoryAddress!;
    slashFactory = new SlashFactoryContract(publicClient, slashFactoryAddress.toString());
  });

  beforeEach(async () => {
    await cheatCodes.mine();
  });

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  const makeSlashes = (): ValidatorSlash[] => [
    {
      validator: EthAddress.random(),
      amount: 100n,
      offenses: [
        { epochOrSlot: 10n, offenseType: OffenseType.INACTIVITY },
        { epochOrSlot: 20n, offenseType: OffenseType.DATA_WITHHOLDING },
      ],
    },
    {
      validator: EthAddress.random(),
      amount: 200n,
      offenses: [{ epochOrSlot: 30n, offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS }],
    },
  ];

  const createSlashPayload = async (slashes?: ValidatorSlash[]) => {
    slashes ??= makeSlashes();
    const request = slashFactory.buildCreatePayloadRequest(slashes);
    const txHash = await writeClient.sendTransaction(request);
    return await writeClient.waitForTransactionReceipt({ hash: txHash });
  };

  const getPayloadAddressFromReceipt = (receipt: TransactionReceipt): EthAddress => {
    expect(receipt.status).toEqual('success');
    const event = tryExtractEvent(receipt.logs, slashFactoryAddress.toString(), SlashFactoryAbi, 'SlashPayloadCreated');
    expect(event).toBeDefined();
    return EthAddress.fromString(event!.args.payloadAddress);
  };

  describe('packValidatorSlashOffense', () => {
    it('correctly packs offense data', () => {
      const offense: ValidatorSlashOffense = {
        epochOrSlot: 1234567890n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      };

      const packed = packValidatorSlashOffense(offense);
      const expectedPacked = (5n << 120n) + 1234567890n;
      expect(packed).toBe(expectedPacked);
    });

    it('throws for invalid offense type', () => {
      const offense: ValidatorSlashOffense = {
        epochOrSlot: 123n,
        offenseType: 256 as OffenseType, // Invalid offense type
      };

      expect(() => packValidatorSlashOffense(offense)).toThrow();
    });

    it('packs and unpacks a validator slash offense correctly', () => {
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: 12345n,
      };

      const packed = packValidatorSlashOffense(offense);
      const unpacked = unpackValidatorSlashOffense(packed);

      expect(unpacked).toEqual(offense);
      expect(packed).toBeLessThan(1n << 128n); // Ensure it fits within 128 bits
    });

    it('handles maximum epoch or slot value', () => {
      const maxEpochOrSlot = (1n << 120n) - 1n; // Maximum value for 120 bits
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        epochOrSlot: maxEpochOrSlot,
      };

      const packed = packValidatorSlashOffense(offense);
      const unpacked = unpackValidatorSlashOffense(packed);

      expect(unpacked).toEqual(offense);
    });

    it('handles minimum epoch or slot value', () => {
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 0n,
      };

      const packed = packValidatorSlashOffense(offense);
      const unpacked = unpackValidatorSlashOffense(packed);

      expect(unpacked).toEqual(offense);
    });

    it('preserves data integrity for multiple pack and unpack cycles', () => {
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 98765n,
      };

      let packed = packValidatorSlashOffense(offense);

      // Pack and unpack multiple times
      for (let i = 0; i < 5; i++) {
        const unpacked = unpackValidatorSlashOffense(packed);
        packed = packValidatorSlashOffense(unpacked);
      }

      const final = unpackValidatorSlashOffense(packed);
      expect(final).toEqual(offense);
    });
  });

  describe('unpackValidatorSlashOffense', () => {
    it('correctly unpacks offense data', () => {
      const packed = (5n << 120n) + 1234567890n;
      const unpacked = unpackValidatorSlashOffense(packed);

      expect(unpacked.epochOrSlot).toBe(1234567890n);
      expect(unpacked.offenseType).toBe(OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS);
    });

    it('handles all offense types', () => {
      for (const offenseType of Object.values(OffenseType)) {
        if (typeof offenseType === 'number') {
          const offense: ValidatorSlashOffense = {
            epochOrSlot: 999n,
            offenseType,
          };

          const packed = packValidatorSlashOffense(offense);
          const unpacked = unpackValidatorSlashOffense(packed);

          expect(unpacked.epochOrSlot).toBe(999n);
          expect(unpacked.offenseType).toBe(offenseType);
        }
      }
    });
  });

  describe('buildCreatePayloadRequest', () => {
    it('creates a valid transaction request', async () => {
      const slashes = makeSlashes();
      const request = slashFactory.buildCreatePayloadRequest(slashes);

      const result = await publicClient.estimateGas({ ...request });
      expect(result).toBeGreaterThan(21000n);
    });

    it('sorts validators by address', () => {
      const validator1 = EthAddress.fromString('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
      const validator2 = EthAddress.fromString('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

      const slashes: ValidatorSlash[] = [
        {
          validator: validator1,
          amount: 100n,
          offenses: [{ epochOrSlot: 10n, offenseType: OffenseType.INACTIVITY }],
        },
        {
          validator: validator2,
          amount: 200n,
          offenses: [{ epochOrSlot: 20n, offenseType: OffenseType.DATA_WITHHOLDING }],
        },
      ];

      const request = slashFactory.buildCreatePayloadRequest(slashes);

      // Decode the data to verify sorting
      const decoded = decodeFunctionData({
        abi: SlashFactoryAbi,
        data: request.data!,
      });

      expect(decoded.args![0]![0].toLowerCase()).toBe(validator2.toString().toLowerCase());
      expect(decoded.args![0]![1].toLowerCase()).toBe(validator1.toString().toLowerCase());
    });
  });

  describe('getSlashPayloadFromEvents', () => {
    it('retrieves slash payload from events', async () => {
      const slashes = makeSlashes().sort((a, b) => a.validator.toString().localeCompare(b.validator.toString()));
      const receipt = await createSlashPayload(slashes);
      const payloadAddress = getPayloadAddressFromReceipt(receipt);

      const result = await slashFactory.getSlashPayloadFromEvents(payloadAddress, constants);

      expect(result).toBeDefined();
      expect(result!.address.toString()).toEqual(payloadAddress.toString());
      expect(result!.slashes).toEqual(slashes);
    });

    it('returns undefined when no events found', async () => {
      const result = await slashFactory.getSlashPayloadFromEvents(EthAddress.random(), constants);
      expect(result).toBeUndefined();
    });

    it('returns payload if within expiration time', async () => {
      const slashes = makeSlashes();
      const receipt = await createSlashPayload(slashes);
      const payloadAddress = getPayloadAddressFromReceipt(receipt);

      await cheatCodes.mine(
        (BigInt(constants.slashingPayloadLifetimeInRounds) - 1n) * BigInt(constants.slashingRoundSize) * 2n,
      );
      const result = await slashFactory.getSlashPayloadFromEvents(payloadAddress, constants);

      expect(result).toBeDefined();
      expect(result!.address.toString()).toEqual(payloadAddress.toString());
      expect(result!.slashes.map(slash => slash.validator.toString()).sort()).toEqual(
        slashes.map(slash => slash.validator.toString()).sort(),
      );
    });

    it('returns undefined if payload is too old', async () => {
      const slashes = makeSlashes();
      const receipt = await createSlashPayload(slashes);
      const payloadAddress = getPayloadAddressFromReceipt(receipt);

      await cheatCodes.mine(
        (BigInt(constants.slashingPayloadLifetimeInRounds) + 5n) * BigInt(constants.slashingRoundSize) * 2n,
      );
      const result = await slashFactory.getSlashPayloadFromEvents(payloadAddress, constants);

      expect(result).toBeUndefined();
    });
  });

  describe('getAddressAndIsDeployed', () => {
    it('returns undeployed', async () => {
      const slashes = makeSlashes();
      const result = await slashFactory.getAddressAndIsDeployed(slashes);
      expect(result.isDeployed).toBe(false);
      expect(result.address.toString()).toMatch(/^0x[0-9a-f]{40}$/);
    });

    it('returns deployed', async () => {
      const slashes = makeSlashes();
      const receipt = await createSlashPayload(slashes);
      const expectedPayloadAddress = getPayloadAddressFromReceipt(receipt);

      const result = await slashFactory.getAddressAndIsDeployed(slashes);
      expect(result.isDeployed).toBe(true);
      expect(result.address.toString()).toMatch(/^0x[0-9a-f]{40}$/);
      expect(result.address.toString()).toEqual(expectedPayloadAddress.toString());
    });

    it('returns same address for exactly same slashes', async () => {
      const slashes = makeSlashes();
      const result1 = await slashFactory.getAddressAndIsDeployed(slashes);
      const result2 = await slashFactory.getAddressAndIsDeployed(slashes);
      expect(result1.address.toString()).toEqual(result2.address.toString());
    });

    it('returns same address for same slashes in different order', async () => {
      const slashes = makeSlashes();
      const result1 = await slashFactory.getAddressAndIsDeployed(slashes);
      const result2 = await slashFactory.getAddressAndIsDeployed(slashes.toReversed());
      expect(result1.address.toString()).toEqual(result2.address.toString());
    });

    it('returns same address for same slashes with offenses in different order', async () => {
      const slashes = makeSlashes();
      const result1 = await slashFactory.getAddressAndIsDeployed(slashes);
      const result2 = await slashFactory.getAddressAndIsDeployed(
        slashes.map(slash => ({
          ...slash,
          offenses: slash.offenses.reverse(),
        })),
      );
      expect(result1.address.toString()).toEqual(result2.address.toString());
    });

    it('returns different addresses for slashes with different epoch identifiers', async () => {
      const validator = EthAddress.random();
      const amount = 300n;
      const offenses1 = [{ epochOrSlot: 30n, offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS }];
      const offenses2 = [{ epochOrSlot: 40n, offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS }];
      const slashes1 = [{ validator, amount, offenses: offenses1 }];
      const slashes2 = [{ validator, amount, offenses: offenses2 }];
      const result1 = await slashFactory.getAddressAndIsDeployed(slashes1);
      const result2 = await slashFactory.getAddressAndIsDeployed(slashes2);
      expect(result1.address.toString()).not.toEqual(result2.address.toString());
    });

    it('returns different addresses for slashes with different offense types', async () => {
      const validator = EthAddress.random();
      const amount = 300n;
      const offenses1 = [{ epochOrSlot: 40n, offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID }];
      const offenses2 = [{ epochOrSlot: 40n, offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS }];
      const slashes1 = [{ validator, amount, offenses: offenses1 }];
      const slashes2 = [{ validator, amount, offenses: offenses2 }];
      const result1 = await slashFactory.getAddressAndIsDeployed(slashes1);
      const result2 = await slashFactory.getAddressAndIsDeployed(slashes2);
      expect(result1.address.toString()).not.toEqual(result2.address.toString());
    });

    it('returns different addresses for slashes with different amounts', async () => {
      const validator = EthAddress.random();
      const amount1 = 300n;
      const amount2 = 400n;
      const offenses = [{ epochOrSlot: 40n, offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID }];
      const slashes1 = [{ validator, amount: amount1, offenses: offenses }];
      const slashes2 = [{ validator, amount: amount2, offenses: offenses }];
      const result1 = await slashFactory.getAddressAndIsDeployed(slashes1);
      const result2 = await slashFactory.getAddressAndIsDeployed(slashes2);
      expect(result1.address.toString()).not.toEqual(result2.address.toString());
    });
  });
});
