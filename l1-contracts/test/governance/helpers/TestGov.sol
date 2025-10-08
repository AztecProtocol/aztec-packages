// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Governance} from "@aztec/governance/Governance.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Configuration} from "@aztec/governance/interfaces/IGovernance.sol";

contract TestGov is Governance {
  constructor(IERC20 _asset, address _governanceProposer, address _beneficiary, Configuration memory _configuration)
    Governance(_asset, _governanceProposer, _beneficiary, _configuration)
  {}

  function test__overrideQuorum(uint256 _id, uint64 _quorum) external {
    proposals[_id].quorum = _quorum;
  }
}
