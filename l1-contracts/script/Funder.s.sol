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

contract FunderScript is Test {
  using ProposalLib for DataStructures.Proposal;

  address internal constant ME = address(0xC374CBA3E62A8cfDf9147581f26BF4C990b499f6);

  IRegistry public constant REGISTRY = IRegistry(0x4d2cC1d5fb6BE65240e0bFC8154243e69c0Fb19E);

  uint256 public constant EOA_MIN_BALANCE = 1e18;

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

    for (uint256 i = 0; i < eoas.length; i++) {
      uint256 balance = eoas[i].balance;
      if (balance < EOA_MIN_BALANCE && eoas[i].code.length == 0) {
        emit log_named_address("Underfunded EOA", eoas[i]);
        emit log_named_decimal_uint("\tBalance", balance, 18);
        underFundedCount++;
        if (_fund) {
          vm.broadcast(ME);
          (bool success,) = eoas[i].call{value: EOA_MIN_BALANCE - balance}("");
          require(success, "Failed to fund EOA");
          emit log_named_decimal_uint("\tFunded with ", EOA_MIN_BALANCE - balance, 18);
        }
      } else {
        properlyFundedCount++;
      }
    }

    emit log_named_uint("Properly funded EOAs", properlyFundedCount);
    emit log_named_uint("Underfunded EOAs    ", underFundedCount);
  }
}
