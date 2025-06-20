// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Governance, DataStructures} from "@aztec/governance/Governance.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegisterNewRollupVersionPayload} from
  "../test/governance/scenario/RegisterNewRollupVersionPayload.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Fakerollup} from "../test/governance/governance-proposer/mocks/Fakerollup.sol";
import {StakingAssetHandler} from "../src/mock/StakingAssetHandler.sol";
import {FeeAssetHandler} from "../src/mock/FeeAssetHandler.sol";
import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Forwarder} from "@aztec/periphery/Forwarder.sol";

contract Yeeter {
  function yeet(address[] memory _to, uint256[] memory _amounts) public payable {
    for (uint256 i = 0; i < _to.length; i++) {
      (bool success,) = _to[i].call{value: _amounts[i]}("");
      require(success, "Failed to yeet");
    }
  }
}

contract FunderScript is Test {
  using ProposalLib for DataStructures.Proposal;

  address internal constant ME = address(0xC374CBA3E62A8cfDf9147581f26BF4C990b499f6);

  IRegistry public constant REGISTRY = IRegistry(0x4d2cC1d5fb6BE65240e0bFC8154243e69c0Fb19E);

  Yeeter public constant YEETER = Yeeter(0x2bf60b04B521E4A434431EFBb83807425a391910);

  uint256 public constant EOA_MIN_BALANCE = 5e18;

  function getProposerEOAs() public returns (address[] memory) {
    Rollup rollup = Rollup(address(REGISTRY.getCanonicalRollup()));
    uint256 attesterCount = rollup.getActiveAttesterCount();

    emit log_named_uint("Attester count", attesterCount);

    address[] memory attesters = rollup.getAttesters();

    // Get the proposers for each attester
    address[] memory proposers = new address[](attesters.length);
    for (uint256 i = 0; i < attesters.length; i++) {
      proposers[i] = rollup.getProposerForAttester(attesters[i]);
    }

    // Get the EOA for each proposer
    address[] memory eoas = new address[](proposers.length);
    for (uint256 i = 0; i < proposers.length; i++) {
      eoas[i] = Forwarder(proposers[i]).owner();
    }

    return eoas;
  }

  function handleEOAs(bool _fund) public {
    address[] memory eoas = getProposerEOAs();

    uint256 properlyFundedCount = 0;
    uint256 underFundedCount = 0;
    uint256 fundingSpend = 0;

    address[] memory toFund = new address[](eoas.length);
    uint256[] memory amounts = new uint256[](eoas.length);

    for (uint256 i = 0; i < eoas.length; i++) {
      uint256 balance = eoas[i].balance;
      if (balance < EOA_MIN_BALANCE && eoas[i].code.length == 0) {
        emit log_named_address("Underfunded EOA", eoas[i]);
        emit log_named_decimal_uint("\tBalance", balance, 18);

        uint256 amount = EOA_MIN_BALANCE - balance;
        emit log_named_decimal_uint("\tFunding with ", amount, 18);
        fundingSpend += amount;

        toFund[underFundedCount] = eoas[i];
        amounts[underFundedCount] = amount;

        underFundedCount++;
      } else {
        properlyFundedCount++;
      }
    }

    emit log_named_uint("Properly funded EOAs", properlyFundedCount);
    emit log_named_uint("Underfunded EOAs    ", underFundedCount);
    emit log_named_decimal_uint("Funding spend", fundingSpend, 18);

    if (_fund && underFundedCount > 0) {
      address[] memory toYeet = new address[](underFundedCount);
      uint256[] memory amountsToYeet = new uint256[](underFundedCount);

      for (uint256 i = 0; i < underFundedCount; i++) {
        toYeet[i] = toFund[i];
        amountsToYeet[i] = amounts[i];
      }

      vm.broadcast(ME);
      YEETER.yeet{value: fundingSpend}(toYeet, amountsToYeet);

      // Ensure that the EOAs were funded
      for (uint256 i = 0; i < underFundedCount; i++) {
        assertEq(toFund[i].balance, EOA_MIN_BALANCE);
      }

      emit log("Funding complete");
    }
  }
}
