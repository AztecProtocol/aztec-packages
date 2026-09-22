// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {console} from "forge-std/console.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {Rollup} from "@aztec/core/Rollup.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {EthValue, EthPerFeeAssetE12} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {
  RewardConfig,
  Bps,
  RegistryRewardOverride,
  MAX_REGISTRY_REWARD_OVERRIDES
} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {IBoosterCore, RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Inbox, INBOX_BUCKET_RING_SIZE} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

import {GSE} from "@aztec/governance/GSE.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

import {HonkVerifier} from "@generated/HonkVerifier.sol";

import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {V6UpgradePayload} from "@aztec/periphery/V6UpgradePayload.sol";

import {V6UpgradeSimulation} from "./V6UpgradeSimulation.sol";

/**
 * @title DeployRollupForUpgradeV6
 * @author Aztec Labs
 * @notice Deploys the v6 rollup and the governance payload that makes it canonical.
 *
 * @dev Usage:
 *        REGISTRY_ADDRESS=0x... forge script script/deploy/DeployRollupForUpgradeV6.s.sol \
 *          --rpc-url $L1_RPC_URL --private-key $KEY --broadcast
 *      Re-check an already deployed rollup without deploying anything:
 *        REGISTRY_ADDRESS=0x... forge script ... --sig 'verify(address)' <rollup>
 *
 *      `REGISTRY_ADDRESS` is the only environment input. Every configuration value is a literal in
 *      {_config} below, so reviewing this file is sufficient to review the deployment: there are no
 *      env-var defaults and no `network-defaults.json` fallbacks that could change what is
 *      deployed. {verify} reads each value back off the deployed contracts and asserts it matches
 *      the table, so a typo in the table or a drift in how the Rollup consumes it fails loudly.
 *
 *      Deploy order matters: the rollup is constructed owned by the deployer, the EscapeHatch is
 *      deployed and registered while that is still true, and only then is ownership handed to
 *      governance. Anything owner-gated that is not done before that line can only be done by a
 *      governance proposal afterwards.
 *
 *      Not covered here, deliberately: the protocol fee margin and recipient keep their
 *      constructor values (0 and a placeholder address). Setting them is a governance call, so it
 *      belongs in {V6UpgradePayload}.
 */
