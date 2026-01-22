import { type AztecNode, type NodeInfo, createAztecNodeClient } from '@aztec/aztec.js/node';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { GovernanceProposerContract, RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import { deployRollupForUpgrade } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { createL1TxUtilsFromViemWallet } from '@aztec/ethereum/l1-tx-utils';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import {
  GSEAbi,
  GovernanceAbi,
  RegisterNewRollupVersionPayloadAbi,
  RegisterNewRollupVersionPayloadBytecode,
  TestERC20Abi,
} from '@aztec/l1-artifacts';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';
import omit from 'lodash.omit';
import { type Hex, encodeFunctionData, getAddress, getContract, parseEventLogs } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  ChainHealth,
  getSequencersConfig,
  rollAztecPods,
  setupEnvironment,
  startPortForwardForEthereum,
  startPortForwardForRPC,
  updateSequencersConfig,
} from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:upgrade_rollup_version');

// This test works through the entire governance process, from proposal creation to execution
describe('spartan_upgrade_rollup_version', () => {
  let aztecNode: AztecNode;
  let nodeInfo: NodeInfo;
  let ETHEREUM_HOSTS: string[];
  let originalL1ContractAddresses: L1ContractAddresses;
  const forwardProcesses: ChildProcess[] = [];
  const health = new ChainHealth(config.NAMESPACE, debugLogger);
  jest.setTimeout(3 * 60 * 60 * 1000); // Governance flow can take a while

  afterAll(async () => {
    await health.teardown();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    await health.setup();
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    const { process: ethereumProcess, port: ethereumPort } = await startPortForwardForEthereum(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    forwardProcesses.push(ethereumProcess);

    const nodeUrl = `http://127.0.0.1:${aztecRpcPort}`;
    const ethereumUrl = `http://127.0.0.1:${ethereumPort}`;

    aztecNode = createAztecNodeClient(nodeUrl, {}, defaultFetch);
    nodeInfo = await aztecNode.getNodeInfo();
    ETHEREUM_HOSTS = [ethereumUrl];

    originalL1ContractAddresses = omit(nodeInfo.l1ContractAddresses, [
      'slashFactoryAddress',
      'stakingAssetHandlerAddress',
      'feeAssetHandlerAddress',
    ]);
  });

  it('should upgrade the rollup version', async () => {
    const chain = createEthereumChain(ETHEREUM_HOSTS, nodeInfo.l1ChainId);

    // Derive private key from mnemonic
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const hdKey = hdAccount.getHdKey();
    if (!hdKey.privateKey) {
      throw new Error('Failed to derive private key from mnemonic');
    }
    const privateKey: Hex = `0x${Buffer.from(hdKey.privateKey).toString('hex')}`;

    const l1Client = createExtendedL1Client(ETHEREUM_HOSTS, MNEMONIC, chain.chainInfo);
    debugLogger.info(`L1 Client address: ${l1Client.account.address}`);

    // Get the original rollup's genesis archive root directly from L1
    // This ensures the new rollup has the same genesis as the original,
    // avoiding version mismatches between local build and deployed network
    const rollup = new RollupContract(l1Client, originalL1ContractAddresses.rollupAddress.toString(), debugLogger);
    const genesisArchiveRoot = await rollup.getGenesisArchiveTreeRoot();
    debugLogger.info(`Original rollup genesis archive root: ${genesisArchiveRoot.toString()}`);

    // Get default L1 contracts config values
    const l1Config = getL1ContractsConfigEnvVars();

    const { rollup: newRollup } = await deployRollupForUpgrade(
      privateKey,
      ETHEREUM_HOSTS[0],
      nodeInfo.l1ChainId,
      originalL1ContractAddresses.registryAddress,
      {
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash,
        genesisArchiveRoot,
        ethereumSlotDuration: l1Config.ethereumSlotDuration,
        aztecSlotDuration: l1Config.aztecSlotDuration,
        aztecEpochDuration: l1Config.aztecEpochDuration,
        aztecProofSubmissionEpochs: l1Config.aztecProofSubmissionEpochs,
        lagInEpochsForValidatorSet: l1Config.lagInEpochsForValidatorSet,
        lagInEpochsForRandao: l1Config.lagInEpochsForRandao,
        inboxLag: l1Config.inboxLag,
        aztecTargetCommitteeSize: l1Config.aztecTargetCommitteeSize,
        slashingQuorum: l1Config.slashingQuorum,
        slashingRoundSizeInEpochs: l1Config.slashingRoundSizeInEpochs,
        slashingLifetimeInRounds: l1Config.slashingLifetimeInRounds,
        slashingExecutionDelayInRounds: l1Config.slashingExecutionDelayInRounds,
        slashingVetoer: l1Config.slashingVetoer,
        slashingDisableDuration: l1Config.slashingDisableDuration,
        localEjectionThreshold: l1Config.localEjectionThreshold,
        manaTarget: l1Config.manaTarget + 1n, // +1 to force different version hash for upgrade
        provingCostPerMana: l1Config.provingCostPerMana,
        feeJuicePortalInitialBalance: 0n,
        realVerifier: false,
        exitDelaySeconds: l1Config.exitDelaySeconds,
        slasherFlavor: l1Config.slasherFlavor,
        slashingOffsetInRounds: l1Config.slashingOffsetInRounds,
        slashAmountSmall: l1Config.slashAmountSmall,
        slashAmountMedium: l1Config.slashAmountMedium,
        slashAmountLarge: l1Config.slashAmountLarge,
        governanceVotingDuration: l1Config.governanceVotingDuration,
      },
      debugLogger,
    );

    // Safeguard against deploying the same version twice (since it will fail)
    // We can remove this once https://linear.app/aztec-labs/issue/TMNT-139/version-at-deployment is resolved
    // See yarn-project/ethereum/src/deploy_l1_contracts.ts L:666
    const currentCanonical = await RegistryContract.collectAddresses(
      l1Client,
      originalL1ContractAddresses.registryAddress,
      'canonical',
      debugLogger,
    );
    const currentVer = await new RollupContract(
      l1Client,
      currentCanonical.rollupAddress.toString(),
      debugLogger,
    ).getVersion();
    const targetVer = await newRollup.getVersion();
    if (currentVer === targetVer) {
      debugLogger.info(`Already at target version ${targetVer}; skipping execute.`);
      expect(true).toBe(true);
      return;
    }

    // Deploy governance payload to register the NEW rollup version in the registry
    const { address: payloadAddress } = await deployL1Contract(
      l1Client,
      RegisterNewRollupVersionPayloadAbi,
      RegisterNewRollupVersionPayloadBytecode,
      [originalL1ContractAddresses.registryAddress.toString(), newRollup.address],
      { logger: debugLogger },
    );
    debugLogger.info(`RegisterNewRollupVersionPayload deployed at ${payloadAddress.toString()}`);

    // Point sequencers at the payload so they vote for it
    await updateSequencersConfig(config, { governanceProposerPayload: payloadAddress });
    try {
      const configs = await getSequencersConfig(config);
      debugLogger.info(`Sequencer configs applied; count=${configs.length}`);
    } catch (e) {
      debugLogger.warn(`Unable to fetch sequencer configs: ${e}`);
    }

    // Wait for quorum and the round transition, then submit round winner via Governance Proposer
    const governanceProposer = new GovernanceProposerContract(
      l1Client,
      nodeInfo.l1ContractAddresses.governanceProposerAddress.toString(),
    );

    const govInfo = async () => {
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.computeRound(slot);
      const info = await governanceProposer.getRoundInfo(nodeInfo.l1ContractAddresses.rollupAddress.toString(), round);
      const leaderVotes = await governanceProposer.getPayloadSignals(
        nodeInfo.l1ContractAddresses.rollupAddress.toString(),
        round,
        info.payloadWithMostSignals,
      );
      return { slot, round, info, leaderVotes } as const;
    };

    const quorumSize = await governanceProposer.getQuorumSize();
    debugLogger.info(`Governance proposer quorum size: ${quorumSize}`);

    // Wait until payload has quorum
    while (true) {
      const { round, leaderVotes } = await govInfo();
      debugLogger.info(`Votes for leader payload: ${leaderVotes}/${quorumSize} (round ${round})`);
      if (leaderVotes >= quorumSize) {
        break;
      }
      await new Promise(r => setTimeout(r, 12_000));
    }

    // Wait for next round so the proposal becomes executable by proposer
    let { round } = await govInfo();
    const executableRound = round;
    while (round === executableRound) {
      await new Promise(r => setTimeout(r, 12_500));
      ({ round } = await govInfo());
    }

    const l1TxUtils = createL1TxUtilsFromViemWallet(l1Client, { loggerFactory: debugLogger });
    const { receipt: proposerReceipt, proposalId } = await governanceProposer.submitRoundWinner(
      executableRound,
      l1TxUtils,
    );
    debugLogger.info(`submitRoundWinner receipt status: ${proposerReceipt.status}`);
    const fromBlock = proposerReceipt.blockNumber;

    const governance = getContract({
      address: getAddress(nodeInfo.l1ContractAddresses.governanceAddress.toString()),
      abi: GovernanceAbi,
      client: l1Client,
    });

    // Helper to tally votes for this proposalId since submission
    const tallyVotes = async () => {
      try {
        const logs = await l1Client.getLogs({ address: governance.address, fromBlock, toBlock: 'latest' });
        const parsed = parseEventLogs({ abi: GovernanceAbi, logs }) as unknown as Array<{
          eventName: string;
          args: { proposalId?: bigint; voter?: `0x${string}`; support?: boolean; amount?: bigint };
        }>;
        const votes = parsed.filter(
          (
            l,
          ): l is {
            eventName: 'VoteCast';
            args: { proposalId: bigint; voter: `0x${string}`; support: boolean; amount: bigint };
          } => l.eventName === 'VoteCast' && typeof l.args === 'object' && l.args.proposalId !== undefined,
        );
        const votesForThis = votes.filter(v => v.args.proposalId === proposalId);
        const yes = votesForThis.filter(v => v.args.support === true).reduce((acc, v) => acc + v.args.amount, 0n);
        const no = votesForThis.filter(v => v.args.support === false).reduce((acc, v) => acc + v.args.amount, 0n);
        debugLogger.info(`VoteCast so far for proposal ${proposalId}: yes=${yes} no=${no} (events=${votes.length})`);
      } catch (e) {
        debugLogger.warn(`tallyVotes failed: ${String(e)}`);
      }
    };

    const proposal = (await governance.read.getProposal([proposalId])) as {
      creation: bigint;
      config: { votingDelay: bigint; votingDuration: bigint; executionDelay: bigint };
      cachedState: number;
    };
    const creation: bigint = proposal.creation;
    const cfg = proposal.config;
    const votingDelay: bigint = cfg.votingDelay;
    const votingDuration: bigint = cfg.votingDuration;
    const executionDelay: bigint = cfg.executionDelay;
    const governanceConfig = (await governance.read.getConfiguration()) as { minimumVotes: bigint };
    debugLogger.info(
      `Governance config: minimumVotes=${governanceConfig.minimumVotes} votingDelay=${votingDelay} votingDuration=${votingDuration} executionDelay=${executionDelay}`,
    );

    const timeToActive = creation + votingDelay;
    const timeToQueued = timeToActive + votingDuration;

    const nowTs = async () => BigInt((await l1Client.getBlock()).timestamp);

    // Wait for Active
    while ((await nowTs()) < timeToActive) {
      const remaining = Number(timeToActive - (await nowTs()));
      debugLogger.info(`Waiting for proposal Active phase. Seconds remaining: ${remaining}`);
      await new Promise(r => setTimeout(r, 5_000));
    }
    debugLogger.info('Proposal is Active (voting started)');

    // Mint + deposit enough staking tokens to exceed minimumVotes, then vote once
    try {
      const stakingToken = getContract({
        address: getAddress(nodeInfo.l1ContractAddresses.stakingAssetAddress.toString()),
        abi: TestERC20Abi,
        client: l1Client,
      });
      const minVotes = governanceConfig.minimumVotes as bigint;
      const buffer = minVotes / 10n; // add 10% buffer
      const depositAmount = minVotes + buffer;
      // Mint to self (TestERC20 has mint(address,uint256))
      const mintData = encodeFunctionData({
        abi: TestERC20Abi,
        functionName: 'mint',
        args: [l1Client.account.address, depositAmount],
      });
      await l1TxUtils.sendAndMonitorTransaction({ to: stakingToken.address, data: mintData });
      // Approve Governance
      const approveData = encodeFunctionData({
        abi: TestERC20Abi,
        functionName: 'approve',
        args: [governance.address, depositAmount],
      });
      await l1TxUtils.sendAndMonitorTransaction({ to: stakingToken.address, data: approveData });
      // Deposit into Governance
      const depositData = encodeFunctionData({
        abi: GovernanceAbi,
        functionName: 'deposit',
        args: [l1Client.account.address, depositAmount],
      });
      await l1TxUtils.sendAndMonitorTransaction({ to: governance.address, data: depositData });
      debugLogger.info(`Deposited staking tokens: ${depositAmount}`);
    } catch (e) {
      debugLogger.warn(`Mint/approve/deposit failed (continuing): ${String(e)}`);
    }

    // Ensure at least one new L1 block after Active to avoid NotInPast
    try {
      const before = await l1Client.getBlockNumber();
      const maxTries = 5;
      let tries = 0;
      while ((await l1Client.getBlockNumber()) === before && tries < maxTries) {
        try {
          await l1TxUtils.sendAndMonitorTransaction({ to: l1Client.account.address, value: 1n });
        } catch {
          await new Promise(r => setTimeout(r, 12_000));
        }
        tries++;
      }
    } catch {
      // ignore
    }

    try {
      // Log voter power and total power (prefer now views, fallback to past timestamp)
      const nowBlock = await l1Client.getBlock();
      let voterPower: bigint;
      let totalPower: bigint;
      try {
        voterPower = (await governance.read.powerNow([l1Client.account.address])) as bigint;
        totalPower = (await governance.read.totalPowerNow()) as bigint;
      } catch {
        const pastTs = nowBlock.timestamp - 1n;
        voterPower = (await governance.read.powerAt([l1Client.account.address, pastTs])) as bigint;
        totalPower = (await governance.read.totalPowerAt([pastTs])) as bigint;
      }
      debugLogger.info(`Voter power: ${voterPower}; total power: ${totalPower}`);

      const voteRollup = new RollupContract(
        l1Client,
        nodeInfo.l1ContractAddresses.rollupAddress.toString(),
        debugLogger,
      );
      debugLogger.info(`Casting local vote for proposal ${proposalId}`);
      const voteResult = await voteRollup.vote(l1TxUtils, proposalId);
      debugLogger.info(`Local vote tx sent: ${voteResult.receipt?.transactionHash ?? 'unknown hash'}`);

      // Log ballot after voting
      try {
        const ballot = (await governance.read.getBallot([proposalId, l1Client.account.address])) as {
          yea: bigint;
          nay: bigint;
        };
        debugLogger.info(`Local ballot: yea=${ballot.yea} nay=${ballot.nay}`);
      } catch {
        // ignore ballot read failure
      }
    } catch (e) {
      debugLogger.warn(`Local vote attempt failed (non-fatal): ${String(e)}`);
    }

    // While in Active, poll until minimumVotes are met or voting window ends
    try {
      while ((await nowTs()) < timeToQueued) {
        const _p = (await governance.read.getProposal([proposalId])) as { cachedState: number };
        // Log cached state and timestamps as we progress
        debugLogger.info(`Proposal state during voting: ${_p.cachedState}`);
        await tallyVotes();
        const remaining = Number(timeToQueued - (await nowTs()));
        debugLogger.info(`Voting in progress. Seconds until voting ends: ${remaining}`);
        await new Promise(r => setTimeout(r, 15_000));
      }
    } catch {
      // ignore read failures while polling
    }

    // Wait precisely until Executable, then attempt execute once
    const startOfExecutable = creation + votingDelay + votingDuration + executionDelay;
    while ((await nowTs()) < startOfExecutable) {
      const remaining = Number(startOfExecutable - (await nowTs()));
      debugLogger.info(`Waiting to become Executable. Seconds remaining: ${remaining}`);
      await tallyVotes();
      await new Promise(r => setTimeout(r, 10_000));
    }

    // Confirm state is Executable (ProposalState.Executable == 3)
    try {
      const normalizeState = (s: unknown): bigint => {
        try {
          if (typeof s === 'bigint') {
            return s;
          }
          if (typeof s === 'number' || typeof s === 'string') {
            return BigInt(s);
          }
        } catch {
          /* ignore */
        }
        return 0n;
      };

      let stateRaw = await governance.read.getProposalState([proposalId]);
      let state = normalizeState(stateRaw);
      while (state !== 3n) {
        debugLogger.info(`Current proposal state: ${state}`);
        await new Promise(r => setTimeout(r, 5_000));
        stateRaw = await governance.read.getProposalState([proposalId]);
        state = normalizeState(stateRaw);
      }
      debugLogger.info('Proposal state is Executable');
    } catch {
      // ignore read failures and continue to execute attempt
    }

    // Use the proposal id returned by submitRoundWinner
    const maxGovernanceWaitMs = 20 * 60 * 1000; // 20 minutes safety window
    const startWait = Date.now();
    // Loop trying execute; ignore failures until timeout
    while (Date.now() - startWait < maxGovernanceWaitMs) {
      try {
        const data = encodeFunctionData({ abi: GovernanceAbi, functionName: 'execute', args: [proposalId] });
        const { receipt } = await l1TxUtils.sendAndMonitorTransaction({ to: governance.address, data });
        if (receipt.status === 'success') {
          debugLogger.info('Governance execute succeeded');
          break;
        }
      } catch (err) {
        debugLogger.warn(`Governance execute attempt failed: ${String(err)}`);
        // Not executable yet or reverted; wait and retry
      }
      await new Promise(r => setTimeout(r, 15_000));
    }

    // Verify GSE correctly registered the new rollup as "latest"
    const gseAddress = originalL1ContractAddresses.gseAddress?.toString();
    if (gseAddress) {
      const gse = getContract({
        address: getAddress(gseAddress),
        abi: GSEAbi,
        client: l1Client,
      });

      const gseLatestRollup = (await gse.read.getLatestRollup()) as `0x${string}`;
      debugLogger.info(`GSE.getLatestRollup() = ${gseLatestRollup}`);
      debugLogger.info(`Expected new rollup = ${newRollup.address}`);

      if (getAddress(gseLatestRollup) !== getAddress(newRollup.address)) {
        debugLogger.error(
          `GSE did NOT register new rollup as latest! GSE latest=${gseLatestRollup}, expected=${newRollup.address}`,
        );
        throw new Error('GSE.addRollup failed - new rollup is not the latest in GSE');
      }

      const isRegistered = (await gse.read.isRollupRegistered([newRollup.address])) as boolean;
      debugLogger.info(`GSE.isRollupRegistered(newRollup) = ${isRegistered}`);
      if (!isRegistered) {
        throw new Error('GSE.addRollup failed - new rollup is not registered in GSE');
      }
    }

    const newAddresses = await newRollup.getRollupAddresses();

    const newCanonicalAddresses = await RegistryContract.collectAddresses(
      l1Client,
      originalL1ContractAddresses.registryAddress,
      'canonical',
      debugLogger,
    );

    const pick = <T, K extends readonly (keyof T)[]>(obj: T, keys: K) =>
      keys.reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {} as Pick<T, K[number]>);

    const keys = [
      // preserved (non-versioned)
      'registryAddress',
      'governanceAddress',
      'governanceProposerAddress',
      'gseAddress',
      'rewardDistributorAddress',
      'feeJuiceAddress',
      'stakingAssetAddress',
      // updated (versioned)
      'rollupAddress',
      'inboxAddress',
      'outboxAddress',
      'feeJuicePortalAddress',
    ] as const;

    const expectedProjection = {
      // preserved
      registryAddress: originalL1ContractAddresses.registryAddress,
      governanceAddress: originalL1ContractAddresses.governanceAddress,
      governanceProposerAddress: originalL1ContractAddresses.governanceProposerAddress,
      gseAddress: originalL1ContractAddresses.gseAddress,
      rewardDistributorAddress: originalL1ContractAddresses.rewardDistributorAddress,
      feeJuiceAddress: originalL1ContractAddresses.feeJuiceAddress,
      stakingAssetAddress: originalL1ContractAddresses.stakingAssetAddress,
      // updated
      rollupAddress: newAddresses.rollupAddress,
      inboxAddress: newAddresses.inboxAddress,
      outboxAddress: newAddresses.outboxAddress,
      feeJuicePortalAddress: newAddresses.feeJuicePortalAddress,
    };

    expect(pick(newCanonicalAddresses, keys)).toEqual(expectedProjection);

    const oldVersion = await new RollupContract(
      l1Client,
      originalL1ContractAddresses.rollupAddress.toString(),
      debugLogger,
    ).getVersion();
    const newVersion = await new RollupContract(
      l1Client,
      newCanonicalAddresses.rollupAddress.toString(),
      debugLogger,
    ).getVersion();

    debugLogger.info(`oldVersion: ${oldVersion}, address: ${originalL1ContractAddresses.rollupAddress}`);
    debugLogger.info(`newVersion: ${newVersion}, address: ${newCanonicalAddresses.rollupAddress}`);
    expect(oldVersion).not.toEqual(newVersion);

    await expect(
      RegistryContract.collectAddresses(l1Client, originalL1ContractAddresses.registryAddress, oldVersion, debugLogger),
    ).resolves.toEqual(originalL1ContractAddresses);

    await expect(
      RegistryContract.collectAddresses(l1Client, originalL1ContractAddresses.registryAddress, newVersion, debugLogger),
    ).resolves.toEqual(newCanonicalAddresses);

    try {
      // clearState: true to delete PVCs - old state is incompatible with new rollup
      await rollAztecPods(config.NAMESPACE, /* clearState */ true);
    } catch (err) {
      debugLogger.warn(`rollAztecPods failed (continuing): ${String(err)}`);
    }

    // Reconnect to the node via RPC after pods restart
    const { process: aztecRpcProcess2, port: aztecRpcPort2 } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess2);
    const nodeUrl2 = `http://127.0.0.1:${aztecRpcPort2}`;
    aztecNode = createAztecNodeClient(nodeUrl2, {}, defaultFetch);

    const newNodeInfo = await aztecNode.getNodeInfo();

    // Reapply proposer payload so sequencers re-signal after restart
    try {
      await updateSequencersConfig(config, { governanceProposerPayload: payloadAddress });
      const configs = await getSequencersConfig(config);
      debugLogger.info(`Sequencer configs re-applied; count=${configs.length}`);
    } catch (err) {
      debugLogger.warn(`Failed to reapply proposer payload (continuing): ${String(err)}`);
    }

    debugLogger.info(`newNodeInfo: ${JSON.stringify(newNodeInfo)}`);
    debugLogger.info(`originalL1ContractAddresses: ${JSON.stringify(originalL1ContractAddresses)}`);
    debugLogger.info(`newCanonicalAddresses: ${JSON.stringify(newCanonicalAddresses)}`);
    expect(newNodeInfo.l1ContractAddresses.rollupAddress).toEqual(newCanonicalAddresses.rollupAddress);

    const l2Tips = await newRollup.getTips();

    // After an upgrade, we must wait for lagInEpochsForValidatorSet epochs before
    // the new rollup can form a committee from validators who deposited with moveWithLatestRollup=true.
    // Then we need additional time for block production and proving.
    const lagEpochs = config.AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET;
    const epochDurationSeconds = config.AZTEC_EPOCH_DURATION * config.AZTEC_SLOT_DURATION;
    const waitForCommitteeSeconds = (lagEpochs + 5) * epochDurationSeconds; // +5 epoch buffer for timing variations
    const proofGenerationTimeSeconds = config.REAL_VERIFIER ? 20 * 60 : 2 * 60; // 20 min for real, 2 min for fake
    const waitForProvingSeconds = epochDurationSeconds + proofGenerationTimeSeconds;
    const totalWaitSeconds = waitForCommitteeSeconds + waitForProvingSeconds;

    debugLogger.info(
      `Waiting up to ${totalWaitSeconds}s for new rollup to produce/prove blocks (lag=${lagEpochs} epochs, epochDuration=${epochDurationSeconds}s, provingBuffer=${waitForProvingSeconds}s)`,
    );

    await expect(
      retryUntil(
        async () => {
          const tips = await newRollup.getTips();
          debugLogger.verbose(
            `Tips check: pending=${tips.pending}, proven=${tips.proven}, target=${l2Tips.proven.valueOf() + 1}`,
          );
          return tips.proven > l2Tips.proven;
        },
        'new rollup should be building/proving blocks',
        totalWaitSeconds,
        30,
      ),
    ).resolves.toBe(true);
  });
});
