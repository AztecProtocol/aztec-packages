// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {EthValue, EthPerFeeAssetE12} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {RewardConfig, Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";

interface IRollupConfiguration {
  function loadConfig() external;
  function useRealVerifier() external view returns (bool);
  function getFeeJuicePortalInitialBalance() external view returns (uint256);
  function getGenesisState() external view returns (GenesisState memory);
  function getRewardConfiguration(IRewardDistributor rewardDistributor) external view returns (RewardConfig memory);
  function getRewardBoostConfiguration() external pure returns (RewardBoostConfig memory);
  function getStakingQueueConfiguration() external view returns (StakingQueueConfig memory);
  function getRollupConfiguration(IRewardDistributor rewardDistributor) external view returns (RollupConfigInput memory);
  function parseValidators() external view returns (CheatDepositArgs[] memory);
}

contract RollupConfiguration is IRollupConfiguration, Test {
  using stdJson for string;

  // Storage for loaded config
  string public networkName;
  string internal validatorsJson;

  function loadConfig() external {
    networkName = vm.envOr("NETWORK", string("local"));
    validatorsJson = vm.envOr("INITIAL_VALIDATORS", string("[]"));
  }

  function useRealVerifier() external view returns (bool) {
    return vm.envOr("REAL_VERIFIER", false);
  }

  function getFeeJuicePortalInitialBalance() external view returns (uint256) {
    return vm.envOr("FEE_JUICE_PORTAL_INITIAL_BALANCE", uint256(0));
  }

  function getGenesisState() external view returns (GenesisState memory) {
    return GenesisState({
      vkTreeRoot: bytes32(vm.envOr("VK_TREE_ROOT", uint256(0))),
      protocolContractsHash: bytes32(vm.envOr("PROTOCOL_CONTRACTS_HASH", uint256(0))),
      genesisArchiveRoot: bytes32(vm.envOr("GENESIS_ARCHIVE_ROOT", uint256(0)))
    });
  }

  function getRewardConfiguration(IRewardDistributor _rewardDistributor) external pure returns (RewardConfig memory) {
    uint16 sequencerBps;
    uint96 checkpointReward;
    sequencerBps = 7000;
    checkpointReward = 500e18;

    return RewardConfig({
      rewardDistributor: _rewardDistributor,
      sequencerBps: Bps.wrap(sequencerBps),
      // NOTE(AD): This matches the previous iteration of deployments that were in typescript. We always deploys a new
      // reward booster.
      booster: IBoosterCore(address(0)),
      checkpointReward: checkpointReward
    });
  }

  function getRewardBoostConfiguration() external pure returns (RewardBoostConfig memory) {
    // AZIP-5: https://github.com/AztecProtocol/governance/pull/14
    return RewardBoostConfig({increment: 101_400, maxScore: 367_500, a: 250_000, minimum: 10_000, k: 1_000_000});
  }

  function getStakingQueueConfiguration() external view returns (StakingQueueConfig memory) {
    return StakingQueueConfig({
      bootstrapValidatorSetSize: vm.envOr("AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE", uint256(0)),
      bootstrapFlushSize: vm.envOr("AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE", uint256(0)),
      normalFlushSizeMin: vm.envOr("AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN", uint256(48)),
      normalFlushSizeQuotient: vm.envOr("AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT", uint256(2)),
      maxQueueFlushSize: vm.envOr("AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE", uint256(48))
    });
  }

  function getRollupConfiguration(IRewardDistributor _rewardDistributor)
    public
    view
    returns (RollupConfigInput memory)
  {
    RollupConfigInput memory config = _getBaseRollupConfiguration();
    config.rewardConfig = this.getRewardConfiguration(_rewardDistributor);
    config.rewardBoostConfig = this.getRewardBoostConfiguration();
    config.stakingQueueConfig = this.getStakingQueueConfiguration();

    // Compute version as first 4 bytes of hash(abi.encode(config, genesisState))
    config.version = _computeConfigVersion(config, this.getGenesisState());

    return config;
  }

  function _getBaseRollupConfiguration() private view returns (RollupConfigInput memory config) {
    uint256 aztecEpochDuration = vm.envUint("AZTEC_EPOCH_DURATION");
    uint256 slashingRoundSize = vm.envUint("AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS") * aztecEpochDuration;

    config.aztecSlotDuration = vm.envUint("AZTEC_SLOT_DURATION");
    config.aztecEpochDuration = aztecEpochDuration;
    config.targetCommitteeSize = vm.envUint("AZTEC_TARGET_COMMITTEE_SIZE");
    config.lagInEpochsForValidatorSet = vm.envUint("AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET");
    config.lagInEpochsForRandao = vm.envUint("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO");
    config.inboxLag = vm.envUint("AZTEC_INBOX_LAG");
    config.aztecProofSubmissionEpochs = vm.envUint("AZTEC_PROOF_SUBMISSION_EPOCHS");
    config.localEjectionThreshold = vm.envUint("AZTEC_LOCAL_EJECTION_THRESHOLD");
    config.slashingQuorum = vm.envOr("AZTEC_SLASHING_QUORUM", slashingRoundSize / 2 + 1);
    config.slashingRoundSize = slashingRoundSize;
    config.slashingLifetimeInRounds = vm.envUint("AZTEC_SLASHING_LIFETIME_IN_ROUNDS");
    config.slashingExecutionDelayInRounds = vm.envUint("AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS");
    config.slashAmounts = _getSlashAmounts();
    config.slashingOffsetInRounds = _getSlashingOffset();
    config.slasherEnabled = vm.envOr("AZTEC_SLASHER_ENABLED", true);
    config.slashingVetoer = vm.envAddress("AZTEC_SLASHING_VETOER");
    config.slashingDisableDuration = vm.envUint("AZTEC_SLASHING_DISABLE_DURATION");
    config.manaTarget = vm.envUint("AZTEC_MANA_TARGET");
    config.exitDelaySeconds = vm.envUint("AZTEC_EXIT_DELAY_SECONDS");
    config.version = 0; // Computed below
    config.provingCostPerMana = EthValue.wrap(vm.envUint("AZTEC_PROVING_COST_PER_MANA"));
    config.initialEthPerFeeAsset = EthPerFeeAssetE12.wrap(vm.envUint("AZTEC_INITIAL_ETH_PER_FEE_ASSET"));
  }

  /// @notice Compute rollup config version by hashing config + genesis state
  /// @dev Version is the first 4 bytes (uint32) of keccak256(abi.encode(rollupConfig, genesisState))
  ///      This DOES NOT match the TS implementation: keccak256(jsonStringify({rollupConfigArgs, genesisStateArgs}))
  function _computeConfigVersion(RollupConfigInput memory _config, GenesisState memory _genesisState)
    private
    pure
    returns (uint32)
  {
    bytes32 hash = keccak256(abi.encode(_config, _genesisState));
    // Extract first 4 bytes as uint32 (big-endian)
    // Casting to bytes4 is intentional because the config version is defined as the first 4 bytes of the hash.
    // forge-lint: disable-next-line(unsafe-typecast)
    return uint32(bytes4(hash));
  }

  function _getSlashingOffset() private view returns (uint256) {
    return vm.envUint("AZTEC_SLASHING_OFFSET_IN_ROUNDS");
  }

  function _getSlashAmounts() private view returns (uint256[3] memory) {
    return [
      vm.envUint("AZTEC_SLASH_AMOUNT_SMALL"),
      vm.envUint("AZTEC_SLASH_AMOUNT_MEDIUM"),
      vm.envUint("AZTEC_SLASH_AMOUNT_LARGE")
    ];
  }

  function parseValidators() external view returns (CheatDepositArgs[] memory) {
    uint256 count = _countValidators();
    if (count == 0) {
      return new CheatDepositArgs[](0);
    }

    CheatDepositArgs[] memory validators = new CheatDepositArgs[](count);
    for (uint256 i = 0; i < count; i++) {
      validators[i] = _parseValidator(i);
    }
    return validators;
  }

  // ============ Validator Parsing (from INITIAL_VALIDATORS env var JSON) ============
  // TODO(AD): Is there anything less clumsy possible here?
  // TODO(AD): but test-only code...
  function _countValidators() private view returns (uint256 count) {
    while (validatorsJson.keyExists(string.concat("[", vm.toString(count), "]"))) {
      count++;
    }
  }

  function _parseValidator(uint256 i) private view returns (CheatDepositArgs memory) {
    string memory basePath = string.concat("[", vm.toString(i), "]");
    (G1Point memory pubKeyG1, G1Point memory pop) = _computeG1Points(basePath);

    return CheatDepositArgs({
      attester: validatorsJson.readAddress(string.concat(basePath, ".attester")),
      withdrawer: validatorsJson.readAddress(string.concat(basePath, ".withdrawer")),
      publicKeyInG2: _parseG2Point(basePath),
      publicKeyInG1: pubKeyG1,
      proofOfPossession: pop
    });
  }

  function _computeG1Points(string memory basePath) private view returns (G1Point memory, G1Point memory) {
    uint256 privateKey = validatorsJson.readUint(string.concat(basePath, ".privateKey"));
    G1Point memory pubKeyG1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), privateKey);
    G1Point memory pop = BN254Lib.g1Mul(BN254Lib.g1ToDigestPoint(pubKeyG1), privateKey);
    return (pubKeyG1, pop);
  }

  function _parseG2Point(string memory basePath) private view returns (G2Point memory) {
    return G2Point({
      x0: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.x0")),
      x1: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.x1")),
      y0: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.y0")),
      y1: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.y1"))
    });
  }
}