contract DeployRollupForUpgradeV6 is Script, StdAssertions {
  /// @notice Thrown when run against a chain this script has no configuration for.
  error DeployRollupForUpgradeV6__UnsupportedChain(uint256 chainId);

  uint256 internal constant MAINNET_CHAIN_ID = 1;
  uint256 internal constant SEPOLIA_CHAIN_ID = 11_155_111;

  /// @notice Every value that determines what the v6 rollup is. One field per configurable knob.
  struct Config {
    // Genesis state of the protocol circuits. Produced by the v6 noir-projects build, not chosen.
    // Left zero on purpose: {run} refuses to deploy until they are filled in, because the Rollup
    // accepts zeros silently and a wrong genesis is only detectable after the fact.
    bytes32 vkTreeRoot;
    bytes32 protocolContractsHash;
    bytes32 genesisArchiveRoot;
    // Time. `ethereumSlotDuration` is the L1 slot length and is used to derive the inbox
    // censorship cutoff; the rest define the Aztec slot/epoch clock.
    uint256 ethereumSlotDuration;
    uint256 aztecSlotDuration;
    uint256 aztecEpochDuration;
    uint256 aztecProofSubmissionEpochs;
    // Committee selection.
    uint256 targetCommitteeSize;
    uint256 lagInEpochsForValidatorSet;
    uint256 lagInEpochsForRandao;
    // Staking. `localEjectionThreshold` is in staking-asset units and is the only one of these
    // three the rollup sets. The other two are immutables of the existing GSE that this rollup
    // inherits by being constructed against it: they are recorded here so {verify} fails if the
    // GSE behind `REGISTRY_ADDRESS` is not the one these numbers were chosen against. Nothing in
    // the contracts enforces a relationship between the three, so this file is the only place the
    // choice of `localEjectionThreshold` can be checked against the thresholds it sits between.
    uint256 localEjectionThreshold;
    uint256 expectedGseActivationThreshold;
    uint256 expectedGseEjectionThreshold;
    uint256 exitDelaySeconds;
    // Entry queue. Bootstrap values apply until the validator set reaches
    // `bootstrapValidatorSetSize`; afterwards each flush admits
    // max(normalFlushSizeMin, setSize / normalFlushSizeQuotient), capped by `maxFlushSize`.
    uint256 entryQueueBootstrapValidatorSetSize;
    uint256 entryQueueBootstrapFlushSize;
    uint256 entryQueueNormalFlushSizeMin;
    uint256 entryQueueNormalFlushSizeQuotient;
    uint256 entryQueueMaxFlushSize;
    // Fees. `initialEthPerFeeAsset` is an E12 fixed-point ETH-per-fee-asset price and is therefore
    // a point-in-time market value that must be refreshed before the deploy.
    uint256 manaTarget;
    uint256 provingCostPerMana;
    uint256 initialEthPerFeeAsset;
    // Rewards. `sequencerBps` is the sequencer's share of each checkpoint reward in basis points;
    // the remainder goes to provers. A fresh RewardBooster is deployed with `rewardBoost`.
    uint16 sequencerBps;
    uint96 checkpointReward;
    RewardBoostConfig rewardBoost;
    // Per-registry sequencer reward overrides. Validators whose GSE withdrawer resolves through
    // `staker.getATP().getRegistry()` to one of these registries earn the override instead of the
    // default sequencer share, so these are reductions, not bonuses: the Rollup's constructor
    // rejects any `sequencerReward` above `checkpointReward * sequencerBps` (450e18 at the values
    // above), rejects a non-zero reward on a zero registry, and rejects duplicate registries.
    // A zero registry means "slot unused", so all-zero disables overrides entirely -- unlike the
    // genesis roots, zero here is a valid configuration and is NOT guarded in {run}.
    address rewardOverrideRegistry0;
    uint96 rewardOverrideSequencerReward0;
    address rewardOverrideRegistry1;
    uint96 rewardOverrideSequencerReward1;
    // Slashing. `slashingRoundSizeInEpochs` is multiplied by `aztecEpochDuration` to get the round
    // size in slots, which is what the SlashingProposer actually stores.
    bool slasherEnabled;
    uint256 slashingRoundSizeInEpochs;
    uint256 slashingQuorum;
    uint256 slashingLifetimeInRounds;
    uint256 slashingExecutionDelayInRounds;
    uint256 slashingOffsetInRounds;
    uint256 slashingDisableDuration;
    address slashingVetoer;
    uint256 slashAmountSmall;
    uint256 slashAmountMedium;
    uint256 slashAmountLarge;
    // Escape hatch. The bond is denominated in the staking asset. The EscapeHatch constructor
    // rejects a configuration that breaks any of these, so they are constraints, not preferences:
    // `escapeHatchActiveDuration` >= `aztecProofSubmissionEpochs` + 1, `escapeHatchFrequency` >
    // both `EscapeHatch.LAG_IN_EPOCHS_FOR_SET_SIZE` (a constant 2) and `escapeHatchActiveDuration`,
    // `escapeHatchLagInHatches` >= 1, withdrawal tax and failed-hatch punishment <= bond size, and
    // `escapeHatchProposingExitDelay` <= 30 days.
    uint96 escapeHatchBondSize;
    uint96 escapeHatchWithdrawalTax;
    uint96 escapeHatchFailedHatchPunishment;
    uint256 escapeHatchFrequency;
    uint256 escapeHatchActiveDuration;
    uint256 escapeHatchLagInHatches;
    uint256 escapeHatchProposingExitDelay;
    // Restricts governance execution of the payload to UK office hours (Mon-Fri, 08:00-17:00
    // London, DST-aware). Enforced as the payload's first action, so a rejected attempt reverts
    // the whole execution and leaves the proposal executable again when the window next opens.
    bool enforcePayloadExecutionWindow;
    // The flush rewarder serving the rollup being replaced, or zero on a chain that has none.
    // A FlushRewarder is immutably bound to one rollup, so v6 needs its own; the payload deploys
    // the replacement and moves the outgoing one's unowed balance across.
    address oldFlushRewarder;
  }

  /**
   * @notice The configuration this script deploys. This is the table to review.
   * @dev The literal below is the mainnet configuration; Sepolia is expressed as a short list of
   *      overrides underneath it, so the only thing a reviewer has to check for Sepolia is that
   *      list. A chain with neither branch reverts rather than silently deploying mainnet values.
   *      Values track v5 production unless a comment says otherwise; each line records the v5
   *      value so any intentional v6 divergence is visible as a divergence.
   */
  /// @dev `virtual` so a test can supply the three genesis roots and exercise the rest of this
  ///      table for real. Nothing else about it is overridable, and nothing in the deploy path
  ///      overrides it: `run()` still refuses to deploy while the roots are zero.
  function _config() internal view virtual returns (Config memory c) {
    c = Config({
      vkTreeRoot: bytes32(0), // TODO: from the v6 protocol circuits build
      protocolContractsHash: bytes32(0), // TODO: from the v6 protocol circuits build
      genesisArchiveRoot: bytes32(0), // TODO: from the v6 protocol circuits build;
      ethereumSlotDuration: 12, // L1 slot time; no v5 equivalent, the v5 inbox took an explicit lag instead
      aztecSlotDuration: 72,
      aztecEpochDuration: 32,
      aztecProofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
      lagInEpochsForValidatorSet: 2,
      lagInEpochsForRandao: 1,
      localEjectionThreshold: 190_000e18, // v5 production: 190_000e18 (mainnet), 199_000e18 (sepolia)
      expectedGseActivationThreshold: 200_000e18, // not set here; asserted against the existing GSE. v5 production:
      // 200_000e18
      expectedGseEjectionThreshold: 100_000e18, // not set here; asserted against the existing GSE. v5 production:
      // 100_000e18
      exitDelaySeconds: 345_600, // 4 days. v5 production: 345_600 (mainnet), 172_800 (sepolia)
      entryQueueBootstrapValidatorSetSize: 500, // v5 production: 500.
      entryQueueBootstrapFlushSize: 4, // v5 production: 4
      entryQueueNormalFlushSizeMin: 1, // v5 production: 1
      entryQueueNormalFlushSizeQuotient: 400, // v5 production: 400
      entryQueueMaxFlushSize: 4, // v5 production: 4
      manaTarget: 75_000_000, // v5 production: 75_000_000
      provingCostPerMana: 12_500_000, // v5 production: 12_500_000 (set by AZIP-16)
      initialEthPerFeeAsset: 10_000_000, // v5 production: 9_512_195, priced 2026-06-11. TODO: refresh before v6 deploy
      sequencerBps: 9000, // 90% sequencer / 10% prover. v5 production: 7000
      checkpointReward: 500e18, // same as v5
      rewardBoost: RewardBoostConfig({
        increment: 101_400, maxScore: 367_500, a: 250_000, minimum: 10_000, k: 1_000_000
      }), // AZIP-5; same as v5
      rewardOverrideRegistry0: address(0), // TODO: ATP registry (auction) -- address lives in ignition-contracts
      rewardOverrideSequencerReward0: 0, // TODO: must be <= 450e18
      rewardOverrideRegistry1: address(0), // TODO: ATP registry (genesis sale)
      rewardOverrideSequencerReward1: 0, // TODO: must be <= 450e18
      slasherEnabled: true,
      slashingRoundSizeInEpochs: 4,
      slashingQuorum: 65, // of the 128-slot round (4 epochs x 32 slots)
      slashingLifetimeInRounds: 34, // v5 production: 34 (mainnet), 5 (sepolia)
      slashingExecutionDelayInRounds: 28, // v5 production: 28 (mainnet), 2 (sepolia)
      slashingOffsetInRounds: 2,
      slashingDisableDuration: 259_200, // 3 days. v5 production: 259_200 (mainnet), 432_000 (sepolia)
      slashingVetoer: 0xBbB4aF368d02827945748b28CD4b2D42e4A37480, // v5 production (mainnet)
      slashAmountSmall: 2000e18, // v5 production: 2000e18 (mainnet), 100_000e18 (sepolia)
      slashAmountMedium: 5000e18, // v5 production: 5000e18 (mainnet), 250_000e18 (sepolia)
      slashAmountLarge: 5000e18, // v5 production: 5000e18 (mainnet), 250_000e18 (sepolia)
      escapeHatchBondSize: 332_000_000e18, // v5 production
      escapeHatchWithdrawalTax: 1_660_000e18, // v5 production
      escapeHatchFailedHatchPunishment: 9_600_000e18, // v5 production
      escapeHatchFrequency: 112, // epochs between hatches. v5 production
      escapeHatchActiveDuration: 2, // epochs. v5 production; also the minimum allowed here, being
      // aztecProofSubmissionEpochs + 1
      escapeHatchLagInHatches: 1, // v5 production
      escapeHatchProposingExitDelay: 30 days, // v5 production; also the maximum the constructor allows
      enforcePayloadExecutionWindow: true,
      oldFlushRewarder: 0x5B98cA4dcE7b59CCf241D12f81d3d2eCF14e410e // bound to the v5 rollup
    });

    if (block.chainid == MAINNET_CHAIN_ID) {
      return c;
    }

    if (block.chainid == SEPOLIA_CHAIN_ID) {
      // Every field Sepolia diverges on, and nothing else. Values are v5's Sepolia production
      // values;
      c.localEjectionThreshold = 199_000e18;
      c.exitDelaySeconds = 172_800; // 2 days
      c.slashingLifetimeInRounds = 5;
      c.slashingExecutionDelayInRounds = 2;
      c.slashingDisableDuration = 432_000; // 5 days
      c.slashingVetoer = 0xdfe19Da6a717b7088621d8bBB66be59F2d78e924;
      c.slashAmountSmall = 100_000e18;
      c.slashAmountMedium = 250_000e18;
      c.slashAmountLarge = 250_000e18;
      // Testnet upgrades are executed on demand, so the office-hours restriction is mainnet only.
      c.enforcePayloadExecutionWindow = false;
      // Sepolia has no flush rewarder to migrate, so the payload skips that action entirely.
      // Leaving the mainnet address here would make the payload constructor revert, since it
      // reads the outgoing rewarder's asset and rate.
      c.oldFlushRewarder = address(0);
      // Sepolia's own ATP registries and reward amounts. The ceiling is the same 450e18 as
      // mainnet, because Sepolia does not override `checkpointReward` or `sequencerBps`.
      c.rewardOverrideRegistry0 = address(0); // TODO: Sepolia ATP registry, or leave zero if none exists
      c.rewardOverrideSequencerReward0 = 0; // TODO: must be <= 450e18
      c.rewardOverrideRegistry1 = address(0); // TODO: Sepolia ATP registry, or leave zero if none exists
      c.rewardOverrideSequencerReward1 = 0; // TODO: must be <= 450e18
      return c;
    }

    revert DeployRollupForUpgradeV6__UnsupportedChain(block.chainid);
  }

  /// @notice The rollup {run} deployed. Zero until it has run.
  /// @dev Mirrors `rollupOutput()` on DeployRollupForUpgrade: the addresses are logged for an
  ///      operator, and exposed here for anything that has to read them back -- a test, or tooling
  ///      that follows the deploy.
  Rollup public deployedRollup;

  /// @notice The payload {run} deployed. Zero until it has run.
  V6UpgradePayload public deployedPayload;

  /// @notice Deploys the verifier, the rollup, and the governance payload, then verifies the result.
  function run() public {
    Config memory c = _config();

    // The three genesis roots are the only values the Rollup accepts silently when wrong, so they
    // are gated here rather than trusted.
    require(c.vkTreeRoot != bytes32(0), "vkTreeRoot not set");
    require(c.protocolContractsHash != bytes32(0), "protocolContractsHash not set");
    require(c.genesisArchiveRoot != bytes32(0), "genesisArchiveRoot not set");

    Registry registry = Registry(vm.envAddress("REGISTRY_ADDRESS"));
    // Everything the new rollup must share with the old one is read off the chain rather than
    // configured, so the new rollup cannot be pointed at the wrong asset or GSE by a typo.
    IInstance current = IInstance(address(registry.getCanonicalRollup()));
    address governance = registry.getGovernance();

    // The account `--private-key` / `--sender` resolves to. Every contract below is deployed by it.
    address deployer = msg.sender;

    vm.startBroadcast(deployer);

    // Always the real verifier: this script exists for upgrades of live networks.
    IVerifier verifier = IVerifier(address(new HonkVerifier()));

    // The 5th argument is the Rollup's owner. Passing `deployer` rather than governance is what
    // would let the deployer run owner-gated setup here; ownership is handed to governance
    // immediately after, so anything not done before that line needs a governance call instead.
    Rollup rollup = new Rollup(
      current.getFeeAsset(),
      current.getStakingAsset(),
      current.getGSE(),
      verifier,
      deployer,
      _genesisState(c),
      _rollupConfigInput(c, registry.getRewardDistributor())
    );

    // Deployed after the rollup because its constructor reads `getProofSubmissionEpochs()` off it
    // to check `escapeHatchActiveDuration`, and because it must be built for this exact rollup.
    EscapeHatch escapeHatch = new EscapeHatch(
      address(rollup),
      address(current.getStakingAsset()),
      c.escapeHatchBondSize,
      c.escapeHatchWithdrawalTax,
      c.escapeHatchFailedHatchPunishment,
      c.escapeHatchFrequency,
      c.escapeHatchActiveDuration,
      c.escapeHatchLagInHatches,
      c.escapeHatchProposingExitDelay
    );

    // `setEscapeHatch` is `onlyOwner` and one-shot: it reverts if a hatch is already registered,
    // and it rejects any hatch whose `getRollup()` is not this rollup. Calling it here, while the
    // deployer still owns the rollup, is what keeps it out of the governance payload.
    rollup.setEscapeHatch(address(escapeHatch));

    // From here on, only governance can change the rollup's configuration.
    rollup.transferOwnership(governance);

    V6UpgradePayload payload = new V6UpgradePayload(
      registry, IInstance(address(rollup)), FlushRewarder(c.oldFlushRewarder), c.enforcePayloadExecutionWindow
    );

    vm.stopBroadcast();

    verify(address(rollup));

    console.log("rollup           ", address(rollup));
    console.log("verifier         ", address(verifier));
    console.log("inbox            ", address(rollup.getInbox()));
    console.log("outbox           ", address(rollup.getOutbox()));
    console.log("feeJuicePortal   ", address(rollup.getFeeAssetPortal()));
    console.log("slasher          ", rollup.getSlasher());
    console.log("escapeHatch      ", address(escapeHatch));
    console.log("rewardBooster    ", address(rollup.getRewardConfig().booster));
    console.log("payload          ", address(payload));
    console.log("newFlushRewarder ", address(payload.NEW_FLUSH_REWARDER()));
    verifyFlushRewarder(address(rollup), address(payload));

    _simulate(address(payload));
    console.log("version          ", rollup.getVersion());

    deployedRollup = rollup;
    deployedPayload = payload;
  }

  /**
   * @notice Runs the payload through the real governance lifecycle against a state snapshot and
   *         reverts it, so a deploy cannot succeed while producing a payload that would fail.
   * @dev Requires FORKED state -- it needs a governance with real voters and mainnet timings; see
   *      V6UpgradeSimulation. `virtual` so a test exercising the config table against a local stack
   *      can skip it, which is the only thing in `run()` that a local stack cannot satisfy.
   */
  function _simulate(address _payload) internal virtual {
    new V6UpgradeSimulation().simulate(_payload);
  }

  /// @notice Asserts every configurable value of an already-deployed rollup against {_config}.
  function verify(address _rollup) public view {
    Config memory c = _config();
    Rollup rollup = Rollup(_rollup);
    Registry registry = Registry(vm.envAddress("REGISTRY_ADDRESS"));

    _verifyGenesisAndTime(rollup, c);
    _verifyStakingAndFees(rollup, c);
    _verifyRewards(rollup, c);
    _verifySlashing(rollup, c);
    _verifyEscapeHatch(rollup, c);
    _verifySubContracts(rollup, registry);
  }

  /// @notice Asserts the payload's replacement flush rewarder is wired to this rollup.
  /// @dev Separate from {verify} because it needs the payload address, which {verify} is not given.
  function verifyFlushRewarder(address _rollup, address _payload) public view {
    Config memory c = _config();
    FlushRewarder newRewarder = V6UpgradePayload(_payload).NEW_FLUSH_REWARDER();

    assertEq(
      V6UpgradePayload(_payload).ENFORCE_EXECUTION_WINDOW(),
      c.enforcePayloadExecutionWindow,
      "payload execution window flag"
    );

    if (c.oldFlushRewarder == address(0)) {
      assertEq(address(newRewarder), address(0), "flush rewarder deployed on a chain with none to migrate");
      return;
    }

    FlushRewarder oldRewarder = FlushRewarder(c.oldFlushRewarder);
    assertEq(address(newRewarder.ROLLUP()), _rollup, "new flush rewarder bound to another rollup");
    assertEq(address(newRewarder.REWARD_ASSET()), address(oldRewarder.REWARD_ASSET()), "flush reward asset");
    assertEq(newRewarder.rewardPerInsertion(), oldRewarder.rewardPerInsertion(), "rewardPerInsertion");
    // Governance must own it, or the reward rate can never be changed again.
    assertEq(newRewarder.owner(), Registry(vm.envAddress("REGISTRY_ADDRESS")).getGovernance(), "flush rewarder owner");
  }

  function _verifyEscapeHatch(Rollup _rollup, Config memory _c) private view {
    // A zero address here means `setEscapeHatch` never ran; since it is one-shot and owner-gated,
    // that would leave the hatch permanently unsettable except by governance.
    EscapeHatch hatch = EscapeHatch(address(_rollup.getEscapeHatch()));
    assertTrue(address(hatch) != address(0), "escape hatch not set on the rollup");

    assertEq(hatch.getRollup(), address(_rollup), "escape hatch points at another rollup");
    assertEq(hatch.getBondToken(), address(_rollup.getStakingAsset()), "escape hatch bond token");
    assertEq(hatch.getBondSize(), _c.escapeHatchBondSize, "escapeHatchBondSize");
    assertEq(hatch.getWithdrawalTax(), _c.escapeHatchWithdrawalTax, "escapeHatchWithdrawalTax");
    assertEq(hatch.getFailedHatchPunishment(), _c.escapeHatchFailedHatchPunishment, "escapeHatchFailedHatchPunishment");
    assertEq(hatch.getFrequency(), _c.escapeHatchFrequency, "escapeHatchFrequency");
    assertEq(hatch.getActiveDuration(), _c.escapeHatchActiveDuration, "escapeHatchActiveDuration");
    assertEq(hatch.getLagInHatches(), _c.escapeHatchLagInHatches, "escapeHatchLagInHatches");
    assertEq(hatch.getProposingExitDelay(), _c.escapeHatchProposingExitDelay, "escapeHatchProposingExitDelay");
  }

  function _verifyGenesisAndTime(Rollup _rollup, Config memory _c) private view {
    assertEq(_rollup.getVkTreeRoot(), _c.vkTreeRoot, "vkTreeRoot mismatch");
    assertEq(_rollup.getProtocolContractsHash(), _c.protocolContractsHash, "protocolContractsHash");
    // The genesis archive root is not exposed by a named getter; it is the archive of checkpoint 0.
    assertEq(_rollup.archiveAt(0), _c.genesisArchiveRoot, "genesisArchiveRoot mismatch");
    assertEq(_rollup.getSlotDuration(), _c.aztecSlotDuration, "aztecSlotDuration mismatch");
    assertEq(_rollup.getEpochDuration(), _c.aztecEpochDuration, "aztecEpochDuration mismatch");
    assertEq(_rollup.getProofSubmissionEpochs(), _c.aztecProofSubmissionEpochs, "aztecProofSubmissionEpochs mismatch");
    assertEq(_rollup.getTargetCommitteeSize(), _c.targetCommitteeSize, "targetCommitteeSize mismatch");
    assertEq(
      _rollup.getLagInEpochsForValidatorSet(), _c.lagInEpochsForValidatorSet, "lagInEpochsForValidatorSet mismatch"
    );
    assertEq(_rollup.getLagInEpochsForRandao(), _c.lagInEpochsForRandao, "lagInEpochsForRandao");
  }

  function _verifyStakingAndFees(Rollup _rollup, Config memory _c) private view {
    assertEq(_rollup.getLocalEjectionThreshold(), _c.localEjectionThreshold, "localEjectionThreshold mismatch");
    // These two read straight off the GSE's immutables, so they are readable as soon as the rollup
    // is constructed and do not depend on the GSE or Registry having registered it.
    assertEq(_rollup.getActivationThreshold(), _c.expectedGseActivationThreshold, "gse activationThreshold mismatch");
    assertEq(_rollup.getEjectionThreshold(), _c.expectedGseEjectionThreshold, "gse ejectionThreshold mismatch");
    assertEq(Timestamp.unwrap(_rollup.getExitDelay()), _c.exitDelaySeconds, "exitDelaySeconds mismatch");
    assertEq(_rollup.getManaTarget(), _c.manaTarget, "manaTarget mismatch");
    assertEq(
      EthValue.unwrap(_rollup.getProvingCostPerManaInEth()), _c.provingCostPerMana, "provingCostPerMana mismatch"
    );
    assertEq(EthPerFeeAssetE12.unwrap(_rollup.getEthPerFeeAsset()), _c.initialEthPerFeeAsset, "initialEthPerFeeAsset");

    // The protocol fee margin and recipient are not deploy-time config; these assertions record
    // that the rollup starts with the constructor's values and still needs a governance call.
    assertEq(_rollup.getProtocolFeeMargin(), 0, "protocol fee margin should start at 0");
    assertEq(
      _rollup.getProtocolFeeRecipient(),
      address(bytes20("CUAUHXICALLI")),
      "protocol fee recipient should still be the constructor placeholder"
    );
  }

  function _verifyRewards(Rollup _rollup, Config memory _c) private view {
    RewardConfig memory rc = _rollup.getRewardConfig();
    assertEq(Bps.unwrap(rc.sequencerBps), _c.sequencerBps, "sequencerBps");
    assertEq(rc.checkpointReward, _c.checkpointReward, "checkpointReward");
    // A booster address of zero in the config makes the Rollup deploy a fresh one, so a non-zero
    // address here confirms that happened.
    assertTrue(address(rc.booster) != address(0), "reward booster not deployed");

    // The overrides live in `internal immutable`s, so `getRegistryRewardOverrides` reassembling
    // them is the only way to read them back; there is no storage slot to inspect.
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides = _rollup.getRegistryRewardOverrides();
    assertEq(overrides[0].registry, _c.rewardOverrideRegistry0, "rewardOverrideRegistry0");
    assertEq(overrides[0].sequencerReward, _c.rewardOverrideSequencerReward0, "rewardOverrideSequencerReward0");
    assertEq(overrides[1].registry, _c.rewardOverrideRegistry1, "rewardOverrideRegistry1");
    assertEq(overrides[1].sequencerReward, _c.rewardOverrideSequencerReward1, "rewardOverrideSequencerReward1");
  }

  function _verifySlashing(Rollup _rollup, Config memory _c) private view {
    // With slashing disabled the Rollup deploys no slasher at all, so there is nothing else to read.
    if (!_c.slasherEnabled) {
      assertEq(_rollup.getSlasher(), address(0), "slasher deployed despite slasherEnabled = false");
      return;
    }

    Slasher slasher = Slasher(_rollup.getSlasher());
    assertEq(slasher.VETOER(), _c.slashingVetoer, "slashingVetoer");
    assertEq(slasher.SLASHING_DISABLE_DURATION(), _c.slashingDisableDuration, "slashingDisableDuration");

    SlashingProposer proposer = SlashingProposer(slasher.PROPOSER());
    assertEq(proposer.INSTANCE(), address(_rollup), "slashing proposer points at another rollup");
    assertEq(proposer.QUORUM(), _c.slashingQuorum, "slashingQuorum");
    assertEq(proposer.ROUND_SIZE_IN_EPOCHS(), _c.slashingRoundSizeInEpochs, "slashingRoundSizeInEpochs");
    assertEq(proposer.ROUND_SIZE(), _c.slashingRoundSizeInEpochs * _c.aztecEpochDuration, "slashingRoundSize");
    assertEq(proposer.LIFETIME_IN_ROUNDS(), _c.slashingLifetimeInRounds, "slashingLifetimeInRounds");
    assertEq(proposer.EXECUTION_DELAY_IN_ROUNDS(), _c.slashingExecutionDelayInRounds, "slashingExecutionDelayInRounds");
    assertEq(proposer.SLASH_OFFSET_IN_ROUNDS(), _c.slashingOffsetInRounds, "slashingOffsetInRounds");
    assertEq(proposer.SLASH_AMOUNT_SMALL(), _c.slashAmountSmall, "slashAmountSmall");
    assertEq(proposer.SLASH_AMOUNT_MEDIUM(), _c.slashAmountMedium, "slashAmountMedium");
    assertEq(proposer.SLASH_AMOUNT_LARGE(), _c.slashAmountLarge, "slashAmountLarge");
  }

  function _verifySubContracts(Rollup _rollup, Registry _registry) private view {
    IInstance current = IInstance(address(_registry.getCanonicalRollup()));
    uint256 version = _rollup.getVersion();

    // Inherited from the chain, not configured: assert they match the rollup being replaced.
    assertEq(address(_rollup.getFeeAsset()), address(current.getFeeAsset()), "feeAsset");
    assertEq(address(_rollup.getStakingAsset()), address(current.getStakingAsset()), "stakingAsset");
    assertEq(address(_rollup.getGSE()), address(current.getGSE()), "gse");
    assertEq(address(_rollup.getRewardDistributor()), address(_registry.getRewardDistributor()), "rewardDistributor");

    // The Inbox and Outbox are deployed by the Rollup's constructor and are only correct if they
    // point back at it and carry its version, which is what scopes L1<>L2 messages to this rollup.
    Inbox inbox = Inbox(address(_rollup.getInbox()));
    assertEq(inbox.ROLLUP(), address(_rollup), "inbox rollup");
    assertEq(inbox.VERSION(), version, "inbox version");
    assertEq(inbox.BUCKET_RING_SIZE(), INBOX_BUCKET_RING_SIZE, "inbox bucket ring size");
    assertEq(inbox.FEE_ASSET_PORTAL(), address(_rollup.getFeeAssetPortal()), "fee juice portal");

    Outbox outbox = Outbox(address(_rollup.getOutbox()));
    assertEq(address(outbox.ROLLUP()), address(_rollup), "outbox rollup");
    assertEq(outbox.VERSION(), version, "outbox version");

    // The deploy is only safe to hand to governance if governance actually controls it.
    assertEq(_rollup.owner(), _registry.getGovernance(), "rollup owner should be governance");
  }

  function _genesisState(Config memory _c) private pure returns (GenesisState memory) {
    return GenesisState({
      vkTreeRoot: _c.vkTreeRoot,
      protocolContractsHash: _c.protocolContractsHash,
      genesisArchiveRoot: _c.genesisArchiveRoot
    });
  }

  function _rollupConfigInput(Config memory _c, IRewardDistributor _rewardDistributor)
    private
    pure
    returns (RollupConfigInput memory config)
  {
    config.ethereumSlotDuration = _c.ethereumSlotDuration;
    config.aztecSlotDuration = _c.aztecSlotDuration;
    config.aztecEpochDuration = _c.aztecEpochDuration;
    config.aztecProofSubmissionEpochs = _c.aztecProofSubmissionEpochs;
    config.targetCommitteeSize = _c.targetCommitteeSize;
    config.lagInEpochsForValidatorSet = _c.lagInEpochsForValidatorSet;
    config.lagInEpochsForRandao = _c.lagInEpochsForRandao;
    config.localEjectionThreshold = _c.localEjectionThreshold;
    config.exitDelaySeconds = _c.exitDelaySeconds;
    config.manaTarget = _c.manaTarget;
    config.provingCostPerMana = EthValue.wrap(_c.provingCostPerMana);
    config.initialEthPerFeeAsset = EthPerFeeAssetE12.wrap(_c.initialEthPerFeeAsset);

    config.slasherEnabled = _c.slasherEnabled;
    config.slashingVetoer = _c.slashingVetoer;
    config.slashingDisableDuration = _c.slashingDisableDuration;
    config.slashingQuorum = _c.slashingQuorum;
    // The Rollup stores the round size in slots; epochs are the reviewable unit.
    config.slashingRoundSize = _c.slashingRoundSizeInEpochs * _c.aztecEpochDuration;
    config.slashingLifetimeInRounds = _c.slashingLifetimeInRounds;
    config.slashingExecutionDelayInRounds = _c.slashingExecutionDelayInRounds;
    config.slashingOffsetInRounds = _c.slashingOffsetInRounds;
    config.slashAmounts = [_c.slashAmountSmall, _c.slashAmountMedium, _c.slashAmountLarge];

    config.stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: _c.entryQueueBootstrapValidatorSetSize,
      bootstrapFlushSize: _c.entryQueueBootstrapFlushSize,
      normalFlushSizeMin: _c.entryQueueNormalFlushSizeMin,
      normalFlushSizeQuotient: _c.entryQueueNormalFlushSizeQuotient,
      maxQueueFlushSize: _c.entryQueueMaxFlushSize
    });

    config.rewardConfig = RewardConfig({
      rewardDistributor: _rewardDistributor,
      sequencerBps: Bps.wrap(_c.sequencerBps),
      // Zero makes the Rollup's constructor deploy a fresh RewardBooster from `rewardBoostConfig`.
      booster: IBoosterCore(address(0)),
      checkpointReward: _c.checkpointReward
    });
    config.rewardBoostConfig = _c.rewardBoost;

    config.registryRewardOverrides[0] = RegistryRewardOverride({
      registry: _c.rewardOverrideRegistry0, sequencerReward: _c.rewardOverrideSequencerReward0
    });
    config.registryRewardOverrides[1] = RegistryRewardOverride({
      registry: _c.rewardOverrideRegistry1, sequencerReward: _c.rewardOverrideSequencerReward1
    });

    // The version identifies this rollup in the Registry and scopes its Inbox/Outbox messages. It
    // is derived from the configuration so that two rollups with different configuration cannot
    // collide. `config.version` is still zero at this point (memory structs start zeroed and
    // nothing above assigns it), which is what `RollupConfiguration._computeConfigVersion` also
    // hashes over, so the two agree.
    config.version = uint32(bytes4(keccak256(abi.encode(config, _genesisState(_c)))));
  }
}
