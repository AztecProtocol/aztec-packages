// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Rollup} from "../harnesses/Rollup.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

contract DistributeFees is Test {
  using Hash for DataStructures.L1ToL2Msg;

  address internal constant OWNER = address(0x1);
  Registry internal registry;
  TestERC20 internal token;
  FeeJuicePortal internal feeJuicePortal;
  Rollup internal rollup;
  RewardDistributor internal rewardDistributor;

  function setUp() public {
    registry = new Registry(OWNER);
    token = new TestERC20("test", "TEST", address(this));
    feeJuicePortal =
      new FeeJuicePortal(address(registry), address(token), bytes32(Constants.FEE_JUICE_ADDRESS));
    token.mint(address(feeJuicePortal), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.initialize();

    rewardDistributor = new RewardDistributor(token, registry, address(this));
    rollup =
      new Rollup(feeJuicePortal, rewardDistributor, token, bytes32(0), bytes32(0), address(this));

    vm.prank(OWNER);
    registry.upgrade(address(rollup));
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
        IERC20Errors.ERC20InsufficientBalance.selector,
        address(feeJuicePortal),
        Constants.FEE_JUICE_INITIAL_MINT,
        Constants.FEE_JUICE_INITIAL_MINT + 1
      )
    );
    feeJuicePortal.distributeFees(address(this), Constants.FEE_JUICE_INITIAL_MINT + 1);
  }

  function test_GivenSufficientBalance(uint256 _numberOfRollups)
    external
    givenTheCallerIsTheCanonicalRollup
  {
    // it should transfer the tokens to the recipient
    // it should emit a {FeesDistributed} event

    uint256 numberOfRollups = bound(_numberOfRollups, 1, 5);
    for (uint256 i = 0; i < numberOfRollups; i++) {
      Rollup freshRollup =
        new Rollup(feeJuicePortal, rewardDistributor, token, bytes32(0), bytes32(0), address(this));
      vm.prank(OWNER);
      registry.upgrade(address(freshRollup));
    }

    assertEq(token.balanceOf(address(this)), 0);

    assertNotEq(registry.getRollup(), address(rollup));

    vm.prank(registry.getRollup());
    vm.expectEmit(true, true, true, true, address(feeJuicePortal));
    emit IFeeJuicePortal.FeesDistributed(address(this), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.distributeFees(address(this), Constants.FEE_JUICE_INITIAL_MINT);

    assertEq(token.balanceOf(address(this)), Constants.FEE_JUICE_INITIAL_MINT);
  }
}
