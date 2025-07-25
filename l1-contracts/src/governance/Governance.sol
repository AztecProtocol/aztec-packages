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

/**
 * @dev a whitelist, controlling who may have power in the governance contract.
 * That is, an address must be an approved beneficiary to receive power via `deposit`.
 *
 * The caveat is that the owner of the contract may open the floodgates, allowing all addresses to hold power.
 * This is currently a "one-way-valve", since if it were reopened after being shut,
 * the contract is in an odd state where entities are holding power, but not allowed to receive more;
 * the whitelist is enabled, but does not reflect the functional entities in the system.
 * As an aside, it is unlikely that in the event Governance were opened up to all addresses,
 * those same addresses would subsequently vote to close it again.
 *
 * In practice, it is expected that the only authorized beneficiary will be the GSE.
 * This is because all rollup instances deposit their stake into the GSE, which in turn deposits it into the governance
 * contract. In turn, it is the GSE that votes on proposals.
 */
struct DepositControl {
  mapping(address beneficiary => bool allowed) isAllowed;
  bool allBeneficiariesAllowed;
}

/**
 * @title Governance
 * @author Aztec Labs
 * @notice A contract that implements governance logic for proposal creation, voting, and execution.
 *         Uses a snapshot-based voting model with partial vote support to enable aggregated voting.
 *
 * @dev KEY CONCEPTS:
 *
 * **Power**: Funds received via `deposit` are held by Governance and tracked 1:1 as "power" for the beneficiary.
 *
 * **Proposals**: Payloads containing actions to be executed by governance (excluding calls to the governance ASSET).
 *
 * **Deposit Control**: A whitelist system controlling who can hold power in governance.
 * - Initially restricted to approved beneficiaries (expected to be only the GSE)
 * - Can be opened to all addresses via `openFloodgates` (one-way valve)
 * - The GSE aggregates stake from all rollup instances and votes on their behalf
 *
 * **Voting Power**: Based on checkpointed deposit history, calculated per proposal.
 *
 * @dev PROPOSAL LIFECYCLE: (see `getProposalState` for details)
 *
 * The current state of a proposal may be retrieved via `getProposalState`.
 *
 * 1. **Pending** (creation → creation + votingDelay)
 *    - Proposal exists but voting hasn't started
 *    - Power snapshot taken at end of this phase
 *
 * 2. **Active** (pendingThrough + 1 → pendingThrough + votingDuration)
 *    - Voting open using power from snapshot
 *    - Multiple partial votes allowed per user
 *
 * 3. **Vote Evaluation** → Rejected if criteria not met:
 *    - Minimum quorum (% of total power)
 *    - Required yea margin (yea votes minus nay votes)
 *
 * 4. **Queued** (activeThrough + 1 → activeThrough + executionDelay)
 *    - Timelock period before execution
 *
 * 5. **Executable** (queuedThrough + 1 → queuedThrough + gracePeriod)
 *    - Anyone can execute during this window
 *
 * 6. **Other States**:
 *    - Executed: Successfully completed
 *    - Expired: Execution window passed
 *    - Rejected: Failed voting criteria
 *    - Droppable: Proposer changed
 *    - Dropped: Proposal dropped via `dropProposal`
 *
 * @dev USER FLOW:
 *
 * 1. **Deposit**: Transfer ASSET to governance for voting power
 *    - Only whitelisted beneficiaries can hold power
 *    - Power is checkpointed for historical lookups
 *
 * 2. **Vote**: Use power from proposal's snapshot timestamp
 *    - Support partial voting (multiple votes allowed, both yea and nay)
 *    - A user's total votes may not exceed their power snapshot for the proposal
 *
 * 3. **Withdraw**: Two-step process with delay
 *    - Initiate: Reduce power
 *    - Finalize: Transfer funds after delay expires
 *    - Standard delay: votingDelay/5 + votingDuration + executionDelay
 *
 * @dev PROPOSAL CREATION:
 *
 * - **Standard**: `governanceProposer` calls `propose`
 * - **Emergency**: Anyone with sufficient power calls `proposeWithLock`
 *   - Requires withdrawing `lockAmount` of power with a finalization delay of `lockDelay`
 *   - Proposal proposer becomes governance itself (cannot be dropped)
 *
 * @dev CONFIGURATION:
 * All timing parameters are controlled by the governance configuration:
 * - votingDelay: Buffer before voting opens
 * - votingDuration: Voting period length
 * - executionDelay: Timelock after voting before the proposal may be executed
 * - gracePeriod: Execution window
 * - minimumVotes: Absolute minimum voting power in system
 * - quorum: Minimum acceptable participation as a percentage of total power
 * - requiredYeaMargin: Required difference between yea and nay votes as a percentage of the votes cast
 * - lockAmount: The amount of power to withdraw when `proposeWithLock` is called
 * - lockDelay: The delay before a withdrawal created by `proposeWithLock` is finalized
 */
