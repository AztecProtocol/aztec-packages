// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Governance} from "@aztec/governance/Governance.sol";
import {Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/governance/libraries/AddressSnapshotLib.sol";
import {DelegationLib, DelegationData} from "@aztec/governance/libraries/DelegationLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

struct AttesterConfig {
  address withdrawer;
}

// Struct to track the attesters on a particular rollup instance throughout time,
// along with each attester's current config.
// Finally a flag to track if the instance exists.
struct InstanceStaking {
  SnapshottedAddressSet attesters;
  mapping(address attester => AttesterConfig config) configOf;
  bool exists;
}

interface IGSECore {
  event Deposit(address indexed instance, address indexed attester, address withdrawer);

  function setGovernance(Governance _governance) external;
  function addRollup(address _rollup) external;
  function deposit(address _attester, address _withdrawer, bool _onBonus) external;
  function withdraw(address _attester, uint256 _amount) external returns (uint256, bool, uint256);
  function delegate(address _instance, address _attester, address _delegatee) external;
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external;
  function voteWithBonus(uint256 _proposalId, uint256 _amount, bool _support) external;
  function finaliseHelper(uint256 _withdrawalId) external;
  function proposeWithLock(IPayload _proposal, address _to) external returns (uint256);

  function isRegistered(address _instance, address _attester) external view returns (bool);
  function isRollupRegistered(address _instance) external view returns (bool);
  function getLatestRollup() external view returns (address);
  function getLatestRollupAt(Timestamp _timestamp) external view returns (address);
  function getGovernance() external view returns (Governance);
}

interface IGSE is IGSECore {
  function getDelegatee(address _instance, address _attester) external view returns (address);
  function getVotingPower(address _attester) external view returns (uint256);
  function getVotingPowerAt(address _attester, Timestamp _timestamp)
    external
    view
    returns (uint256);

  function getWithdrawer(address _instance, address _attester)
    external
    view
    returns (address, bool, address);
  function balanceOf(address _instance, address _attester) external view returns (uint256);
  function effectiveBalanceOf(address _instance, address _attester) external view returns (uint256);
  function supplyOf(address _instance) external view returns (uint256);
  function totalSupply() external view returns (uint256);
  function getConfig(address _instance, address _attester)
    external
    view
    returns (AttesterConfig memory);
  function getAttesterCountAtTime(address _instance, Timestamp _timestamp)
    external
    view
    returns (uint256);

  function getAttestersFromIndicesAtTime(
    address _instance,
    Timestamp _timestamp,
    uint256[] memory _indices
  ) external view returns (address[] memory);
  function getAttestersAtTime(address _instance, Timestamp _timestamp)
    external
    view
    returns (address[] memory);
  function getAttesterFromIndexAtTime(address _instance, uint256 _index, Timestamp _timestamp)
    external
    view
    returns (address);
  function getPowerUsed(address _delegatee, uint256 _proposalId) external view returns (uint256);
  function getBonusInstanceAddress() external view returns (address);
}

/**
 * @title GSECore
 * @author Aztec Labs
 * @notice The core Governance Staking Escrow contract that handles the staking of attesters on rollup instances.
 *         It is responsible for:
 *         - depositing/withdrawing attesters on rollup instances
 *         - providing rollup instances with historical views of their attesters
 *         - allowing depositors to delegate their voting power
 *         - allowing delegatees to vote at governance
 *         - maintaining a set of "bonus" attesters which are always staked on the latest rollup
 *
 * NB: The "bonus" attesters are thus automatically "moved along" whenever the latest rollup changes.
 * That is, at the point of the rollup getting added, the bonus stake is immediately available.
 * This allows the latest rollup to start with a set of attesters, rather than requiring them to exit
 * the old rollup and deposit in the new one.
 *
 * NB: The "latest" rollup in this contract does not technically need to be the "canonical" rollup
 * according to the Registry, but in practice, it will be unless the new rollup does not use the GSE.
 * Proposals which add rollups that DO want to use the GSE MUST call addRollup to both the Registry and the GSE.
 * See RegisterNewRollupVersionPayload.sol for an example.
 *
 * NB: The "owner" of the GSE is intended to be the Governance contract, but there is a circular
 * dependency in that we also want the GSE to be registered as the first beneficiary of the governance
 * contract so that we don't need to go through a governance proposal to add it. To that end,
 * this contract's view of `governance` needs to be set. So the current flow is to deploy the GSE with the owner
 * set to the deployer, then deploy Governance, passing the GSE as the initial/sole authorized beneficiary,
 * then have the deployer `setGovernance`, and then `transferOwnership` to Governance.
 */
contract GSECore is IGSECore, Ownable {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;
  using SafeCast for uint224;
  using Checkpoints for Checkpoints.Trace224;
  using DelegationLib for DelegationData;
  using ProposalLib for Proposal;

  /**
   * Create a special "bonus" address for use by the latest rollup.
   *
   * As far as terminology, the GSE tracks staking and voting/delegation data for "instances",
   * and an "instance" is either the address of a "true" rollup contract which was added via `addRollup`,
   * or (ONLY IN THIS CONTRACT) this special "bonus" address, which has its own accounting.
   *
   * NB: in every other context, "instance" refers broadly to a specific instance of an aztec rollup contract
   * (possibly inclusive of its family of related contracts e.g. Inbox, Outbox, etc.)
   *
   * Thus, this bonus address appears in `delegation` and `instances`, and from the perspective of the GSE,
   * it is an instance (though it can never be in the list of rollups).
   *
   * Lower in the code, we use "rollup" if we know we're talking about a rollup (often msg.sender),
   * and "instance" if we are talking about about either a rollup instance or the bonus instance.
   *
   * The latest rollup according to `rollups` may use the attesters and voting power
   * from the BONUS_INSTANCE_ADDRESS as a "bonus" to their own.
   *
   * One invariant of the GSE is that the attesters available to any rollup instance must form a set.
   * i.e. there must be no duplicates.
   *
   * Thus, for the latest rollup, there are two "buckets" of attesters available:
   * - the attesters that are associated with the rollup's address
   * - the attesters that are associated with the BONUS_INSTANCE_ADDRESS
   *
   * The GSE ensures that:
   * - each bucket individually is a set
   * - when you add these two buckets together, it is a set.
   *
   * For a rollup that is no longer the latest, the attesters available to it are the attesters that are
   * associated with the rollup's address. In effect, when a rollup goes from being the latest to not being
   * the latest, it loses all attesters that were associated with the bonus instance.
   *
   * In this way, the "effective" attesters/balance/etc for a rollup (at a point in time) is:
   * - the rollup's bucket and the bonus bucket if the rollup was the latest at that point in time
   * - only the rollup's bucket if the rollup was not the latest at that point in time
   *
   * Note further, that operations like deposit and withdraw are initiated by a rollup,
   * but the "affected instance" address will be either the rollup's address or the BONUS_INSTANCE_ADDRESS;
   * we will typically need to look at both instances to know what to do.
   *
   * NB: in a large way, the BONUS_INSTANCE_ADDRESS is the entire point of the GSE,
   * otherwise the rollups would've managed their own attesters/delegation/etc.
   */
  address public constant BONUS_INSTANCE_ADDRESS =
    address(uint160(uint256(keccak256("bonus-instance"))));

  uint256 public immutable DEPOSIT_AMOUNT;
  uint256 public immutable MINIMUM_STAKE;
  IERC20 public immutable STAKING_ASSET;

  // The GSE's history of rollups.
  Checkpoints.Trace224 internal rollups;
  // Mapping from instance address to its historical staking information.
  mapping(address instanceAddress => InstanceStaking instance) internal instances;

  /**
   * Contains state for:
   * checkpointed total supply
   * instance => {
   *   checkpointed supply
   *   attester => { balance, delegatee }
   * }
   * delegatee => {
   *   checkpointed voting power
   *   proposal ID => { power used }
   * }
   */
  DelegationData internal delegation;
  Governance internal governance;

  /**
   * @dev enforces that the caller is a registered rollup.
   */
  modifier onlyRollup() {
    require(isRollupRegistered(msg.sender), Errors.GSE__NotRollup(msg.sender));
    _;
  }

  /**
   * @param __owner - The owner of the GSE.
   * @param _stakingAsset - The asset that is used for staking.
   * @param _depositAmount - The amount of staking asset required to deposit an attester on the rollup.
   * @param _minimumStake - The minimum amount of staking asset required to be in the set to be considered an attester.
   *                        Presently, as the rollup instance does not allow for partial withdrawals, the only way for
   *                        a staked amount to reduce is to either withdraw the entire amount or be slashed.
   *                        If the balance falls below the minimum stake, the attester is removed from the set.
   */
  constructor(address __owner, IERC20 _stakingAsset, uint256 _depositAmount, uint256 _minimumStake)
    Ownable(__owner)
  {
    STAKING_ASSET = _stakingAsset;
    DEPOSIT_AMOUNT = _depositAmount;
    MINIMUM_STAKE = _minimumStake;
    instances[BONUS_INSTANCE_ADDRESS].exists = true;
  }

  function setGovernance(Governance _governance) external override(IGSECore) onlyOwner {
    // Once again desparate times calls for desparate measures.
    require(address(governance) == address(0), Errors.GSE__GovernanceAlreadySet());
    governance = _governance;
  }

  /**
   * @notice  Adds another rollup to the instances, which is the new latest rollup.
   *          Only callable by the owner (usually governance) and only when the rollup is not already in the set
   *
   * @dev rollups only have access to the "bonus instance" while they are the most recent rollup.
   *
   * @param _rollup - The address of the rollup to add
   */
  function addRollup(address _rollup) external override(IGSECore) onlyOwner {
    require(_rollup != address(0), Errors.GSE__InvalidRollupAddress(_rollup));
    require(!instances[_rollup].exists, Errors.GSE__RollupAlreadyRegistered(_rollup));
    instances[_rollup].exists = true;
    rollups.push(block.timestamp.toUint32(), uint224(uint160(_rollup)));
  }

  /**
   * @notice Deposits a new attester
   *
   * @dev msg.sender must be a registered rollup.
   *
   * @dev Transfers STAKING_ASSET from msg.sender to the GSE, and then into Governance.
   *
   * @dev if _onBonus is true, then msg.sender must be the latest rollup.
   *
   * @dev The same attester may deposit on multiple *instances*, so long as the invariant described
   * above BONUS_INSTANCE_ADDRESS holds.
   *
   * E.g. Suppose the registered rollups are A, then B, then C, so C's effective attesters are
   * those associated with C and the bonus address.
   *
   * Alice may come along now and deposit on A, and B, with _onBonus=false in both cases.
   *
   * For depositing into C, she can deposit *either* with _onBonus = true OR false.
   * If she deposits with _onBonus = false, then she is associated with C's address.
   * If she deposits with _onBonus = true, then she is associated with the bonus address.
   *
   * Suppose she deposits with _onBonus = true, and a new rollup D is added to the rollups.
   *
   * Now she cannot deposit through D AT ALL, since she is already in D's effective attesters.
   * But she CAN go back and deposit directly into C, with _onBonus = false.
   *
   * @param _attester     - The attester address of the attester
   * @param _withdrawer   - The withdrawer address of the attester
   * @param _onBonus  - Whether to deposit into the specific instance, or the bonus instance
   */
  function deposit(address _attester, address _withdrawer, bool _onBonus)
    external
    override(IGSECore)
    onlyRollup
  {
    bool isMsgSenderLatestRollup = getLatestRollup() == msg.sender;

    // If _onBonus is true, then msg.sender must be the latest rollup.
    require(!_onBonus || isMsgSenderLatestRollup, Errors.GSE__NotLatestRollup(msg.sender));

    // Ensure that we are not already attesting on the rollup
    require(
      !isRegistered(msg.sender, _attester), Errors.GSE__AlreadyRegistered(msg.sender, _attester)
    );

    // Ensure that if we are the latest rollup, we are not already attesting on the bonus instance.
    require(
      !isMsgSenderLatestRollup || !isRegistered(BONUS_INSTANCE_ADDRESS, _attester),
      Errors.GSE__AlreadyRegistered(BONUS_INSTANCE_ADDRESS, _attester)
    );

    // Set the recipient instance address, i.e. the one that will receive the attester.
    // From above, we know that if we are here, and _onBonus is true,
    // then msg.sender is the latest instance,
    // but the user is targeting the bonus address.
    // Otherwise, we use the msg.sender, which we know is a registered rollup
    // thanks to the modifier.
    address recipientInstance = _onBonus ? BONUS_INSTANCE_ADDRESS : msg.sender;

    // Add the attester to the instance's checkpointed set of attesters.
    require(
      instances[recipientInstance].attesters.add(_attester),
      Errors.GSE__AlreadyRegistered(recipientInstance, _attester)
    );

    instances[recipientInstance].configOf[_attester] = AttesterConfig({withdrawer: _withdrawer});

    delegation.delegate(recipientInstance, _attester, recipientInstance);
    delegation.increaseBalance(recipientInstance, _attester, DEPOSIT_AMOUNT);

    STAKING_ASSET.transferFrom(msg.sender, address(this), DEPOSIT_AMOUNT);

    Governance gov = getGovernance();
    STAKING_ASSET.approve(address(gov), DEPOSIT_AMOUNT);
    gov.deposit(address(this), DEPOSIT_AMOUNT);

    emit Deposit(recipientInstance, _attester, _withdrawer);
  }

  /**
   * @notice  Withdraws at least the amount specified.
   *          If the leftover balance is less than the minimum deposit, the entire balance is withdrawn.
   *
   * @dev     To be used by a rollup to withdraw funds from the GSE. For example if slashing or
   *          just withdrawing events happen, a rollup can use this function to withdraw the funds.
   *          It looks in both the rollup instance and the bonus address for the attester.
   *
   * @dev     Note that all funds are returned to the rollup, so for slashing the rollup itself must
   *          address the problem of "what to do" with the funds. And it must look at the returned amount
   *          withdrawn and the bool.
   *
   * @param _attester - The attester to withdraw from.
   * @param _amount   - The amount to withdraw
   *
   * @return The actual amount withdrawn.
   * @return True if attester is removed from set, false otherwise
   * @return The id of the withdrawal at the governance
   */
  function withdraw(address _attester, uint256 _amount)
    external
    override(IGSECore)
    onlyRollup
    returns (uint256, bool, uint256)
  {
    // We need to figure out where the attester is effectively located
    // we start by looking at the instance that is withdrawing the attester
    address withdrawingInstance = msg.sender;
    InstanceStaking storage instanceStaking = instances[msg.sender];
    bool foundAttester = instanceStaking.attesters.contains(_attester);

    // If we haven't found the attester in the rollup instance staking,
    // and we are latest rollup, go look in the "bonus" instance.
    if (
      !foundAttester && getLatestRollup() == msg.sender
        && instances[BONUS_INSTANCE_ADDRESS].attesters.contains(_attester)
    ) {
      withdrawingInstance = BONUS_INSTANCE_ADDRESS;
      instanceStaking = instances[BONUS_INSTANCE_ADDRESS];
      foundAttester = true;
    }

    require(foundAttester, Errors.GSE__NothingToExit(_attester));

    uint256 balance = delegation.getBalanceOf(withdrawingInstance, _attester);
    require(balance >= _amount, Errors.GSE__InsufficientStake(balance, _amount));

    // First assume we are only withdrawing the amount specified.
    uint256 amountWithdrawn = _amount;
    // If the balance after withdrawal is less than the minimum stake,
    // we will remove the attester from the instance.
    bool isRemoved = balance - _amount < MINIMUM_STAKE;

    // Note that the current implementation of the rollup does not allow for partial withdrawals,
    // via `initiateWithdraw`, so a "normal" withdrawal will always remove the attester from the instance.
    // However, if the attester is slashed, we might just reduce the balance.
    if (isRemoved) {
      require(instanceStaking.attesters.remove(_attester), Errors.GSE__FailedToRemove(_attester));
      delete instanceStaking.configOf[_attester];
      amountWithdrawn = balance;

      // Update the delegatee to address(0) when removing
      // This reduces the voting power of the attester's delegatee by the amount withdrawn
      // by moving it to address(0).
      delegation.delegate(withdrawingInstance, _attester, address(0));
    }

    // Decrease the balance of the attester in the instance.
    // Move voting power from the attester's delegatee to address(0) (unless the delegatee is already address(0))
    // Reduce the supply of the instance and the total supply.
    delegation.decreaseBalance(withdrawingInstance, _attester, amountWithdrawn);

    // The withdrawal contains a pending amount that may be claimed by ID when a delay has passed.
    // Note that the rollup is the one that receives the funds when the withdrawal is claimed.
    uint256 withdrawalId = getGovernance().initiateWithdraw(msg.sender, amountWithdrawn);

    return (amountWithdrawn, isRemoved, withdrawalId);
  }

  /**
   * @notice  A helper function to make it easy for users of the GSE to finalise
   *          a pending exit in the governance.
   *
   *          Kept in here since it is already connected to Governance:
   *          we don't want the rollup to have to deal with links to gov etc.
   *
   * @dev     Will be a no operation if the withdrawal is already collected.
   *
   * @param _withdrawalId - The id of the withdrawal
   */
  function finaliseHelper(uint256 _withdrawalId) external override(IGSECore) {
    Governance gov = getGovernance();
    if (!gov.getWithdrawal(_withdrawalId).claimed) {
      gov.finaliseWithdraw(_withdrawalId);
    }
  }

  /**
   * @notice Make a proposal to Governance via `Governance.proposeWithLock`
   *
   * @dev It is required to expose this on the GSE, since it is assumed that only the GSE can hold
   * power in Governance (see the comment at the top of Governance.sol).
   *
   * @dev Transfers governance's configured `lockAmount` of STAKING_ASSET from msg.sender to the GSE,
   * and then into Governance.
   *
   * @dev Immediately creates a withdrawal from Governance for the `lockAmount`.
   *
   * @dev The delay until the withdrawal may be finalized is equal to the current `lockDelay` in Governance.
   *
   * @param _payload - The IPayload address, which is a contract that contains the proposed actions to be executed by the governance.
   * @param _to - The address that will receive the withdrawn funds when the withdrawal is finalized (see `finaliseWithdraw`)
   *
   * @return The id of the proposal
   */
  function proposeWithLock(IPayload _payload, address _to)
    external
    override(IGSECore)
    returns (uint256)
  {
    Governance gov = getGovernance();
    uint256 amount = gov.getConfiguration().proposeConfig.lockAmount;

    STAKING_ASSET.transferFrom(msg.sender, address(this), amount);
    STAKING_ASSET.approve(address(gov), amount);

    gov.deposit(address(this), amount);

    return gov.proposeWithLock(_payload, _to);
  }

  /**
   * @notice  Delegates the voting power of `_attester` at `_instance` to `_delegatee`
   *
   *          Only callable by the `withdrawer` for the given `_attester` at the given
   *          `_instance`.
   *
   * @dev The delegatee may use this voting power to vote on proposals in Governance.
   *
   * Note that voting power for a delegatee is timestamped. The delegatee must have this
   * power before a proposal becomes "active" in order to use it.
   * See `Governance.getProposalState` for more details.
   *
   * @param _instance   - The address of the rollup instance (or bonus instance address)
   *                    - to which the `_attester` stake is pledged.
   * @param _attester   - The address of the attester to delegate on behalf of
   * @param _delegatee  - The degelegatee that should receive the power
   */
  function delegate(address _instance, address _attester, address _delegatee)
    external
    override(IGSECore)
  {
    require(isRollupRegistered(_instance), Errors.GSE__InstanceDoesNotExist(_instance));
    address withdrawer = instances[_instance].configOf[_attester].withdrawer;
    require(msg.sender == withdrawer, Errors.GSE__NotWithdrawer(withdrawer, msg.sender));
    delegation.delegate(_instance, _attester, _delegatee);
  }

  /**
   * @notice  Votes at the governance using the power delegated to `msg.sender`
   *
   * @param _proposalId - The id of the proposal in the governance to vote on
   * @param _amount     - The amount of voting power to use in the vote
   *                      In the gov, it is possible to do a vote with partial power
   * @param _support    - True if supporting the proposal, false otherwise.
   */
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external override(IGSECore) {
    _vote(msg.sender, _proposalId, _amount, _support);
  }

  /**
   * @notice  Votes at the governance using the power delegated the bonus instance
   *          Only callable by the rollup that was the latest rollup at the time of the proposal.
   *
   * @param _proposalId - The id of the proposal in the governance to vote on
   * @param _amount     - The amount of voting power to use in the vote
   *                      In the gov, it is possible to do a vote with partial power
   */
  function voteWithBonus(uint256 _proposalId, uint256 _amount, bool _support)
    external
    override(IGSECore)
  {
    Timestamp ts = _pendingThrough(_proposalId);
    require(msg.sender == getLatestRollupAt(ts), Errors.GSE__NotLatestRollup(msg.sender));
    _vote(BONUS_INSTANCE_ADDRESS, _proposalId, _amount, _support);
  }

  function isRollupRegistered(address _instance) public view override(IGSECore) returns (bool) {
    return instances[_instance].exists;
  }

  /**
   * @notice  Lookup if the `_attester` is in the `_instance` attester set
   *
   * @param _instance   - The instance to look at
   * @param _attester   - The attester to lookup
   *
   * @return  True if the `_attester` is in the set of `_instance`, false otherwise
   */
  function isRegistered(address _instance, address _attester)
    public
    view
    override(IGSECore)
    returns (bool)
  {
    return instances[_instance].attesters.contains(_attester);
  }

  /**
   * @notice  Get the address of latest instance
   *
   * @return  The address of the latest instance
   */
  function getLatestRollup() public view override(IGSECore) returns (address) {
    return address(rollups.latest().toUint160());
  }

  /**
   * @notice  Get the address of the instance that was latest at time `_timestamp`
   *
   * @param _timestamp  - The timestamp to lookup
   *
   * @return  The address of the latest instance at the time of lookup
   */
  function getLatestRollupAt(Timestamp _timestamp) public view override(IGSECore) returns (address) {
    return address(rollups.upperLookup(Timestamp.unwrap(_timestamp).toUint32()).toUint160());
  }

  function getGovernance() public view override(IGSECore) returns (Governance) {
    return governance;
  }

  /**
   * @notice  Inner logic for the vote
   *
   * @dev     Fetches the timestamp where proposal becomes active, and use it for the voting power
   *          of the `_voter`
   *
   * @param _voter      - The voter
   * @param _proposalId - The proposal to vote on
   * @param _amount     - The amount of power to use
   * @param _support    - True to support the proposal, false otherwise
   */
  function _vote(address _voter, uint256 _proposalId, uint256 _amount, bool _support) internal {
    Timestamp ts = _pendingThrough(_proposalId);
    // Mark the power as spent within our delegation accounting.
    delegation.usePower(_voter, _proposalId, ts, _amount);
    // Vote on the proposal
    getGovernance().vote(_proposalId, _amount, _support);
  }

  function _pendingThrough(uint256 _proposalId) internal view returns (Timestamp) {
    return getGovernance().getProposal(_proposalId).pendingThroughMemory();
  }
}

contract GSE is IGSE, GSECore {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;
  using SafeCast for uint224;
  using Checkpoints for Checkpoints.Trace224;
  using DelegationLib for DelegationData;

  constructor(address __owner, IERC20 _stakingAsset, uint256 _depositAmount, uint256 _minimumStake)
    GSECore(__owner, _stakingAsset, _depositAmount, _minimumStake)
  {}

  function getConfig(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (AttesterConfig memory)
  {
    (InstanceStaking storage instanceStaking, bool attesterExists,) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return AttesterConfig({withdrawer: address(0)});
    }

    return instanceStaking.configOf[_attester];
  }

  function getWithdrawer(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (address withdrawer, bool attesterExists, address instanceAddress)
  {
    InstanceStaking storage instanceStaking;
    (instanceStaking, attesterExists, instanceAddress) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return (address(0), false, address(0));
    }

    return (instanceStaking.configOf[_attester].withdrawer, true, instanceAddress);
  }

  function balanceOf(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (uint256)
  {
    return delegation.getBalanceOf(_instance, _attester);
  }

  /**
   * @notice  Get the effective balance of the attester at the instance.
   *
   *          The effective balance is the balance of the attester at the instance,
   *          plus the balance of the attester at the bonus instance if the instance is the latest rollup.
   *
   * @param _instance   - The instance to look at
   * @param _attester   - The attester to look at
   *
   * @return The effective balance of the attester at the instance
   */
  function effectiveBalanceOf(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (uint256)
  {
    uint256 balance = delegation.getBalanceOf(_instance, _attester);
    if (getLatestRollup() == _instance) {
      balance += delegation.getBalanceOf(BONUS_INSTANCE_ADDRESS, _attester);
    }
    return balance;
  }

  function supplyOf(address _instance) external view override(IGSE) returns (uint256) {
    return delegation.getSupplyOf(_instance);
  }

  function totalSupply() external view override(IGSE) returns (uint256) {
    return delegation.getSupply();
  }

  function getDelegatee(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (address)
  {
    return delegation.getDelegatee(_instance, _attester);
  }

  function getVotingPower(address _delegatee) external view override(IGSE) returns (uint256) {
    return delegation.getVotingPower(_delegatee);
  }

  /**
   * @notice  Get the addresses of the attesters at the instance at the time of `_timestamp`
   *
   * @param _instance   - The instance to look at
   * @param _timestamp  - The timestamp to lookup
   *
   * @return The attesters at the instance at the time of `_timestamp`
   */
  function getAttestersAtTime(address _instance, Timestamp _timestamp)
    external
    view
    override(IGSE)
    returns (address[] memory)
  {
    // @todo Throw me in jail for this crime against humanity
    uint256 count = getAttesterCountAtTime(_instance, _timestamp);
    uint256[] memory indices = new uint256[](count);
    for (uint256 i = 0; i < count; i++) {
      indices[i] = i;
    }

    return _getAddressFromIndicesAtTimestamp(_instance, indices, _timestamp);
  }

  function getAttestersFromIndicesAtTime(
    address _instance,
    Timestamp _timestamp,
    uint256[] memory _indices
  ) external view override(IGSE) returns (address[] memory) {
    return _getAddressFromIndicesAtTimestamp(_instance, _indices, _timestamp);
  }

  function getAttesterFromIndexAtTime(address _instance, uint256 _index, Timestamp _timestamp)
    external
    view
    override(IGSE)
    returns (address)
  {
    uint256[] memory indices = new uint256[](1);
    indices[0] = _index;
    return _getAddressFromIndicesAtTimestamp(_instance, indices, _timestamp)[0];
  }

  function getPowerUsed(address _delegatee, uint256 _proposalId)
    external
    view
    override(IGSE)
    returns (uint256)
  {
    return delegation.getPowerUsed(_delegatee, _proposalId);
  }

  function getBonusInstanceAddress() external pure override(IGSE) returns (address) {
    return BONUS_INSTANCE_ADDRESS;
  }

  function getVotingPowerAt(address _delegatee, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (uint256)
  {
    return delegation.getVotingPowerAt(_delegatee, _timestamp);
  }

  /**
   * @notice  Get the number of effective attesters at the instance at the time of `_timestamp`
   *          (including the bonus instance)
   *
   * @param _instance   - The instance to look at
   * @param _timestamp  - The timestamp to lookup
   *
   * @return The number of effective attesters at the instance at the time of `_timestamp`
   */
  function getAttesterCountAtTime(address _instance, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (uint256)
  {
    InstanceStaking storage store = instances[_instance];
    uint32 timestamp = Timestamp.unwrap(_timestamp).toUint32();

    uint256 count = store.attesters.lengthAtTimestamp(timestamp);
    if (getLatestRollupAt(_timestamp) == _instance) {
      count += instances[BONUS_INSTANCE_ADDRESS].attesters.lengthAtTimestamp(timestamp);
    }

    return count;
  }

  /**
   * @notice  Get the addresses of the attesters at the instance at the time of `_timestamp`
   *
   * @dev
   *
   * @param _instance   - The instance to look at
   * @param _indices    - The indices of the attesters to lookup
   * @param _timestamp  - The timestamp to lookup
   *
   * @return The addresses of the attesters at the instance at the time of `_timestamp`
   */
  function _getAddressFromIndicesAtTimestamp(
    address _instance,
    uint256[] memory _indices,
    Timestamp _timestamp
  ) internal view returns (address[] memory) {
    address[] memory attesters = new address[](_indices.length);

    // Note: This function could get called where _instance is the bonus instance.
    // This is okay, because we know that in this case, `isLatestRollup` will be false.
    // So we won't double count.
    InstanceStaking storage instanceStore = instances[_instance];
    InstanceStaking storage bonusStore = instances[BONUS_INSTANCE_ADDRESS];
    bool isLatestRollup = getLatestRollupAt(_timestamp) == _instance;

    uint32 ts = Timestamp.unwrap(_timestamp).toUint32();

    uint256 storeSize = instanceStore.attesters.lengthAtTimestamp(ts);
    uint256 canonicalSize = isLatestRollup ? bonusStore.attesters.lengthAtTimestamp(ts) : 0;
    uint256 totalSize = storeSize + canonicalSize;

    // When this is called from `getAttestersAtTime`, _indices.length is one more than the effective attester count.
    // And the returned array will be:
    // [rollup attester 1, rollup attester 2, ..., rollup attester N, bonus attester 1, bonus attester 2, ..., bonus attester M]
    for (uint256 i = 0; i < _indices.length; i++) {
      uint256 index = _indices[i];
      require(index < totalSize, Errors.GSE__OutOfBounds(index, totalSize));

      if (index < storeSize) {
        attesters[i] = instanceStore.attesters.getAddressFromIndexAtTimestamp(index, ts);
      } else if (isLatestRollup) {
        attesters[i] = bonusStore.attesters.getAddressFromIndexAtTimestamp(index - storeSize, ts);
      } else {
        revert Errors.GSE__FatalError("SHOULD NEVER HAPPEN");
      }
    }

    return attesters;
  }

  // @todo I think we can clean this up more, don't think we need the instances being passed around nearly as much now.
  function _getInstanceStoreWithAttester(address _instance, address _attester)
    internal
    view
    returns (InstanceStaking storage, bool, address)
  {
    InstanceStaking storage store = instances[_instance];
    bool attesterExists = store.attesters.contains(_attester);
    address instanceAddress = _instance;

    if (
      !attesterExists && getLatestRollup() == _instance
        && instances[BONUS_INSTANCE_ADDRESS].attesters.contains(_attester)
    ) {
      store = instances[BONUS_INSTANCE_ADDRESS];
      attesterExists = true;
      instanceAddress = BONUS_INSTANCE_ADDRESS;
    }

    return (store, attesterExists, instanceAddress);
  }
}
