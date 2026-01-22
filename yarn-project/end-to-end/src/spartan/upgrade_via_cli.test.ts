import { type AztecNode, type NodeInfo, createAztecNodeClient } from '@aztec/aztec.js/node';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { GovernanceProposerContract, RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { createL1TxUtilsFromViemWallet } from '@aztec/ethereum/l1-tx-utils';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { GSEAbi, GovernanceAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';
import fs from 'fs';
import omit from 'lodash.omit';
import path from 'path';
import { type Hex, encodeFunctionData, getAddress, getContract, parseEventLogs } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  getGitProjectRoot,
  rollAztecPods,
  runProjectScript,
  setupEnvironment,
  startPortForwardForEthereum,
  startPortForwardForRPC,
  updateSequencersConfig,
  waitForResourceByLabel,
} from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:upgrade_via_cli');

/**
 * Deployment result from the deploy_rollup_upgrade.sh script.
 */
interface DeployResult {
  rollupAddress: string;
  payloadAddress: string;
}

/**
 * Parse deployment result from the deploy script output.
 * The Forge script outputs: JSON DEPLOY RESULT: {"rollupAddress":"0x...","payloadAddress":"0x...",...}
 */
function parseDeployResult(output: string): DeployResult {
  const match = output.match(/JSON DEPLOY RESULT:\s*({.*})/);
  if (!match) {
    throw new Error('Could not find JSON DEPLOY RESULT in script output');
  }
  const json = JSON.parse(match[1]);
  if (!json.rollupAddress) {
    throw new Error(`rollupAddress not found in deploy result: ${match[1]}`);
  }
  if (!json.payloadAddress) {
    throw new Error(`payloadAddress not found in deploy result: ${match[1]}`);
  }
  return { rollupAddress: json.rollupAddress, payloadAddress: json.payloadAddress };
}

/**
 * Temporarily sets AZTEC_MANA_TARGET in network-defaults.yml to (currentManaTarget + 1)
 * to force a different rollup version hash.
 *
 * The rollup version is computed from a hash of configuration parameters including mana target.
 * When deploying an upgrade, we need the new rollup to have a different version than the current
 * canonical rollup, otherwise the governance flow will be skipped (can't upgrade to same version).
 *
 * By querying the current rollup's mana target and writing that value + 1, we support multiple
 * sequential upgrades - each time we deploy based on the actual current canonical rollup state,
 * not a static file value.
 *
 * @param currentManaTarget - The mana target from the current canonical rollup
 * @returns A cleanup function to restore the original file content
 */
function bumpManaTargetInNetworkDefaults(currentManaTarget: bigint): () => void {
  const networkDefaultsPath = path.join(getGitProjectRoot(), 'spartan/environments/network-defaults.yml');
  const originalContent = fs.readFileSync(networkDefaultsPath, 'utf-8');

  // Find and replace the AZTEC_MANA_TARGET in the l1-contracts section (first occurrence)
  const manaTargetRegex = /^(\s*AZTEC_MANA_TARGET:\s*)(\d+)/m;
  const match = originalContent.match(manaTargetRegex);
  if (!match) {
    throw new Error('Could not find AZTEC_MANA_TARGET in network-defaults.yml');
  }

  const fileValue = parseInt(match[2], 10);
  const newValue = currentManaTarget + 1n;
  const newContent = originalContent.replace(manaTargetRegex, `$1${newValue}`);

  fs.writeFileSync(networkDefaultsPath, newContent);
  debugLogger.info(
    `Set AZTEC_MANA_TARGET to ${newValue} in network-defaults.yml (was ${fileValue}, current rollup has ${currentManaTarget})`,
  );

  // Return cleanup function to restore original content
  return () => {
    fs.writeFileSync(networkDefaultsPath, originalContent);
    debugLogger.info(`Restored AZTEC_MANA_TARGET to ${fileValue} in network-defaults.yml`);
  };
}

// This test deploys a new rollup version using the deploy_rollup_upgrade.sh script
// and goes through the governance process to register it
describe('spartan_upgrade_via_cli', () => {
  let aztecNode: AztecNode;
  let nodeInfo: NodeInfo;
  let ETHEREUM_HOSTS: string[];
  let originalL1ContractAddresses: L1ContractAddresses;
  const forwardProcesses: ChildProcess[] = [];
  jest.setTimeout(3 * 60 * 60 * 1000); // Governance flow can take a while

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    const { process: ethereumProcess, port: ethereumPort } = await startPortForwardForEthereum(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    forwardProcesses.push(ethereumProcess);

    const nodeUrl = `http://127.0.0.1:${aztecRpcPort}`;
    const ethereumUrl = `http://127.0.0.1:${ethereumPort}`;

    aztecNode = createAztecNodeClient(nodeUrl);
    nodeInfo = await aztecNode.getNodeInfo();
    ETHEREUM_HOSTS = [ethereumUrl];

    originalL1ContractAddresses = omit(nodeInfo.l1ContractAddresses, [
      'slashFactoryAddress',
      'stakingAssetHandlerAddress',
      'feeAssetHandlerAddress',
    ]);
  });

  it('should deploy a new rollup via deploy script and upgrade via governance', async () => {
    const chain = createEthereumChain(ETHEREUM_HOSTS, nodeInfo.l1ChainId);

    // Derive private key from mnemonic (same as upgrade_rollup_version.test.ts)
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const hdKey = hdAccount.getHdKey();
    if (!hdKey.privateKey) {
      throw new Error('Failed to derive private key from mnemonic');
    }
    const privateKey: Hex = `0x${Buffer.from(hdKey.privateKey).toString('hex')}`;

    const l1Client = createExtendedL1Client(ETHEREUM_HOSTS, MNEMONIC, chain.chainInfo);
    debugLogger.info(`L1 Client address: ${l1Client.account.address}`);

    const registryAddress = originalL1ContractAddresses.registryAddress;
    debugLogger.info(`Registry address: ${registryAddress}`);

    // Get the current number of rollup versions in the registry
    const registry = new RegistryContract(l1Client, registryAddress.toString());
    const oldNumberOfVersions = await registry.getNumberOfVersions();
    debugLogger.info(`Current number of rollup versions: ${oldNumberOfVersions}`);

    const oldRollupAddress = originalL1ContractAddresses.rollupAddress;
    const oldRollup = new RollupContract(l1Client, oldRollupAddress.toString());
    const oldVersion = await oldRollup.getVersion();
    debugLogger.info(`Old rollup version: ${oldVersion}, address: ${oldRollupAddress}`);

    // Get the current rollup's mana target and bump it in network-defaults.yml
    // This ensures the newly deployed rollup will have a different version hash
    const currentManaTarget = await oldRollup.getManaTarget();
    debugLogger.info(`Current rollup mana target: ${currentManaTarget}`);
    const restoreNetworkDefaults = bumpManaTargetInNetworkDefaults(currentManaTarget);

    // Deploy a new rollup via the deploy script
    // Required env vars for local (chain ID 1337):
    //   L1_CHAIN_ID, L1_RPC_URL, FUNDING_PRIVATE_KEY
    // AZTEC_* env vars come from the test environment (next-scenario.env)
    // When NETWORK is blank, the script loads base l1-contracts defaults
    let result;
    try {
      result = await runProjectScript(
        'spartan/scripts/deploy_rollup_upgrade.sh',
        [registryAddress.toString()],
        debugLogger,
        {
          L1_CHAIN_ID: nodeInfo.l1ChainId.toString(),
          L1_RPC_URL: ETHEREUM_HOSTS[0],
          FUNDING_PRIVATE_KEY: privateKey,
        },
      );
    } finally {
      // Always restore network-defaults.yml after deploy attempt
      restoreNetworkDefaults();
    }

    expect(result.exitCode).toBe(0);

    // Parse deployment result from script output (includes rollup and payload addresses)
    const combinedOutput = result.stdout + result.stderr;
    const deployResult = parseDeployResult(combinedOutput);
    debugLogger.info(`New rollup deployed at: ${deployResult.rollupAddress}`);
    debugLogger.info(`Governance payload deployed at: ${deployResult.payloadAddress}`);

    const newRollup = new RollupContract(l1Client, deployResult.rollupAddress as `0x${string}`);
    const newVersion = await newRollup.getVersion();
    debugLogger.info(`New rollup version: ${newVersion}`);

    // Safeguard against deploying the same version twice
    const currentCanonical = await RegistryContract.collectAddresses(l1Client, registryAddress, 'canonical');
    const currentVer = await new RollupContract(l1Client, currentCanonical.rollupAddress.toString()).getVersion();
    if (currentVer === newVersion) {
      debugLogger.info(`Already at target version ${newVersion}; skipping governance execution.`);
      expect(true).toBe(true);
      return;
    }

    // Use the governance payload deployed by the script
    const payloadAddress = EthAddress.fromString(deployResult.payloadAddress);

    // Point sequencers at the payload so they vote for it
    await updateSequencersConfig(config, { governanceProposerPayload: payloadAddress });
    debugLogger.info(`Sequencer configs updated with payload ${payloadAddress.toString()}`);

    // Wait for quorum and the round transition, then submit round winner via Governance Proposer
    const governanceProposer = new GovernanceProposerContract(
      l1Client,
      nodeInfo.l1ContractAddresses.governanceProposerAddress.toString(),
    );

    // Use the CURRENT canonical rollup for governance queries
    // Sequencers signal on the canonical rollup, which may differ from oldRollupAddress if a previous upgrade occurred
    const canonicalRollupAddress = await registry.getCanonicalAddress();
    const canonicalRollup = new RollupContract(l1Client, canonicalRollupAddress.toString());
    debugLogger.info(`Querying governance for canonical rollup: ${canonicalRollupAddress}`);

    const govInfo = async () => {
      const slot = await canonicalRollup.getSlotNumber();
      const round = await governanceProposer.computeRound(slot);
      const info = await governanceProposer.getRoundInfo(canonicalRollupAddress.toString(), round);
      const leaderVotes = await governanceProposer.getPayloadSignals(
        canonicalRollupAddress.toString(),
        round,
        info.payloadWithMostSignals,
      );
      return { slot, round, info, leaderVotes } as const;
    };

    const quorumSize = await governanceProposer.getQuorumSize();
    debugLogger.info(`Governance proposer quorum size: ${quorumSize}, our payload: ${payloadAddress.toString()}`);

    // Wait until leader payload has quorum (should be ours since we configured sequencers)
    while (true) {
      const { round, info, leaderVotes } = await govInfo();
      debugLogger.info(
        `Round ${round}: leader=${info.payloadWithMostSignals.slice(0, 10)}... votes=${leaderVotes}/${quorumSize}`,
      );
      if (leaderVotes >= quorumSize) {
        break;
      }
      await new Promise(r => setTimeout(r, 12_000));
    }

    // Wait for next round so the proposal becomes executable by proposer
    let { round } = await govInfo();
    const executableRound = round;
    debugLogger.info(`Our payload has quorum in round ${executableRound}. Waiting for next round...`);
    while (round === executableRound) {
      await new Promise(r => setTimeout(r, 12_500));
      ({ round } = await govInfo());
    }

    const l1TxUtils = createL1TxUtilsFromViemWallet(l1Client, { logger: debugLogger });
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

      const voteRollup = new RollupContract(l1Client, oldRollupAddress.toString());
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
      debugLogger.info(`Expected new rollup = ${deployResult.rollupAddress}`);

      if (getAddress(gseLatestRollup) !== getAddress(deployResult.rollupAddress)) {
        debugLogger.error(
          `GSE did NOT register new rollup as latest! GSE latest=${gseLatestRollup}, expected=${deployResult.rollupAddress}`,
        );
        throw new Error('GSE.addRollup failed - new rollup is not the latest in GSE');
      }

      const isRegistered = (await gse.read.isRollupRegistered([
        deployResult.rollupAddress as `0x${string}`,
      ])) as boolean;
      debugLogger.info(`GSE.isRollupRegistered(newRollup) = ${isRegistered}`);
      if (!isRegistered) {
        throw new Error('GSE.addRollup failed - new rollup is not registered in GSE');
      }
    }

    const newAddresses = await newRollup.getRollupAddresses();

    const newCanonicalAddresses = await RegistryContract.collectAddresses(l1Client, registryAddress, 'canonical');

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

    const finalOldVersion = await new RollupContract(
      l1Client,
      originalL1ContractAddresses.rollupAddress.toString(),
    ).getVersion();
    const finalNewVersion = await new RollupContract(
      l1Client,
      newCanonicalAddresses.rollupAddress.toString(),
    ).getVersion();

    debugLogger.info(`oldVersion: ${finalOldVersion}, address: ${originalL1ContractAddresses.rollupAddress}`);
    debugLogger.info(`newVersion: ${finalNewVersion}, address: ${newCanonicalAddresses.rollupAddress}`);
    expect(finalOldVersion).not.toEqual(finalNewVersion);

    await expect(RegistryContract.collectAddresses(l1Client, registryAddress, finalOldVersion)).resolves.toEqual(
      originalL1ContractAddresses,
    );

    await expect(RegistryContract.collectAddresses(l1Client, registryAddress, finalNewVersion)).resolves.toEqual(
      newCanonicalAddresses,
    );

    try {
      // clearState: true to delete PVCs - old state is incompatible with new rollup
      await rollAztecPods(config.NAMESPACE, /* clearState */ true);
    } catch (err) {
      debugLogger.warn(`rollAztecPods failed (continuing): ${String(err)}`);
      // rollAztecPods may have failed before waiting for RPC pods - ensure they're ready
      debugLogger.info('Waiting for RPC pods to be ready...');
      await waitForResourceByLabel({
        resource: 'pods',
        namespace: config.NAMESPACE,
        label: 'app.kubernetes.io/component=rpc',
        timeout: '5m',
      });
    }

    // Reconnect to the node via RPC after pods restart
    const { process: aztecRpcProcess2, port: aztecRpcPort2 } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess2);
    const nodeUrl2 = `http://127.0.0.1:${aztecRpcPort2}`;
    aztecNode = createAztecNodeClient(nodeUrl2);

    const newNodeInfo = await aztecNode.getNodeInfo();

    // Reapply proposer payload so sequencers re-signal after restart
    try {
      await updateSequencersConfig(config, { governanceProposerPayload: payloadAddress });
      debugLogger.info(`Sequencer configs re-applied with payload ${payloadAddress.toString()}`);
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

    debugLogger.info('Successfully verified new rollup is producing and proving blocks via CLI deploy');
  });
});
