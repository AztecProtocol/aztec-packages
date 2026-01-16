// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetDepositMerkleRootTest is StakingAssetHandlerBase {
  bytes32 internal newRoot = bytes32(uint256(0x123456789abcdef));

  function test_WhenCallerOfSetDepositMerkleRootIsNotOwner(address _caller) external {
    // it reverts

    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setDepositMerkleRoot(newRoot);
  }

  function test_WhenCallerOfSetDepositMerkleRootIsOwner() external {
    // it sets the deposit merkle root
    // it emits a {DepositMerkleRootUpdated} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.DepositMerkleRootUpdated(newRoot);
    stakingAssetHandler.setDepositMerkleRoot(newRoot);

    assertEq(stakingAssetHandler.depositMerkleRoot(), newRoot);
  }
}
