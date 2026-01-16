// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {
  Configuration as GovernanceConfiguration,
  ProposeWithLockConfiguration
} from "@aztec/governance/interfaces/IGovernance.sol";
import {IRollupConfiguration, RollupConfiguration, RewardConfig} from "./RollupConfiguration.sol";

struct ZkPassportConfiguration {
  string domain;
  string scope;
}

struct ProtocolTreasuryConfiguration {
  uint256 gatedUntil;
}

struct CoinIssuerConfiguration {
  uint256 coinIssuerRate;
}

struct GseConfiguration {
  uint256 activationThreshold;
  uint256 ejectionThreshold;
}

struct GovernanceProposerConfiguration {
  uint256 quorum;
  uint256 roundSize;
}

struct FlushRewardConfiguration {
  uint256 rewardPerInsertion;
  uint256 initialFundingAmount;
}

interface IDeploymentConfiguration {
  function loadConfig() external;
  function existingTokenAddress() external view returns (address);
  function rollupConfig() external view returns (IRollupConfiguration);
  function getProtocolTreasuryConfiguration() external view returns (ProtocolTreasuryConfiguration memory);
  function getCoinIssuerConfiguration() external pure returns (CoinIssuerConfiguration memory);
  function getGseConfiguration() external view returns (GseConfiguration memory);
  function getGovernanceProposerConfiguration() external view returns (GovernanceProposerConfiguration memory);
  function getGovernanceConfiguration() external view returns (GovernanceConfiguration memory);
  function getFlushRewardConfiguration() external pure returns (FlushRewardConfiguration memory);
  function getZkPassportConfiguration() external view returns (ZkPassportConfiguration memory);
  function getRewardDistributorFunding() external view returns (uint256);
}