contract Governance is IGovernance {
  using SafeERC20 for IERC20;
  using ProposalLib for Proposal;
  using UserLib for User;
  using ConfigurationLib for Configuration;

  IERC20 public immutable ASSET;

  /**
   * @dev The address that is allowed to `propose` new proposals.
   *
   * This address can only be updated by the governance itself through a proposal.
   */
  address public governanceProposer;

  /**
   * @dev The whitelist of beneficiaries that are allowed to hold power via `deposit`,
   * and the flag to allow all beneficiaries to hold power.
   */
  DepositControl internal depositControl;

  /**
   * @dev The proposals that have been made.
   *
   * The proposal ID is the current count of proposals (see `proposalCount`).
   * New proposals are created by calling `_propose`, via `propose` or `proposeWithLock`.
   * The storage of a proposal may be modified by calling `vote`, `execute`, or `dropProposal`.
   */
  mapping(uint256 proposalId => Proposal proposal) internal proposals;

  /**
   * @dev The ballots that have been cast for each proposal.
   *
   * `Ballot`s contain a `yea` and `nay` count, which are the number of votes for and against the proposal.
   * `ballots` is only updated during `vote`.
   */
  mapping(uint256 proposalId => mapping(address user => Ballot ballot)) public ballots;

  /**
   * @dev Checkpointed deposit amounts for an address.
   *
   * `users` is only updated during `deposit`, `initiateWithdraw`, and `proposeWithLock`.
   */
  mapping(address userAddress => User user) internal users;

  /**
   * @dev Withdrawals that have been initiated.
   *
   * `withdrawals` is only updated during `initiateWithdraw`, `proposeWithLock`, and `finaliseWithdraw`.
   */
  mapping(uint256 withdrawalId => Withdrawal withdrawal) internal withdrawals;

  /**
   * @dev The configuration of the governance contract.
   *
   * `configuration` is set in the constructor, and is only updated during `updateConfiguration`,
   * which must be done via a proposal.
   */
  Configuration internal configuration;

  /**
   * @dev The total power of the governance contract.
   *
   * `total` is only updated during `deposit`, `initiateWithdraw`, and `proposeWithLock`.
   */
  User internal total;

  /**
   * @dev The count of proposals that have been made.
   *
   * `proposalCount` is only updated during `_propose`.
   */
  uint256 public proposalCount;

  /**
   * @dev The count of withdrawals that have been initiated.
   *
   * `withdrawalCount` is only updated during `initiateWithdraw` and `proposeWithLock`.
   */
  uint256 public withdrawalCount;

  /**
   * @dev Modifier to ensure that the caller is the governance contract itself.
   *
   * Protects functions that allow the governance contract to modify its own state, via a proposal.
   */
  modifier onlySelf() {
    require(
      msg.sender == address(this), Errors.Governance__CallerNotSelf(msg.sender, address(this))
    );
    _;
  }

  /**
   * @dev Modifier to ensure that the beneficiary is allowed to hold power in Governance.
   */
  modifier isDepositAllowed(address _beneficiary) {
    require(
      depositControl.allBeneficiariesAllowed || depositControl.isAllowed[_beneficiary],
      Errors.Governance__DepositNotAllowed()
    );

    _;
  }

  /**
   * @dev the initial _beneficiary is expected to be the GSE.
   */
  constructor(
    IERC20 _asset,
    address _governanceProposer,
    address _beneficiary,
    Configuration memory _configuration
  ) {
    ASSET = _asset;
    governanceProposer = _governanceProposer;

    configuration = _configuration;
    configuration.assertValid();

    // Unnecessary to set, but better clarity.
    depositControl.allBeneficiariesAllowed = false;
    depositControl.isAllowed[_beneficiary] = true;
    emit BeneficiaryAdded(_beneficiary);
  }

  /**
   * @notice Add a beneficiary to the whitelist.
   * @dev The beneficiary may hold power in the governance contract after this call.
   * only callable by the governance contract itself.
   *
   * @param _beneficiary The address to add to the whitelist.
   */
  function addBeneficiary(address _beneficiary) external override(IGovernance) onlySelf {
    depositControl.isAllowed[_beneficiary] = true;
    emit BeneficiaryAdded(_beneficiary);
  }

  /**
   * @notice Allow all addresses to hold power in the governance contract.
   * @dev This is a one-way valve.
   * only callable by the governance contract itself.
   */
  function openFloodgates() external override(IGovernance) onlySelf {
    depositControl.allBeneficiariesAllowed = true;
    emit FloodGatesOpened();
  }

  /**
   * @notice Update the governance proposer.
   * @dev The governance proposer is the address that is allowed to use `propose`.
   * only callable by the governance contract itself.
   *
   * @dev causes all proposals proposed by the previous governance proposer to be `Droppable`.
   *
   * @dev prevents the governance proposer from being set to the governance contract itself.
   *
   * @param _governanceProposer The new governance proposer.
   */
  function updateGovernanceProposer(address _governanceProposer)
    external
    override(IGovernance)
    onlySelf
  {
    require(
      _governanceProposer != address(this), Errors.Governance__GovernanceProposerCannotBeSelf()
    );
    governanceProposer = _governanceProposer;
    emit GovernanceProposerUpdated(_governanceProposer);
  }

  /**
   * @notice Update the governance configuration.
   * only callable by the governance contract itself.
   *
   * @dev all existing proposals will use the configuration they were created with.
   */
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

  /**
   * @notice Deposit funds into the governance contract, transferring ASSET from msg.sender to the governance contract,
   * increasing the power 1:1 of the beneficiary within the governance contract.
   *
   * @dev The beneficiary must be allowed to hold power in the governance contract,
   * according to `depositControl`.
   *
   * Increments the checkpointed power of the specified beneficiary, and the total power of the governance contract.
   *
   * Note that anyone may deposit funds into the governance contract, and the only restriction is that
   * the beneficiary must be allowed to hold power in the governance contract, according to `depositControl`.
   *
   * It is worth pointing out that someone could attempt to spam the deposit function, and increase the cost to vote
   * as a result of creating many checkpoints. In reality though, at ethereum's current block time of 12s, it would
   * take ~36 years of continuous spamming to increase the cost to vote by ~66K gas, so we accept this risk.
   *
   * @param _beneficiary The beneficiary to increase the power of.
   * @param _amount The amount of funds to deposit, which is converted to power 1:1.
   */
  function deposit(address _beneficiary, uint256 _amount)
    external
    override(IGovernance)
    isDepositAllowed(_beneficiary)
  {
    ASSET.safeTransferFrom(msg.sender, address(this), _amount);
    users[_beneficiary].add(_amount);
    total.add(_amount);

    emit Deposit(msg.sender, _beneficiary, _amount);
  }

  /**
   * @notice Initiate a withdrawal of funds from the governance contract,
   * decreasing the power of the beneficiary within the governance contract.
   *
   * @dev the withdraw may be finalized by anyone after configuration.withdrawalDelay() has passed.
   *
   * @param _to The address that will receive the funds when the withdrawal is finalized.
   * @param _amount The amount of power to reduce, and thus funds to withdraw.
   * @return The id of the withdrawal, passed to `finaliseWithdraw`.
   */
  function initiateWithdraw(address _to, uint256 _amount)
    external
    override(IGovernance)
    returns (uint256)
  {
    return _initiateWithdraw(msg.sender, _to, _amount, configuration.withdrawalDelay());
  }

  /**
   * @notice Finalise a withdrawal of funds from the governance contract,
   * transferring ASSET from the governance contract to the recipient specified in the withdrawal.
   *
   * @dev The withdrawal must not have been claimed, and the delay specified on the withdrawal must have passed.
   *
   * @param _withdrawalId The id of the withdrawal to finalise.
   */
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

  /**
   * @notice Propose a new proposal as the governanceProposer
   *
   * @dev the state of the proposal may be retrieved via `getProposalState`.
   *
   * Note that the `proposer` of the proposal is the *current* governanceProposer; if the governanceProposer
   * no longer matches the one stored in the proposal, the state of the proposal will be `Droppable`.
   *
   * @param _proposal The IPayload address, which is a contract that contains the proposed actions to be executed by the governance.
   * @return The id of the proposal.
   */
  function propose(IPayload _proposal) external override(IGovernance) returns (uint256) {
    require(
      msg.sender == governanceProposer,
      Errors.Governance__CallerNotGovernanceProposer(msg.sender, governanceProposer)
    );
    return _propose(_proposal, governanceProposer);
  }

  /**
   * @notice Propose a new proposal by withdrawing an existing amount of power from Governance with a longer delay.
   *
   * @dev proposals made in this way are identical to those made by the governanceProposer, with the exception
   * that the "proposer" stored in the proposal is the address of the governance contract itself,
   * which means it will not transition to a "Droppable" state if the governanceProposer changes.
   *
   * @dev this is intended to only be used in an emergency, where the governanceProposer is compromised.
   *
   * @dev We don't actually need to check available power here, since if the msg.sender does not have
   * sufficient balance, the .
   *
   * @param _proposal The IPayload address, which is a contract that contains the proposed actions to be executed by the governance.
   * @param _to The address that will receive the withdrawn funds when the withdrawal is finalized (see `finaliseWithdraw`)
   * @return The id of the proposal
   */
  function proposeWithLock(IPayload _proposal, address _to)
    external
    override(IGovernance)
    returns (uint256)
  {
    _initiateWithdraw(
      msg.sender, _to, configuration.proposeConfig.lockAmount, configuration.proposeConfig.lockDelay
    );
    return _propose(_proposal, address(this));
  }

  /**
   * @notice Vote on a proposal.
   * @dev The proposal must be `Active` to vote on it.
   *
   * NOTE: The amount of power to vote is equal to the power of msg.sender at the time
   * just before the proposal became active.
   *
   * The same caller (e.g. the GSE) may `vote` multiple times, voting different ways,
   * so long as their total votes are less than or equal to their available power;
   * each vote is tracked per proposal, per caller within the `ballots` mapping.
   *
   * We keep track of the total yea and nay votes as a `summedBallot` on the proposal in storage.
   *
   * @param _proposalId The id of the proposal to vote on.
   * @param _amount The amount of power to vote with, which must be less than the available power.
   * @param _support The support of the vote.
   */
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

    uint256 availablePower = userPower - (userBallot.nay + userBallot.yea);
    require(
      _amount <= availablePower,
      Errors.Governance__InsufficientPower(msg.sender, availablePower, _amount)
    );

    Ballot storage summedBallot = proposals[_proposalId].summedBallot;
    if (_support) {
      userBallot.yea += _amount;
      summedBallot.yea += _amount;
    } else {
      userBallot.nay += _amount;
      summedBallot.nay += _amount;
    }

    emit VoteCast(_proposalId, msg.sender, _support, _amount);

    return true;
  }

  /**
   * @notice Execute a proposal.
   * @dev The proposal must be `Executable` to execute it.
   * If it is, we mark the proposal as `Executed` and execute the actions,
   * simply looping through and calling them.
   *
   * As far as the inidividual calls, there are 2 safety measures:
   *  - The call cannot target the ASSET which underlies the governance contract
   *  - The call must succeed
   *
   * @param _proposalId The id of the proposal to execute.
   */
  function execute(uint256 _proposalId) external override(IGovernance) returns (bool) {
    ProposalState state = getProposalState(_proposalId);
    require(state == ProposalState.Executable, Errors.Governance__ProposalNotExecutable());

    Proposal storage proposal = proposals[_proposalId];
    proposal.cachedState = ProposalState.Executed;

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

  /**
   * @notice Update a proposal to be `Dropped`.
   * @dev The proposal must be `Droppable` to mark it permanently as `Dropped`.
   * See `getProposalState` for more details.
   *
   * @param _proposalId The id of the proposal to mark as `Dropped`.
   */
  function dropProposal(uint256 _proposalId) external override(IGovernance) returns (bool) {
    Proposal storage self = proposals[_proposalId];
    require(self.cachedState != ProposalState.Dropped, Errors.Governance__ProposalAlreadyDropped());
    require(
      getProposalState(_proposalId) == ProposalState.Droppable,
      Errors.Governance__ProposalCannotBeDropped()
    );

    self.cachedState = ProposalState.Dropped;
    return true;
  }

  /**
   * @notice Get the power of an address at a given timestamp.
   * @dev If the timestamp is the current block timestamp, we return the powerNow.
   * Otherwise, we return the powerAt the timestamp.
   *
   * Note that `powerNow` with the current block timestamp is NOT STABLE.
   *
   *  For example, imagine a transaction that performs the following:
   *  1. deposit
   *  2. powerNow
   *  3. deposit
   *  4. powerNow
   *
   *  The powerNow at 4 will be different from the powerNow at 2.
   *
   * @param _owner The address to get the power of.
   * @param _ts The timestamp to get the power at.
   * @return The power of the address at the given timestamp.
   */
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

  /**
   * @notice Get the total power in Governance at a given timestamp.
   * @dev If the timestamp is the current block timestamp, we return the powerNow.
   * Otherwise, we return the powerAt the timestamp.
   *
   * Note that `powerNow` with the current block timestamp is NOT STABLE.
   *
   * See `powerAt` for more details.
   *
   * @param _ts The timestamp to get the power at.
   * @return The total power at the given timestamp.
   */
  function totalPowerAt(Timestamp _ts) external view override(IGovernance) returns (uint256) {
    if (_ts == Timestamp.wrap(block.timestamp)) {
      return total.powerNow();
    }
    return total.powerAt(_ts);
  }

  /**
   * @notice Check if an address is permitted to hold power in Governance.
   *
   * @param _beneficiary The address to check.
   * @return True if the address is permitted to hold power in Governance.
   */
  function isPermittedInGovernance(address _beneficiary)
    external
    view
    override(IGovernance)
    returns (bool)
  {
    return depositControl.isAllowed[_beneficiary];
  }

  /**
   * @notice Check if everyone is permitted to hold power in Governance.
   *
   * @return True if everyone is permitted to hold power in Governance.
   */
  function isAllBeneficiariesAllowed() external view override(IGovernance) returns (bool) {
    return depositControl.allBeneficiariesAllowed;
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
   * @notice Get the state of a proposal in the governance system
   *
   * @dev Determine the current state of a proposal based on timestamps, vote results, and governance configuration.
   *
   * @dev NB: the state returned here is LOGICAL, and is the "true state" of the proposal:
   * it need not match the state of the proposal in storage, which is effectively just a cache.
   *
   *  Flow Logic:
   *  1. Check if proposal exists (revert if not)
   *  2. If the cached state of the proposal is "stable" (Executed/Dropped), return that state
   *  3. Check if governance proposer changed (→ Droppable, unless proposed via lock)
   *  4. Time-based state transitions:
   *   - currentTime ≤ pendingThrough() → Pending
   *   - currentTime ≤ activeThrough() → Active
   *   - Vote tabulation check → Rejected if not accepted
   *   - currentTime ≤ queuedThrough() → Queued
   *   - currentTime ≤ executableThrough() → Executable
   *   - Otherwise → Expired
   *
   * @dev State Descriptions:
   *      - Pending: Proposal created but voting hasn't started yet
   *      - Active: Voting is currently open
   *      - Rejected: Voting closed but proposal didn't meet acceptance criteria
   *      - Queued: Proposal accepted and waiting for execution window
   *      - Executable: Proposal can be executed
   *      - Expired: Execution window has passed
   *      - Droppable: Proposer changed
   *      - Dropped: Proposal dropped by calling `dropProposal`
   *      - Executed: Proposal has been successfully executed
   *
   * @dev edge case: it is possible that a proposal be "Droppable" according to the logic here,
   * but no one called `dropProposal`, and then be in a different state later.
   * This can happen if, for whatever reason, the governance proposer stored by this contract changes
   * from the one the proposal is made via, (which would cause this function to return `Droppable`),
   * but then a separate proposal is executed which restores the original governance proposer.
   * So, `Dropped` is permanent, but `Droppable` is not.
   *
   * @param _proposalId The ID of the proposal to check
   * @return The current state of the proposal
   */
  function getProposalState(uint256 _proposalId)
    public
    view
    override(IGovernance)
    returns (ProposalState)
  {
    require(_proposalId < proposalCount, Errors.Governance__ProposalDoesNotExists(_proposalId));

    Proposal storage self = proposals[_proposalId];

    // A proposal's state is "stable" after `execute` or `dropProposal` has been called on it.
    // In this case, the state of the proposal as returned by `getProposalState` is the same as the cached state,
    // and the state will not change.
    if (self.cachedState == ProposalState.Executed || self.cachedState == ProposalState.Dropped) {
      return self.cachedState;
    }

    // If the governanceProposer has changed, and the proposal did not come through `proposeWithLock`,
    // the state of the proposal is `Droppable`.
    if (governanceProposer != self.proposer && address(this) != self.proposer) {
      return ProposalState.Droppable;
    }

    Timestamp currentTime = Timestamp.wrap(block.timestamp);

    if (currentTime <= self.pendingThrough()) {
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

  /**
   * @dev reduce the user's power, the total power, and insert a new withdrawal.
   *
   *  The reason for a configurable delay is that `proposeWithLock` creates a withdrawal,
   *  which has a (presumably) very long delay, whereas `initiateWithdraw` has a much shorter delay.
   *
   * @param _from The address to reduce the power of.
   * @param _to The address to send the funds to.
   * @param _amount The amount of power to reduce, and thus funds to withdraw.
   * @param _delay The delay before the funds can be withdrawn.
   * @return The id of the withdrawal.
   */
  function _initiateWithdraw(address _from, address _to, uint256 _amount, Timestamp _delay)
    internal
    returns (uint256)
  {
    users[_from].sub(_amount);
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

  /**
   * @dev create a new proposal. In it we store:
   *
   *  - a copy of the current configuration, because it can be updated on the Governance contract
   *  - the summed ballot to avoid recomputing it when determining the proposal state
   *  - the proposer, which can be:
   *    - the current governanceProposer (which can be updated on the Governance contract), if created via `propose`
   *    - the governance contract itself, if created via `proposeWithLock`
   *
   * @param _proposal The proposal to propose.
   * @param _proposer The address that is proposing the proposal.
   * @return The id of the proposal, which is one less than the current count of proposals.
   */
  function _propose(IPayload _proposal, address _proposer) internal returns (uint256) {
    uint256 proposalId = proposalCount++;

    proposals[proposalId] = Proposal({
      config: configuration,
      cachedState: ProposalState.Pending,
      payload: _proposal,
      proposer: _proposer,
      creation: Timestamp.wrap(block.timestamp),
      summedBallot: Ballot({yea: 0, nay: 0})
    });

    emit Proposed(proposalId, address(_proposal));

    return proposalId;
  }
}
