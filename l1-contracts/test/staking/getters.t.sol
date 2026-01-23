// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";

contract GettersTest is StakingBase {
  function setUp() public override {
    super.setUp();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);
    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    staking.flushEntryQueue();
  }

  function test_getAttesterAtIndex() external view {
    address attester = staking.getAttesterAtIndex(0);
    assertEq(attester, ATTESTER);
  }

  function test_getAttesterOutOfBounds() external {
    vm.expectRevert();
    staking.getAttesterAtIndex(1);
  }
}
