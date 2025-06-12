import {
  DefaultL1ContractsConfig,
  type DeployL1ContractsArgs,
  type ExtendedViemWalletClient,
  type L1ReaderConfig,
  L1TxUtils,
  RollupContract,
  SlashingProposerContract,
  createExtendedL1Client,
  deployL1Contracts,
} from '@aztec/ethereum';
import { startAnvil } from '@aztec/ethereum/test';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import { SlashFactoryAbi } from '@aztec/l1-artifacts/SlashFactoryAbi';

import type { Anvil } from '@viem/anvil';
import EventEmitter from 'node:events';
import { type GetContractReturnType, getAddress, getContract } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import {
  DefaultSlasherConfig,
  Offense,
  type SlasherConfig,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  type WatcherEmitter,
} from './config.js';
import { SlasherClient } from './slasher_client.js';

const originalVersionSalt = 42;
const aztecSlotDuration = 4;
const ethereumSlotDuration = 2;

describe('SlasherClient', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;

  let slasherClient: TestSlasherClient;
  let dummyWatcher: DummyWatcher;
  let rollup: RollupContract;
  let slashingProposer: SlashingProposerContract;
  let l1TxUtils: L1TxUtils;
  let depositAmount: bigint;

  beforeAll(async () => {
    logger = createLogger('slasher:test:slasher_client');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    const l1Client = createExtendedL1Client([rpcUrl], privateKey, foundry);

    const config: DeployL1ContractsArgs = {
      ...DefaultL1ContractsConfig,
      salt: originalVersionSalt,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot: Fr.random(),
      slashingQuorum: 6,
      slashingRoundSize: 10,
      ethereumSlotDuration,
      aztecSlotDuration,
      aztecEpochDuration: 4,
      initialValidators: [
        {
          attester: EthAddress.fromString(l1Client.account.address),
          withdrawer: EthAddress.fromString(l1Client.account.address),
        },
      ],
      realVerifier: false,
    };

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, config);

    l1TxUtils = new L1TxUtils(l1Client, logger);

    dummyWatcher = new DummyWatcher();

    slasherClient = await TestSlasherClient.new(
      {
        ...DefaultSlasherConfig,
        slashInactivityCreatePenalty: 5n,
        slashInactivityCreateTargetPercentage: 0.8,
        slashInactivitySignalTargetPercentage: 0.6,
        slashProposerRoundPollingIntervalSeconds: 0.25,
        slashPayloadTtlSeconds: 100,
      },
      deployed.l1ContractAddresses,
      l1TxUtils,
      [dummyWatcher],
      new DateProvider(),
    );

    slasherClient.start();

    rollup = new RollupContract(l1TxUtils.client, deployed.l1ContractAddresses.rollupAddress);
    slashingProposer = await rollup.getSlashingProposer();

    depositAmount = await rollup.getMinimumStake();

    await rollup.setupEpoch(l1TxUtils);
  });

  afterAll(async () => {
    await slasherClient.stop();
    await anvil.stop().catch(logger.error);
  });

  beforeEach(async () => {
    slasherClient.updateConfig({
      slashOverridePayload: undefined,
      slashPayloadTtlSeconds: 100,
      slashProposerRoundPollingIntervalSeconds: 0.25,
    });
    // sleep 3 slots to ensure that async events coming in from L1 are processed...
    await sleep(ethereumSlotDuration * 3 * 1000);
    // so that we can clear them.
    slasherClient.clearMonitoredPayloads();
  });

  it('creates payloads when the watcher signals', async () => {
    await retryUntil(
      async () => {
        await rollup.setupEpoch(l1TxUtils);
        const c = await rollup.getCurrentEpochCommittee();
        logger.debug('committee', c);
        return c.length === 1 && c[0].toLowerCase() === privateKey.address.toLowerCase();
      },
      'non-empty committee',
      20,
      1,
    );

    const slashAmount = depositAmount - 1n;
    expect(slashAmount).toBeLessThan(depositAmount);
    const committee = await rollup.getCurrentEpochCommittee();
    const amounts = Array.from({ length: committee.length }, () => slashAmount);
    const offenses = Array.from({ length: committee.length }, () => Offense.UNKNOWN);

    const args = committee.map((validator, index) => ({
      validator: EthAddress.fromString(validator),
      amount: amounts[index],
      offense: offenses[index],
    }));

    dummyWatcher.triggerSlash(args);

    // A monitored payload should be created automatically
    let payload: EthAddress | undefined = undefined;
    await retryUntil(
      async () => {
        const slot = await rollup.getSlotNumber();
        payload = await slasherClient.getSlashPayload(slot);
        return payload !== undefined && !payload.isZero();
      },
      'has monitored payload',
      5,
      0.5,
    );

    const quorumSize = await slashingProposer.getQuorumSize();
    logger.info('Quorum size:', quorumSize);
    const roundSize = await slashingProposer.getRoundSize();
    logger.info('Round size:', roundSize);

    // Await the slashing
    await retryUntil(
      async () => {
        await rollup.setupEpoch(l1TxUtils);
        // Print debug info
        const round = await slashingProposer.computeRound(await rollup.getSlotNumber());
        const roundInfo = await slashingProposer.getRoundInfo(rollup.address, round);
        const leaderVotes = await slashingProposer.getProposalVotes(rollup.address, round, roundInfo.leader);
        logger.info(`Currently in round ${round}`);
        logger.info('Round info:', roundInfo);
        logger.info(`Leader votes: ${leaderVotes}`);

        await l1TxUtils.client.sendTransaction(slashingProposer.createVoteRequest(payload!.toString())).catch(err => {
          // sometimes the custom error is not decoded properly
          if (err.message.includes('GovernanceProposer__OnlyProposerCanVote') || err.message.includes('0xea36d1ac')) {
            return;
          }
          throw err;
        });

        // Check if the payload is cleared
        const slot = await rollup.getSlotNumber();
        payload = await slasherClient.getSlashPayload(slot);
        return payload === undefined;
      },
      'cleared monitored payload',
      30,
      0.5,
    );

    const info = await rollup.getAttesterView(l1TxUtils.client.account.address);

    expect(info.effectiveBalance).toBe(0n);
    expect(info.exit.amount).toBe(depositAmount - slashAmount);
  });

  it('drops payloads beyond TTL', async () => {
    const config = {
      slashPayloadTtlSeconds: 1,
    };
    slasherClient.updateConfig(config);
    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.random(),
        amount: depositAmount,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    await sleep(config.slashPayloadTtlSeconds * 1000 + 100);

    const slot = await rollup.getSlotNumber();
    const payload = await slasherClient.getSlashPayload(slot);

    expect(payload).toBeUndefined();
  });

  it('clears monitored payloads', async () => {
    expect(slasherClient.getMonitoredPayloads()).toEqual([]);
    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.random(),
        amount: depositAmount,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    slasherClient.clearMonitoredPayloads();
    expect(slasherClient.getMonitoredPayloads()).toEqual([]);
  });

  it('only signals for override payload if present', async () => {
    const config = {
      slashOverridePayload: EthAddress.random(),
    };
    slasherClient.updateConfig(config);

    const slot = BigInt(Math.floor(Math.random() * 1000000));
    const payload = await slasherClient.getSlashPayload(slot);
    expect(payload).toBe(config.slashOverridePayload);

    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.random(),
        amount: depositAmount,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    const slot2 = BigInt(Math.floor(Math.random() * 1000000));
    const payload2 = await slasherClient.getSlashPayload(slot2);
    expect(payload2).toBe(config.slashOverridePayload);

    slasherClient.proposalExecuted({ round: 0n, proposal: config.slashOverridePayload.toString() });

    const slot3 = BigInt(Math.floor(Math.random() * 1000000));
    const payload3 = await slasherClient.getSlashPayload(slot3);
    // now we get the payload that was triggered by the watcher
    expect(payload3).not.toBe(config.slashOverridePayload);

    // but if we update the config we get the override payload again
    slasherClient.updateConfig(config);
    const payload4 = await slasherClient.getSlashPayload(slot3);
    expect(payload4).toBe(config.slashOverridePayload);
  });

  it('sorts offenses within payload by validator address', async () => {
    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.fromString('0x0000000000000000000000000000000000000003'),
        amount: 100n,
        offense: Offense.UNKNOWN,
      },
      {
        validator: EthAddress.fromString('0x0000000000000000000000000000000000000001'),
        amount: 200n,
        offense: Offense.VALID_EPOCH_PRUNED,
      },
      {
        validator: EthAddress.fromString('0x0000000000000000000000000000000000000002'),
        amount: 300n,
        offense: Offense.INACTIVITY,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    const payloadActions = slasherClient.getMonitoredPayloads();
    expect(payloadActions.length).toBe(1);
    expect(payloadActions[0].validators).toEqual([
      EthAddress.fromString('0x0000000000000000000000000000000000000001'),
      EthAddress.fromString('0x0000000000000000000000000000000000000002'),
      EthAddress.fromString('0x0000000000000000000000000000000000000003'),
    ]);
    expect(payloadActions[0].offenses).toEqual([Offense.VALID_EPOCH_PRUNED, Offense.INACTIVITY, Offense.UNKNOWN]);
    expect(payloadActions[0].amounts).toEqual([200n, 300n, 100n]);
  });

  it('handles replaying the same payload', async () => {
    // trigger a payload
    // observe it in monitored
    // clear monitored
    // trigger the same payload again
    // observe it in monitored
    // trigger the same payload again (without clearing)
    // should only be one payload in monitored

    const validator = EthAddress.random();
    expect(slasherClient.getMonitoredPayloads()).toEqual([]);
    dummyWatcher.triggerSlash([
      {
        validator,
        amount: depositAmount,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);
    slasherClient.clearMonitoredPayloads();

    dummyWatcher.triggerSlash([
      {
        validator,
        amount: depositAmount,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    expect(slasherClient.getMonitoredPayloads().length).toEqual(1);
    expect(slasherClient.getMonitoredPayloads()[0].validators).toEqual([validator]);
    expect(slasherClient.getMonitoredPayloads()[0].amounts).toEqual([depositAmount]);
    expect(slasherClient.getMonitoredPayloads()[0].offenses).toEqual([Offense.UNKNOWN]);

    dummyWatcher.triggerSlash([
      {
        validator,
        amount: depositAmount,
        offense: Offense.UNKNOWN,
      },
    ]);

    // manually sleep for 3 slots
    await sleep(ethereumSlotDuration * 3 * 1000);

    // now ensure that we only have one payload in monitored
    await awaitMonitoredPayloads(slasherClient);
    expect(slasherClient.getMonitoredPayloads().length).toEqual(1);
    expect(slasherClient.getMonitoredPayloads()[0].validators).toEqual([validator]);
    expect(slasherClient.getMonitoredPayloads()[0].amounts).toEqual([depositAmount]);
    expect(slasherClient.getMonitoredPayloads()[0].offenses).toEqual([Offense.UNKNOWN]);
  });

  it('handles multiple payloads with the same validator but different offenses', async () => {
    const validator = EthAddress.random();
    expect(slasherClient.getMonitoredPayloads()).toEqual([]);

    dummyWatcher.triggerSlash([
      {
        validator,
        amount: depositAmount - 1n,
        offense: Offense.UNKNOWN,
      },
    ]);
    await awaitMonitoredPayloads(slasherClient, 1);

    dummyWatcher.triggerSlash([
      {
        validator,
        amount: depositAmount,
        offense: Offense.UNKNOWN,
      },
    ]);
    await awaitMonitoredPayloads(slasherClient, 2);

    expect(slasherClient.getMonitoredPayloads().length).toEqual(2);
    expect(slasherClient.getMonitoredPayloads()[0].validators).toEqual([validator]);
    expect(slasherClient.getMonitoredPayloads()[0].amounts).toEqual([depositAmount]);
    expect(slasherClient.getMonitoredPayloads()[0].offenses).toEqual([Offense.UNKNOWN]);
    expect(slasherClient.getMonitoredPayloads()[1].validators).toEqual([validator]);
    expect(slasherClient.getMonitoredPayloads()[1].amounts).toEqual([depositAmount - 1n]);
    expect(slasherClient.getMonitoredPayloads()[1].offenses).toEqual([Offense.UNKNOWN]);

    const firstPayload = await slasherClient.getSlashPayload(await rollup.getSlotNumber());
    expect(firstPayload).toBeDefined();
    slasherClient.proposalExecuted({ round: 0n, proposal: firstPayload!.toString() });

    const secondPayload = await slasherClient.getSlashPayload(await rollup.getSlotNumber());
    expect(secondPayload).toBeDefined();

    expect(slasherClient.getMonitoredPayloads().length).toEqual(1);
    expect(slasherClient.getMonitoredPayloads()[0].validators).toEqual([validator]);
    expect(slasherClient.getMonitoredPayloads()[0].amounts).toEqual([depositAmount - 1n]);
    expect(slasherClient.getMonitoredPayloads()[0].offenses).toEqual([Offense.UNKNOWN]);
  });

  function awaitMonitoredPayloads(slasherClient: SlasherClient, minimumPayloads = 1) {
    return retryUntil(
      () => slasherClient.getMonitoredPayloads().length >= minimumPayloads,
      'has monitored payload',
      ethereumSlotDuration * 3,
      0.1,
    );
  }
});

class TestSlasherClient extends SlasherClient {
  static override async new(
    config: SlasherConfig,
    l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
    l1TxUtils: L1TxUtils,
    watchers: Watcher[],
    dateProvider: DateProvider,
  ) {
    if (!l1Contracts.rollupAddress) {
      throw new Error('Cannot initialize SlasherClient without a rollup address');
    }
    if (!l1Contracts.slashFactoryAddress) {
      throw new Error('Cannot initialize SlasherClient without a slashFactory address');
    }

    const rollup = new RollupContract(l1TxUtils.client, l1Contracts.rollupAddress);
    const slashingProposer = await rollup.getSlashingProposer();
    const slashFactoryContract = getContract({
      address: getAddress(l1Contracts.slashFactoryAddress.toString()),
      abi: SlashFactoryAbi,
      client: l1TxUtils.client,
    });
    return new TestSlasherClient(config, slashFactoryContract, slashingProposer, l1TxUtils, watchers, dateProvider);
  }

  constructor(
    config: SlasherConfig,
    slashFactoryContract: GetContractReturnType<typeof SlashFactoryAbi, ExtendedViemWalletClient>,
    slashingProposer: SlashingProposerContract,
    l1TxUtils: L1TxUtils,
    watchers: Watcher[],
    dateProvider: DateProvider,
    log = createLogger('slasher'),
  ) {
    super(config, slashFactoryContract, slashingProposer, l1TxUtils, watchers, dateProvider, log);
  }

  public override proposalExecuted(args: { round: bigint; proposal: `0x${string}` }) {
    super.proposalExecuted(args);
  }
}

class DummyWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  constructor() {
    super();
  }

  public shouldSlash(_args: WantToSlashArgs): Promise<boolean> {
    return Promise.resolve(true);
  }

  public triggerSlash(args: WantToSlashArgs[]) {
    this.emit(WANT_TO_SLASH_EVENT, args);
  }
}
