// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {ProofCommitmentEscrow} from "@aztec/core/ProofCommitmentEscrow.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

import {TestERC20} from "../TestERC20.sol";

// solhint-disable comprehensive-interface

contract TestProofCommitmentEscrow is Test {
  ProofCommitmentEscrow internal _escrow;
  TestERC20 internal _token;
  address internal prover;
  uint256 internal depositAmount;

  modifier setup() {
    _token = new TestERC20();
    _escrow = new ProofCommitmentEscrow(_token, address(this));
    _;
  }

  modifier setupWithApproval(address _prover, uint256 _depositAmount) {
    _token = new TestERC20();
    _escrow = new ProofCommitmentEscrow(_token, address(this));

    _token.mint(_prover, _depositAmount);
    vm.prank(_prover);
    _token.approve(address(_escrow), _depositAmount);

    prover = _prover;
    depositAmount = _depositAmount;
    _;
  }

  function testDeposit() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    _escrow.deposit(depositAmount);

    assertEq(
      _token.balanceOf(address(_escrow)),
      depositAmount,
      "Escrow balance should match deposit amount"
    );
    assertEq(_token.balanceOf(prover), 0, "Prover balance should be 0 after deposit");
  }

  function testCannotWithdrawWithoutMatureRequest() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    _escrow.deposit(depositAmount);
    uint256 withdrawReadyAt = block.timestamp + _escrow.WITHDRAW_DELAY();

    _mintAndDeposit(prover, depositAmount);

    vm.prank(prover);
    _escrow.startWithdraw(depositAmount);

    vm.prank(prover);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ProofCommitmentEscrow__WithdrawRequestNotReady.selector,
        block.timestamp,
        withdrawReadyAt
      )
    );
    _escrow.executeWithdraw();

    vm.warp(block.timestamp + _escrow.WITHDRAW_DELAY() - 1);
    vm.prank(prover);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ProofCommitmentEscrow__WithdrawRequestNotReady.selector,
        block.timestamp,
        withdrawReadyAt
      )
    );
    _escrow.executeWithdraw();
  }

  function testWithdrawAfterDelay() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    _escrow.deposit(depositAmount);
    uint256 withdrawAmount = 50;
    uint256 withdrawReadyAt = block.timestamp + _escrow.WITHDRAW_DELAY();

    _mintAndDeposit(prover, depositAmount);

    vm.prank(prover);
    _escrow.startWithdraw(withdrawAmount);

    vm.warp(withdrawReadyAt);

    vm.prank(prover);
    _escrow.executeWithdraw();

    assertEq(
      _token.balanceOf(address(_escrow)),
      depositAmount - withdrawAmount,
      "Escrow balance should be reduced after withdrawal"
    );
    assertEq(_token.balanceOf(prover), withdrawAmount, "Prover balance should match deposit amount");
  }

  function testCannotReplayWithdrawRequest() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    _escrow.deposit(depositAmount);
    uint256 withdrawAmount = 50;
    uint256 withdrawReadyAt = block.timestamp + _escrow.WITHDRAW_DELAY();

    _mintAndDeposit(prover, depositAmount);

    vm.prank(prover);
    _escrow.startWithdraw(withdrawAmount);
    vm.warp(withdrawReadyAt);

    vm.prank(prover);
    _escrow.executeWithdraw();

    vm.prank(prover);
    _escrow.executeWithdraw();

    assertEq(
      _token.balanceOf(address(_escrow)),
      depositAmount - withdrawAmount,
      "Escrow balance should be reduced after withdrawal"
    );
  }

  function testOnlyOwnerCanStake(address nonOwner) public setup {
    vm.assume(nonOwner != address(this));
    vm.prank(nonOwner);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.ProofCommitmentEscrow__NotOwner.selector, nonOwner)
    );
    _escrow.stakeBond(0, address(0));
  }

  function testCannotStakeMoreThanProverBalance() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    _escrow.deposit(depositAmount);
    uint256 stakeAmount = depositAmount + 1;

    _mintAndDeposit(prover, depositAmount);

    vm.expectRevert();
    _escrow.stakeBond(stakeAmount, prover);

    assertEq(
      _token.balanceOf(address(_escrow)),
      depositAmount,
      "Escrow balance should match deposit amount"
    );
    assertEq(_escrow.deposits(prover), depositAmount, "Prover balance should match deposit amount");
  }

  function testOnlyOwnerCanUnstake(address nonOwner) public setup {
    vm.assume(nonOwner != address(this));
    vm.prank(nonOwner);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.ProofCommitmentEscrow__NotOwner.selector, nonOwner)
    );
    _escrow.unstakeBond();
  }

  function testStakeAndUnstake() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    _escrow.deposit(depositAmount);
    uint256 stakeAmount = 50;

    _mintAndDeposit(prover, depositAmount);

    _escrow.stakeBond(stakeAmount, prover);

    assertEq(
      _escrow.deposits(prover), depositAmount - stakeAmount, "Prover balance should be reduced"
    );

    _escrow.unstakeBond();

    assertEq(
      _escrow.deposits(prover), depositAmount, "Prover balance should be restored after unstake"
    );
  }

  function testOverwritingStakeSlashesPreviousProver() public setup {
    address proverA = address(42);
    address proverB = address(43);
    uint256 depositAmountA = 100;
    uint256 stakeAmountA = 50;
    uint256 depositAmountB = 200;
    uint256 stakeAmountB = 100;

    _token.mint(proverA, depositAmountA);
    vm.prank(proverA);
    _token.approve(address(_escrow), depositAmountA);
    vm.prank(proverA);
    _escrow.deposit(depositAmountA);

    _token.mint(proverB, depositAmountB);
    vm.prank(proverB);
    _token.approve(address(_escrow), depositAmountB);
    vm.prank(proverB);
    _escrow.deposit(depositAmountB);

    // Prover A deposits and is staked
    _escrow.stakeBond(stakeAmountA, proverA);

    // Prover B deposits and owner overwrites the stake
    _escrow.stakeBond(stakeAmountB, proverB);

    // Prover A cannot recover the staked amount
    uint256 expectedDepositA = depositAmountA - stakeAmountA;
    assertEq(
      _escrow.deposits(proverA),
      expectedDepositA,
      "Prover A's deposit should reflect the slashed stake"
    );

    // Owner cannot unstake Prover A's stake anymore
    _escrow.unstakeBond();
    assertEq(
      _escrow.deposits(proverB),
      depositAmountB,
      "Prover B's deposit should be restored after unstake"
    );
    assertEq(
      _escrow.deposits(proverA),
      expectedDepositA,
      "Prover A's deposit remains slashed after unstake"
    );
  }

  function testWithdrawRequestOverwriting() public setupWithApproval(address(42), 100) {
    uint256 withdrawAmountA = 40;
    uint256 withdrawAmountB = 60;
    uint256 withdrawReadyAtA = block.timestamp + _escrow.WITHDRAW_DELAY();
    uint256 withdrawReadyAtB = block.timestamp + 2 * _escrow.WITHDRAW_DELAY();

    vm.prank(prover);
    _escrow.deposit(depositAmount);

    // Prover starts first withdraw request
    vm.prank(prover);
    _escrow.startWithdraw(withdrawAmountA);

    // Prover starts second withdraw request before executing first
    vm.warp(withdrawReadyAtA);

    vm.prank(prover);
    _escrow.startWithdraw(withdrawAmountB);

    // Attempt to execute first withdraw request after its delay
    vm.prank(prover);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ProofCommitmentEscrow__WithdrawRequestNotReady.selector,
        withdrawReadyAtA,
        withdrawReadyAtB
      )
    );
    _escrow.executeWithdraw();

    // Execute second withdraw request after its delay
    vm.warp(withdrawReadyAtB);
    vm.prank(prover);
    _escrow.executeWithdraw();

    // Assert
    assertEq(
      _escrow.deposits(prover),
      depositAmount - withdrawAmountB,
      "Prover's deposit should be reduced by the withdrawn amount"
    );
  }

  function testMinBalanceAtSlot() public setupWithApproval(address(42), 100) {
    uint256 withdrawAmount = 25;
    Timestamp withdrawReadyAt = Timestamp.wrap(block.timestamp + _escrow.WITHDRAW_DELAY());

    vm.prank(prover);
    _escrow.deposit(depositAmount);

    assertEq(
      _escrow.minBalanceAtTime(Timestamp.wrap(block.timestamp), prover),
      depositAmount,
      "Min balance should match deposit amount before any withdraw request"
    );

    assertEq(
      _escrow.minBalanceAtTime(withdrawReadyAt - Timestamp.wrap(1), prover),
      depositAmount,
      "Min balance should match deposit amount before withdraw request matures"
    );

    vm.prank(prover);
    _escrow.startWithdraw(withdrawAmount);

    assertEq(
      _escrow.minBalanceAtTime(Timestamp.wrap(block.timestamp), prover),
      depositAmount,
      "Min balance should be unaffected by pending withdraw request before maturity"
    );

    assertEq(
      _escrow.minBalanceAtTime(Timestamp.wrap(block.timestamp + _escrow.WITHDRAW_DELAY()), prover),
      0,
      "Min balance should be 0 at or beyond the delay window"
    );

    vm.warp(block.timestamp + 1);

    assertEq(
      _escrow.minBalanceAtTime(withdrawReadyAt, prover),
      depositAmount - withdrawAmount,
      "Min balance should be 75 after withdraw request matures"
    );

    assertEq(
      _escrow.minBalanceAtTime(withdrawReadyAt + Timestamp.wrap(1), prover),
      0,
      "Min balance should be 0 at or beyond the delay window"
    );
  }

  function _mintAndDeposit(address _prover, uint256 _amount) internal {}
}
