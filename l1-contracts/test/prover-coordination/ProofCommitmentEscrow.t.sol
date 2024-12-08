// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {ProofCommitmentEscrow} from "@aztec/core/ProofCommitmentEscrow.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

// solhint-disable comprehensive-interface

contract TestProofCommitmentEscrow is Test {
  // solhint-disable-next-line var-name-mixedcase
  ProofCommitmentEscrow internal ESCROW;
  // solhint-disable-next-line var-name-mixedcase
  TestERC20 internal TOKEN;
  address internal prover;
  uint256 internal depositAmount;

  modifier setupWithApproval(address _prover, uint256 _depositAmount) {
    TOKEN.mint(_prover, _depositAmount);
    vm.prank(_prover);
    TOKEN.approve(address(ESCROW), _depositAmount);

    prover = _prover;
    depositAmount = _depositAmount;
    _;
  }

  function setUp() public {
    TOKEN = new TestERC20("test", "TEST", address(this));
    ESCROW = new ProofCommitmentEscrow(
      TOKEN, address(this), TestConstants.AZTEC_SLOT_DURATION, TestConstants.AZTEC_EPOCH_DURATION
    );
  }

  function testDeposit() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    ESCROW.deposit(depositAmount);

    assertEq(
      TOKEN.balanceOf(address(ESCROW)), depositAmount, "Escrow balance should match deposit amount"
    );
    assertEq(TOKEN.balanceOf(prover), 0, "Prover balance should be 0 after deposit");
  }

  function testCannotWithdrawWithoutMatureRequest() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    ESCROW.deposit(depositAmount);
    uint256 withdrawReadyAt = block.timestamp + ESCROW.WITHDRAW_DELAY();

    vm.prank(prover);
    ESCROW.startWithdraw(depositAmount);

    vm.prank(prover);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ProofCommitmentEscrow__WithdrawRequestNotReady.selector,
        block.timestamp,
        withdrawReadyAt
      )
    );
    ESCROW.executeWithdraw();

    vm.warp(block.timestamp + ESCROW.WITHDRAW_DELAY() - 1);
    vm.prank(prover);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ProofCommitmentEscrow__WithdrawRequestNotReady.selector,
        block.timestamp,
        withdrawReadyAt
      )
    );
    ESCROW.executeWithdraw();
  }

  function testWithdrawAfterDelay() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    ESCROW.deposit(depositAmount);
    uint256 withdrawAmount = 50;
    uint256 withdrawReadyAt = block.timestamp + ESCROW.WITHDRAW_DELAY();

    vm.prank(prover);
    ESCROW.startWithdraw(withdrawAmount);

    vm.warp(withdrawReadyAt);

    vm.prank(prover);
    ESCROW.executeWithdraw();

    assertEq(
      TOKEN.balanceOf(address(ESCROW)),
      depositAmount - withdrawAmount,
      "Escrow balance should be reduced after withdrawal"
    );
    assertEq(TOKEN.balanceOf(prover), withdrawAmount, "Prover balance should match deposit amount");
  }

  function testCannotReplayWithdrawRequest(uint256 _withdrawAmount)
    public
    setupWithApproval(address(42), 100)
  {
    vm.prank(prover);
    ESCROW.deposit(depositAmount);
    uint256 withdrawAmount = bound(_withdrawAmount, 1, depositAmount);
    uint256 withdrawReadyAt = block.timestamp + ESCROW.WITHDRAW_DELAY();

    vm.prank(prover);
    ESCROW.startWithdraw(withdrawAmount);
    vm.warp(withdrawReadyAt);

    vm.prank(prover);
    ESCROW.executeWithdraw();

    vm.prank(prover);
    ESCROW.executeWithdraw();

    assertEq(
      TOKEN.balanceOf(address(ESCROW)),
      depositAmount - withdrawAmount,
      "Escrow balance should be reduced after withdrawal"
    );
  }

  function testOnlyOwnerCanStake(address nonOwner) public {
    vm.assume(nonOwner != address(this));
    vm.prank(nonOwner);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.ProofCommitmentEscrow__NotOwner.selector, nonOwner)
    );
    ESCROW.stakeBond(address(0), 0);
  }

  function testCannotStakeMoreThanProverBalance() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    ESCROW.deposit(depositAmount);
    uint256 stakeAmount = depositAmount + 1;

    vm.expectRevert();
    ESCROW.stakeBond(prover, stakeAmount);

    assertEq(
      TOKEN.balanceOf(address(ESCROW)), depositAmount, "Escrow balance should match deposit amount"
    );
    assertEq(ESCROW.deposits(prover), depositAmount, "Prover balance should match deposit amount");
  }

  function testOnlyOwnerCanUnstake(address nonOwner) public {
    vm.assume(nonOwner != address(this));
    vm.prank(nonOwner);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.ProofCommitmentEscrow__NotOwner.selector, nonOwner)
    );
    ESCROW.unstakeBond(address(0), 0);
  }

  function testStakeAndUnstake() public setupWithApproval(address(42), 100) {
    vm.prank(prover);
    ESCROW.deposit(depositAmount);
    uint256 stakeAmount = 50;

    ESCROW.stakeBond(prover, stakeAmount);

    assertEq(
      ESCROW.deposits(prover), depositAmount - stakeAmount, "Prover balance should be reduced"
    );

    ESCROW.unstakeBond(prover, stakeAmount);

    assertEq(
      ESCROW.deposits(prover), depositAmount, "Prover balance should be restored after unstake"
    );
  }

  function testOverwritingStakeSlashesPreviousProver() public {
    address proverA = address(42);
    address proverB = address(43);
    uint256 depositAmountA = 100;
    uint256 stakeAmountA = 50;
    uint256 depositAmountB = 200;
    uint256 stakeAmountB = 100;

    TOKEN.mint(proverA, depositAmountA);
    vm.prank(proverA);
    TOKEN.approve(address(ESCROW), depositAmountA);
    vm.prank(proverA);
    ESCROW.deposit(depositAmountA);

    TOKEN.mint(proverB, depositAmountB);
    vm.prank(proverB);
    TOKEN.approve(address(ESCROW), depositAmountB);
    vm.prank(proverB);
    ESCROW.deposit(depositAmountB);

    // Prover A is staked
    ESCROW.stakeBond(proverA, stakeAmountA);

    // Prover B is staked
    ESCROW.stakeBond(proverB, stakeAmountB);

    // Prover A is missing the stake
    uint256 expectedDepositA = depositAmountA - stakeAmountA;
    assertEq(
      ESCROW.deposits(proverA),
      expectedDepositA,
      "Prover A's deposit should reflect the slashed stake"
    );

    // Prover B gets unstaked
    ESCROW.unstakeBond(proverB, stakeAmountB);
    assertEq(
      ESCROW.deposits(proverB),
      depositAmountB,
      "Prover B's deposit should be restored after unstake"
    );
    assertEq(
      ESCROW.deposits(proverA), expectedDepositA, "Prover A's deposit remains slashed after unstake"
    );
  }

  function testWithdrawRequestOverwriting() public setupWithApproval(address(42), 100) {
    uint256 withdrawAmountA = 40;
    uint256 withdrawAmountB = 60;
    uint256 withdrawReadyAtA = block.timestamp + ESCROW.WITHDRAW_DELAY();
    uint256 withdrawReadyAtB = block.timestamp + 2 * ESCROW.WITHDRAW_DELAY();

    vm.prank(prover);
    ESCROW.deposit(depositAmount);

    // Prover starts first withdraw request
    vm.prank(prover);
    ESCROW.startWithdraw(withdrawAmountA);

    // Prover starts second withdraw request before executing first
    vm.warp(withdrawReadyAtA);

    vm.prank(prover);
    ESCROW.startWithdraw(withdrawAmountB);

    // Attempt to execute first withdraw request after its delay
    vm.prank(prover);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ProofCommitmentEscrow__WithdrawRequestNotReady.selector,
        withdrawReadyAtA,
        withdrawReadyAtB
      )
    );
    ESCROW.executeWithdraw();

    // Execute second withdraw request after its delay
    vm.warp(withdrawReadyAtB);
    vm.prank(prover);
    ESCROW.executeWithdraw();

    // Assert
    assertEq(
      ESCROW.deposits(prover),
      depositAmount - withdrawAmountB,
      "Prover's deposit should be reduced by the withdrawn amount"
    );
  }

  function testMinBalanceAtTime() public setupWithApproval(address(42), 100) {
    uint256 withdrawAmount = 25;
    Timestamp withdrawReadyAt = Timestamp.wrap(block.timestamp + ESCROW.WITHDRAW_DELAY());

    vm.prank(prover);
    ESCROW.deposit(depositAmount);

    assertEq(
      ESCROW.minBalanceAtTime(Timestamp.wrap(block.timestamp), prover),
      depositAmount,
      "Min balance should match deposit amount before any withdraw request"
    );

    assertEq(
      ESCROW.minBalanceAtTime(withdrawReadyAt - Timestamp.wrap(1), prover),
      depositAmount,
      "Min balance should match deposit amount before withdraw request matures"
    );

    vm.prank(prover);
    ESCROW.startWithdraw(withdrawAmount);

    assertEq(
      ESCROW.minBalanceAtTime(Timestamp.wrap(block.timestamp), prover),
      depositAmount,
      "Min balance should be unaffected by pending withdraw request before maturity"
    );

    assertEq(
      ESCROW.minBalanceAtTime(Timestamp.wrap(block.timestamp + ESCROW.WITHDRAW_DELAY()), prover),
      0,
      "Min balance should be 0 at or beyond the delay window"
    );

    vm.warp(block.timestamp + 1);

    assertEq(
      ESCROW.minBalanceAtTime(withdrawReadyAt, prover),
      depositAmount - withdrawAmount,
      "Min balance should be 75 after withdraw request matures"
    );

    assertEq(
      ESCROW.minBalanceAtTime(withdrawReadyAt + Timestamp.wrap(1), prover),
      0,
      "Min balance should be 0 at or beyond the delay window"
    );
  }
}
