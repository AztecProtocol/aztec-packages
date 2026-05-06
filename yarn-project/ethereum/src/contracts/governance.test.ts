import { createExtendedL1Client, getPublicClient } from '@aztec/ethereum/client';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { GovernanceAbi } from '@aztec/l1-artifacts/GovernanceAbi';

import { type Hex, encodeFunctionData, parseEventLogs } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import {
  type GovernanceConfiguration,
  GovernanceContract,
  MAX_PROPOSAL_LIFETIME_SECONDS,
  ProposalState,
  ReadOnlyGovernanceContract,
} from './governance.js';

describe('Governance', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let publicClient: ViemClient;
  let walletClient: ExtendedViemWalletClient;
  let cheatCodes: EthCheatCodes;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
  let governanceAddress: `0x${string}`;
  let governanceProposerAddress: `0x${string}`;

  beforeAll(async () => {
    // this is the 6th address that gets funded by the junk mnemonic
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    privateKey = privateKeyToAccount(privateKeyRaw);
    vkTreeRoot = Fr.random();
    protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    walletClient = createExtendedL1Client([rpcUrl], privateKey, foundry);
    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new TestDateProvider());

    const deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot,
      protocolContractsHash,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    governanceAddress = deployed.l1ContractAddresses.governanceAddress.toString() as `0x${string}`;
    governanceProposerAddress = deployed.l1ContractAddresses.governanceProposerAddress.toString() as `0x${string}`;
  });

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('ReadOnlyGovernanceContract', () => {
    let governance: ReadOnlyGovernanceContract;

    beforeEach(() => {
      governance = new ReadOnlyGovernanceContract(governanceAddress, publicClient);
    });

    it('can be instantiated with public client but not wallet methods', () => {
      expect(governance).toBeDefined();
      expect(governance.client).toBe(publicClient);

      // Verify wallet-specific methods are not available
      expect(governance).not.toHaveProperty('deposit');
      expect(governance).not.toHaveProperty('proposeWithLock');
      expect(governance).not.toHaveProperty('vote');
      expect(governance).not.toHaveProperty('executeProposal');
    });

    it('has all read-only methods', () => {
      expect(governance.getGovernanceProposerAddress).toBeDefined();
      expect(governance.getConfiguration).toBeDefined();
      expect(governance.getProposal).toBeDefined();
      expect(governance.getProposalState).toBeDefined();
      expect(governance.getProposalCount).toBeDefined();
      expect(governance.hasActiveProposalWithPayload).toBeDefined();
      expect(governance.awaitProposalActive).toBeDefined();
      expect(governance.awaitProposalExecutable).toBeDefined();
    });

    it('gets configuration', async () => {
      const config = await governance.getConfiguration();
      expect(config).toBeDefined();
      expect(config.proposeConfig.lockDelay).toBeGreaterThan(0n);
      expect(config.proposeConfig.lockAmount).toBeGreaterThan(0n);
      expect(config.votingDelay).toBeGreaterThan(0n);
      expect(config.votingDuration).toBeGreaterThan(0n);
      expect(config.executionDelay).toBeGreaterThan(0n);
      expect(config.gracePeriod).toBeGreaterThan(0n);
      expect(config.quorum).toBeGreaterThan(0n);
      expect(config.requiredYeaMargin).toBeGreaterThan(0n);
      expect(config.minimumVotes).toBeGreaterThan(0n);
    });

    describe('hasActiveProposalWithPayload', () => {
      // Runtime bytecode for a contract whose only behavior is: ignore calldata, return `original`
      // (zero-padded to 32 bytes). This is a stand-in for `IProposerPayload.getOriginalPayload()`.
      // The point is to faithfully exercise the 'getOriginalPayload' path.
      //
      //   PUSH20 <original>   // 0x73 <20 bytes>
      //   PUSH1  0x00
      //   MSTORE              // mem[0..31] = 000...000<original>
      //   PUSH1  0x20
      //   PUSH1  0x00
      //   RETURN              // return mem[0..31]
      const buildMockWrapperBytecode = (original: EthAddress): Hex =>
        `0x73${original.toString().toLowerCase().replace(/^0x/, '')}60005260206000f3`;

      // A wrapper that always reverts when called. Stands in for proposals created via
      // `Governance.proposeWithLock`, which bypass GSEPayload entirely -- the payload stored on the
      // proposal won't have a `getOriginalPayload()` selector and the call will revert. The sweep
      // must treat this as "no match" and continue rather than aborting.
      //   PUSH1 0x00
      //   PUSH1 0x00
      //   REVERT
      const REVERTING_WRAPPER_BYTECODE: Hex = '0x60006000fd';

      // Etches `code` at a random address and returns the address as a Hex string
      const etchCode = async (code: Hex) => {
        const addr = EthAddress.random();
        await cheatCodes.etch(addr, code);
        return addr.toString() as `0x${string}`;
      };

      // Calls `Governance.propose(wrapper)` from the impersonated `governanceProposer`. Returns the
      // resulting proposal id by parsing the `Proposed` event from the receipt. Anvil accepts
      // unsigned transactions from impersonated accounts via `eth_sendTransaction`, so we don't need
      // a separate wallet client.
      const proposeAsProposer = async (wrapperAddress: Hex): Promise<bigint> => {
        const data = encodeFunctionData({
          abi: GovernanceAbi,
          functionName: 'propose',
          args: [wrapperAddress],
        });
        const txHash = (await cheatCodes.rpcCall('eth_sendTransaction', [
          { from: governanceProposerAddress, to: governanceAddress, data, gas: '0x100000' },
        ])) as Hex;
        const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash });
        expect(receipt.status).toBe('success');
        const [proposed] = parseEventLogs({ abi: GovernanceAbi, eventName: 'Proposed', logs: receipt.logs });
        if (!proposed) {
          throw new Error('Proposed event not found in receipt');
        }
        return proposed.args.proposalId;
      };

      // Returns the latest L1 block timestamp as a bigint
      const nowOnChain = () => publicClient.getBlock({ includeTransactions: false }).then(b => b.timestamp);

      beforeAll(async () => {
        await cheatCodes.startImpersonating(governanceProposerAddress);
      });

      afterAll(async () => {
        await cheatCodes.stopImpersonating(governanceProposerAddress);
      });

      it('returns false on a fresh governance with no proposals', async () => {
        const proposalCount = await governance.getProposalCount();
        expect(proposalCount).toBe(0n);
        const arbitraryPayload = EthAddress.random().toString();
        await expect(governance.hasActiveProposalWithPayload(arbitraryPayload)).resolves.toBe(false);
      });

      it('returns true when a live proposal unwraps to the queried payload', async () => {
        const original = EthAddress.random();
        const wrapper = await etchCode(buildMockWrapperBytecode(original));

        const proposalId = await proposeAsProposer(wrapper);

        // The proposal is freshly created, so it should be in `Pending` state
        await expect(governance.getProposalState(proposalId)).resolves.toBe(ProposalState.Pending);
        await expect(governance.hasActiveProposalWithPayload(original.toString())).resolves.toBe(true);
      });

      it('returns false when no live proposal references the queried payload', async () => {
        // Create a proposal for a different payload than the one we query.
        const proposalOriginal = EthAddress.random();
        const wrapper = await etchCode(buildMockWrapperBytecode(proposalOriginal));
        await proposeAsProposer(wrapper);

        const queriedPayload = EthAddress.random();
        await expect(governance.hasActiveProposalWithPayload(queriedPayload.toString())).resolves.toBe(false);
      });

      it('returns false once the matching proposal reaches a terminal state', async () => {
        // No tokens were ever deposited, so no votes can be cast. Once the active phase ends with no
        // yea votes the proposal transitions to `Rejected`, which is terminal -- and at that point
        // re-signaling/re-proposing is allowed, so `hasActiveProposalWithPayload` must report false.
        const original = EthAddress.random();
        const wrapper = await etchCode(buildMockWrapperBytecode(original));
        const proposalId = await proposeAsProposer(wrapper);

        // Pending while the queried payload is in Pending.
        await expect(governance.hasActiveProposalWithPayload(original.toString())).resolves.toBe(true);

        // Warp past the active phase so the proposal becomes terminal. We use the proposal's own
        // frozen config (creation + votingDelay + votingDuration + 1) rather than the live config,
        // because each proposal stores its own snapshot.
        const proposal = await governance.getProposal(proposalId);
        const activeThrough = proposal.creation + proposal.config.votingDelay + proposal.config.votingDuration;
        await cheatCodes.warp(Number(activeThrough + 1n));

        await expect(governance.getProposalState(proposalId)).resolves.toBe(ProposalState.Rejected);
        await expect(governance.hasActiveProposalWithPayload(original.toString())).resolves.toBe(false);
      });

      it('skips proposals whose payload reverts on getOriginalPayload (proposeWithLock-style)', async () => {
        // `Governance.proposeWithLock` bypasses GSEPayload, so the payload stored on such a proposal
        // is the original IPayload contract directly -- it has no `getOriginalPayload()` selector and
        // the unwrap call reverts. The sweep must treat that as "no match" and keep iterating instead
        // of aborting the whole call.
        const revertingWrapper = await etchCode(REVERTING_WRAPPER_BYTECODE);
        await proposeAsProposer(revertingWrapper);

        const original = EthAddress.random();
        const wrapper = await etchCode(buildMockWrapperBytecode(original));
        const proposalId = await proposeAsProposer(wrapper);

        // The proposal is freshly created, so it should be in `Pending` state
        await expect(governance.getProposalState(proposalId)).resolves.toBe(ProposalState.Pending);
        await expect(governance.hasActiveProposalWithPayload(original.toString())).resolves.toBe(true);
      });

      it('finds a live proposal among multiple unrelated proposals', async () => {
        // Create three proposals; the *middle* one is the one we want to find. This exercises the
        // descent loop's matching logic and confirms that hitting non-matching proposals (newer ones
        // here, since we walk newest -> oldest) doesn't short-circuit the search.
        const irrelevantOriginal1 = EthAddress.random();
        const irrelevantOriginal2 = EthAddress.random();
        const targetOriginal = EthAddress.random();

        const targetWrapper = await etchCode(buildMockWrapperBytecode(targetOriginal));
        await proposeAsProposer(targetWrapper);

        const noiseWrapper1 = await etchCode(buildMockWrapperBytecode(irrelevantOriginal1));
        await proposeAsProposer(noiseWrapper1);

        const noiseWrapper2 = await etchCode(buildMockWrapperBytecode(irrelevantOriginal2));
        await proposeAsProposer(noiseWrapper2);

        await expect(governance.hasActiveProposalWithPayload(targetOriginal.toString())).resolves.toBe(true);
      });

      it('matches case-insensitively against the original payload address', async () => {
        // Ethereum addresses are case-insensitive (mixed case is only used for EIP-55 checksums).
        // Callers may pass either form, so the comparison must lowercase both sides.
        const original = EthAddress.random();
        const wrapper = await etchCode(buildMockWrapperBytecode(original));
        await proposeAsProposer(wrapper);

        const upperHex = ('0x' + original.toString().slice(2).toUpperCase()) as Hex;
        await expect(governance.hasActiveProposalWithPayload(upperHex)).resolves.toBe(true);
      });

      it('early-stops on the protocol-wide lifetime cap and returns false for old proposals', async () => {
        // Even if a proposal is "live" in the sense that no terminal-state transition has been
        // recorded, once its creation timestamp is more than 4 * TIME_UPPER (= 360 days) in the past
        // it cannot possibly still be in Pending/Active/Queued/Executable, because each phase is
        // capped at TIME_UPPER = 90 days. We don't even get as far as `getProposalState` for those
        // -- the descent loop short-circuits on `proposal.creation < hardCutoff`.
        const original = EthAddress.random();
        const wrapper = await etchCode(buildMockWrapperBytecode(original));
        await proposeAsProposer(wrapper);

        // Live initially.
        await expect(governance.hasActiveProposalWithPayload(original.toString())).resolves.toBe(true);

        // Warp beyond 4 * 90 days so the proposal's creation falls outside the hard cutoff.
        const FOUR_TIME_UPPER = 4n * 90n * 24n * 3600n;
        const target = (await nowOnChain()) + FOUR_TIME_UPPER + 60n;
        await cheatCodes.warp(Number(target));

        // We don't assert on getProposalState here; it would return `Rejected` (no votes cast in the
        // active phase), but the early-stop in `hasActiveProposalWithPayload` is meant to fire even
        // if it were stuck in some non-terminal state, so we test the boolean directly.
        await expect(governance.hasActiveProposalWithPayload(original.toString())).resolves.toBe(false);

        // Sanity: the older live proposals from earlier tests are also past the cutoff now, so the
        // sweep should report false for any payload, including the dummy one.
        await expect(governance.hasActiveProposalWithPayload(EthAddress.random().toString())).resolves.toBe(false);
      });
    });

    describe('Configuration time bounds (sync check for MAX_PROPOSAL_LIFETIME_SECONDS)', () => {
      // Mirrors `ConfigurationLib.TIME_UPPER` in `l1-contracts/src/governance/libraries/ConfigurationLib.sol`
      // If any of the tests below fail due to a change of constants in the Governance contract, we must update
      // the value of MAX_PROPOSAL_LIFETIME_SECONDS in the governance contract wrapper here in ts-land.
      const TIME_UPPER = 90n * 24n * 3600n;

      let governance: ReadOnlyGovernanceContract;
      let baselineConfig: GovernanceConfiguration;

      beforeAll(async () => {
        governance = new ReadOnlyGovernanceContract(governanceAddress, publicClient);
        baselineConfig = await governance.getConfiguration();
      });

      // Probes `updateConfiguration` via `eth_call` impersonating the Governance contract itself.
      // `updateConfiguration` is gated by an `onlySelf` modifier, so we set `from = governanceAddress`.
      // `eth_call` does not commit state, so this leaves the deployment untouched between probes.
      const probeUpdateConfiguration = async (config: GovernanceConfiguration) => {
        const data = encodeFunctionData({
          abi: GovernanceAbi,
          functionName: 'updateConfiguration',
          args: [config],
        });
        try {
          await cheatCodes.rpcCall('eth_call', [{ from: governanceAddress, to: governanceAddress, data }, 'latest']);
          return { ok: true as const };
        } catch (err) {
          return { ok: false as const, err };
        }
      };

      // Iterate the four fields whose upper bound feeds MAX_PROPOSAL_LIFETIME_SECONDS. Each is named
      // explicitly so the failure message points at the exact field that drifted from the assumption.
      const TIME_BOUNDED_FIELDS = ['votingDelay', 'votingDuration', 'executionDelay', 'gracePeriod'] as const;

      it.each(TIME_BOUNDED_FIELDS)('accepts %s = TIME_UPPER', async field => {
        const result = await probeUpdateConfiguration({ ...baselineConfig, [field]: TIME_UPPER });
        expect(result.ok).toBe(true);
      });

      it.each(TIME_BOUNDED_FIELDS)('rejects %s = TIME_UPPER + 1', async field => {
        const result = await probeUpdateConfiguration({ ...baselineConfig, [field]: TIME_UPPER + 1n });
        expect(result.ok).toBe(false);
      });

      it('the ts hard cap matches the protocol-wide upper bound', () => {
        const expected = 4n * TIME_UPPER;
        expect(MAX_PROPOSAL_LIFETIME_SECONDS).toBe(expected);
      });
    });
  });

  describe('GovernanceContract', () => {
    let governance: GovernanceContract;

    beforeEach(() => {
      governance = new GovernanceContract(governanceAddress, walletClient);
    });

    it('can be instantiated with wallet client and has write methods', () => {
      expect(governance).toBeDefined();
      expect(governance.client).toBe(walletClient);

      // Verify wallet-specific methods are available
      expect(governance.deposit).toBeDefined();
      expect(governance.proposeWithLock).toBeDefined();
      expect(governance.vote).toBeDefined();
      expect(governance.executeProposal).toBeDefined();
    });

    it('inherits all read-only methods from ReadOnlyGovernanceContract', () => {
      expect(governance.getGovernanceProposerAddress).toBeDefined();
      expect(governance.getConfiguration).toBeDefined();
      expect(governance.getProposal).toBeDefined();
      expect(governance.getProposalState).toBeDefined();
      expect(governance.getProposalCount).toBeDefined();
      expect(governance.hasActiveProposalWithPayload).toBeDefined();
      expect(governance.awaitProposalActive).toBeDefined();
      expect(governance.awaitProposalExecutable).toBeDefined();
    });

    it('cannot be instantiated with public client', () => {
      expect(() => {
        new GovernanceContract(governanceAddress, publicClient as any);
      }).toThrow();
    });
  });
});
