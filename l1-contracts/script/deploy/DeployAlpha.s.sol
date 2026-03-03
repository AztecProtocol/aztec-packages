// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @title DeployAlpha
 * @notice Mainnet-only deployment and validation script for the alpha upgrade.
 * @dev This script is intentionally self-contained:
 * - All deployment inputs are hardcoded constants in this file.
 * - `run()` deploys verifier, rollup, escape hatch, and payload, then calls `validate(payload)`.
 * - `validate(payload)` performs strict config checks and governance execution simulation.
 *
 * Runtime requirements:
 * - `block.chainid == 1`.
 * - `DEPLOYER` must be set and correspond to the broadcast key.
 *
 * Expected usage:
 * - Preferred deployment entrypoint: `l1-contracts/scripts/run_alpha_upgrade.sh`
 *   (ensures `--verify` is always included for Etherscan verification).
 * - Deployment path (direct): `run()`.
 * - Post-deploy revalidation path: `validate(address payload)`.
 */
import {Script} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {console} from "forge-std/console.sol";

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollup, IRollupCore, GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {EthPerFeeAssetE12, EthValue} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Bps, RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {IBooster, IBoosterCore, RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {TallySlashingProposer} from "@aztec/core/slashing/TallySlashingProposer.sol";

import {GSE, IGSE, IGSECore} from "@aztec/governance/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {Configuration, IGovernance, Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";

import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";

import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

import {AlphaPayload} from "@aztec/alpha/AlphaPayload.sol";
import {HonkVerifier as RollupVerifier} from "@aztec/alpha/AlphaVerifier.sol";

contract DeployAlpha is Script, StdAssertions {
  error DeployAlpha__NotMainnet(uint256 chainId);
  error DeployAlpha__SnapshotRevertFailed(uint256 snapshotId);

  uint256 internal constant MAINNET_CHAIN_ID = 1;

  address internal constant MAINNET_REGISTRY = 0x35b22e09Ee0390539439E24f06Da43D83f90e298;
  address internal constant MAINNET_GOVERNANCE = 0x1102471Eb3378FEE427121c9EfcEa452E4B6B75e;
  address internal constant MAINNET_CANONICAL_ROLLUP = 0x603bb2c05D474794ea97805e8De69bCcFb3bCA12;
  address internal constant MAINNET_GSE = 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f;
  address internal constant MAINNET_FEE_ASSET = 0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2;
  address internal constant MAINNET_STAKING_ASSET = 0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2;
  address internal constant MAINNET_REWARD_DISTRIBUTOR = 0x3D6A1B00C830C5f278FC5dFb3f6Ff0b74Db6dfe0;
  address internal constant MAINNET_OLD_FLUSH_REWARDER = 0x7C9a7130379F1B5dd6e7A53AF84fC0fE32267B65;
  address internal constant MAINNET_REWARD_TOKEN = 0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2;

  bytes32 internal constant MAINNET_VK_TREE_ROOT = 0x1dd2644a17d1ddd8831287a78c5a1033b7ae35cdf2a3db833608856c062fc2ba;
  bytes32 internal constant MAINNET_PROTOCOL_CONTRACTS_HASH =
    0x2672340d9a0107a7b81e6d10d25b854debe613f3272e8738e8df0ca2ff297141;
  bytes32 internal constant MAINNET_GENESIS_ARCHIVE_ROOT =
    0x15684c8c3d2106918d3860f777e50555b7166adff47df13cc652e2e5a50bf5c7;

  uint256 internal constant AZTEC_SLOT_DURATION = 72;
  uint256 internal constant AZTEC_EPOCH_DURATION = 32;
  uint256 internal constant AZTEC_TARGET_COMMITTEE_SIZE = 48;
  uint256 internal constant AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET = 2;
  uint256 internal constant AZTEC_LAG_IN_EPOCHS_FOR_RANDAO = 1;
  uint256 internal constant AZTEC_INBOX_LAG = 1;
  uint256 internal constant AZTEC_PROOF_SUBMISSION_EPOCHS = 1;
  uint256 internal constant AZTEC_ACTIVATION_THRESHOLD = 200_000e18;
  uint256 internal constant AZTEC_EJECTION_THRESHOLD = 100_000e18;
  uint256 internal constant AZTEC_LOCAL_EJECTION_THRESHOLD = 190_000e18;
  uint256 internal constant AZTEC_MANA_TARGET = 75_000_000;
  uint256 internal constant AZTEC_EXIT_DELAY_SECONDS = 345_600;
  // 10 * 30$ /(150e6 * 32) / 2500$ * 1e18 = 25_000_000 wei per mana
  uint256 internal constant AZTEC_PROVING_COST_PER_MANA = 25_000_000;
  uint256 internal constant AZTEC_INITIAL_ETH_PER_FEE_ASSET = 11_729_988; // 0.000011729988 eth per aztec token

  uint256 internal constant AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS = 4;
  uint256 internal constant AZTEC_SLASHING_QUORUM = 65;
  uint256 internal constant AZTEC_SLASHING_LIFETIME_IN_ROUNDS = 34;
  uint256 internal constant AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS = 28;
  uint256 internal constant AZTEC_SLASHING_OFFSET_IN_ROUNDS = 2;
  address internal constant AZTEC_SLASHING_VETOER = 0xBbB4aF368d02827945748b28CD4b2D42e4A37480;
  uint256 internal constant AZTEC_SLASHING_DISABLE_DURATION = 259_200;
  uint256 internal constant AZTEC_SLASH_AMOUNT_SMALL = 2000e18;
  uint256 internal constant AZTEC_SLASH_AMOUNT_MEDIUM = 2000e18;
  uint256 internal constant AZTEC_SLASH_AMOUNT_LARGE = 2000e18;

  uint256 internal constant AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE = 500;
  uint256 internal constant AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE = 500;
  uint256 internal constant AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN = 1;
  uint256 internal constant AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT = 400;
  uint256 internal constant AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE = 4;

  uint16 internal constant REWARD_SEQUENCER_BPS = 7000;
  uint96 internal constant REWARD_CHECKPOINT_REWARD = 500e18;
  uint256 internal constant REWARDS_CLAIMABLE_TIMESTAMP = 0;

  // https://forum.aztec.network/t/last-resort-liveness-pricing-aztecs-escape-hatch/8427
  address internal constant ESCAPE_HATCH_BOND_TOKEN = MAINNET_STAKING_ASSET;
  uint96 internal constant ESCAPE_HATCH_BOND_SIZE = 332_000_000e18;
  uint96 internal constant ESCAPE_HATCH_WITHDRAWAL_TAX = 1_660_000e18;
  uint96 internal constant ESCAPE_HATCH_FAILED_HATCH_PUNISHMENT = 9_600_000e18;
  uint256 internal constant ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_SET_SIZE = 2;
  uint256 internal constant ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_RANDAO = 1;
  uint256 internal constant ESCAPE_HATCH_LAG_IN_HATCHES = 1;
  uint256 internal constant ESCAPE_HATCH_FREQUENCY = 112;
  uint256 internal constant ESCAPE_HATCH_ACTIVE_DURATION = 2;
  uint256 internal constant ESCAPE_HATCH_PROPOSING_EXIT_DELAY = 2_592_000; // 30 days

  bytes32 internal constant EXPECTED_HONK_VERIFIER_CREATION_HASH =
    0x5bec8ab8249c56abdb5558db3a06d01fbd598d28872da479d4ec8a924428a7ee;
  bytes32 internal constant EXPECTED_HONK_VERIFIER_RUNTIME_HASH =
    0x9a0aed515ad9e25d127fc25746b81a92701c2113f894f1122d87d32d98569e28;

  bytes32 internal constant STF_STORAGE_POSITION = keccak256("aztec.stf.storage");
  bytes32 internal constant STAKING_SLOT = keccak256("aztec.core.staking.storage");
  bytes32 internal constant VALIDATOR_SELECTION_STORAGE_POSITION = keccak256("aztec.validator_selection.storage");
  uint256 internal constant STF_VK_TREE_ROOT_SLOT_OFFSET = 3;
  uint256 internal constant STF_PROTOCOL_CONTRACTS_HASH_SLOT_OFFSET = 4;
  uint256 internal constant STF_EPOCH_PROOF_VERIFIER_SLOT_OFFSET = 7;
  uint256 internal constant STAKING_QUEUE_CONFIG_SLOT_OFFSET = 4;
  uint256 internal constant ESCAPE_HATCH_CHECKPOINTS_SLOT_OFFSET = 3;
  uint256 internal constant MASK_32BIT = 0xFFFFFFFF;

  struct SimulationSnapshot {
    address oldCanonicalRollup;
    uint256 versions;
    uint256 bonusCount;
    uint256 oldEffectiveCount;
    uint256 totalSupply;
    uint256 bonusSupply;
    uint256 oldEffectiveSupply;
    Configuration governanceConfig;
    uint256 fundsToMove;
    uint256 oldRewarderBalance;
    uint256 newRewarderBalance;
  }

  function getExpectedRuntimeHash() external returns (bytes32) {
    bytes32 val = _computeExpectedRuntimeHash();
    emit log_named_bytes32("Verifier code hash", val);
    return val;
  }

  function run() external {
    _assertMainnet();
    _assertHardcodedAddresses();

    GenesisState memory genesisState = _getGenesisState();
    RollupConfigInput memory config = _buildRollupConfiguration(IRewardDistributor(MAINNET_REWARD_DISTRIBUTOR));
    address deployer = vm.envAddress("DEPLOYER");

    vm.startBroadcast(deployer);

    IVerifier verifier = IVerifier(address(new RollupVerifier()));
    Rollup rollup = new Rollup(
      IERC20(MAINNET_FEE_ASSET),
      IERC20(MAINNET_STAKING_ASSET),
      GSE(MAINNET_GSE),
      verifier,
      address(MAINNET_GOVERNANCE),
      genesisState,
      config
    );
    IEscapeHatch escapeHatch = IEscapeHatch(
      address(
        new EscapeHatch(
          address(rollup),
          ESCAPE_HATCH_BOND_TOKEN,
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
    AlphaPayload payload = new AlphaPayload(
      IRegistry(MAINNET_REGISTRY), IInstance(address(rollup)), FlushRewarder(MAINNET_OLD_FLUSH_REWARDER), escapeHatch
    );

    vm.stopBroadcast();

    validate(payload);
    _writeOutputJson(rollup, verifier, payload, escapeHatch);

    console.log("Payload address", address(payload));
  }

  function validate(AlphaPayload _payloadToValidate) public {
    _assertMainnet();
    assertRollupConfiguration(_payloadToValidate);
    simulateExecution(_payloadToValidate);
  }

  function assertRollupConfiguration(AlphaPayload _payloadToValidate) public {
    _assertMainnet();
    console.log("[assert] rollup configuration start");
    assertNotEq(address(_payloadToValidate), address(0), "payload is zero");

    IInstance rollup = _payloadToValidate.ROLLUP();
    IRollup rollupCore = IRollup(address(rollup));
    _validateVerifierPinning();
    _validatePayloadImmutables(_payloadToValidate, rollup);
    _validatePayloadActions(_payloadToValidate);
    _validateEscapeHatchConfig(_payloadToValidate, rollup);
    _validateRollupGetterConfig(rollup);
    _validateRollupStorageConfig(rollupCore);
    _validateStakingQueueConfig(rollupCore);
    _validateSlasherStack(rollup);
    console.log(unicode"[assert] rollup configuration ✓");
  }

  function simulateExecution(AlphaPayload _payloadToValidate) public {
    _assertMainnet();
    console.log("[assert] simulate execution start");
    assertNotEq(address(_payloadToValidate), address(0), "payload is zero");

    IRegistry registry = _payloadToValidate.REGISTRY();
    Governance governance = Governance(address(_payloadToValidate.GOVERNANCE()));
    IInstance newRollup = _payloadToValidate.ROLLUP();
    FlushRewarder oldRewarder = _payloadToValidate.OLD_FLUSH_REWARDER();
    FlushRewarder newRewarder = _payloadToValidate.NEW_FLUSH_REWARDER();
    IERC20 rewardAsset = _payloadToValidate.REWARD_ASSET();
    IGSE gse = IGSE(address(newRollup.getGSE()));
    Epoch currentEpoch = newRollup.getCurrentEpoch();

    assertEq(address(newRollup.getEscapeHatch()), address(0), "sim pre escape hatch mismatch");
    assertEq(address(newRollup.getEscapeHatchForEpoch(currentEpoch)), address(0), "sim pre epoch escape hatch mismatch");
    assertEq(_getEscapeHatchCheckpointsLength(newRollup), 0, "sim pre escape hatch checkpoints mismatch");

    SimulationSnapshot memory before =
      _captureSimulationSnapshot(registry, governance, gse, oldRewarder, newRewarder, rewardAsset);
    assertEq(before.oldCanonicalRollup, MAINNET_CANONICAL_ROLLUP, "sim pre canonical mismatch");
    assertEq(address(registry.getCanonicalRollup()), before.oldCanonicalRollup, "sim pre canonical drift");
    assertEq(gse.getLatestRollup(), before.oldCanonicalRollup, "sim pre latest mismatch");
    assertFalse(gse.isRollupRegistered(address(newRollup)), "sim pre rollup already in gse");

    uint256 version = newRollup.getVersion();
    vm.expectRevert();
    registry.getRollup(version);

    uint256 snapshotId = vm.snapshotState();

    _executePayloadThroughGovernance(_payloadToValidate, registry, governance, gse, before.oldCanonicalRollup);

    _assertSimulationPostState(
      _payloadToValidate, registry, governance, gse, oldRewarder, newRewarder, rewardAsset, before
    );

    bool reverted = vm.revertToState(snapshotId);
    if (!reverted) {
      revert DeployAlpha__SnapshotRevertFailed(snapshotId);
    }
    console.log(unicode"[assert] simulate execution ✓");
  }

  function _assertMainnet() private view {
    if (block.chainid != MAINNET_CHAIN_ID) {
      revert DeployAlpha__NotMainnet(block.chainid);
    }
  }

  function _assertHardcodedAddresses() private view {
    console.log("[assert] hardcoded addresses match start");
    IRegistry registry = IRegistry(MAINNET_REGISTRY);
    IStaking canonicalRollup = IStaking(MAINNET_CANONICAL_ROLLUP);
    IRollup canonicalRollupWithFees = IRollup(MAINNET_CANONICAL_ROLLUP);

    assertEq(registry.getGovernance(), MAINNET_GOVERNANCE, "governance mismatch");
    assertEq(address(registry.getCanonicalRollup()), MAINNET_CANONICAL_ROLLUP, "canonical rollup mismatch");
    assertEq(address(registry.getRewardDistributor()), MAINNET_REWARD_DISTRIBUTOR, "reward distributor mismatch");
    assertEq(address(canonicalRollup.getGSE()), MAINNET_GSE, "gse mismatch");
    assertEq(address(canonicalRollupWithFees.getFeeAsset()), MAINNET_FEE_ASSET, "fee asset mismatch");
    assertEq(address(canonicalRollup.getStakingAsset()), MAINNET_STAKING_ASSET, "staking asset mismatch");
    assertEq(address(FlushRewarder(MAINNET_OLD_FLUSH_REWARDER).REWARD_ASSET()), MAINNET_REWARD_TOKEN, "token mismatch");
    console.log(unicode"[assert] hardcoded addresses match ✓");
  }

  function _buildRollupConfiguration(IRewardDistributor rewardDistributor)
    private
    pure
    returns (RollupConfigInput memory)
  {
    uint256 slashingRoundSize = AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS * AZTEC_EPOCH_DURATION;

    RollupConfigInput memory config = RollupConfigInput({
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      aztecEpochDuration: AZTEC_EPOCH_DURATION,
      targetCommitteeSize: AZTEC_TARGET_COMMITTEE_SIZE,
      lagInEpochsForValidatorSet: AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET,
      lagInEpochsForRandao: AZTEC_LAG_IN_EPOCHS_FOR_RANDAO,
      aztecProofSubmissionEpochs: AZTEC_PROOF_SUBMISSION_EPOCHS,
      slashingQuorum: AZTEC_SLASHING_QUORUM,
      slashingRoundSize: slashingRoundSize,
      slashingLifetimeInRounds: AZTEC_SLASHING_LIFETIME_IN_ROUNDS,
      slashingExecutionDelayInRounds: AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS,
      slashAmounts: [AZTEC_SLASH_AMOUNT_SMALL, AZTEC_SLASH_AMOUNT_MEDIUM, AZTEC_SLASH_AMOUNT_LARGE],
      slashingOffsetInRounds: AZTEC_SLASHING_OFFSET_IN_ROUNDS,
      slasherFlavor: SlasherFlavor.TALLY,
      slashingVetoer: AZTEC_SLASHING_VETOER,
      slashingDisableDuration: AZTEC_SLASHING_DISABLE_DURATION,
      manaTarget: AZTEC_MANA_TARGET,
      exitDelaySeconds: AZTEC_EXIT_DELAY_SECONDS,
      version: 0,
      provingCostPerMana: EthValue.wrap(AZTEC_PROVING_COST_PER_MANA),
      initialEthPerFeeAsset: EthPerFeeAssetE12.wrap(AZTEC_INITIAL_ETH_PER_FEE_ASSET),
      rewardConfig: _getRewardConfiguration(rewardDistributor),
      rewardBoostConfig: _getRewardBoostConfiguration(),
      stakingQueueConfig: _getStakingQueueConfiguration(),
      localEjectionThreshold: AZTEC_LOCAL_EJECTION_THRESHOLD,
      earliestRewardsClaimableTimestamp: Timestamp.wrap(REWARDS_CLAIMABLE_TIMESTAMP),
      inboxLag: AZTEC_INBOX_LAG
    });

    config.version = _computeConfigVersion(config, _getGenesisState());
    return config;
  }

  function _getRewardConfiguration(IRewardDistributor rewardDistributor) private pure returns (RewardConfig memory) {
    return RewardConfig({
      rewardDistributor: rewardDistributor,
      sequencerBps: Bps.wrap(REWARD_SEQUENCER_BPS),
      booster: IBoosterCore(address(0)),
      checkpointReward: REWARD_CHECKPOINT_REWARD
    });
  }

  function _getRewardBoostConfiguration() private pure returns (RewardBoostConfig memory) {
    return RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000});
  }

  function _getStakingQueueConfiguration() private pure returns (StakingQueueConfig memory) {
    return StakingQueueConfig({
      bootstrapValidatorSetSize: AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE,
      bootstrapFlushSize: AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE,
      normalFlushSizeMin: AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN,
      normalFlushSizeQuotient: AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT,
      maxQueueFlushSize: AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE
    });
  }

  function _getGenesisState() private pure returns (GenesisState memory) {
    return GenesisState({
      vkTreeRoot: MAINNET_VK_TREE_ROOT,
      protocolContractsHash: MAINNET_PROTOCOL_CONTRACTS_HASH,
      genesisArchiveRoot: MAINNET_GENESIS_ARCHIVE_ROOT
    });
  }

  function _computeConfigVersion(RollupConfigInput memory config, GenesisState memory genesisState)
    private
    pure
    returns (uint32)
  {
    bytes32 hash = keccak256(abi.encode(config, genesisState));
    return uint32(bytes4(hash));
  }

  function _computeExpectedRuntimeHash() private returns (bytes32) {
    return address(new RollupVerifier()).codehash;
  }

  function _validateVerifierPinning() private returns (bytes32 expectedRuntimeHash) {
    console.log("[assert] verifier pinning start");
    assertEq(
      keccak256(type(RollupVerifier).creationCode),
      EXPECTED_HONK_VERIFIER_CREATION_HASH,
      "bad verifier creation code hash"
    );
    expectedRuntimeHash = _computeExpectedRuntimeHash();
    assertEq(expectedRuntimeHash, EXPECTED_HONK_VERIFIER_RUNTIME_HASH, "bad runtime hash constant");
    console.log(unicode"[assert] verifier pinning ✓");
  }

  function _validatePayloadImmutables(AlphaPayload _payloadToValidate, IInstance instance) private view {
    console.log("[assert] payload immutables start");
    FlushRewarder oldRewarder = _payloadToValidate.OLD_FLUSH_REWARDER();
    FlushRewarder newRewarder = _payloadToValidate.NEW_FLUSH_REWARDER();
    IERC20 rewardAsset = _payloadToValidate.REWARD_ASSET();

    assertEq(address(_payloadToValidate.REGISTRY()), MAINNET_REGISTRY, "payload registry mismatch");
    assertEq(address(_payloadToValidate.GOVERNANCE()), MAINNET_GOVERNANCE, "payload governance mismatch");
    assertEq(address(_payloadToValidate.ROLLUP()), address(instance), "payload rollup mismatch");
    assertNotEq(address(instance), MAINNET_CANONICAL_ROLLUP, "payload rollup already canonical");
    assertNotEq(address(_payloadToValidate.ESCAPE_HATCH()), address(0), "payload escape hatch missing");
    assertEq(address(oldRewarder), MAINNET_OLD_FLUSH_REWARDER, "payload old rewarder mismatch");
    assertEq(address(rewardAsset), MAINNET_REWARD_TOKEN, "payload reward asset mismatch");
    assertEq(address(oldRewarder.REWARD_ASSET()), MAINNET_REWARD_TOKEN, "old rewarder asset mismatch");
    assertEq(Ownable(address(oldRewarder)).owner(), MAINNET_GOVERNANCE, "old rewarder owner mismatch");
    assertEq(address(oldRewarder.ROLLUP()), MAINNET_CANONICAL_ROLLUP, "old rewarder rollup mismatch");

    assertNotEq(address(newRewarder), address(oldRewarder), "rewarder alias mismatch");
    assertEq(Ownable(address(newRewarder)).owner(), MAINNET_GOVERNANCE, "new rewarder owner mismatch");
    assertEq(address(newRewarder.ROLLUP()), address(instance), "new rewarder rollup mismatch");
    assertEq(address(newRewarder.REWARD_ASSET()), address(oldRewarder.REWARD_ASSET()), "new rewarder asset mismatch");
    assertEq(newRewarder.rewardPerInsertion(), oldRewarder.rewardPerInsertion(), "new rewarder rate mismatch");
    assertEq(rewardAsset.balanceOf(address(newRewarder)), 0, "new rewarder unexpectedly funded");
    assertGt(bytes(_payloadToValidate.getURI()).length, 0, "payload uri empty");
    console.log(unicode"[assert] payload immutables ✓");
  }

  function _validatePayloadActions(AlphaPayload _payloadToValidate) private view {
    console.log("[assert] payload actions start");
    IPayload.Action[] memory actions = _payloadToValidate.getActions();
    assertEq(actions.length, 6, "payload action count mismatch");

    bytes memory expectedAddRegistry =
      abi.encodeWithSelector(IRegistry.addRollup.selector, address(_payloadToValidate.ROLLUP()));
    assertEq(actions[0].target, address(_payloadToValidate.REGISTRY()), "action0 target mismatch");
    assertEq(keccak256(actions[0].data), keccak256(expectedAddRegistry), "action0 data mismatch");

    bytes memory expectedAddGse =
      abi.encodeWithSelector(IGSECore.addRollup.selector, address(_payloadToValidate.ROLLUP()));
    assertEq(actions[1].target, address(_payloadToValidate.ROLLUP().getGSE()), "action1 target mismatch");
    assertEq(keccak256(actions[1].data), keccak256(expectedAddGse), "action1 data mismatch");

    Configuration memory config = _payloadToValidate.GOVERNANCE().getConfiguration();
    config.executionDelay = Timestamp.wrap(30 days);
    bytes memory expectedConfig = abi.encodeWithSelector(IGovernance.updateConfiguration.selector, config);
    bytes memory expectedSetRewardsClaimable = abi.encodeWithSelector(IRollupCore.setRewardsClaimable.selector, true);
    assertEq(actions[2].target, address(_payloadToValidate.ROLLUP()), "action2 target mismatch");
    assertEq(keccak256(actions[2].data), keccak256(expectedSetRewardsClaimable), "action2 data mismatch");

    bytes memory expectedUpdateEscapeHatch = abi.encodeWithSelector(
      IValidatorSelectionCore.updateEscapeHatch.selector, address(_payloadToValidate.ESCAPE_HATCH())
    );
    assertEq(actions[3].target, address(_payloadToValidate.ROLLUP()), "action3 target mismatch");
    assertEq(keccak256(actions[3].data), keccak256(expectedUpdateEscapeHatch), "action3 data mismatch");

    bytes memory expectedRecover = abi.encodeWithSelector(
      FlushRewarder.recover.selector,
      address(_payloadToValidate.REWARD_ASSET()),
      address(_payloadToValidate.NEW_FLUSH_REWARDER()),
      _payloadToValidate.OLD_FLUSH_REWARDER().rewardsAvailable()
    );
    assertEq(actions[4].target, address(_payloadToValidate.OLD_FLUSH_REWARDER()), "action4 target mismatch");
    assertEq(keccak256(actions[4].data), keccak256(expectedRecover), "action4 data mismatch");

    assertEq(actions[5].target, address(_payloadToValidate.GOVERNANCE()), "action5 target mismatch");
    assertEq(keccak256(actions[5].data), keccak256(expectedConfig), "action5 data mismatch");
    console.log(unicode"[assert] payload actions ✓");
  }

  function _validateEscapeHatchConfig(AlphaPayload _payloadToValidate, IInstance instance) private view {
    console.log("[assert] escape hatch config start");
    EscapeHatch escapeHatch = EscapeHatch(address(_payloadToValidate.ESCAPE_HATCH()));

    assertEq(escapeHatch.getRollup(), address(instance), "escape hatch rollup mismatch");
    assertEq(escapeHatch.getBondToken(), ESCAPE_HATCH_BOND_TOKEN, "escape hatch bond token mismatch");
    assertEq(escapeHatch.getBondSize(), ESCAPE_HATCH_BOND_SIZE, "escape hatch bond size mismatch");
    assertEq(escapeHatch.getWithdrawalTax(), ESCAPE_HATCH_WITHDRAWAL_TAX, "escape hatch withdrawal tax mismatch");
    assertEq(
      escapeHatch.getFailedHatchPunishment(),
      ESCAPE_HATCH_FAILED_HATCH_PUNISHMENT,
      "escape hatch failed punishment mismatch"
    );
    assertEq(escapeHatch.getFrequency(), ESCAPE_HATCH_FREQUENCY, "escape hatch frequency mismatch");
    assertEq(escapeHatch.getActiveDuration(), ESCAPE_HATCH_ACTIVE_DURATION, "escape hatch active duration mismatch");
    assertEq(escapeHatch.getLagInHatches(), ESCAPE_HATCH_LAG_IN_HATCHES, "escape hatch lag in hatches mismatch");
    assertEq(
      escapeHatch.getProposingExitDelay(),
      ESCAPE_HATCH_PROPOSING_EXIT_DELAY,
      "escape hatch proposing exit delay mismatch"
    );
    assertEq(
      escapeHatch.LAG_IN_EPOCHS_FOR_SET_SIZE(),
      ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_SET_SIZE,
      "escape hatch lag in epochs for set size mismatch"
    );
    assertEq(
      escapeHatch.LAG_IN_EPOCHS_FOR_RANDAO(),
      ESCAPE_HATCH_LAG_IN_EPOCHS_FOR_RANDAO,
      "escape hatch lag in epochs for randao mismatch"
    );
    assertEq(escapeHatch.getCandidateCount(), 0, "escape hatch candidate count mismatch");
    console.log(unicode"[assert] escape hatch config ✓");
  }

  function _validateRollupGetterConfig(IInstance rollup) private view {
    console.log("[assert] rollup getter config start");
    IRollup rollupCore = IRollup(address(rollup));
    RollupConfigInput memory expectedConfig = _buildRollupConfiguration(IRewardDistributor(MAINNET_REWARD_DISTRIBUTOR));
    RewardConfig memory rewardConfig = rollupCore.getRewardConfig();
    assertNotEq(address(rewardConfig.booster), address(0), "booster missing");
    IBooster booster = IBooster(address(rewardConfig.booster));
    RewardBoostConfig memory boostConfig = booster.getConfig();

    assertEq(Ownable(address(rollup)).owner(), MAINNET_GOVERNANCE, "rollup owner mismatch");
    assertEq(address(rollupCore.getFeeAsset()), MAINNET_FEE_ASSET, "rollup fee asset mismatch");
    assertEq(address(rollup.getStakingAsset()), MAINNET_STAKING_ASSET, "rollup staking asset mismatch");
    assertEq(rollup.getActivationThreshold(), AZTEC_ACTIVATION_THRESHOLD, "activation threshold mismatch");
    assertEq(rollup.getEjectionThreshold(), AZTEC_EJECTION_THRESHOLD, "ejection threshold mismatch");
    assertEq(address(rollup.getGSE()), MAINNET_GSE, "rollup gse mismatch");
    assertEq(address(rollupCore.getRewardDistributor()), MAINNET_REWARD_DISTRIBUTOR, "rollup distributor mismatch");
    assertEq(rollup.getSlotDuration(), AZTEC_SLOT_DURATION, "slot duration mismatch");
    assertEq(rollup.getEpochDuration(), AZTEC_EPOCH_DURATION, "epoch duration mismatch");
    assertEq(rollupCore.getProofSubmissionEpochs(), AZTEC_PROOF_SUBMISSION_EPOCHS, "proof epochs mismatch");
    assertEq(rollup.getTargetCommitteeSize(), AZTEC_TARGET_COMMITTEE_SIZE, "committee size mismatch");
    assertEq(rollup.getLagInEpochsForValidatorSet(), AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET, "validator lag mismatch");
    assertEq(rollup.getLagInEpochsForRandao(), AZTEC_LAG_IN_EPOCHS_FOR_RANDAO, "randao lag mismatch");
    assertEq(rollupCore.getManaTarget(), AZTEC_MANA_TARGET, "mana target mismatch");
    assertEq(
      EthValue.unwrap(rollupCore.getProvingCostPerManaInEth()), AZTEC_PROVING_COST_PER_MANA, "proving cost mismatch"
    );
    assertEq(
      EthPerFeeAssetE12.unwrap(rollupCore.getEthPerFeeAsset()), AZTEC_INITIAL_ETH_PER_FEE_ASSET, "eth per fee mismatch"
    );
    assertEq(Timestamp.unwrap(rollup.getExitDelay()), AZTEC_EXIT_DELAY_SECONDS, "exit delay mismatch");
    assertEq(rollup.getLocalEjectionThreshold(), AZTEC_LOCAL_EJECTION_THRESHOLD, "ejection threshold mismatch");
    assertEq(address(rewardConfig.rewardDistributor), MAINNET_REWARD_DISTRIBUTOR, "reward distributor config mismatch");
    assertEq(Bps.unwrap(rewardConfig.sequencerBps), REWARD_SEQUENCER_BPS, "sequencer bps mismatch");
    assertEq(rewardConfig.checkpointReward, REWARD_CHECKPOINT_REWARD, "checkpoint reward mismatch");
    assertEq(boostConfig.increment, 125_000, "boost increment mismatch");
    assertEq(boostConfig.maxScore, 15_000_000, "boost max score mismatch");
    assertEq(boostConfig.a, 1000, "boost a mismatch");
    assertEq(boostConfig.minimum, 100_000, "boost minimum mismatch");
    assertEq(boostConfig.k, 1_000_000, "boost k mismatch");
    assertEq(
      Timestamp.unwrap(rollupCore.getEarliestRewardsClaimableTimestamp()),
      REWARDS_CLAIMABLE_TIMESTAMP,
      "earliest reward mismatch"
    );
    assertFalse(rollupCore.isRewardsClaimable(), "rewards unexpectedly claimable before payload execution");
    assertEq(Inbox(address(rollupCore.getInbox())).LAG(), AZTEC_INBOX_LAG, "inbox lag mismatch");
    assertNotEq(address(rollupCore.getInbox()), address(0), "inbox missing");
    assertNotEq(address(rollupCore.getOutbox()), address(0), "outbox missing");
    assertEq(Inbox(address(rollupCore.getInbox())).ROLLUP(), address(rollup), "inbox rollup mismatch");
    assertEq(Inbox(address(rollupCore.getInbox())).VERSION(), expectedConfig.version, "inbox version mismatch");
    assertEq(
      Inbox(address(rollupCore.getInbox())).FEE_ASSET_PORTAL(),
      address(rollupCore.getFeeAssetPortal()),
      "portal mismatch"
    );
    assertEq(address(Outbox(address(rollupCore.getOutbox())).ROLLUP()), address(rollup), "outbox rollup mismatch");
    assertEq(Outbox(address(rollupCore.getOutbox())).VERSION(), expectedConfig.version, "outbox version mismatch");
    assertEq(rollupCore.getVersion(), expectedConfig.version, "rollup version mismatch");
    assertEq(rollupCore.archiveAt(0), MAINNET_GENESIS_ARCHIVE_ROOT, "genesis archive mismatch");
    assertEq(rollupCore.getBurnAddress(), address(bytes20("CUAUHXICALLI")), "burn address mismatch");
    assertFalse(rollup.getIsBootstrapped(), "rollup bootstrapped unexpectedly");
    console.log(unicode"[assert] rollup getter config ✓");
  }

  function _validateRollupStorageConfig(IRollup rollup) private view {
    console.log("[assert] rollup storage config start");
    uint256 stfBase = uint256(STF_STORAGE_POSITION);
    bytes32 vkTreeRootSlot = vm.load(address(rollup), bytes32(stfBase + STF_VK_TREE_ROOT_SLOT_OFFSET));
    bytes32 protocolContractsHashSlot =
      vm.load(address(rollup), bytes32(stfBase + STF_PROTOCOL_CONTRACTS_HASH_SLOT_OFFSET));
    bytes32 verifierSlot = vm.load(address(rollup), bytes32(stfBase + STF_EPOCH_PROOF_VERIFIER_SLOT_OFFSET));
    address verifierAddress = address(uint160(uint256(verifierSlot)));

    assertEq(vkTreeRootSlot, MAINNET_VK_TREE_ROOT, "vk tree root mismatch");
    assertEq(protocolContractsHashSlot, MAINNET_PROTOCOL_CONTRACTS_HASH, "protocol contracts hash mismatch");
    assertNotEq(verifierAddress, address(0), "verifier address missing");
    assertEq(verifierAddress.codehash, EXPECTED_HONK_VERIFIER_RUNTIME_HASH, "verifier runtime mismatch");
    console.log(unicode"[assert] rollup storage config ✓");
  }

  function _validateStakingQueueConfig(IRollup rollup) private view {
    console.log("[assert] staking queue config start");
    uint256 stakingBase = uint256(STAKING_SLOT);
    uint256 packed = uint256(vm.load(address(rollup), bytes32(stakingBase + STAKING_QUEUE_CONFIG_SLOT_OFFSET)));
    uint256 bootstrapValidatorSetSize = (packed >> 128) & MASK_32BIT;
    uint256 bootstrapFlushSize = (packed >> 96) & MASK_32BIT;
    uint256 normalFlushSizeMin = (packed >> 64) & MASK_32BIT;
    uint256 normalFlushSizeQuotient = (packed >> 32) & MASK_32BIT;
    uint256 maxQueueFlushSize = packed & MASK_32BIT;

    assertEq(
      bootstrapValidatorSetSize, AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE, "queue bootstrap validator mismatch"
    );
    assertEq(bootstrapFlushSize, AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE, "queue bootstrap flush mismatch");
    assertEq(normalFlushSizeMin, AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN, "queue normal min mismatch");
    assertEq(normalFlushSizeQuotient, AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT, "queue normal quotient mismatch");
    assertEq(maxQueueFlushSize, AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE, "queue max flush mismatch");
    console.log(unicode"[assert] staking queue config ✓");
  }

  function _getEscapeHatchCheckpointsLength(IInstance instance) private view returns (uint256) {
    uint256 validatorSelectionBase = uint256(VALIDATOR_SELECTION_STORAGE_POSITION);
    bytes32 len = vm.load(address(instance), bytes32(validatorSelectionBase + ESCAPE_HATCH_CHECKPOINTS_SLOT_OFFSET));
    return uint256(len);
  }

  function _validateSlasherStack(IInstance instance) private view {
    console.log("[assert] slasher stack start");
    address slasherAddress = instance.getSlasher();
    Slasher slasher = Slasher(slasherAddress);
    address proposerAddress = slasher.PROPOSER();
    TallySlashingProposer proposer = TallySlashingProposer(proposerAddress);

    assertNotEq(slasherAddress, address(0), "slasher missing");
    assertEq(slasher.GOVERNANCE(), MAINNET_GOVERNANCE, "slasher governance mismatch");
    assertEq(slasher.VETOER(), AZTEC_SLASHING_VETOER, "slasher vetoer mismatch");
    assertEq(slasher.SLASHING_DISABLE_DURATION(), AZTEC_SLASHING_DISABLE_DURATION, "slasher disable mismatch");
    assertNotEq(proposerAddress, address(0), "slasher proposer missing");
    assertEq(uint256(proposer.SLASHING_PROPOSER_TYPE()), uint256(SlasherFlavor.TALLY), "slasher flavor mismatch");
    assertEq(proposer.INSTANCE(), address(instance), "proposer instance mismatch");
    assertEq(address(proposer.SLASHER()), slasherAddress, "proposer slasher mismatch");
    assertEq(proposer.QUORUM(), AZTEC_SLASHING_QUORUM, "proposer quorum mismatch");
    assertEq(
      proposer.ROUND_SIZE(), AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS * AZTEC_EPOCH_DURATION, "proposer round mismatch"
    );
    assertEq(proposer.ROUND_SIZE_IN_EPOCHS(), AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS, "proposer epoch round mismatch");
    assertEq(proposer.LIFETIME_IN_ROUNDS(), AZTEC_SLASHING_LIFETIME_IN_ROUNDS, "proposer lifetime mismatch");
    assertEq(
      proposer.EXECUTION_DELAY_IN_ROUNDS(),
      AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS,
      "proposer execution delay mismatch"
    );
    assertEq(proposer.SLASH_OFFSET_IN_ROUNDS(), AZTEC_SLASHING_OFFSET_IN_ROUNDS, "proposer slash offset mismatch");
    assertEq(proposer.SLASH_AMOUNT_SMALL(), AZTEC_SLASH_AMOUNT_SMALL, "proposer slash small mismatch");
    assertEq(proposer.SLASH_AMOUNT_MEDIUM(), AZTEC_SLASH_AMOUNT_MEDIUM, "proposer slash medium mismatch");
    assertEq(proposer.SLASH_AMOUNT_LARGE(), AZTEC_SLASH_AMOUNT_LARGE, "proposer slash large mismatch");
    assertEq(proposer.COMMITTEE_SIZE(), AZTEC_TARGET_COMMITTEE_SIZE, "proposer committee size mismatch");
    console.log(unicode"[assert] slasher stack ✓");
  }

  function _captureSimulationSnapshot(
    IRegistry registry,
    IGovernance governance,
    IGSE gse,
    FlushRewarder oldRewarder,
    FlushRewarder newRewarder,
    IERC20 rewardAsset
  ) private view returns (SimulationSnapshot memory snap) {
    Timestamp ts = Timestamp.wrap(block.timestamp);
    address oldCanonicalRollup = address(registry.getCanonicalRollup());
    address bonusInstance = gse.getBonusInstanceAddress();

    snap.oldCanonicalRollup = oldCanonicalRollup;
    snap.versions = registry.numberOfVersions();
    snap.bonusCount = gse.getAttesterCountAtTime(bonusInstance, ts);
    snap.oldEffectiveCount = gse.getAttesterCountAtTime(oldCanonicalRollup, ts);
    snap.totalSupply = gse.totalSupply();
    snap.bonusSupply = gse.supplyOf(bonusInstance);
    snap.oldEffectiveSupply = gse.supplyOf(oldCanonicalRollup) + snap.bonusSupply;
    snap.governanceConfig = governance.getConfiguration();
    snap.fundsToMove = oldRewarder.rewardsAvailable();
    snap.oldRewarderBalance = rewardAsset.balanceOf(address(oldRewarder));
    snap.newRewarderBalance = rewardAsset.balanceOf(address(newRewarder));
  }

  function _validateGsePayloadWrapper(AlphaPayload payload, GSEPayload gsePayload) private view {
    IPayload.Action[] memory payloadActions = payload.getActions();
    IPayload.Action[] memory wrappedActions = gsePayload.getActions();
    assertEq(wrappedActions.length, payloadActions.length + 1, "sim wrapped action count mismatch");

    for (uint256 i = 0; i < payloadActions.length; i++) {
      assertEq(wrappedActions[i].target, payloadActions[i].target, "sim wrapped target mismatch");
      assertEq(keccak256(wrappedActions[i].data), keccak256(payloadActions[i].data), "sim wrapped data mismatch");
    }

    uint256 terminalIndex = wrappedActions.length - 1;
    assertEq(wrappedActions[terminalIndex].target, address(gsePayload), "sim wrapped terminal target mismatch");
    assertEq(
      keccak256(wrappedActions[terminalIndex].data),
      keccak256(abi.encodeWithSelector(GSEPayload.amIValid.selector)),
      "sim wrapped terminal data mismatch"
    );
  }

  function _executePayloadThroughGovernance(
    AlphaPayload payload,
    IRegistry registry,
    Governance governance,
    IGSE gse,
    address oldCanonicalRollup
  ) private {
    GSEPayload gsePayload = new GSEPayload(IPayload(address(payload)), gse, registry);
    _validateGsePayloadWrapper(payload, gsePayload);

    vm.prank(governance.governanceProposer());
    uint256 proposalId = governance.propose(IPayload(address(gsePayload)));

    Proposal memory proposal = governance.getProposal(proposalId);
    assertEq(
      uint256(governance.getProposalState(proposalId)), uint256(ProposalState.Pending), "sim proposal not pending"
    );
    assertEq(proposal.proposer, governance.governanceProposer(), "sim proposal proposer mismatch");
    assertEq(address(proposal.payload), address(gsePayload), "sim proposal payload mismatch");
    assertEq(
      address(GSEPayload(address(proposal.payload)).getOriginalPayload()),
      address(payload),
      "sim proposal original mismatch"
    );

    Timestamp pendingThrough = _pendingThrough(proposal);
    Timestamp activeThrough = _activeThrough(proposal);
    Timestamp queuedThrough = _queuedThrough(proposal);

    vm.warp(Timestamp.unwrap(pendingThrough) + 1);
    assertEq(uint256(governance.getProposalState(proposalId)), uint256(ProposalState.Active), "sim proposal not active");

    uint256 oldRollupVoteAmount = gse.getVotingPowerAt(oldCanonicalRollup, pendingThrough);
    if (oldRollupVoteAmount > 0) {
      vm.prank(oldCanonicalRollup);
      gse.vote(proposalId, oldRollupVoteAmount, true);
    }

    uint256 bonusVoteAmount = gse.getVotingPowerAt(gse.getBonusInstanceAddress(), pendingThrough);
    if (bonusVoteAmount > 0) {
      vm.prank(oldCanonicalRollup);
      gse.voteWithBonus(proposalId, bonusVoteAmount, true);
    }

    vm.warp(Timestamp.unwrap(activeThrough) + 1);
    assertEq(uint256(governance.getProposalState(proposalId)), uint256(ProposalState.Queued), "sim proposal not queued");

    vm.warp(Timestamp.unwrap(queuedThrough) + 1);
    assertEq(
      uint256(governance.getProposalState(proposalId)), uint256(ProposalState.Executable), "sim proposal not executable"
    );

    governance.execute(proposalId);
    assertEq(
      uint256(governance.getProposalState(proposalId)), uint256(ProposalState.Executed), "sim proposal not executed"
    );
  }

  function _assertSimulationPostState(
    AlphaPayload payload,
    IRegistry registry,
    IGovernance governance,
    IGSE gse,
    FlushRewarder oldRewarder,
    FlushRewarder newRewarder,
    IERC20 rewardAsset,
    SimulationSnapshot memory before
  ) private view {
    console.log("[assert] post execution state start");
    assertNotEq(before.oldCanonicalRollup, address(payload.ROLLUP()), "sim old/new rollup alias");
    assertEq(address(registry.getCanonicalRollup()), address(payload.ROLLUP()), "sim canonical mismatch");
    assertNotEq(address(registry.getCanonicalRollup()), before.oldCanonicalRollup, "sim canonical unchanged");
    assertEq(gse.getLatestRollup(), address(registry.getCanonicalRollup()), "sim canonical/latest mismatch");

    {
      uint256 versionsAfter = registry.numberOfVersions();
      assertEq(versionsAfter, before.versions + 1, "sim versions mismatch");

      uint256 newVersion = payload.ROLLUP().getVersion();
      assertEq(registry.getVersion(before.versions), newVersion, "sim latest version mismatch");
      assertEq(address(registry.getRollup(newVersion)), address(payload.ROLLUP()), "sim version mapping mismatch");
    }

    assertEq(gse.getLatestRollup(), address(payload.ROLLUP()), "sim gse latest mismatch");
    assertTrue(gse.isRollupRegistered(before.oldCanonicalRollup), "sim old gse rollup missing");
    assertTrue(gse.isRollupRegistered(address(payload.ROLLUP())), "sim new gse rollup missing");
    assertTrue(IRollup(address(payload.ROLLUP())).isRewardsClaimable(), "sim rewards not claimable");
    _assertEscapeHatchPostState(payload);

    _assertGseFollowerStateAfterSimulation(payload, gse, before);

    _assertGovernanceConfigurationAfterSimulation(before.governanceConfig, governance.getConfiguration());
    _assertRewardMigrationAfterSimulation(oldRewarder, newRewarder, rewardAsset, before);
    console.log(unicode"[assert] post execution state ✓");
  }

  function _assertEscapeHatchPostState(AlphaPayload payload) private view {
    assertEq(address(payload.ROLLUP().getEscapeHatch()), address(payload.ESCAPE_HATCH()), "sim escape hatch mismatch");

    Epoch executionEpoch = payload.ROLLUP().getCurrentEpoch();
    assertEq(
      address(payload.ROLLUP().getEscapeHatchForEpoch(executionEpoch)),
      address(0),
      "sim current epoch escape hatch mismatch"
    );

    Epoch nextEpoch = Epoch.wrap(Epoch.unwrap(executionEpoch) + 1);
    assertEq(
      address(payload.ROLLUP().getEscapeHatchForEpoch(nextEpoch)),
      address(payload.ESCAPE_HATCH()),
      "sim next epoch escape hatch mismatch"
    );
    assertEq(_getEscapeHatchCheckpointsLength(payload.ROLLUP()), 1, "sim escape hatch checkpoints mismatch");
  }

  function _assertGseFollowerStateAfterSimulation(AlphaPayload payload, IGSE gse, SimulationSnapshot memory before)
    private
    view
  {
    address bonusInstance = gse.getBonusInstanceAddress();
    Timestamp postTs = Timestamp.wrap(block.timestamp);
    uint256 bonusAfter = gse.getAttesterCountAtTime(bonusInstance, postTs);
    uint256 oldEffectiveAfter = gse.getAttesterCountAtTime(before.oldCanonicalRollup, postTs);
    uint256 newEffectiveAfter = gse.getAttesterCountAtTime(address(payload.ROLLUP()), postTs);
    uint256 totalSupplyAfter = gse.totalSupply();
    uint256 bonusSupplyAfter = gse.supplyOf(bonusInstance);
    uint256 oldSupplyAfter = gse.supplyOf(before.oldCanonicalRollup);
    uint256 newSupplyAfter = gse.supplyOf(address(payload.ROLLUP()));
    uint256 newEffectiveSupplyAfter = newSupplyAfter + bonusSupplyAfter;

    assertEq(newEffectiveAfter, bonusAfter, "sim new effective mismatch");
    assertEq(bonusAfter, before.bonusCount, "sim bonus count mismatch");
    assertEq(before.oldEffectiveCount, oldEffectiveAfter + before.bonusCount, "sim old effective mismatch");
    assertEq(totalSupplyAfter, before.totalSupply, "sim total supply mismatch");
    assertEq(bonusSupplyAfter, before.bonusSupply, "sim bonus supply mismatch");
    assertEq(before.oldEffectiveSupply, oldSupplyAfter + before.bonusSupply, "sim old effective supply mismatch");
    assertEq(newSupplyAfter, 0, "sim new direct supply mismatch");
    assertEq(newEffectiveSupplyAfter, before.bonusSupply, "sim new effective supply mismatch");
    assertGt(newEffectiveSupplyAfter, totalSupplyAfter * 2 / 3, "sim effective supply <= 2/3");
  }

  function _pendingThrough(Proposal memory proposal) private pure returns (Timestamp) {
    return Timestamp.wrap(Timestamp.unwrap(proposal.creation) + Timestamp.unwrap(proposal.config.votingDelay));
  }

  function _activeThrough(Proposal memory proposal) private pure returns (Timestamp) {
    return
      Timestamp.wrap(Timestamp.unwrap(_pendingThrough(proposal)) + Timestamp.unwrap(proposal.config.votingDuration));
  }

  function _queuedThrough(Proposal memory proposal) private pure returns (Timestamp) {
    return Timestamp.wrap(Timestamp.unwrap(_activeThrough(proposal)) + Timestamp.unwrap(proposal.config.executionDelay));
  }

  function _assertGovernanceConfigurationAfterSimulation(
    Configuration memory beforeConfig,
    Configuration memory afterConfig
  ) private pure {
    console.log("[assert] governance config after simulation start");
    assertEq(Timestamp.unwrap(afterConfig.executionDelay), 30 days, "sim execution delay mismatch");
    assertEq(
      Timestamp.unwrap(beforeConfig.votingDelay), Timestamp.unwrap(afterConfig.votingDelay), "sim voting delay mismatch"
    );
    assertEq(
      Timestamp.unwrap(beforeConfig.votingDuration),
      Timestamp.unwrap(afterConfig.votingDuration),
      "sim voting duration mismatch"
    );
    assertEq(
      Timestamp.unwrap(beforeConfig.gracePeriod), Timestamp.unwrap(afterConfig.gracePeriod), "sim grace mismatch"
    );
    assertEq(beforeConfig.quorum, afterConfig.quorum, "sim quorum mismatch");
    assertEq(beforeConfig.requiredYeaMargin, afterConfig.requiredYeaMargin, "sim yea margin mismatch");
    assertEq(beforeConfig.minimumVotes, afterConfig.minimumVotes, "sim minimum votes mismatch");
    assertEq(
      Timestamp.unwrap(beforeConfig.proposeConfig.lockDelay),
      Timestamp.unwrap(afterConfig.proposeConfig.lockDelay),
      "sim lock delay mismatch"
    );
    assertEq(beforeConfig.proposeConfig.lockAmount, afterConfig.proposeConfig.lockAmount, "sim lock amount mismatch");
    console.log(unicode"[assert] governance config after simulation ✓");
  }

  function _assertRewardMigrationAfterSimulation(
    FlushRewarder oldRewarder,
    FlushRewarder newRewarder,
    IERC20 rewardAsset,
    SimulationSnapshot memory before
  ) private view {
    console.log("[assert] reward migration after simulation start");
    uint256 oldRewarderBalanceAfter = rewardAsset.balanceOf(address(oldRewarder));
    uint256 newRewarderBalanceAfter = rewardAsset.balanceOf(address(newRewarder));

    assertNotEq(address(oldRewarder), address(newRewarder), "sim rewarder alias mismatch");
    assertEq(Ownable(address(oldRewarder)).owner(), MAINNET_GOVERNANCE, "sim old rewarder owner mismatch");
    assertEq(Ownable(address(newRewarder)).owner(), MAINNET_GOVERNANCE, "sim new rewarder owner mismatch");
    assertEq(
      oldRewarderBalanceAfter, before.oldRewarderBalance - before.fundsToMove, "sim old rewarder balance mismatch"
    );
    assertEq(
      newRewarderBalanceAfter, before.newRewarderBalance + before.fundsToMove, "sim new rewarder balance mismatch"
    );
    assertEq(oldRewarder.rewardsAvailable(), 0, "sim old rewardsAvailable mismatch");
    assertEq(newRewarder.rewardsAvailable(), before.fundsToMove, "sim new rewardsAvailable mismatch");
    assertEq(newRewarder.rewardPerInsertion(), oldRewarder.rewardPerInsertion(), "sim reward rate mismatch");
    console.log(unicode"[assert] reward migration after simulation ✓");
  }

  function _writeOutputJson(Rollup rollup, IVerifier verifier, AlphaPayload payload, IEscapeHatch escapeHatch) private {
    string memory key = "alpha";
    vm.serializeAddress(key, "rollupAddress", address(rollup));
    vm.serializeAddress(key, "verifierAddress", address(verifier));
    vm.serializeAddress(key, "payloadAddress", address(payload));
    vm.serializeAddress(key, "newFlushRewarderAddress", address(payload.NEW_FLUSH_REWARDER()));
    vm.serializeAddress(key, "escapeHatchAddress", address(escapeHatch));
    vm.serializeAddress(key, "oldFlushRewarderAddress", MAINNET_OLD_FLUSH_REWARDER);
    vm.serializeAddress(key, "registryAddress", MAINNET_REGISTRY);
    string memory finalJson = vm.serializeAddress(key, "governanceAddress", MAINNET_GOVERNANCE);
    console.log("JSON DEPLOY RESULT:", finalJson);
  }
}
