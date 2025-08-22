import type { ExtendedViemWalletClient } from '@aztec/ethereum';
import { DefaultL1ContractsConfig, RollupContract, createExtendedL1Client, deployL1Contracts } from '@aztec/ethereum';
import { EthCheatCodes, startAnvil } from '@aztec/ethereum/test';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TallySlashingProposerAbi } from '@aztec/l1-artifacts/TallySlashingProposerAbi';

import type { Anvil } from '@viem/anvil';
import { type Hex, encodeFunctionData } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { TallySlashingProposerContract } from './tally_slashing_proposer.js';

describe('TallySlashingProposer', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;
  let writeClient: ExtendedViemWalletClient;
  let cheatCodes: EthCheatCodes;
  let tallySlashingProposer: TallySlashingProposerContract;
  let tallySlashingProposerAddress: EthAddress;

  const mockSignature = {
    v: 27,
    r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
    s: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321' as Hex,
  };

  // Test configuration values
  const testSlashingRoundSize = 192; // Multiple of aztecEpochDuration (32): 192 = 32 * 6
  const testConfig = {
    ...DefaultL1ContractsConfig,
    salt: undefined,
    vkTreeRoot: Fr.random(),
    protocolContractTreeRoot: Fr.random(),
    genesisArchiveRoot: Fr.random(),
    realVerifier: false,
    slasherFlavor: 'tally' as const,
    slashingRoundSize: testSlashingRoundSize,
  };

  beforeAll(async () => {
    logger = createLogger('ethereum:test:tally_slashing_proposer');
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

    ({ anvil, rpcUrl } = await startAnvil());

    cheatCodes = new EthCheatCodes([rpcUrl]);

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, testConfig);

    writeClient = createExtendedL1Client([rpcUrl], privateKey);
    const rollup = new RollupContract(writeClient, deployed.l1ContractAddresses.rollupAddress!);
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
      expect(quorumSize).toBe(BigInt(testConfig.slashingQuorum));
    });

    it('returns correct round size from deployed contract', async () => {
      const roundSize = await tallySlashingProposer.getRoundSize();
      expect(roundSize).toBe(BigInt(testConfig.slashingRoundSize));
    });

    it('returns correct committee size from deployed contract', async () => {
      const committeeSize = await tallySlashingProposer.getCommitteeSize();
      expect(committeeSize).toBe(BigInt(testConfig.aztecTargetCommitteeSize));
    });

    it('returns correct round size in epochs from deployed contract', async () => {
      const roundSizeInEpochs = await tallySlashingProposer.getRoundSizeInEpochs();
      const expectedValue = BigInt(testConfig.slashingRoundSize / testConfig.aztecEpochDuration);
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

    it('returns correct slashing unit from deployed contract', async () => {
      const slashingUnit = await tallySlashingProposer.getSlashingUnit();
      expect(slashingUnit).toBe(testConfig.slashingUnit);
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
    it('builds vote request', async () => {
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
});
