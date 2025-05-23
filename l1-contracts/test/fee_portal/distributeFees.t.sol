// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

contract DistributeFees is Test {
  using Hash for DataStructures.L1ToL2Msg;

  address internal constant OWNER = address(0x1);
  TestERC20 internal token;
  FeeJuicePortal internal feeJuicePortal;
  Rollup internal rollup;
  RewardDistributor internal rewardDistributor;

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();

    rollup = builder.getConfig().rollup;
    token = builder.getConfig().testERC20;

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));
  }

  function test_RevertGiven_TheCallerIsNotTheCanonicalRollup() external {
    // it should revert
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeJuicePortal__Unauthorized.selector));
    feeJuicePortal.distributeFees(address(this), 1);
  }

  modifier givenTheCallerIsTheCanonicalRollup() {
    _;
  }

  function test_RevertGiven_InsufficientBalance() external givenTheCallerIsTheCanonicalRollup {
    // it should revert
    vm.prank(address(rollup));
    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientBalance.selector, address(feeJuicePortal), 0, 0 + 1
      )
    );
    feeJuicePortal.distributeFees(address(this), 1);
  }

  function test_GivenSufficientBalance() external givenTheCallerIsTheCanonicalRollup {
    // it should transfer the tokens to the recipient
    // it should emit a {FeesDistributed} event

    assertEq(token.balanceOf(address(this)), 0);

    uint256 initialBalance = 10e18;

    deal(address(token), address(feeJuicePortal), initialBalance);

    vm.prank(address(rollup));
    vm.expectEmit(true, true, true, true, address(feeJuicePortal));
    emit IFeeJuicePortal.FeesDistributed(address(this), initialBalance);
    feeJuicePortal.distributeFees(address(this), initialBalance);

    assertEq(token.balanceOf(address(this)), initialBalance);
  }
}
