import {
  DefaultL1ContractsConfig,
  type DeployL1ContractsArgs,
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

import type { Anvil } from '@viem/anvil';
import EventEmitter from 'node:events';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import {
  DefaultSlasherConfig,
  Offence,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  type WatcherEmitter,
} from './config.js';
import { SlasherClient } from './slasher_client.js';

const originalVersionSalt = 42;
const aztecSlotDuration = 4;

describe('SlasherClient', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;

  let slasherClient: SlasherClient;
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
      ethereumSlotDuration: 2,
      aztecSlotDuration,
      aztecEpochDuration: 4,
      initialValidators: [
        {
          attester: EthAddress.fromString(l1Client.account.address),
          withdrawer: EthAddress.fromString(l1Client.account.address),
        },
      ],
    };

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, config);

    l1TxUtils = new L1TxUtils(l1Client, logger);

    dummyWatcher = new DummyWatcher();

    slasherClient = await SlasherClient.new(
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

    await slasherClient.start();

    rollup = new RollupContract(l1TxUtils.client, deployed.l1ContractAddresses.rollupAddress);
    slashingProposer = await rollup.getSlashingProposer();

    depositAmount = await rollup.getMinimumStake();

    await rollup.setupEpoch(l1TxUtils);
  });

  afterAll(async () => {
    await slasherClient.stop();
    await sleep(500); // let the calls to uninstall the filters resolve
    // await sleep(500000); // REMOVE
    await anvil.stop().catch(logger.error);
  });

  it('creates payloads when the watcher signals', async () => {
    // const cheatCodes = new EthCheatCodes([rpcUrl]);

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
    // 100000000000000000000
    // 100000000000000000000
    logger.info('amounts', { depositAmount: depositAmount.toString(), slashAmount: slashAmount.toString() });
    logger.info('amounts', { depositAmount: depositAmount.toString(), slashAmount: slashAmount.toString() });
    logger.info('amounts', { depositAmount: depositAmount.toString(), slashAmount: slashAmount.toString() });
    logger.info('amounts', { depositAmount: depositAmount.toString(), slashAmount: slashAmount.toString() });
    logger.info('amounts', { depositAmount: depositAmount.toString(), slashAmount: slashAmount.toString() });
    const committee = await rollup.getCurrentEpochCommittee();
    const amounts = Array.from({ length: committee.length }, () => slashAmount);
    const offenses = Array.from({ length: committee.length }, () => Offence.UNKNOWN);

    dummyWatcher.triggerSlash({
      validators: committee,
      amounts,
      offenses,
    });

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
          if (err.message.includes('GovernanceProposer__OnlyProposerCanVote')) {
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

    // const rollupRaw = rollup.getContract();
    // const slasherAddress = await rollup.getSlasher();

    // const slasher = getContract({
    //   abi: SlasherAbi,
    //   address: slasherAddress,
    //   client: l1TxUtils.client,
    // });

    // const slashFailed = await slasher.getEvents.SlashFailed();
    // logger.info('Slash failed:', slashFailed);
    // logger.info('Slash failed:', slashFailed);
    // logger.info('Slash failed:', slashFailed);

    // const slashEvents = await rollupRaw.getEvents.Slashed();
    // logger.info('Slash events:', slashEvents);
    // logger.info('asdf');
    // logger.info('asdf');
    // logger.info('asdf');
    // logger.info('asdf');

    // expect(slashEvents.length).toBe(1);

    const info = await rollup.getAttesterView(l1TxUtils.client.account.address);

    expect(info.effectiveBalance).toBe(0n);
    expect(info.exit.amount).toBe(depositAmount - slashAmount);
  });
});

class DummyWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  constructor() {
    super();
  }

  public shouldSlash(_validator: `0x${string}`, _amount: bigint, _offense: Offence): Promise<boolean> {
    return Promise.resolve(true);
  }

  public triggerSlash(args: WantToSlashArgs) {
    this.emit(WANT_TO_SLASH_EVENT, args);
  }
}
