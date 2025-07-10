// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  IGovernance,
  Proposal,
  ProposalState,
  Configuration,
  Ballot,
  Withdrawal
} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {ProposalLib, VoteTabulationReturn} from "@aztec/governance/libraries/ProposalLib.sol";
import {User, UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

struct DepositControl {
  mapping(address caller => bool allowed) isAllowed;
  bool allDepositsAllowed;
}

/**
 * @title Governance
 * @author Aztec Labs
 * @notice  A contract that implements the governance logic, including proposal creation, voting, and execution
 *          A proposal is a payload which returns a list of actions to be executed by the governance, excluding
 *          calls to the governance token itself.
 *          The model is snapshot based and it is possible to make "partial" votes, using a fraction of one's power,
 *          making it simpler to build "aggregated" voting, for example for privately voting from inside the rollup.
 */
contract Governance is IGovernance {
  using SafeERC20 for IERC20;
  using ProposalLib for Proposal;
  using UserLib for User;
  using ConfigurationLib for Configuration;

  IERC20 public immutable ASSET;

  address public governanceProposer;

  DepositControl internal depositControl;

  mapping(uint256 proposalId => Proposal proposal) internal proposals;
  mapping(uint256 proposalId => mapping(address user => Ballot ballot)) public ballots;
  mapping(address userAddress => User user) internal users;
  mapping(uint256 withdrawalId => Withdrawal withdrawal) internal withdrawals;

  Configuration internal configuration;
  User internal total;
  uint256 public proposalCount;
  uint256 public withdrawalCount;

  modifier onlySelf() {
    require(
      msg.sender == address(this), Errors.Governance__CallerNotSelf(msg.sender, address(this))
    );
    _;
  }

  modifier isDepositAllowed(address _caller) {
    require(
      depositControl.allDepositsAllowed || depositControl.isAllowed[_caller],
      Errors.Governance__DepositNotAllowed()
    );

    _;
  }

  constructor(
    IERC20 _asset,
    address _governanceProposer,
    address _depositor,
    Configuration memory _configuration
  ) {
    ASSET = _asset;
    governanceProposer = _governanceProposer;

    configuration = _configuration;
    configuration.assertValid();

    // Unnecessary to set, but better clarity.
    depositControl.allDepositsAllowed = false;
    depositControl.isAllowed[_depositor] = true;
    emit DepositorAdded(_depositor);
  }

  function addDepositor(address _depositor) external override(IGovernance) onlySelf {
    depositControl.isAllowed[_depositor] = true;
    emit DepositorAdded(_depositor);
  }

  function openFloodgates() external override(IGovernance) onlySelf {
    depositControl.allDepositsAllowed = true;
    emit FloodGatesOpened();
  }

  function updateGovernanceProposer(address _governanceProposer)
    external
    override(IGovernance)
    onlySelf
  {
    governanceProposer = _governanceProposer;
    emit GovernanceProposerUpdated(_governanceProposer);
  }

  function updateConfiguration(Configuration memory _configuration)
    external
    override(IGovernance)
    onlySelf
  {
    // This following MUST revert if the configuration is invalid
    _configuration.assertValid();

    configuration = _configuration;

    emit ConfigurationUpdated(Timestamp.wrap(block.timestamp));
  }

  function deposit(address beneficiary, uint256 _amount)
    external
    override(IGovernance)
    isDepositAllowed(beneficiary)
  {
    ASSET.safeTransferFrom(msg.sender, address(this), _amount);
    users[beneficiary].add(_amount);
    total.add(_amount);

    emit Deposit(msg.sender, beneficiary, _amount);
  }

  function initiateWithdraw(address _to, uint256 _amount)
    external
    override(IGovernance)
    returns (uint256)
  {
    return _initiateWithdraw(_to, _amount, configuration.withdrawalDelay());
  }

  function finaliseWithdraw(uint256 _withdrawalId) external override(IGovernance) {
    Withdrawal storage withdrawal = withdrawals[_withdrawalId];
    require(!withdrawal.claimed, Errors.Governance__WithdrawalAlreadyclaimed());
    require(
      Timestamp.wrap(block.timestamp) >= withdrawal.unlocksAt,
      Errors.Governance__WithdrawalNotUnlockedYet(
        Timestamp.wrap(block.timestamp), withdrawal.unlocksAt
      )
    );
    withdrawal.claimed = true;

    emit WithdrawFinalised(_withdrawalId);

    ASSET.safeTransfer(withdrawal.recipient, withdrawal.amount);
  }

  function propose(IPayload _proposal) external override(IGovernance) returns (uint256) {
    require(
      msg.sender == governanceProposer,
      Errors.Governance__CallerNotGovernanceProposer(msg.sender, governanceProposer)
    );
    return _propose(_proposal, governanceProposer);
  }

  /**
   * @notice  Propose a new proposal by locking up a bunch of power
   *
   *          Beware that if the governanceProposer changes these proposals will also be dropped
   *          This is to ensure consistency around way proposals are made, and they should
   *          really be using the proposal logic in GovernanceProposer, which might have a similar
   *          mechanism in place as well.
   *          It is here for emergency purposes.
   *          Using the lock should be a last resort if the GovernanceProposer is broken.
   *
   * @param _proposal The proposal to propose
   * @param _to The address to send the lock to
   * @return The id of the proposal
   */
  function proposeWithLock(IPayload _proposal, address _to)
    external
    override(IGovernance)
    returns (uint256)
  {
    uint256 availablePower = users[msg.sender].powerNow();
    uint256 amount = configuration.proposeConfig.lockAmount;

    require(
      amount <= availablePower,
      Errors.Governance__InsufficientPower(msg.sender, availablePower, amount)
    );

    _initiateWithdraw(_to, amount, configuration.proposeConfig.lockDelay);
    return _propose(_proposal, address(this));
  }

  function vote(uint256 _proposalId, uint256 _amount, bool _support)
    external
    override(IGovernance)
    returns (bool)
  {
    ProposalState state = getProposalState(_proposalId);
    require(state == ProposalState.Active, Errors.Governance__ProposalNotActive());

    // Compute the power at the time where we became active
    uint256 userPower = users[msg.sender].powerAt(proposals[_proposalId].pendingThrough());

    Ballot storage userBallot = ballots[_proposalId][msg.sender];

    uint256 availablePower = userPower - (userBallot.nea + userBallot.yea);
    require(
      _amount <= availablePower,
      Errors.Governance__InsufficientPower(msg.sender, availablePower, _amount)
    );

    Ballot storage summedBallot = proposals[_proposalId].summedBallot;
    if (_support) {
      userBallot.yea += _amount;
      summedBallot.yea += _amount;
    } else {
      userBallot.nea += _amount;
      summedBallot.nea += _amount;
    }

    emit VoteCast(_proposalId, msg.sender, _support, _amount);

    return true;
  }

  function execute(uint256 _proposalId) external override(IGovernance) returns (bool) {
    ProposalState state = getProposalState(_proposalId);
    require(state == ProposalState.Executable, Errors.Governance__ProposalNotExecutable());

    Proposal storage proposal = proposals[_proposalId];
    proposal.state = ProposalState.Executed;

    IPayload.Action[] memory actions = proposal.payload.getActions();

    for (uint256 i = 0; i < actions.length; i++) {
      require(actions[i].target != address(ASSET), Errors.Governance__CannotCallAsset());
      // We allow calls to EOAs. If you really want be my guest.
      // solhint-disable-next-line avoid-low-level-calls
      (bool success,) = actions[i].target.call(actions[i].data);
      require(success, Errors.Governance__CallFailed(actions[i].target));
    }

    emit ProposalExecuted(_proposalId);

    return true;
  }

  function dropProposal(uint256 _proposalId) external override(IGovernance) returns (bool) {
    Proposal storage self = proposals[_proposalId];
    require(self.state != ProposalState.Dropped, Errors.Governance__ProposalAlreadyDropped());
    require(
      getProposalState(_proposalId) == ProposalState.Dropped,
      Errors.Governance__ProposalCannotBeDropped()
    );

    self.state = ProposalState.Dropped;
    return true;
  }

  function powerAt(address _owner, Timestamp _ts)
    external
    view
    override(IGovernance)
    returns (uint256)
  {
    if (_ts == Timestamp.wrap(block.timestamp)) {
      return users[_owner].powerNow();
    }
    return users[_owner].powerAt(_ts);
  }

  function totalPowerAt(Timestamp _ts) external view override(IGovernance) returns (uint256) {
    if (_ts == Timestamp.wrap(block.timestamp)) {
      return total.powerNow();
    }
    return total.powerAt(_ts);
  }

  function isAllowedToDeposit(address _caller) external view override(IGovernance) returns (bool) {
    return depositControl.isAllowed[_caller];
  }

  function isAllDepositsAllowed() external view override(IGovernance) returns (bool) {
    return depositControl.allDepositsAllowed;
  }

  function getConfiguration() external view override(IGovernance) returns (Configuration memory) {
    return configuration;
  }

  function getProposal(uint256 _proposalId)
    external
    view
    override(IGovernance)
    returns (Proposal memory)
  {
    return proposals[_proposalId];
  }

  function getWithdrawal(uint256 _withdrawalId)
    external
    view
    override(IGovernance)
    returns (Withdrawal memory)
  {
    return withdrawals[_withdrawalId];
  }

  /**
   * @notice	Get the state of the proposal
   *
   * @dev			Currently optimised for readability NOT gas.
   *
   */
  function getProposalState(uint256 _proposalId)
    public
    view
    override(IGovernance)
    returns (ProposalState)
  {
    require(_proposalId < proposalCount, Errors.Governance__ProposalDoesNotExists(_proposalId));

    Proposal storage self = proposals[_proposalId];

    if (self.isStable()) {
      return self.state;
    }

    // If the governanceProposer have changed we mark is as dropped unless it was proposed using the lock.
    if (governanceProposer != self.proposer && address(this) != self.proposer) {
      return ProposalState.Dropped;
    }

    Timestamp currentTime = Timestamp.wrap(block.timestamp);
    uint32 currentDepositCheckpoint = UserLib.toDepositCheckpoint(currentTime);
    uint32 pendingThroughCheckpoint = UserLib.toDepositCheckpoint(self.pendingThrough());

    if (currentDepositCheckpoint <= pendingThroughCheckpoint) {
      return ProposalState.Pending;
    }

    if (currentTime <= self.activeThrough()) {
      return ProposalState.Active;
    }

    uint256 totalPower = total.powerAt(self.pendingThrough());
    (VoteTabulationReturn vtr,) = self.voteTabulation(totalPower);
    if (vtr != VoteTabulationReturn.Accepted) {
      return ProposalState.Rejected;
    }

    if (currentTime <= self.queuedThrough()) {
      return ProposalState.Queued;
    }

    if (currentTime <= self.executableThrough()) {
      return ProposalState.Executable;
    }

    return ProposalState.Expired;
  }

  function _initiateWithdraw(address _to, uint256 _amount, Timestamp _delay)
    internal
    returns (uint256)
  {
    users[msg.sender].sub(_amount);
    total.sub(_amount);

    uint256 withdrawalId = withdrawalCount++;

    withdrawals[withdrawalId] = Withdrawal({
      amount: _amount,
      unlocksAt: Timestamp.wrap(block.timestamp) + _delay,
      recipient: _to,
      claimed: false
    });

    emit WithdrawInitiated(withdrawalId, _to, _amount);

    return withdrawalId;
  }

  function _propose(IPayload _proposal, address _proposer) internal returns (uint256) {
    uint256 proposalId = proposalCount++;

    proposals[proposalId] = Proposal({
      config: configuration,
      state: ProposalState.Pending,
      payload: _proposal,
      proposer: _proposer,
      creation: Timestamp.wrap(block.timestamp),
      summedBallot: Ballot({yea: 0, nea: 0})
    });

    emit Proposed(proposalId, address(_proposal));

    return proposalId;
  }
}