contract DeploymentConfiguration is IDeploymentConfiguration, Test {
  // Rollup configuration component - delegates rollup-specific config
  IRollupConfiguration public rollupConfig;

  // Storage for loaded config
  string public networkName;

  function loadConfig() public {
    networkName = vm.envOr("NETWORK", string("local"));
    rollupConfig = new RollupConfiguration();
    rollupConfig.loadConfig();
  }

  function existingTokenAddress() public view returns (address) {
    return vm.envOr("EXISTING_TOKEN_ADDRESS", address(0));
  }

  function getProtocolTreasuryConfiguration() external view returns (ProtocolTreasuryConfiguration memory) {
    return ProtocolTreasuryConfiguration({gatedUntil: block.timestamp + 90 minutes});
  }

  function getCoinIssuerConfiguration() external pure returns (CoinIssuerConfiguration memory) {
    return CoinIssuerConfiguration({coinIssuerRate: 0.2e18});
  }

  function getGseConfiguration() external view returns (GseConfiguration memory) {
    return GseConfiguration({
      activationThreshold: vm.envOr("AZTEC_ACTIVATION_THRESHOLD", uint256(100e18)),
      ejectionThreshold: vm.envOr("AZTEC_EJECTION_THRESHOLD", uint256(50e18))
    });
  }

  function getGovernanceProposerConfiguration() external view returns (GovernanceProposerConfiguration memory) {
    uint256 roundSize = vm.envOr("AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE", uint256(300));
    uint256 defaultQuorum = roundSize / 2 + 1;
    return GovernanceProposerConfiguration({
      quorum: vm.envOr("AZTEC_GOVERNANCE_PROPOSER_QUORUM", defaultQuorum), roundSize: roundSize
    });
  }

  function getGovernanceConfiguration() external view returns (GovernanceConfiguration memory) {
    bytes32 h = keccak256(bytes(networkName));

    if (h == keccak256("staging-public")) {
      return GovernanceConfiguration({
        proposeConfig: ProposeWithLockConfiguration({
          lockDelay: Timestamp.wrap(60 * 60 * 24 * 30), lockAmount: 100e18 * 100
        }),
        votingDelay: Timestamp.wrap(60),
        votingDuration: Timestamp.wrap(60 * 60),
        executionDelay: Timestamp.wrap(60),
        gracePeriod: Timestamp.wrap(60 * 60 * 24 * 7),
        quorum: 0.3e18,
        requiredYeaMargin: 0.04e18,
        minimumVotes: 50_000e18 * 200
      });
    } else if (h == keccak256("testnet")) {
      return GovernanceConfiguration({
        proposeConfig: ProposeWithLockConfiguration({lockDelay: Timestamp.wrap(90 days), lockAmount: 258_750_000e18}),
        votingDelay: Timestamp.wrap(12 hours),
        votingDuration: Timestamp.wrap(1 days),
        executionDelay: Timestamp.wrap(12 hours),
        gracePeriod: Timestamp.wrap(1 days),
        quorum: 0.2e18,
        requiredYeaMargin: 0.1e18,
        minimumVotes: 48 * 200_000e18
      });
    } else if (h == keccak256("staging-ignition")) {
      return GovernanceConfiguration({
        proposeConfig: ProposeWithLockConfiguration({
          lockDelay: Timestamp.wrap(10 * 365 * 24 * 60 * 60), lockAmount: 1250 * 200_000e18
        }),
        votingDelay: Timestamp.wrap(7 * 24 * 60 * 60),
        votingDuration: Timestamp.wrap(7 * 24 * 60 * 60),
        executionDelay: Timestamp.wrap(30 * 24 * 60 * 60),
        gracePeriod: Timestamp.wrap(7 * 24 * 60 * 60),
        quorum: 0.2e18,
        requiredYeaMargin: 0.1e18,
        minimumVotes: 1250 * 200_000e18
      });
    } else if (h == keccak256("mainnet")) {
      return GovernanceConfiguration({
        proposeConfig: ProposeWithLockConfiguration({
          lockDelay: Timestamp.wrap(90 * 24 * 60 * 60), lockAmount: 258_750_000e18
        }),
        votingDelay: Timestamp.wrap(3 * 24 * 60 * 60),
        votingDuration: Timestamp.wrap(7 * 24 * 60 * 60),
        executionDelay: Timestamp.wrap(7 * 24 * 60 * 60),
        gracePeriod: Timestamp.wrap(7 * 24 * 60 * 60),
        quorum: 0.2e18,
        requiredYeaMargin: 0.33e18,
        minimumVotes: 1000 * 200_000e18
      });
    } else {
      // local, devnet, next-net
      return GovernanceConfiguration({
        proposeConfig: ProposeWithLockConfiguration({lockDelay: Timestamp.wrap(60 * 60 * 24 * 30), lockAmount: 1e24}),
        votingDelay: Timestamp.wrap(60),
        votingDuration: Timestamp.wrap(vm.envOr("AZTEC_GOVERNANCE_VOTING_DURATION", uint256(60 * 60))),
        executionDelay: Timestamp.wrap(60),
        gracePeriod: Timestamp.wrap(60 * 60 * 24 * 7),
        quorum: 0.1e18,
        requiredYeaMargin: 0.04e18,
        minimumVotes: 400e18
      });
    }
  }

  function getFlushRewardConfiguration() external pure returns (FlushRewardConfiguration memory) {
    return FlushRewardConfiguration({rewardPerInsertion: 100e18, initialFundingAmount: 1_000_000e18});
  }

  function getZkPassportConfiguration() public view returns (ZkPassportConfiguration memory) {
    return ZkPassportConfiguration({
      domain: vm.envOr("ZKPASSPORT_DOMAIN", string("sequencer.alpha-testnet.aztec.network")),
      scope: vm.envOr("ZKPASSPORT_SCOPE", string("personhood"))
    });
  }

  function getRewardDistributorFunding() external view returns (uint256) {
    // Delegated to RollupConfiguration
    RewardConfig memory rewardConfig = rollupConfig.getRewardConfiguration(IRewardDistributor(address(0)));
    return uint256(rewardConfig.checkpointReward) * 200_000;
  }
}
