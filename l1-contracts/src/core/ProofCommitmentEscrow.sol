// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

contract ProofCommitmentEscrow is IProofCommitmentEscrow {
  using SafeERC20 for IERC20;

  struct WithdrawRequest {
    uint256 amount;
    Timestamp executableAt;
  }

  uint256 public immutable WITHDRAW_DELAY;

  address public immutable ROLLUP;
  IERC20 public immutable TOKEN;

  mapping(address => uint256) public deposits;
  mapping(address => WithdrawRequest) public withdrawRequests;

  modifier onlyRollup() {
    require(msg.sender == ROLLUP, Errors.ProofCommitmentEscrow__NotOwner(msg.sender));
    _;
  }

  constructor(
    IERC20 _token,
    address _rollup,
    uint256 _aztecSlotDuration,
    uint256 _aztecEpochDuration
  ) {
    ROLLUP = _rollup;
    TOKEN = _token;
    WITHDRAW_DELAY = _aztecSlotDuration * _aztecEpochDuration;
  }

  /**
   * @notice  Deposit TOKENs into the escrow
   *
   * @dev     The caller must have approved the TOKEN transfer
   *
   * @param _amount The amount of TOKENs to deposit
   */
  function deposit(uint256 _amount) external override(IProofCommitmentEscrow) {
    TOKEN.safeTransferFrom(msg.sender, address(this), _amount);

    deposits[msg.sender] += _amount;

    emit Deposit(msg.sender, _amount);
  }

  /**
   * @notice  Start a withdrawal request
   *
   * @dev     The caller must have sufficient balance
   *          The withdrawal request will be executable after a delay
   *          Subsequent calls to this function will overwrite the previous request
   *
   * @param _amount - The amount of TOKENs to withdraw
   */
  function startWithdraw(uint256 _amount) external override(IProofCommitmentEscrow) {
    require(
      deposits[msg.sender] >= _amount,
      Errors.ProofCommitmentEscrow__InsufficientBalance(deposits[msg.sender], _amount)
    );

    withdrawRequests[msg.sender] = WithdrawRequest({
      amount: _amount,
      executableAt: Timestamp.wrap(block.timestamp + WITHDRAW_DELAY)
    });

    emit StartWithdraw(msg.sender, _amount, withdrawRequests[msg.sender].executableAt);
  }

  /**
   * @notice Execute a mature withdrawal request
   */
  function executeWithdraw() external override(IProofCommitmentEscrow) {
    WithdrawRequest memory request = withdrawRequests[msg.sender];
    require(
      request.executableAt <= Timestamp.wrap(block.timestamp),
      Errors.ProofCommitmentEscrow__WithdrawRequestNotReady(block.timestamp, request.executableAt)
    );

    delete withdrawRequests[msg.sender];
    deposits[msg.sender] -= request.amount;
    TOKEN.safeTransfer(msg.sender, request.amount);

    emit ExecuteWithdraw(msg.sender, request.amount);
  }

  /**
   * @notice  Stake an amount of previously deposited TOKENs
   *
   * @dev     Only callable by the owner
   *          The prover must have sufficient balance
   *          The prover's balance will be reduced by the bond amount
   */
  function stakeBond(address _prover, uint256 _amount)
    external
    override(IProofCommitmentEscrow)
    onlyRollup
  {
    deposits[_prover] -= _amount;

    emit StakeBond(_prover, _amount);
  }

  /**
   * @notice  Unstake the bonded TOKENs, returning them to the prover
   *
   * @dev     Only callable by the owner
   */
  function unstakeBond(address _prover, uint256 _amount)
    external
    override(IProofCommitmentEscrow)
    onlyRollup
  {
    deposits[_prover] += _amount;

    emit UnstakeBond(_prover, _amount);
  }

  function token() external view override(IProofCommitmentEscrow) returns (IERC20) {
    return TOKEN;
  }

  /**
   * @notice  Get the minimum balance of a prover at a given timestamp.
   *
   * @dev     Returns 0 if the timestamp is beyond the WITHDRAW_DELAY from the current block timestamp
   *
   * @param _timestamp The timestamp at which to check the balance
   * @param _prover The address of the prover
   *
   * @return  The balance of the prover at the given timestamp, compensating for withdrawal requests that have matured by that time
   */
  function minBalanceAtTime(Timestamp _timestamp, address _prover)
    external
    view
    override(IProofCommitmentEscrow)
    returns (uint256)
  {
    // If the timestamp is beyond the WITHDRAW_DELAY, the minimum possible balance is 0;
    // the prover could issue a withdraw request in this block for the full amount,
    // and execute it exactly WITHDRAW_DELAY later.
    if (_timestamp >= Timestamp.wrap(block.timestamp + WITHDRAW_DELAY)) {
      return 0;
    }

    uint256 balance = deposits[_prover];
    if (withdrawRequests[_prover].executableAt <= _timestamp) {
      balance -= withdrawRequests[_prover].amount;
    }
    return balance;
  }
}
