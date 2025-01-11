// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  IStaking,
  ValidatorInfo,
  Exit,
  Status,
  OperatorInfo,
  StakingStorage
} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Slasher} from "@aztec/core/staking/Slasher.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";

contract Staking is IStaking {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  // Constant pulled out of the ass
  Timestamp public constant EXIT_DELAY = Timestamp.wrap(60 * 60 * 24);

  Slasher public immutable SLASHER;
  IERC20 public immutable STAKING_ASSET;
  uint256 public immutable MINIMUM_STAKE;

  StakingStorage internal stakingStore;

  constructor(
    IERC20 _stakingAsset,
    uint256 _minimumStake,
    uint256 _slashingQuorum,
    uint256 _roundSize
  ) {
    SLASHER = new Slasher(_slashingQuorum, _roundSize);
    STAKING_ASSET = _stakingAsset;
    MINIMUM_STAKE = _minimumStake;
  }

  function finaliseWithdraw(address _attester) external override(IStaking) {
    ValidatorInfo storage validator = stakingStore.info[_attester];
    require(validator.status == Status.EXITING, Errors.Staking__NotExiting(_attester));

    Exit storage exit = stakingStore.exits[_attester];
    require(
      exit.exitableAt <= Timestamp.wrap(block.timestamp),
      Errors.Staking__WithdrawalNotUnlockedYet(Timestamp.wrap(block.timestamp), exit.exitableAt)
    );

    uint256 amount = validator.stake;
    address recipient = exit.recipient;

    delete stakingStore.exits[_attester];
    delete stakingStore.info[_attester];

    STAKING_ASSET.transfer(recipient, amount);

    emit IStaking.WithdrawFinalised(_attester, recipient, amount);
  }

  function slash(address _attester, uint256 _amount) external override(IStaking) {
    require(
      msg.sender == address(SLASHER), Errors.Staking__NotSlasher(address(SLASHER), msg.sender)
    );

    ValidatorInfo storage validator = stakingStore.info[_attester];
    require(validator.status != Status.NONE, Errors.Staking__NoOneToSlash(_attester));

    // There is a special, case, if exiting and past the limit, it is untouchable!
    require(
      !(
        validator.status == Status.EXITING
          && stakingStore.exits[_attester].exitableAt <= Timestamp.wrap(block.timestamp)
      ),
      Errors.Staking__CannotSlashExitedStake(_attester)
    );
    validator.stake -= _amount;

    // If the attester was validating AND is slashed below the MINIMUM_STAKE we update him to LIVING
    // When LIVING, he can only start exiting, we don't "really" exit him, because that cost
    // gas and cost edge cases around recipient, so lets just avoid that.
    if (validator.status == Status.VALIDATING && validator.stake < MINIMUM_STAKE) {
      require(stakingStore.attesters.remove(_attester), Errors.Staking__FailedToRemove(_attester));
      validator.status = Status.LIVING;
    }

    emit Slashed(_attester, _amount);
  }

  function getInfo(address _attester)
    external
    view
    override(IStaking)
    returns (ValidatorInfo memory)
  {
    return stakingStore.info[_attester];
  }

  function getExit(address _attester) external view override(IStaking) returns (Exit memory) {
    return stakingStore.exits[_attester];
  }

  function getOperatorAtIndex(uint256 _index)
    external
    view
    override(IStaking)
    returns (OperatorInfo memory)
  {
    address attester = stakingStore.attesters.at(_index);
    return OperatorInfo({proposer: stakingStore.info[attester].proposer, attester: attester});
  }

  function deposit(address _attester, address _proposer, address _withdrawer, uint256 _amount)
    public
    virtual
    override(IStaking)
  {
    require(_amount >= MINIMUM_STAKE, Errors.Staking__InsufficientStake(_amount, MINIMUM_STAKE));
    STAKING_ASSET.transferFrom(msg.sender, address(this), _amount);
    require(
      stakingStore.info[_attester].status == Status.NONE,
      Errors.Staking__AlreadyRegistered(_attester)
    );
    require(stakingStore.attesters.add(_attester), Errors.Staking__AlreadyActive(_attester));

    // If BLS, need to check possession of private key to avoid attacks.

    stakingStore.info[_attester] = ValidatorInfo({
      stake: _amount,
      withdrawer: _withdrawer,
      proposer: _proposer,
      status: Status.VALIDATING
    });

    emit IStaking.Deposit(_attester, _proposer, _withdrawer, _amount);
  }

  function initiateWithdraw(address _attester, address _recipient)
    public
    virtual
    override(IStaking)
    returns (bool)
  {
    ValidatorInfo storage validator = stakingStore.info[_attester];

    require(
      msg.sender == validator.withdrawer,
      Errors.Staking__NotWithdrawer(validator.withdrawer, msg.sender)
    );
    require(
      validator.status == Status.VALIDATING || validator.status == Status.LIVING,
      Errors.Staking__NothingToExit(_attester)
    );
    if (validator.status == Status.VALIDATING) {
      require(stakingStore.attesters.remove(_attester), Errors.Staking__FailedToRemove(_attester));
    }

    // Note that the "amount" is not stored here, but reusing the `validators`
    // We always exit fully.
    stakingStore.exits[_attester] =
      Exit({exitableAt: Timestamp.wrap(block.timestamp) + EXIT_DELAY, recipient: _recipient});
    validator.status = Status.EXITING;

    emit IStaking.WithdrawInitiated(_attester, _recipient, validator.stake);

    return true;
  }

  function getActiveAttesterCount() public view override(IStaking) returns (uint256) {
    return stakingStore.attesters.length();
  }

  function getProposerForAttester(address _attester)
    public
    view
    override(IStaking)
    returns (address)
  {
    return stakingStore.info[_attester].proposer;
  }

  function getAttesterAtIndex(uint256 _index) public view override(IStaking) returns (address) {
    return stakingStore.attesters.at(_index);
  }

  function getProposerAtIndex(uint256 _index) public view override(IStaking) returns (address) {
    return stakingStore.info[stakingStore.attesters.at(_index)].proposer;
  }
}
