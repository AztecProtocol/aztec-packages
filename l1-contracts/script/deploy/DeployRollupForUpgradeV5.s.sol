// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {StdStorage, stdStorage} from "forge-std/StdStorage.sol";
import {console} from "forge-std/console.sol";

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {
  CompressedStakingQueueConfig,
  StakingQueueConfig,
  StakingQueueConfigLib
} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {EthPerFeeAssetE12, EthValue} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Bps, RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {IBooster, RewardBooster, RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSE, IGSE, IGSECore} from "@aztec/governance/GSE.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {V5UpgradePayload} from "@aztec/periphery/V5UpgradePayload.sol";

import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

import {MockVerifier} from "@aztec/mock/MockVerifier.sol";

import {HonkVerifier} from "./HonkVerifier.sol";
import {DeployRollupLib, RollupAddressOutput} from "./DeployRollupLib.sol";
import {IRollupConfiguration, RollupConfiguration} from "./RollupConfiguration.sol";

/// @title DeployRollupForUpgradeV5
/// @author Aztec Labs
/// @notice Deploys the v5 rollup, v5 reward distributor, the v5 escape hatch, and the
///         V5UpgradePayload that governance must execute to make the deployment canonical.
///
/// Runs only on mainnet or Sepolia: the existing L1 infrastructure (registry, governance, GSE,
/// assets, distributor, flush rewarder) is a hardcoded per-chain table cross-checked against
/// live chain state before anything is deployed (`REGISTRY_ADDRESS`, when set, is asserted
/// against the table). The v5 reward distributor is deployed first so it can be wired into the
/// v5 rollup constructor; both the v4 (current) distributor's address and the new one are
/// captured by the payload at its construction.
///
/// The rollup configuration needs no environment: every env var RollupConfiguration reads is
/// pinned in-script from the per-chain `ExpectedConfig` table before the config is loaded.
/// See V5UpgradePayload.sol for the actions executed when governance accepts the payload.
///
/// `run()` finishes by calling `validate(payload)`, which asserts the payload's immutables
/// against live chain state, the exact action encodings, the escape-hatch configuration,
/// every rollup-config knob against the hardcoded per-chain expectations (so env drift fails
/// loudly), the staking-queue config, the slasher stack, and then simulates the full
/// governance lifecycle (GSEPayload wrap → propose → vote → execute) against a state snapshot
/// that is reverted afterwards. Re-run the validation against an already-deployed payload with
/// `--sig 'validate(address)' <payload>`.
contract DeployRollupForUpgradeV5 is Script, StdAssertions {
  using stdStorage for StdStorage;

  error DeployRollupForUpgradeV5__SnapshotRevertFailed(uint256 snapshotId);
  error DeployRollupForUpgradeV5__UnsupportedChain(uint256 chainId);
  error DeployRollupForUpgradeV5__MainnetDeploymentBlocked();

  uint256 internal constant MAINNET_CHAIN_ID = 1;
  uint256 internal constant SEPOLIA_CHAIN_ID = 11_155_111;

  /// @notice Pre-upgrade L1 infrastructure for a chain, asserted against live state before
  ///         anything is deployed.
  struct ExpectedAddresses {
    address registry;
    address governance;
    address gse;
    address canonicalRollup;
    address feeAsset;
    address stakingAsset;
    address rewardDistributor;
    address oldFlushRewarder;
  }

  /// @notice Every rollup-configuration knob of the v5 deploy.
  struct ExpectedConfig {
    uint256 slotDuration;
    uint256 epochDuration;
    uint256 targetCommitteeSize;
    uint256 lagInEpochsForValidatorSet;
    uint256 lagInEpochsForRandao;
    uint256 inboxLag;
    uint256 proofSubmissionEpochs;
    uint256 activationThreshold;
    uint256 ejectionThreshold;
    uint256 localEjectionThreshold;
    uint256 exitDelaySeconds;
    uint256 manaTarget;
    uint256 provingCostPerMana;
    uint256 initialEthPerFeeAsset;
    uint256 slashingRoundSizeInEpochs;
    uint256 slashingQuorum;
    uint256 slashingLifetimeInRounds;
    uint256 slashingExecutionDelayInRounds;
    uint256 slashingOffsetInRounds;
    address slashingVetoer;
    uint256 slashingDisableDuration;
    uint256 slashAmountSmall;
    uint256 slashAmountMedium;
    uint256 slashAmountLarge;
    StakingQueueConfig stakingQueueConfig;
    uint16 sequencerBps;
    uint96 checkpointReward;
    RewardBoostConfig rewardBoostConfig;
  }

  uint96 internal constant ESCAPE_HATCH_BOND_SIZE = 332_000_000e18;
  uint96 internal constant ESCAPE_HATCH_WITHDRAWAL_TAX = 1_660_000e18;
  uint96 internal constant ESCAPE_HATCH_FAILED_HATCH_PUNISHMENT = 9_600_000e18;
  uint256 internal constant ESCAPE_HATCH_FREQUENCY = 112;
  uint256 internal constant ESCAPE_HATCH_ACTIVE_DURATION = 2;
  uint256 internal constant ESCAPE_HATCH_LAG_IN_HATCHES = 1;
  uint256 internal constant ESCAPE_HATCH_PROPOSING_EXIT_DELAY = 30 days;
  uint256 internal constant ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_SET_SIZE = 2;
  uint256 internal constant ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_RANDAO = 1;

  bytes32 internal constant STAKING_SLOT = keccak256("aztec.core.staking.storage");
  uint256 internal constant STAKING_QUEUE_CONFIG_SLOT_OFFSET = 5;

  // Constants taken from aztec-packages-private/v5-next@e56e4904ba75f38e041de3a5ed663b815c8f48f8
  bytes32 internal constant EXPECTED_VK_TREE_ROOT = 0x2b3b6ea4412b9c8f6457a37f91a2870306f8641e07e16a49b68bda6f8bc02892;
  bytes32 internal constant EXPECTED_PROTOCOL_CONTRACTS_HASH =
    0x2c075866eafc88a1f6f9addc7e337c6e64e45d1cb7fd7c0d612ebcec72aab2ca;
  bytes32 internal constant EXPECTED_GENESIS_ARCHIVE_ROOT =
    0x177a4955b31ecaafad999753938a44e526b54c5ba5d536688227f85f15cfbdf5;

  uint256 internal constant ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE = 500;
  uint256 internal constant ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE = 4;
  uint256 internal constant ENTRY_QUEUE_FLUSH_SIZE_MIN = 1;
  uint256 internal constant ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT = 400;
  uint256 internal constant ENTRY_QUEUE_MAX_FLUSH_SIZE = 4;

  struct SimulationSnapshot {
    address oldCanonicalRollup;
    uint256 versions;
    uint256 totalSupply;
    uint256 bonusSupply;
    uint256 oldRdBalance;
    uint256 newRdBalance;
    uint256 flushFundsToMove;
    uint256 oldFlushBalance;
    uint256 newFlushBalance;
  }

  RollupAddressOutput internal _rollupOutput;
  RewardDistributor internal _newRewardDistributor;
  IEscapeHatch internal _escapeHatch;
  V5UpgradePayload internal _payload;

  function rollupOutput() external view returns (RollupAddressOutput memory) {
    return _rollupOutput;
  }

  function newRewardDistributor() external view returns (RewardDistributor) {
    return _newRewardDistributor;
  }

  function escapeHatch() external view returns (IEscapeHatch) {
    return _escapeHatch;
  }

  function payload() external view returns (V5UpgradePayload) {
    return _payload;
  }

  function _expectedAddresses() internal view returns (ExpectedAddresses memory) {
    if (block.chainid == MAINNET_CHAIN_ID) {
      return ExpectedAddresses({
        registry: 0x35b22e09Ee0390539439E24f06Da43D83f90e298,
        governance: 0x1102471Eb3378FEE427121c9EfcEa452E4B6B75e,
        gse: 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f,
        canonicalRollup: 0xAe2001f7e21d5EcABf6234E9FDd1E76F50F74962,
        feeAsset: 0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2,
        stakingAsset: 0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2,
        rewardDistributor: 0x3D6A1B00C830C5f278FC5dFb3f6Ff0b74Db6dfe0,
        oldFlushRewarder: 0xf1AcfB0C6ADd7104e700b8FAd3Ea025dbB041F34
      });
    }
    if (block.chainid == SEPOLIA_CHAIN_ID) {
      return ExpectedAddresses({
        registry: 0xA0BFb1B494FB49041e5c6e8c2C1BE09cD171c6Ba,
        governance: 0xCAf7447721447B22Cd0076aC7C63877c3AFD329F,
        gse: 0xb6A38A51a6C1de9012f9d8EA9745ef957212eAaC,
        canonicalRollup: 0xf6D0D42aCE06829bECB78C74F49879528fC632c1,
        feeAsset: 0x762C132040fdA6183066Fa3B14d985ee55aA3C18,
        stakingAsset: 0x5595cb9ED193cAc2C0Bc5393313bc6115817954B,
        rewardDistributor: 0x030d2780E70F085c31D490268D3900d4CEa16606,
        oldFlushRewarder: address(0)
      });
    }
    revert DeployRollupForUpgradeV5__UnsupportedChain(block.chainid);
  }

  /// @notice The rollup config to deploy. Mainnet values are the baseline; Sepolia overrides
  ///         only the fields that diverge, per the `testnet` preset in
  ///         `spartan/environments/network-defaults.yml`.
  function _expectedConfig() internal view returns (ExpectedConfig memory c) {
    c = ExpectedConfig({
      slotDuration: 72,
      epochDuration: 32,
      targetCommitteeSize: 48,
      lagInEpochsForValidatorSet: 2,
      lagInEpochsForRandao: 1,
      // inbox lag updated in AZIP-6 Pipelined block building
      inboxLag: 2,
      proofSubmissionEpochs: 1,
      activationThreshold: 200_000e18,
      ejectionThreshold: 100_000e18,
      localEjectionThreshold: 190_000e18,
      exitDelaySeconds: 345_600,
      manaTarget: 75_000_000,
      // provingCostPerMana updated in AZIP-16 Activate Equivocation Slashing and Update Economic Parameters
      provingCostPerMana: 12_500_000,
      // Taken on 2026-06-11 when 1 eth = $1640, 1 AZTEC = $0.0156. E12 representation.
      initialEthPerFeeAsset: 9_512_195,
      slashingRoundSizeInEpochs: 4,
      slashingQuorum: 65,
      slashingLifetimeInRounds: 34,
      slashingExecutionDelayInRounds: 28,
      slashingOffsetInRounds: 2,
      slashingVetoer: 0xBbB4aF368d02827945748b28CD4b2D42e4A37480,
      slashingDisableDuration: 259_200,
      // Slash amounts updated in AZIP-16 Activate Equivocation Slashing and Update Economic Parameters
      slashAmountSmall: 2000e18,
      slashAmountMedium: 5000e18,
      slashAmountLarge: 5000e18,
      stakingQueueConfig: _stakingQueueConfig(),
      sequencerBps: 7000,
      checkpointReward: 500e18,
      // Updated in AZIP-5 Optimise prover rewards for consistency
      rewardBoostConfig: RewardBoostConfig({
        increment: 101_400, maxScore: 367_500, a: 250_000, minimum: 10_000, k: 1_000_000
      })
    });

    if (block.chainid == MAINNET_CHAIN_ID) {
      return c;
    }
    if (block.chainid == SEPOLIA_CHAIN_ID) {
      c.localEjectionThreshold = 199_000e18;
      c.exitDelaySeconds = 172_800;
      c.slashingLifetimeInRounds = 5;
      c.slashingExecutionDelayInRounds = 2;
      c.slashingVetoer = 0xdfe19Da6a717b7088621d8bBB66be59F2d78e924;
      c.slashingDisableDuration = 432_000;
      // testnet preset (AZIP-16): slashes the full stake, harsher than mainnet.
      c.slashAmountSmall = 100_000e18;
      c.slashAmountMedium = 250_000e18;
      c.slashAmountLarge = 250_000e18;
      return c;
    }
    revert DeployRollupForUpgradeV5__UnsupportedChain(block.chainid);
  }

  function _stakingQueueConfig() internal pure returns (StakingQueueConfig memory) {
    return StakingQueueConfig({
      bootstrapValidatorSetSize: ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE,
      bootstrapFlushSize: ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE,
      normalFlushSizeMin: ENTRY_QUEUE_FLUSH_SIZE_MIN,
      normalFlushSizeQuotient: ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT,
      maxQueueFlushSize: ENTRY_QUEUE_MAX_FLUSH_SIZE
    });
  }

  /// @dev RollupConfiguration reads its inputs from env vars. Pin every one of them to the
  ///      per-chain expected table (and the genesis pins) so the bare `forge script` invocation
  ///      needs no config environment and the deploy cannot drift from what validate() asserts.
  function _pinConfigEnv() internal {
    ExpectedConfig memory ec = _expectedConfig();

    vm.setEnv("REAL_VERIFIER", "true");
    vm.setEnv("VK_TREE_ROOT", vm.toString(EXPECTED_VK_TREE_ROOT));
    vm.setEnv("PROTOCOL_CONTRACTS_HASH", vm.toString(EXPECTED_PROTOCOL_CONTRACTS_HASH));
    vm.setEnv("GENESIS_ARCHIVE_ROOT", vm.toString(EXPECTED_GENESIS_ARCHIVE_ROOT));

    vm.setEnv("AZTEC_SLOT_DURATION", vm.toString(ec.slotDuration));
    vm.setEnv("AZTEC_EPOCH_DURATION", vm.toString(ec.epochDuration));
    vm.setEnv("AZTEC_TARGET_COMMITTEE_SIZE", vm.toString(ec.targetCommitteeSize));
    vm.setEnv("AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET", vm.toString(ec.lagInEpochsForValidatorSet));
    vm.setEnv("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO", vm.toString(ec.lagInEpochsForRandao));
    vm.setEnv("AZTEC_INBOX_LAG", vm.toString(ec.inboxLag));
    vm.setEnv("AZTEC_PROOF_SUBMISSION_EPOCHS", vm.toString(ec.proofSubmissionEpochs));
    vm.setEnv("AZTEC_LOCAL_EJECTION_THRESHOLD", vm.toString(ec.localEjectionThreshold));
    vm.setEnv("AZTEC_EXIT_DELAY_SECONDS", vm.toString(ec.exitDelaySeconds));
    vm.setEnv("AZTEC_MANA_TARGET", vm.toString(ec.manaTarget));
    vm.setEnv("AZTEC_PROVING_COST_PER_MANA", vm.toString(ec.provingCostPerMana));
    vm.setEnv("AZTEC_INITIAL_ETH_PER_FEE_ASSET", vm.toString(ec.initialEthPerFeeAsset));

    vm.setEnv("AZTEC_SLASHER_ENABLED", "true");
    vm.setEnv("AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS", vm.toString(ec.slashingRoundSizeInEpochs));
    vm.setEnv("AZTEC_SLASHING_QUORUM", vm.toString(ec.slashingQuorum));
    vm.setEnv("AZTEC_SLASHING_LIFETIME_IN_ROUNDS", vm.toString(ec.slashingLifetimeInRounds));
    vm.setEnv("AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS", vm.toString(ec.slashingExecutionDelayInRounds));
    vm.setEnv("AZTEC_SLASHING_OFFSET_IN_ROUNDS", vm.toString(ec.slashingOffsetInRounds));
    vm.setEnv("AZTEC_SLASHING_VETOER", vm.toString(ec.slashingVetoer));
    vm.setEnv("AZTEC_SLASHING_DISABLE_DURATION", vm.toString(ec.slashingDisableDuration));
    vm.setEnv("AZTEC_SLASH_AMOUNT_SMALL", vm.toString(ec.slashAmountSmall));
    vm.setEnv("AZTEC_SLASH_AMOUNT_MEDIUM", vm.toString(ec.slashAmountMedium));
    vm.setEnv("AZTEC_SLASH_AMOUNT_LARGE", vm.toString(ec.slashAmountLarge));

    vm.setEnv("AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE", vm.toString(ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE));
    vm.setEnv("AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE", vm.toString(ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE));
    vm.setEnv("AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN", vm.toString(ENTRY_QUEUE_FLUSH_SIZE_MIN));
    vm.setEnv("AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT", vm.toString(ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT));
    vm.setEnv("AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE", vm.toString(ENTRY_QUEUE_MAX_FLUSH_SIZE));
  }

  /// @notice Cross-checks the hardcoded per-chain address book against live chain state.
  function _assertExpectedAddresses() internal view returns (ExpectedAddresses memory expected) {
    console.log("[assert] expected addresses start");
    expected = _expectedAddresses();
    IRegistry registry = IRegistry(expected.registry);
    IStaking canonicalRollup = IStaking(expected.canonicalRollup);

    address envRegistry = vm.envOr("REGISTRY_ADDRESS", address(0));
    if (envRegistry != address(0)) {
      assertEq(envRegistry, expected.registry, "REGISTRY_ADDRESS env mismatch");
    }

    assertEq(registry.getGovernance(), expected.governance, "governance mismatch");
    assertEq(address(registry.getCanonicalRollup()), expected.canonicalRollup, "canonical rollup mismatch");
    assertEq(address(registry.getRewardDistributor()), expected.rewardDistributor, "reward distributor mismatch");
    assertEq(address(canonicalRollup.getGSE()), expected.gse, "gse mismatch");
    assertEq(address(IRollup(expected.canonicalRollup).getFeeAsset()), expected.feeAsset, "fee asset mismatch");
    assertEq(address(canonicalRollup.getStakingAsset()), expected.stakingAsset, "staking asset mismatch");
    if (expected.oldFlushRewarder != address(0)) {
      FlushRewarder oldFlush = FlushRewarder(expected.oldFlushRewarder);
      assertEq(Ownable(address(oldFlush)).owner(), expected.governance, "old flush rewarder owner mismatch");
      assertEq(address(oldFlush.ROLLUP()), expected.canonicalRollup, "old flush rewarder rollup mismatch");
    }
    console.log(unicode"[assert] expected addresses ✓");
  }

  function run() public {
    ExpectedAddresses memory expected = _assertExpectedAddresses();
    Registry registry = Registry(expected.registry);
    address deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);

    _pinConfigEnv();

    IRollupConfiguration rollupConfig = new RollupConfiguration();
    rollupConfig.loadConfig();

    IStaking v4Rollup = IStaking(address(registry.getCanonicalRollup()));
    GSE gse = v4Rollup.getGSE();
    IERC20 feeAsset = IRollup(address(v4Rollup)).getFeeAsset();
    IERC20 stakingAsset = v4Rollup.getStakingAsset();
    Governance governance = Governance(registry.getGovernance());

    vm.startBroadcast(deployer);

    // 1. Deploy the v5 reward distributor. It reads canonical from the same registry, so once
    //    the V5UpgradePayload makes v5 the canonical rollup, this distributor's implicit pool
    //    becomes claimable by v5.
    _newRewardDistributor = new RewardDistributor(feeAsset, registry);

    // 2. Deploy the v5 rollup, binding it to the new distributor at construction. The rollup
    //    is deployed directly (not via DeployRollupLib) so that governance is the constructor
    //    governance arg: that address becomes the slasher's immutable GOVERNANCE, which a
    //    post-deploy Ownable transfer cannot fix. None of the lib's deployer-owned setup
    //    (registry/GSE registration, initial validators) applies to an upgrade.
    _rollupOutput.verifier =
      rollupConfig.useRealVerifier() ? IVerifier(address(new HonkVerifier())) : IVerifier(address(new MockVerifier()));
    _rollupOutput.rollup = new Rollup(
      feeAsset,
      stakingAsset,
      gse,
      _rollupOutput.verifier,
      address(governance),
      rollupConfig.getGenesisState(),
      rollupConfig.getRollupConfiguration(IRewardDistributor(address(_newRewardDistributor)))
    );

    // 3. Deploy the escape hatch for the v5 rollup. It stays inert until the payload's
    //    `setEscapeHatch` action activates it on the rollup.
    _escapeHatch = IEscapeHatch(
      address(
        new EscapeHatch(
          address(_rollupOutput.rollup),
          address(stakingAsset),
          ESCAPE_HATCH_BOND_SIZE,
          ESCAPE_HATCH_WITHDRAWAL_TAX,
          ESCAPE_HATCH_FAILED_HATCH_PUNISHMENT,
          ESCAPE_HATCH_FREQUENCY,
          ESCAPE_HATCH_ACTIVE_DURATION,
          ESCAPE_HATCH_LAG_IN_HATCHES,
          ESCAPE_HATCH_PROPOSING_EXIT_DELAY
        )
      )
    );

    // 4. Deploy the upgrade payload. Captures the current registry distributor as OLD, and —
    //    on chains with a flush rewarder — deploys the v5 flush rewarder in its constructor
    //    and appends the flush-rewarder migration action.
    FlushRewarder oldFlushRewarder = FlushRewarder(expected.oldFlushRewarder);
    _payload = new V5UpgradePayload(
      registry,
      IInstance(address(_rollupOutput.rollup)),
      IRewardDistributor(address(_newRewardDistributor)),
      feeAsset,
      _escapeHatch,
      oldFlushRewarder
    );

    vm.stopBroadcast();

    validate(_payload);
    _writeDeploymentOutput();
  }

  /// @notice Asserts the payload's wiring against live chain state and the hardcoded per-chain
  ///         expectations, then simulates governance executing it. Re-runnable post-deploy:
  ///         `--sig 'validate(address)' <payload>`.
  function validate(V5UpgradePayload _payloadToValidate) public {
    assertNotEq(address(_payloadToValidate), address(0), "payload is zero");
    _assertExpectedAddresses();
    _validatePayloadImmutables(_payloadToValidate);
    _validatePayloadActions(_payloadToValidate);
    _validateEscapeHatchConfig(_payloadToValidate);
    _validateGenesisState(_payloadToValidate);
    _validateRollupGetterConfig(_payloadToValidate);
    _validateStakingQueueConfig(_payloadToValidate);
    _validateSlasherStack(_payloadToValidate);
    _simulateExecution(_payloadToValidate);
  }

  function _validateGenesisState(V5UpgradePayload _p) internal view {
    console.log("[assert] genesis state start");
    IRollup rollupCore = IRollup(address(_p.NEW_ROLLUP()));
    assertEq(rollupCore.getVkTreeRoot(), EXPECTED_VK_TREE_ROOT, "vk tree root mismatch");
    assertEq(
      rollupCore.getProtocolContractsHash(), EXPECTED_PROTOCOL_CONTRACTS_HASH, "protocol contracts hash mismatch"
    );
    assertEq(rollupCore.archiveAt(0), EXPECTED_GENESIS_ARCHIVE_ROOT, "genesis archive root mismatch");
    console.log(unicode"[assert] genesis state ✓");
  }

  function _validatePayloadImmutables(V5UpgradePayload _p) internal view {
    console.log("[assert] payload immutables start");
    ExpectedAddresses memory expected = _expectedAddresses();
    IRegistry registry = _p.REGISTRY();
    address governance = registry.getGovernance();
    IInstance newRollup = _p.NEW_ROLLUP();
    address oldCanonicalRollup = address(registry.getCanonicalRollup());

    assertEq(address(registry), expected.registry, "payload registry mismatch");
    assertEq(address(_p.OLD_FLUSH_REWARDER()), expected.oldFlushRewarder, "payload flush rewarder mismatch");
    assertEq(_p.OLD_REWARD_DISTRIBUTOR(), address(registry.getRewardDistributor()), "old distributor drifted");
    assertNotEq(address(newRollup), oldCanonicalRollup, "new rollup already canonical");
    assertEq(Ownable(address(newRollup)).owner(), governance, "new rollup not owned by governance");
    assertNotEq(address(_p.NEW_REWARD_DISTRIBUTOR()), _p.OLD_REWARD_DISTRIBUTOR(), "distributor alias");
    assertEq(address(_p.ASSET()), address(IRollup(address(newRollup)).getFeeAsset()), "asset is not the fee asset");
    assertGt(bytes(_p.getURI()).length, 0, "payload uri empty");

    // The v5 rollup binds its distributor immutably, so the distributor's own immutables must
    // match the chain it serves: a wrong ASSET strands the drained pool (claim transfers ASSET,
    // not whatever was deposited), a wrong REGISTRY breaks canonical resolution.
    RewardDistributor newRd = RewardDistributor(address(_p.NEW_REWARD_DISTRIBUTOR()));
    assertEq(address(newRd.ASSET()), expected.feeAsset, "new distributor asset mismatch");
    assertEq(address(newRd.REGISTRY()), expected.registry, "new distributor registry mismatch");

    assertNotEq(address(_p.ESCAPE_HATCH()), address(0), "escape hatch missing");
    assertEq(_p.ESCAPE_HATCH().getRollup(), address(newRollup), "escape hatch rollup mismatch");
    assertEq(address(newRollup.getEscapeHatch()), address(0), "new rollup hatch slot not empty");
    assertEq(
      address(newRollup.getEscapeHatchForEpoch(newRollup.getCurrentEpoch())), address(0), "epoch hatch not empty"
    );

    FlushRewarder oldFlush = _p.OLD_FLUSH_REWARDER();
    FlushRewarder newFlush = _p.NEW_FLUSH_REWARDER();
    if (address(oldFlush) == address(0)) {
      assertEq(address(newFlush), address(0), "unexpected new flush rewarder");
    } else {
      assertEq(Ownable(address(oldFlush)).owner(), governance, "old flush rewarder owner mismatch");
      assertEq(address(oldFlush.ROLLUP()), oldCanonicalRollup, "old flush rewarder rollup mismatch");
      assertNotEq(address(newFlush), address(oldFlush), "flush rewarder alias");
      assertEq(Ownable(address(newFlush)).owner(), governance, "new flush rewarder owner mismatch");
      assertEq(address(newFlush.ROLLUP()), address(newRollup), "new flush rewarder rollup mismatch");
      assertEq(address(newFlush.REWARD_ASSET()), address(oldFlush.REWARD_ASSET()), "flush reward asset mismatch");
      assertEq(newFlush.rewardPerInsertion(), oldFlush.rewardPerInsertion(), "flush reward rate mismatch");
      assertEq(oldFlush.REWARD_ASSET().balanceOf(address(newFlush)), 0, "new flush rewarder unexpectedly funded");
    }
    console.log(unicode"[assert] payload immutables ✓");
  }

  function _validatePayloadActions(V5UpgradePayload _p) internal view {
    console.log("[assert] payload actions start");
    IPayload.Action[] memory actions = _p.getActions();
    bool migratesFlush = address(_p.OLD_FLUSH_REWARDER()) != address(0);
    assertEq(actions.length, migratesFlush ? 6 : 5, "action count mismatch");

    bytes memory expectedDrain = abi.encodeWithSelector(
      _p.LEGACY_RECOVER_SELECTOR(),
      address(_p.ASSET()),
      address(_p.NEW_REWARD_DISTRIBUTOR()),
      _p.ASSET().balanceOf(_p.OLD_REWARD_DISTRIBUTOR())
    );
    assertEq(actions[0].target, _p.OLD_REWARD_DISTRIBUTOR(), "action0 target mismatch");
    assertEq(keccak256(actions[0].data), keccak256(expectedDrain), "action0 data mismatch");

    bytes memory expectedAddRollup = abi.encodeWithSelector(IRegistry.addRollup.selector, address(_p.NEW_ROLLUP()));
    assertEq(actions[1].target, address(_p.REGISTRY()), "action1 target mismatch");
    assertEq(keccak256(actions[1].data), keccak256(expectedAddRollup), "action1 data mismatch");

    bytes memory expectedUpdateRd =
      abi.encodeWithSelector(IRegistry.updateRewardDistributor.selector, address(_p.NEW_REWARD_DISTRIBUTOR()));
    assertEq(actions[2].target, address(_p.REGISTRY()), "action2 target mismatch");
    assertEq(keccak256(actions[2].data), keccak256(expectedUpdateRd), "action2 data mismatch");

    bytes memory expectedAddGse = abi.encodeWithSelector(IGSECore.addRollup.selector, address(_p.NEW_ROLLUP()));
    assertEq(actions[3].target, address(_p.NEW_ROLLUP().getGSE()), "action3 target mismatch");
    assertEq(keccak256(actions[3].data), keccak256(expectedAddGse), "action3 data mismatch");

    bytes memory expectedSetHatch =
      abi.encodeWithSelector(IValidatorSelectionCore.setEscapeHatch.selector, address(_p.ESCAPE_HATCH()));
    assertEq(actions[4].target, address(_p.NEW_ROLLUP()), "action4 target mismatch");
    assertEq(keccak256(actions[4].data), keccak256(expectedSetHatch), "action4 data mismatch");

    if (migratesFlush) {
      bytes memory expectedFlushRecover = abi.encodeWithSelector(
        FlushRewarder.recover.selector,
        address(_p.NEW_FLUSH_REWARDER().REWARD_ASSET()),
        address(_p.NEW_FLUSH_REWARDER()),
        _p.OLD_FLUSH_REWARDER().rewardsAvailable()
      );
      assertEq(actions[5].target, address(_p.OLD_FLUSH_REWARDER()), "action5 target mismatch");
      assertEq(keccak256(actions[5].data), keccak256(expectedFlushRecover), "action5 data mismatch");
    }
    console.log(unicode"[assert] payload actions ✓");
  }

  function _validateEscapeHatchConfig(V5UpgradePayload _p) internal view {
    console.log("[assert] escape hatch config start");
    EscapeHatch hatch = EscapeHatch(address(_p.ESCAPE_HATCH()));
    address stakingAsset = address(IStaking(address(_p.NEW_ROLLUP())).getStakingAsset());

    assertEq(hatch.getRollup(), address(_p.NEW_ROLLUP()), "hatch rollup mismatch");
    assertEq(hatch.getBondToken(), stakingAsset, "hatch bond token mismatch");
    assertEq(hatch.getBondSize(), ESCAPE_HATCH_BOND_SIZE, "hatch bond size mismatch");
    assertEq(hatch.getWithdrawalTax(), ESCAPE_HATCH_WITHDRAWAL_TAX, "hatch withdrawal tax mismatch");
    assertEq(hatch.getFailedHatchPunishment(), ESCAPE_HATCH_FAILED_HATCH_PUNISHMENT, "hatch punishment mismatch");
    assertEq(hatch.getFrequency(), ESCAPE_HATCH_FREQUENCY, "hatch frequency mismatch");
    assertEq(hatch.getActiveDuration(), ESCAPE_HATCH_ACTIVE_DURATION, "hatch active duration mismatch");
    assertEq(hatch.getLagInHatches(), ESCAPE_HATCH_LAG_IN_HATCHES, "hatch lag mismatch");
    assertEq(hatch.getProposingExitDelay(), ESCAPE_HATCH_PROPOSING_EXIT_DELAY, "hatch exit delay mismatch");
    assertEq(hatch.LAG_IN_EPOCHS_FOR_SET_SIZE(), ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_SET_SIZE, "hatch set lag mismatch");
    assertEq(hatch.LAG_IN_EPOCHS_FOR_RANDAO(), ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_RANDAO, "hatch randao lag mismatch");
    assertEq(hatch.getCandidateCount(), 0, "hatch candidate count mismatch");
    console.log(unicode"[assert] escape hatch config ✓");
  }

  function _validateRollupGetterConfig(V5UpgradePayload _p) internal view {
    console.log("[assert] rollup getter config start");
    ExpectedAddresses memory ea = _expectedAddresses();
    ExpectedConfig memory ec = _expectedConfig();
    IInstance rollup = _p.NEW_ROLLUP();
    IRollup rollupCore = IRollup(address(rollup));

    assertEq(Ownable(address(rollup)).owner(), ea.governance, "rollup owner mismatch");
    assertEq(address(rollupCore.getFeeAsset()), ea.feeAsset, "rollup fee asset mismatch");
    assertEq(address(rollup.getStakingAsset()), ea.stakingAsset, "rollup staking asset mismatch");
    assertEq(address(rollup.getGSE()), ea.gse, "rollup gse mismatch");
    assertEq(
      address(rollupCore.getRewardDistributor()), address(_p.NEW_REWARD_DISTRIBUTOR()), "rollup distributor mismatch"
    );

    // The verifier is the one immutable that must never be a MockVerifier in production. Compare
    // the deployed code's hash against the mock's compile-time runtime code so a mock is caught on
    // both the run() path and the re-runnable validate(address) path (where _rollupOutput is unset).
    IVerifier verifier = rollupCore.getEpochProofVerifier();
    assertNotEq(address(verifier), address(0), "verifier missing");
    assertTrue(address(verifier).codehash != keccak256(type(MockVerifier).runtimeCode), "verifier is a MockVerifier");
    if (address(_rollupOutput.verifier) != address(0)) {
      assertEq(address(verifier), address(_rollupOutput.verifier), "verifier mismatch");
    }

    assertEq(rollup.getSlotDuration(), ec.slotDuration, "slot duration mismatch");
    assertEq(rollup.getEpochDuration(), ec.epochDuration, "epoch duration mismatch");
    assertEq(rollup.getTargetCommitteeSize(), ec.targetCommitteeSize, "committee size mismatch");
    assertEq(rollup.getLagInEpochsForValidatorSet(), ec.lagInEpochsForValidatorSet, "validator lag mismatch");
    assertEq(rollup.getLagInEpochsForRandao(), ec.lagInEpochsForRandao, "randao lag mismatch");
    assertEq(rollupCore.getProofSubmissionEpochs(), ec.proofSubmissionEpochs, "proof epochs mismatch");
    assertEq(rollup.getActivationThreshold(), ec.activationThreshold, "activation threshold mismatch");
    assertEq(rollup.getEjectionThreshold(), ec.ejectionThreshold, "ejection threshold mismatch");
    assertEq(rollup.getLocalEjectionThreshold(), ec.localEjectionThreshold, "local ejection threshold mismatch");
    assertEq(Timestamp.unwrap(rollup.getExitDelay()), ec.exitDelaySeconds, "exit delay mismatch");
    assertEq(rollupCore.getManaTarget(), ec.manaTarget, "mana target mismatch");
    assertEq(EthValue.unwrap(rollupCore.getProvingCostPerManaInEth()), ec.provingCostPerMana, "proving cost mismatch");
    assertEq(
      EthPerFeeAssetE12.unwrap(rollupCore.getEthPerFeeAsset()), ec.initialEthPerFeeAsset, "eth per fee asset mismatch"
    );

    RewardConfig memory rewardConfig = rollupCore.getRewardConfig();
    assertEq(
      address(rewardConfig.rewardDistributor), address(_p.NEW_REWARD_DISTRIBUTOR()), "reward distributor mismatch"
    );
    assertEq(Bps.unwrap(rewardConfig.sequencerBps), ec.sequencerBps, "sequencer bps mismatch");
    assertEq(rewardConfig.checkpointReward, ec.checkpointReward, "checkpoint reward mismatch");
    assertNotEq(address(rewardConfig.booster), address(0), "booster missing");
    assertEq(address(RewardBooster(address(rewardConfig.booster)).ROLLUP()), address(rollup), "booster rollup mismatch");
    RewardBoostConfig memory boostConfig = IBooster(address(rewardConfig.booster)).getConfig();
    assertEq(boostConfig.increment, ec.rewardBoostConfig.increment, "boost increment mismatch");
    assertEq(boostConfig.maxScore, ec.rewardBoostConfig.maxScore, "boost max score mismatch");
    assertEq(boostConfig.a, ec.rewardBoostConfig.a, "boost a mismatch");
    assertEq(boostConfig.minimum, ec.rewardBoostConfig.minimum, "boost minimum mismatch");
    assertEq(boostConfig.k, ec.rewardBoostConfig.k, "boost k mismatch");

    Inbox inbox = Inbox(address(rollupCore.getInbox()));
    assertEq(inbox.ROLLUP(), address(rollup), "inbox rollup mismatch");
    assertEq(inbox.VERSION(), rollupCore.getVersion(), "inbox version mismatch");
    assertEq(inbox.LAG(), ec.inboxLag, "inbox lag mismatch");
    assertEq(inbox.FEE_ASSET_PORTAL(), address(rollupCore.getFeeAssetPortal()), "portal mismatch");
    Outbox outbox = Outbox(address(rollupCore.getOutbox()));
    assertEq(address(outbox.ROLLUP()), address(rollup), "outbox rollup mismatch");
    assertEq(outbox.VERSION(), rollupCore.getVersion(), "outbox version mismatch");
    console.log(unicode"[assert] rollup getter config ✓");
  }

  function _validateStakingQueueConfig(V5UpgradePayload _p) internal view {
    console.log("[assert] staking queue config start");
    StakingQueueConfig memory expected = _expectedConfig().stakingQueueConfig;
    uint256 packed =
      uint256(vm.load(address(_p.NEW_ROLLUP()), bytes32(uint256(STAKING_SLOT) + STAKING_QUEUE_CONFIG_SLOT_OFFSET)));
    StakingQueueConfig memory actual = StakingQueueConfigLib.decompress(CompressedStakingQueueConfig.wrap(packed));

    assertEq(actual.bootstrapValidatorSetSize, expected.bootstrapValidatorSetSize, "queue bootstrap set mismatch");
    assertEq(actual.bootstrapFlushSize, expected.bootstrapFlushSize, "queue bootstrap flush mismatch");
    assertEq(actual.normalFlushSizeMin, expected.normalFlushSizeMin, "queue flush min mismatch");
    assertEq(actual.normalFlushSizeQuotient, expected.normalFlushSizeQuotient, "queue flush quotient mismatch");
    assertEq(actual.maxQueueFlushSize, expected.maxQueueFlushSize, "queue max flush mismatch");
    console.log(unicode"[assert] staking queue config ✓");
  }

  function _validateSlasherStack(V5UpgradePayload _p) internal view {
    console.log("[assert] slasher stack start");
    ExpectedAddresses memory ea = _expectedAddresses();
    ExpectedConfig memory ec = _expectedConfig();
    address slasherAddress = IStaking(address(_p.NEW_ROLLUP())).getSlasher();
    Slasher slasher = Slasher(slasherAddress);
    SlashingProposer proposer = SlashingProposer(slasher.PROPOSER());

    assertNotEq(slasherAddress, address(0), "slasher missing");
    assertEq(slasher.GOVERNANCE(), ea.governance, "slasher governance mismatch");
    assertEq(slasher.VETOER(), ec.slashingVetoer, "slasher vetoer mismatch");
    assertEq(slasher.SLASHING_DISABLE_DURATION(), ec.slashingDisableDuration, "slasher disable duration mismatch");
    assertNotEq(address(proposer), address(0), "slashing proposer missing");
    assertEq(proposer.INSTANCE(), address(_p.NEW_ROLLUP()), "proposer instance mismatch");
    assertEq(address(proposer.SLASHER()), slasherAddress, "proposer slasher mismatch");
    assertEq(proposer.QUORUM(), ec.slashingQuorum, "proposer quorum mismatch");
    assertEq(proposer.ROUND_SIZE(), ec.slashingRoundSizeInEpochs * ec.epochDuration, "proposer round size mismatch");
    assertEq(proposer.ROUND_SIZE_IN_EPOCHS(), ec.slashingRoundSizeInEpochs, "proposer epoch round mismatch");
    assertEq(proposer.LIFETIME_IN_ROUNDS(), ec.slashingLifetimeInRounds, "proposer lifetime mismatch");
    assertEq(
      proposer.EXECUTION_DELAY_IN_ROUNDS(), ec.slashingExecutionDelayInRounds, "proposer execution delay mismatch"
    );
    assertEq(proposer.SLASH_OFFSET_IN_ROUNDS(), ec.slashingOffsetInRounds, "proposer slash offset mismatch");
    assertEq(proposer.SLASH_AMOUNT_SMALL(), ec.slashAmountSmall, "proposer slash small mismatch");
    assertEq(proposer.SLASH_AMOUNT_MEDIUM(), ec.slashAmountMedium, "proposer slash medium mismatch");
    assertEq(proposer.SLASH_AMOUNT_LARGE(), ec.slashAmountLarge, "proposer slash large mismatch");
    assertEq(proposer.COMMITTEE_SIZE(), ec.targetCommitteeSize, "proposer committee size mismatch");
    assertNotEq(proposer.SLASH_PAYLOAD_IMPLEMENTATION(), address(0), "slash payload implementation missing");

    // A freshly deployed rollup must carry no slasher-migration state: a non-zero legacy or
    // pending slasher would mean the deploy inherited stale state and could slash unexpectedly.
    (address legacySlasher,) = IStaking(address(_p.NEW_ROLLUP())).getLegacySlasher();
    assertEq(legacySlasher, address(0), "unexpected legacy slasher on fresh rollup");
    (address pendingSlasher,) = IStaking(address(_p.NEW_ROLLUP())).getPendingSlasher();
    assertEq(pendingSlasher, address(0), "unexpected pending slasher on fresh rollup");
    console.log(unicode"[assert] slasher stack ✓");
  }

  /// @dev Wraps the payload in a GSEPayload (as GovernanceProposer does), walks the proposal
  ///      through the full governance lifecycle, executes it, asserts the post-state, and
  ///      reverts to a snapshot so the validation leaves no trace.
  function _simulateExecution(V5UpgradePayload _p) internal {
    console.log("[assert] simulate execution start");
    IRegistry registry = _p.REGISTRY();
    Governance governance = Governance(registry.getGovernance());
    IGSE gse = IGSE(address(_p.NEW_ROLLUP().getGSE()));

    SimulationSnapshot memory before = _captureSnapshot(_p, registry, gse);

    uint256 snapshotId = vm.snapshotState();

    _executeThroughGovernance(_p, governance, gse, before.oldCanonicalRollup);
    _assertPostState(_p, registry, gse, before);

    if (!vm.revertToState(snapshotId)) {
      revert DeployRollupForUpgradeV5__SnapshotRevertFailed(snapshotId);
    }
    console.log(unicode"[assert] simulate execution ✓");
  }

  function _captureSnapshot(V5UpgradePayload _p, IRegistry _registry, IGSE _gse)
    internal
    view
    returns (SimulationSnapshot memory snap)
  {
    snap.oldCanonicalRollup = address(_registry.getCanonicalRollup());
    snap.versions = _registry.numberOfVersions();
    snap.totalSupply = _gse.totalSupply();
    snap.bonusSupply = _gse.supplyOf(_gse.getBonusInstanceAddress());
    snap.oldRdBalance = _p.ASSET().balanceOf(_p.OLD_REWARD_DISTRIBUTOR());
    snap.newRdBalance = _p.ASSET().balanceOf(address(_p.NEW_REWARD_DISTRIBUTOR()));
    if (address(_p.OLD_FLUSH_REWARDER()) != address(0)) {
      IERC20 flushAsset = _p.OLD_FLUSH_REWARDER().REWARD_ASSET();
      snap.flushFundsToMove = _p.OLD_FLUSH_REWARDER().rewardsAvailable();
      snap.oldFlushBalance = flushAsset.balanceOf(address(_p.OLD_FLUSH_REWARDER()));
      snap.newFlushBalance = flushAsset.balanceOf(address(_p.NEW_FLUSH_REWARDER()));
    }
  }

  function _executeThroughGovernance(V5UpgradePayload _p, Governance _governance, IGSE _gse, address _oldCanonical)
    internal
  {
    GSEPayload gsePayload = new GSEPayload(IPayload(address(_p)), _gse, _p.REGISTRY());
    _validateGsePayloadWrapper(_p, gsePayload);

    // A simulation-only depositor with a majority of governance power guarantees the proposal
    // passes regardless of how power is distributed (on Sepolia the GSE holds ~2% of it; the
    // rest sits with direct depositors this simulation cannot speak for). The deposit happens
    // inside the snapshot that _simulateExecution reverts.
    address simVoter = address(uint160(uint256(keccak256("DeployRollupForUpgradeV5.simVoter"))));
    uint256 simPower = _governance.totalPowerAt(Timestamp.wrap(block.timestamp - 1)) * 2;
    IERC20 govAsset = _governance.ASSET();
    stdstore.target(address(govAsset)).sig(IERC20.balanceOf.selector).with_key(simVoter).checked_write(simPower);
    vm.startPrank(simVoter);
    govAsset.approve(address(_governance), simPower);
    _governance.deposit(simVoter, simPower);
    vm.stopPrank();

    vm.prank(_governance.governanceProposer());
    uint256 proposalId = _governance.propose(IPayload(address(gsePayload)));

    Proposal memory proposal = _governance.getProposal(proposalId);
    Timestamp pendingThrough =
      Timestamp.wrap(Timestamp.unwrap(proposal.creation) + Timestamp.unwrap(proposal.config.votingDelay));
    Timestamp activeThrough =
      Timestamp.wrap(Timestamp.unwrap(pendingThrough) + Timestamp.unwrap(proposal.config.votingDuration));
    Timestamp queuedThrough =
      Timestamp.wrap(Timestamp.unwrap(activeThrough) + Timestamp.unwrap(proposal.config.executionDelay));

    vm.warp(Timestamp.unwrap(pendingThrough) + 1);
    assertEq(uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Active), "proposal not active");

    uint256 oldRollupVoteAmount = _gse.getVotingPowerAt(_oldCanonical, pendingThrough);
    if (oldRollupVoteAmount > 0) {
      vm.prank(_oldCanonical);
      _gse.vote(proposalId, oldRollupVoteAmount, true);
    }
    uint256 bonusVoteAmount = _gse.getVotingPowerAt(_gse.getBonusInstanceAddress(), pendingThrough);
    if (bonusVoteAmount > 0) {
      vm.prank(_oldCanonical);
      _gse.voteWithBonus(proposalId, bonusVoteAmount, true);
    }
    vm.prank(simVoter);
    _governance.vote(proposalId, simPower, true);

    vm.warp(Timestamp.unwrap(queuedThrough) + 1);
    assertEq(
      uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Executable), "proposal not executable"
    );

    _governance.execute(proposalId);
    assertEq(
      uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Executed), "proposal not executed"
    );
  }

  function _validateGsePayloadWrapper(V5UpgradePayload _p, GSEPayload _gsePayload) internal view {
    IPayload.Action[] memory payloadActions = _p.getActions();
    IPayload.Action[] memory wrappedActions = _gsePayload.getActions();
    assertEq(wrappedActions.length, payloadActions.length + 1, "wrapped action count mismatch");

    for (uint256 i = 0; i < payloadActions.length; i++) {
      assertEq(wrappedActions[i].target, payloadActions[i].target, "wrapped target mismatch");
      assertEq(keccak256(wrappedActions[i].data), keccak256(payloadActions[i].data), "wrapped data mismatch");
    }

    uint256 terminalIndex = wrappedActions.length - 1;
    assertEq(wrappedActions[terminalIndex].target, address(_gsePayload), "wrapped terminal target mismatch");
    assertEq(
      keccak256(wrappedActions[terminalIndex].data),
      keccak256(abi.encodeWithSelector(GSEPayload.amIValid.selector)),
      "wrapped terminal data mismatch"
    );
  }

  function _assertPostState(V5UpgradePayload _p, IRegistry _registry, IGSE _gse, SimulationSnapshot memory _before)
    internal
    view
  {
    console.log("[assert] post execution state start");
    IInstance newRollup = _p.NEW_ROLLUP();

    assertEq(address(_registry.getCanonicalRollup()), address(newRollup), "canonical mismatch");
    assertEq(_registry.numberOfVersions(), _before.versions + 1, "version count mismatch");
    assertEq(
      address(_registry.getRewardDistributor()), address(_p.NEW_REWARD_DISTRIBUTOR()), "distributor pointer mismatch"
    );
    assertTrue(_gse.isRollupRegistered(address(newRollup)), "new rollup missing from gse");
    assertEq(_gse.getLatestRollup(), address(newRollup), "gse latest mismatch");

    assertEq(_p.ASSET().balanceOf(_p.OLD_REWARD_DISTRIBUTOR()), 0, "old distributor not drained");
    assertEq(
      _p.ASSET().balanceOf(address(_p.NEW_REWARD_DISTRIBUTOR())),
      _before.newRdBalance + _before.oldRdBalance,
      "new distributor balance mismatch"
    );

    // The hatch checkpoint is keyed to the next epoch: live immediately via the latest-checkpoint
    // getter, but not active for the execution epoch itself.
    assertEq(address(newRollup.getEscapeHatch()), address(_p.ESCAPE_HATCH()), "hatch not activated");
    Epoch executionEpoch = newRollup.getCurrentEpoch();
    assertEq(address(newRollup.getEscapeHatchForEpoch(executionEpoch)), address(0), "hatch active too early");
    assertEq(
      address(newRollup.getEscapeHatchForEpoch(Epoch.wrap(Epoch.unwrap(executionEpoch) + 1))),
      address(_p.ESCAPE_HATCH()),
      "hatch not active next epoch"
    );

    if (address(_p.OLD_FLUSH_REWARDER()) != address(0)) {
      IERC20 flushAsset = _p.OLD_FLUSH_REWARDER().REWARD_ASSET();
      assertEq(_p.OLD_FLUSH_REWARDER().rewardsAvailable(), 0, "old flush rewarder rewards not migrated");
      assertEq(
        flushAsset.balanceOf(address(_p.OLD_FLUSH_REWARDER())),
        _before.oldFlushBalance - _before.flushFundsToMove,
        "old flush rewarder balance mismatch"
      );
      assertEq(
        flushAsset.balanceOf(address(_p.NEW_FLUSH_REWARDER())),
        _before.newFlushBalance + _before.flushFundsToMove,
        "new flush rewarder balance mismatch"
      );
    }

    // The GSEPayload wrapper's amIValid already enforced the follower invariant during
    // execution; re-derive it here so a regression in the wrapper is also caught.
    uint256 newEffectiveSupply = _gse.supplyOf(address(newRollup)) + _gse.supplyOf(_gse.getBonusInstanceAddress());
    assertGt(newEffectiveSupply, _gse.totalSupply() * 2 / 3, "new rollup effective supply <= 2/3");
    console.log(unicode"[assert] post execution state ✓");
  }

  function _writeDeploymentOutput() internal {
    DeployRollupLib.writeRollupAddressesToJson(vm, "v5", _rollupOutput);
    vm.serializeAddress("v5", "newRewardDistributorAddress", address(_newRewardDistributor));
    vm.serializeAddress("v5", "oldRewardDistributorAddress", _payload.OLD_REWARD_DISTRIBUTOR());
    vm.serializeAddress("v5", "escapeHatchAddress", address(_escapeHatch));
    vm.serializeAddress("v5", "oldFlushRewarderAddress", address(_payload.OLD_FLUSH_REWARDER()));
    vm.serializeAddress("v5", "newFlushRewarderAddress", address(_payload.NEW_FLUSH_REWARDER()));
    string memory finalJson = vm.serializeAddress("v5", "payloadAddress", address(_payload));
    console.log("JSON DEPLOY RESULT:", finalJson);
  }
}
