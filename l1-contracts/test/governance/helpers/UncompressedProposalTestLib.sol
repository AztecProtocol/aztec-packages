// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {CompressedProposal, CompressedProposalLib} from "@aztec/governance/libraries/compressed-data/Proposal.sol";
import {ProposalLib, VoteTabulationReturn, VoteTabulationInfo} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {
  Configuration,
  CompressedConfiguration,
  CompressedConfigurationLib
} from "@aztec/governance/libraries/compressed-data/Configuration.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";

contract UncompressedProposalWrapper {
  using CompressedProposalLib for CompressedProposal;
  using CompressedProposalLib for Proposal;
  using ProposalLib for CompressedProposal;
  using CompressedConfigurationLib for CompressedConfiguration;
  using CompressedConfigurationLib for Configuration;
  using ConfigurationLib for Configuration;
  using ConfigurationLib for CompressedConfiguration;

  CompressedProposal internal cp;
  CompressedConfiguration internal cc;

  function voteTabulation(Proposal memory _self, uint256 _totalPower)
    external
    returns (VoteTabulationReturn, VoteTabulationInfo)
  {
    cp = CompressedProposalLib.compress(_self);
    return cp.voteTabulation(_totalPower);
  }

  function pendingThrough(Proposal memory _self) external returns (Timestamp) {
    cp = CompressedProposalLib.compress(_self);
    return cp.pendingThrough();
  }

  function activeThrough(Proposal memory _self) external returns (Timestamp) {
    cp = CompressedProposalLib.compress(_self);
    return cp.activeThrough();
  }

  function queuedThrough(Proposal memory _self) external returns (Timestamp) {
    cp = CompressedProposalLib.compress(_self);
    return cp.queuedThrough();
  }

  function executableThrough(Proposal memory _self) external returns (Timestamp) {
    cp = CompressedProposalLib.compress(_self);
    return cp.executableThrough();
  }

  function getWithdrawalDelay(Configuration memory _self) external returns (Timestamp) {
    cc = CompressedConfigurationLib.compress(_self);
    return cc.getWithdrawalDelay();
  }
}
