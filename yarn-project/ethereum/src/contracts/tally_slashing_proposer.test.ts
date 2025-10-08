import type { DeployL1ContractsArgs, ExtendedViemWalletClient } from '@aztec/ethereum';
import {
  DefaultL1ContractsConfig,
  RollupContract,
  createExtendedL1Client,
  decodeSlashConsensusVotes,
  deployL1Contracts,
} from '@aztec/ethereum';
import { EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import { DateProvider } from '@aztec/foundation/timer';
import { TallySlashingProposerAbi } from '@aztec/l1-artifacts/TallySlashingProposerAbi';

import type { Anvil } from '@viem/anvil';
import { type Hex, type TypedDataDefinition, encodeFunctionData, hashTypedData } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { TallySlashingProposerContract } from './tally_slashing_proposer.js';

describe('TallySlashingProposer', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let deployerPrivateKey: PrivateKeyAccount;
  let logger: Logger;
  let writeClient: ExtendedViemWalletClient;

  let validatorsPrivateKeys: PrivateKeyAccount[];
  let validatorsAddresses: EthAddress[];

  let cheatCodes: EthCheatCodes;
  let rollupCheatCodes: RollupCheatCodes;
  let rollup: RollupContract;
  let tallySlashingProposer: TallySlashingProposerContract;
  let tallySlashingProposerAddress: EthAddress;
  let testConfig: DeployL1ContractsArgs;

  const mockSignature = {
    v: 27,
    r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
    s: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321' as Hex,
  };

  // Test configuration values
  const testSlashingRoundSize = 192;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:tally_slashing_proposer');
    deployerPrivateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

    ({ anvil, rpcUrl } = await startAnvil());

    validatorsPrivateKeys = (
      [
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
        '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
        '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
      ] as const
    ).map(key => privateKeyToAccount(key));
    validatorsAddresses = validatorsPrivateKeys.map(key => EthAddress.fromString(key.address));

    testConfig = {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
      slasherFlavor: 'tally' as const,
      slashingQuorum: testSlashingRoundSize / 2 + 1,
      slashingRoundSizeInEpochs: testSlashingRoundSize / DefaultL1ContractsConfig.aztecEpochDuration,
      aztecTargetCommitteeSize: 4,
      initialValidators: validatorsAddresses.map(attester => ({
        attester,
        withdrawer: attester,
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      })),
    };

    const deployed = await deployL1Contracts([rpcUrl], deployerPrivateKey, foundry, logger, testConfig);
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());
    rollupCheatCodes = new RollupCheatCodes(cheatCodes, deployed.l1ContractAddresses);

    writeClient = createExtendedL1Client([rpcUrl], deployerPrivateKey);
    rollup = new RollupContract(writeClient, deployed.l1ContractAddresses.rollupAddress!);
    tallySlashingProposer = (await rollup.getSlashingProposer()) as TallySlashingProposerContract;
    tallySlashingProposerAddress = tallySlashingProposer.address;
  });

  beforeEach(async () => {
    await cheatCodes.mine();
  });

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('contract constants getters', () => {
    it('returns correct quorum size from deployed contract', async () => {
      const quorumSize = await tallySlashingProposer.getQuorumSize();
      expect(quorumSize).toBe(BigInt(testConfig.slashingQuorum!));
    });

    it('returns correct round size from deployed contract', async () => {
      const roundSize = await tallySlashingProposer.getRoundSize();
      expect(roundSize).toBe(BigInt(testConfig.slashingRoundSizeInEpochs * testConfig.aztecEpochDuration));
    });

    it('returns correct committee size from deployed contract', async () => {
      const committeeSize = await tallySlashingProposer.getCommitteeSize();
      expect(committeeSize).toBe(BigInt(testConfig.aztecTargetCommitteeSize));
    });

    it('returns correct round size in epochs from deployed contract', async () => {
      const roundSizeInEpochs = await tallySlashingProposer.getRoundSizeInEpochs();
      const expectedValue = BigInt(testConfig.slashingRoundSizeInEpochs);
      expect(roundSizeInEpochs).toBe(expectedValue);
    });

    it('returns correct lifetime in rounds from deployed contract', async () => {
      const lifetimeInRounds = await tallySlashingProposer.getLifetimeInRounds();
      expect(lifetimeInRounds).toBe(BigInt(testConfig.slashingLifetimeInRounds));
    });

    it('returns correct execution delay in rounds from deployed contract', async () => {
      const executionDelayInRounds = await tallySlashingProposer.getExecutionDelayInRounds();
      expect(executionDelayInRounds).toBe(BigInt(testConfig.slashingExecutionDelayInRounds));
    });

    it('returns correct slashing amounts from deployed contract', async () => {
      const slashingAmounts = await tallySlashingProposer.getSlashingAmounts();
      expect(slashingAmounts).toEqual([
        testConfig.slashAmountSmall,
        testConfig.slashAmountMedium,
        testConfig.slashAmountLarge,
      ]);
    });

    it('returns correct slash offset in rounds from deployed contract', async () => {
      const slashOffsetInRounds = await tallySlashingProposer.getSlashOffsetInRounds();
      expect(slashOffsetInRounds).toBe(BigInt(testConfig.slashingOffsetInRounds));
    });
  });

  describe('getCurrentRound', () => {
    it('returns current round from deployed contract', async () => {
      const currentRound = await tallySlashingProposer.getCurrentRound();
      expect(typeof currentRound).toBe('bigint');
      expect(currentRound).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('getRound', () => {
    it('returns round information for valid round number', async () => {
      const roundInfo = await tallySlashingProposer.getRound(0n);

      expect(typeof roundInfo.isExecuted).toBe('boolean');
      expect(typeof roundInfo.readyToExecute).toBe('boolean');
      expect(typeof roundInfo.voteCount).toBe('bigint');
      expect(roundInfo.voteCount).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('buildVoteRequest', () => {
    it('builds vote request with random signature', async () => {
      const votes = '0x1234567890abcdef' as Hex;
      const request = tallySlashingProposer.buildVoteRequestWithSignature(votes, mockSignature);

      // Send transaction and expect it to revert (since vote data is invalid)
      try {
        await writeClient.sendTransaction(request);
      } catch (error: any) {
        // Verify it's a revert error from the contract, not a formatting error
        expect(error.message || error.toString()).toMatch(/custom error/i);
      }
    });

    it('builds correct typed data to sign', async () => {
      const votes = bufferToHex(Buffer.alloc(testSlashingRoundSize / testConfig.aztecEpochDuration, 1));
      const slot = 1n;
      const typedData = tallySlashingProposer.buildVoteTypedData(votes, slot);
      const expectedDigest = await tallySlashingProposer.getVoteDataDigest(votes, slot);
      expect(hashTypedData(typedData)).toEqual(expectedDigest.toString());
    });

    it('builds vote request with signer', async () => {
      await rollupCheatCodes.advanceToEpoch(12n);
      const votes = bufferToHex(Buffer.alloc(testSlashingRoundSize / testConfig.aztecEpochDuration, 1));
      const slot = await rollup.getSlotNumber();
      const proposer = EthAddress.fromString(await rollup.getCurrentProposer());
      const proposerIndex = validatorsAddresses.findIndex(addr => addr.equals(proposer));
      expect(proposerIndex).toBeGreaterThanOrEqual(0);
      const proposerKey = validatorsPrivateKeys[proposerIndex];

      const signer = (typedData: TypedDataDefinition) => proposerKey.signTypedData(typedData);
      const request = await tallySlashingProposer.buildVoteRequestFromSigner(votes, slot, signer);

      const hash = await writeClient.sendTransaction(request);
      await writeClient.waitForTransactionReceipt({ hash });
    });

    it('encodes vote function correctly', () => {
      const votes = '0xabcdef1234567890' as Hex;
      const request = tallySlashingProposer.buildVoteRequestWithSignature(votes, mockSignature);

      const expectedData = encodeFunctionData({
        abi: TallySlashingProposerAbi,
        functionName: 'vote',
        args: [votes, mockSignature],
      });

      expect(request.data).toBe(expectedData);
    });
  });

  describe('buildExecuteRoundRequest', () => {
    it('builds executeRound request', async () => {
      const round = 1n;
      const committees = [
        [EthAddress.fromString('0x1111111111111111111111111111111111111111')],
        [EthAddress.fromString('0x2222222222222222222222222222222222222222')],
      ];

      const request = tallySlashingProposer.buildExecuteRoundRequest(round, committees);

      // Send transaction and expect it to revert (since round is likely not ready to execute)
      try {
        await writeClient.sendTransaction(request);
      } catch (error: any) {
        // Verify it's a revert error from the contract, not a formatting error
        expect(error.message || error.toString()).toMatch(/custom error/i);
      }
    });

    it('encodes executeRound function correctly', () => {
      const round = 2n;
      const committees = [
        [EthAddress.fromString('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')],
        [EthAddress.fromString('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')],
      ];

      const request = tallySlashingProposer.buildExecuteRoundRequest(round, committees);

      const expectedData = encodeFunctionData({
        abi: TallySlashingProposerAbi,
        functionName: 'executeRound',
        args: [round, committees.map(c => c.map(addr => addr.toString()))],
      });

      expect(request.data).toBe(expectedData);
    });
  });

  describe('wrapper functionality', () => {
    it('wrapper properly wraps viem contract', () => {
      // Verify the wrapper has access to the underlying contract
      expect(tallySlashingProposer.address).toBeDefined();
      expect(tallySlashingProposer.address.toString()).toBe(tallySlashingProposerAddress.toString());
      expect(tallySlashingProposer.type).toBe('tally');
    });
  });

  describe('decodeSlashConsensusVotes', () => {
    it('decodes buffer back to votes correctly', () => {
      const buffer = Buffer.from([0xc9]); // 1 | (2 << 2) | (0 << 4) | (3 << 6)
      const votes = decodeSlashConsensusVotes(buffer);

      expect(votes).toEqual([1, 2, 0, 3]);
    });

    it('decodes empty buffer correctly', () => {
      const buffer = Buffer.from([]);
      const votes = decodeSlashConsensusVotes(buffer);

      expect(votes).toEqual([]);
    });

    it('decodes maximum vote values correctly', () => {
      const buffer = Buffer.from([0xff]); // 3 | (3 << 2) | (3 << 4) | (3 << 6)
      const votes = decodeSlashConsensusVotes(buffer);

      expect(votes).toEqual([3, 3, 3, 3]);
    });

    it('decodes multiple bytes correctly', () => {
      const buffer = Buffer.from([0x90, 0x1b]); // [0,0,1,2] then [3,2,1,0]
      const votes = decodeSlashConsensusVotes(buffer);

      expect(votes).toEqual([0, 0, 1, 2, 3, 2, 1, 0]);
    });
  });
});
