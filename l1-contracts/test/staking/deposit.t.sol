// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Status, IStakingCore, AttesterView, IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {IStakingCore, Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

contract DepositTest is StakingBase {
  using stdStorage for StdStorage;

  function test_GivenCallerHasInsufficientAllowance() external {
    // it reverts

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientAllowance.selector, address(staking), 0, ACTIVATION_THRESHOLD
      )
    );

    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
  }

  modifier givenCallerHasSufficientAllowance() {
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);
    _;
  }

  function test_GivenCallerHasInsufficientFunds() external givenCallerHasSufficientAllowance {
    // it reverts

    vm.expectRevert(
      abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, ACTIVATION_THRESHOLD)
    );

    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
  }

  modifier givenCallerHasSufficientFunds() {
    mint(address(this), ACTIVATION_THRESHOLD);
    _;
  }

  function test_GivenAttesterIsAlreadyRegistered()
    external
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
  {
    // it reverts

    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    staking.flushEntryQueue();

    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), type(uint256).max);

    // Now reset the next flushable epoch to 0
    stdstore.enable_packed_slots().target(address(staking)).sig(IStaking.getNextFlushableEpoch.selector).depth(0)
      .checked_write(uint256(0));
    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });

    // The real error gets caught by the flushEntryQueue call
    // address magicAddress = address(staking.getGSE().getCanonicalMagicAddress());
    // vm.expectRevert(
    //   abi.encodeWithSelector(Errors.Staking__AlreadyRegistered.selector, magicAddress, ATTESTER)
    // );
    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.FailedDeposit(ATTESTER, WITHDRAWER, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero());
    staking.flushEntryQueue();

    vm.prank(SLASHER);
    staking.slash(ATTESTER, ACTIVATION_THRESHOLD - EJECTION_THRESHOLD + 1);
    assertEq(uint256(staking.getStatus(ATTESTER)), uint256(Status.ZOMBIE));

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, ATTESTER));
    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, WITHDRAWER);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, ATTESTER));
    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
  }

  modifier givenAttesterIsNotRegistered() {
    _;
  }

  function test_GivenAttesterIsAlreadyActive()
    external
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
    givenAttesterIsNotRegistered
  {
    // it reverts

    // This should not be possible to get to as the attester is registered until exit
    // and to exit it must already have been removed from the active set.
  }

  function test_GivenAttesterIsNotActive()
    external
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
    givenAttesterIsNotRegistered
  {
    // it adds attester to the entry queue
    // it emits a {ValidatorQueued} event

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.ValidatorQueued(ATTESTER, WITHDRAWER);

    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    // the money is in the staking contract
    assertEq(stakingAsset.balanceOf(address(staking)), ACTIVATION_THRESHOLD);
    // the money is not in the GSE
    assertEq(stakingAsset.balanceOf(address(staking.getGSE())), 0);
    // nor in governance
    assertEq(stakingAsset.balanceOf(address(staking.getGSE().getGovernance())), 0);

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0, "effective balance");
    assertTrue(attesterView.status == Status.NONE);
  }
}
