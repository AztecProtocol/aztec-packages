// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {IPayload, Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract StaticTest is WithGSE {
  function test_getWithdrawer(address[2] memory _instances, address _attester, address _withdrawer) external {
    vm.assume(_instances[0] != _instances[1]);
    vm.assume(_instances[0] != address(0) && _instances[0] != gse.getBonusInstanceAddress());
    vm.assume(_instances[1] != address(0) && _instances[1] != gse.getBonusInstanceAddress());
    vm.assume(_attester != _withdrawer);

    vm.prank(gse.owner());
    gse.addRollup(_instances[0]);
    vm.prank(gse.owner());
    gse.addRollup(_instances[1]);

    // Add an attester to instance[0] specifically
    {
      cheat_deposit(_instances[0], _attester, _withdrawer, false);

      address actualWithdrawer = gse.getWithdrawer(_attester);

      assertEq(actualWithdrawer, _withdrawer, "invalid withdrawer");
    }

    // Add an attester to instance[1], but on bonus
    {
      cheat_deposit(_instances[1], _attester, _withdrawer, true);

      address actualWithdrawer = gse.getWithdrawer(_attester);

      assertEq(actualWithdrawer, _withdrawer, "invalid withdrawer");
    }

    // Withdrawer is not an attester, so should not be able to get a withdrawer
    {
      address actualWithdrawer = gse.getWithdrawer(_withdrawer);

      assertEq(actualWithdrawer, address(0), "invalid withdrawer");
    }
  }

  function test_getVotingPower(address _instance, address _attester) external {
    vm.assume(_instance != address(0) && _instance != gse.getBonusInstanceAddress());
    vm.assume(_attester != address(0) && _attester != _instance);

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    cheat_deposit(_instance, _attester, _attester, false);

    assertEq(gse.getVotingPower(_attester), 0, "invalid voting power");
    assertEq(gse.getVotingPower(_instance), gse.ACTIVATION_THRESHOLD(), "invalid voting power");
  }

  function test_getAttesterFromIndexAtTime(address _instance, address[4] memory _attesters) external {
    vm.assume(_instance != address(0) && _instance != gse.getBonusInstanceAddress());
    for (uint256 i = 0; i < _attesters.length; i++) {
      for (uint256 j = i + 1; j < _attesters.length; j++) {
        vm.assume(_attesters[i] != _attesters[j]);
      }
    }

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    Timestamp ts = Timestamp.wrap(block.timestamp);
    Timestamp ts2 = ts + Timestamp.wrap(1 days);

    cheat_deposit(_instance, _attesters[0], _attesters[0], false);
    cheat_deposit(_instance, _attesters[1], _attesters[1], true);
    vm.warp(Timestamp.unwrap(ts2));
    cheat_deposit(_instance, _attesters[2], _attesters[2], false);
    cheat_deposit(_instance, _attesters[3], _attesters[3], true);

    assertEq(gse.getAttesterFromIndexAtTime(_instance, 0, ts), _attesters[0], "invalid attester");

    // As _instance is latest, it will also get attesters[1]
    assertEq(gse.getAttesterFromIndexAtTime(_instance, 1, ts), _attesters[1], "invalid attester");

    address[] memory attesters = getAttestersAtTime(_instance, ts);
    assertEq(attesters.length, 2, "invalid attesters");
    assertEq(attesters[0], _attesters[0], "invalid attester");
    assertEq(attesters[1], _attesters[1], "invalid attester");

    // Note the indexes of this can look strange as it first the specific then the bonus
    attesters = getAttestersAtTime(_instance, ts2);
    assertEq(attesters.length, 4, "invalid attesters");
    assertEq(attesters[0], _attesters[0], "invalid attester");
    assertEq(attesters[1], _attesters[2], "invalid attester");
    assertEq(attesters[2], _attesters[1], "invalid attester");
    assertEq(attesters[3], _attesters[3], "invalid attester");
  }

  function getAttestersAtTime(address _instance, Timestamp _timestamp) internal view returns (address[] memory) {
    uint256 count = gse.getAttesterCountAtTime(_instance, _timestamp);
    address[] memory attesters = new address[](count);
    for (uint256 i = 0; i < count; i++) {
      attesters[i] = gse.getAttesterFromIndexAtTime(_instance, i, _timestamp);
    }
    return attesters;
  }
}
