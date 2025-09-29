// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Bn254LibWrapper} from "@aztec/governance/Bn254LibWrapper.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {AddressSnapshotLib, SnapshottedAddressSet} from "@aztec/governance/libraries/AddressSnapshotLib.sol";
import {
  DepositDelegationLib, DepositAndDelegationAccounting
} from "@aztec/governance/libraries/DepositDelegationLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

// Struct to store configuration of an attester (block producer)
// Keep track of the actor who can initiate and control withdraws for the attester.
// Keep track of the public key in G1 of BN254 that has registered on the instance
struct AttesterConfig {
  G1Point publicKey;
  address withdrawer;
}

// Struct to track the attesters (block producers) on a particular rollup instance
// throughout time, along with each attester's current config.
// Finally a flag to track if the instance exists.
struct InstanceAttesterRegistry {
  SnapshottedAddressSet attesters;
  bool exists;
}

interface IGSECore {
  event Deposit(address indexed instance, address indexed attester, address withdrawer);

  function setGovernance(Governance _governance) external;
  function setProofOfPossessionGasLimit(uint64 _proofOfPossessionGasLimit) external;
  function addRollup(address _rollup) external;
  function deposit(
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) external;
  function withdraw(address _attester, uint256 _amount) external returns (uint256, bool, uint256);
  function delegate(address _instance, address _attester, address _delegatee) external;
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external;
  function voteWithBonus(uint256 _proposalId, uint256 _amount, bool _support) external;
  function finalizeWithdraw(uint256 _withdrawalId) external;
  function proposeWithLock(IPayload _proposal, address _to) external returns (uint256);

  function isRegistered(address _instance, address _attester) external view returns (bool);
  function isRollupRegistered(address _instance) external view returns (bool);
  function getLatestRollup() external view returns (address);
  function getLatestRollupAt(Timestamp _timestamp) external view returns (address);
  function getGovernance() external view returns (Governance);
}

interface IGSE is IGSECore {
  function getRegistrationDigest(G1Point memory _publicKey) external view returns (G1Point memory);
  function getDelegatee(address _instance, address _attester) external view returns (address);
  function getVotingPower(address _attester) external view returns (uint256);
  function getVotingPowerAt(address _attester, Timestamp _timestamp) external view returns (uint256);

  function getWithdrawer(address _attester) external view returns (address);
  function balanceOf(address _instance, address _attester) external view returns (uint256);
  function effectiveBalanceOf(address _instance, address _attester) external view returns (uint256);
  function supplyOf(address _instance) external view returns (uint256);
  function totalSupply() external view returns (uint256);
  function getConfig(address _attester) external view returns (AttesterConfig memory);
  function getAttesterCountAtTime(address _instance, Timestamp _timestamp) external view returns (uint256);

  function getAttestersFromIndicesAtTime(address _instance, Timestamp _timestamp, uint256[] memory _indices)
    external
    view
    returns (address[] memory);
  function getG1PublicKeysFromAddresses(address[] memory _attesters) external view returns (G1Point[] memory);
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
 * @notice The core Governance Staking Escrow contract that handles the deposits of attesters on rollup instances.
 *         It is responsible for:
 *         - depositing/withdrawing attesters on rollup instances
 *         - providing rollup instances with historical views of their attesters
 *         - allowing depositors to delegate their voting power
 *         - allowing delegatees to vote at governance
 *         - maintaining a set of "bonus" attesters which are always deposited on behalf of the latest rollup
 *
 * NB: The "bonus" attesters are thus automatically "moved along" whenever the latest rollup changes.
 * That is, at the point of the rollup getting added, the bonus is immediately available.
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
  using DepositDelegationLib for DepositAndDelegationAccounting;
  using SafeERC20 for IERC20;

  /**
   * Create a special "bonus" address for use by the latest rollup.
   * This is a convenience mechanism to allow attesters to always be staked on the latest rollup.
   *
   * As far as terminology, the GSE tracks deposits and voting/delegation data for "instances",
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
  address public constant BONUS_INSTANCE_ADDRESS = address(uint160(uint256(keccak256("bonus-instance"))));

  // External wrapper of the BN254 library to more easily allow gas limits.
  Bn254LibWrapper internal immutable BN254_LIB_WRAPPER = new Bn254LibWrapper();

  // The amount of ASSET needed to add an attester to the set
  uint256 public immutable ACTIVATION_THRESHOLD;

  // The amount of ASSET needed to keep an attester in the set, if the attester balance fall below this threshold
  // the attester will be ejected from the set.
  uint256 public immutable EJECTION_THRESHOLD;

  // The asset used for sybil resistance and power in governance. Must match the ASSET in `Governance` to work as
  // intended.
  IERC20 public immutable ASSET;

  // The GSE's history of rollups.
  Checkpoints.Trace224 internal rollups;
  // Mapping from instance address to its historical attester information.
  mapping(address instanceAddress => InstanceAttesterRegistry instance) internal instances;

  // Global attester information
  mapping(address attester => AttesterConfig config) internal configOf;
  // Mapping from the hashed public key in G1 of BN254 to the keys are registered.
  mapping(bytes32 hashedPK1 => bool isRegistered) public ownedPKs;

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
  DepositAndDelegationAccounting internal delegation;
  Governance internal governance;

  // Gas limit for proof of possession validation.
  //
  // Must exceed the happy path gas consumption to ensure deposits succeed.
  // Acts as a cap on unhappy path gas usage to prevent excessive consumption.
  //
  // - Happy path average: 140K gas
  // - Buffer: 60K gas (~40% margin)
  //
  // WARNING: If set below happy path requirements, all deposits will fail.
  // Governance can adjust this value via proposal.
  uint64 public proofOfPossessionGasLimit = 200_000;

  /**
   * @dev enforces that the caller is a registered rollup.
   */
  modifier onlyRollup() {
    require(isRollupRegistered(msg.sender), Errors.GSE__NotRollup(msg.sender));
    _;
  }

  /**
   * @param __owner - The owner of the GSE.
   *                  Initially a deployer to allow adding an initial rollup, then handed over to governance.
   * @param _asset - The ERC20 token asset used in governance and for sybil resistance.
   *                 This token is deposited by attesters to gain voting power in governance
   *                 (ratio of voting power to staked amount is 1:1).
   * @param _activationThreshold - The amount of asset required to deposit an attester on the rollup.
   * @param _ejectionThreshold - The minimum amount of asset required to be in the set to be considered an attester.
   *                        If the balance falls below this threshold, the attester is ejected from the set.
   */
  constructor(address __owner, IERC20 _asset, uint256 _activationThreshold, uint256 _ejectionThreshold)
    Ownable(__owner)
  {
    ASSET = _asset;
    ACTIVATION_THRESHOLD = _activationThreshold;
    EJECTION_THRESHOLD = _ejectionThreshold;
    instances[BONUS_INSTANCE_ADDRESS].exists = true;
  }

  function setGovernance(Governance _governance) external override(IGSECore) onlyOwner {
    require(address(governance) == address(0), Errors.GSE__GovernanceAlreadySet());
    governance = _governance;
  }

  function setProofOfPossessionGasLimit(uint64 _proofOfPossessionGasLimit) external override(IGSECore) onlyOwner {
    proofOfPossessionGasLimit = _proofOfPossessionGasLimit;
  }

  /**
   * @notice  Adds another rollup to the instances, which is the new latest rollup.
   *          Only callable by the owner (usually governance) and only when the rollup is not already in the set
   *
   * @dev rollups only have access to the "bonus instance" while they are the most recent rollup.
   *
   * @dev The GSE only supports adding rollups, not removing them. If a rollup becomes compromised, governance can
   * simply add a new rollup and the bonus instance mechanism ensures a smooth transition by allowing the new rollup
   * to immediately inherit attesters.
   *
   * @dev Beware that multiple calls to `addRollup` at the same `block.timestamp` will override each other and only
   * the last will be in the `rollups`.
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
   * @dev Transfers ASSET from msg.sender to the GSE, and then into Governance.
   *
   * @dev if _moveWithLatestRollup is true, then msg.sender must be the latest rollup.
   *
   * @dev An attester configuration is registered globally to avoid BLS troubles when moving stake.
   *
   * Suppose the registered rollups are A, then B, then C, so C's effective attesters are
   * those associated with C and the bonus address.
   *
   * Alice may come along now and deposit on A or B, with _moveWithLatestRollup=false in either case.
   *
   * For depositing into C, she can deposit *either* with _moveWithLatestRollup = true OR false.
   * If she deposits with _moveWithLatestRollup = false, then she is associated with C's address.
   * If she deposits with _moveWithLatestRollup = true, then she is associated with the bonus address.
   *
   * Suppose she deposits with _moveWithLatestRollup = true, and a new rollup D is added to the rollups.
   * Then her stake moves to D, and she is in the effective attesters of D.
   *
   * @param _attester     - The attester address on behalf of which the deposit is made.
   * @param _withdrawer   - Address which the user wish to use to initiate a withdraw for the `_attester` and
   *                        to update delegation with. The withdrawals are enforced by the rollup to which it is
   *                        controlled, so it is practically a value for the rollup to use, meaning dishonest rollup
   *                        can reject withdrawal attempts.
   * @param _publicKeyInG1 - BLS public key for the attester in G1
   * @param _publicKeyInG2 - BLS public key for the attester in G2
   * @param _proofOfPossession - A proof of possessions for the private key corresponding _publicKey in G1 and G2
   * @param _moveWithLatestRollup - Whether to deposit into the specific instance, or the bonus instance
   */
  function deposit(
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) external override(IGSECore) onlyRollup {
    bool isMsgSenderLatestRollup = getLatestRollup() == msg.sender;

    // If _moveWithLatestRollup is true, then msg.sender must be the latest rollup.
    if (_moveWithLatestRollup) {
      require(isMsgSenderLatestRollup, Errors.GSE__NotLatestRollup(msg.sender));
    }

    // Ensure that we are not already attesting on the rollup
    require(!isRegistered(msg.sender, _attester), Errors.GSE__AlreadyRegistered(msg.sender, _attester));

    // Ensure that if we are the latest rollup, we are not already attesting on the bonus instance.
    if (isMsgSenderLatestRollup) {
      require(
        !isRegistered(BONUS_INSTANCE_ADDRESS, _attester),
        Errors.GSE__AlreadyRegistered(BONUS_INSTANCE_ADDRESS, _attester)
      );
    }

    // Set the recipient instance address, i.e. the one that will receive the attester.
    // From above, we know that if we are here, and _moveWithLatestRollup is true,
    // then msg.sender is the latest instance,
    // but the user is targeting the bonus address.
    // Otherwise, we use the msg.sender, which we know is a registered rollup
    // thanks to the modifier.
    address recipientInstance = _moveWithLatestRollup ? BONUS_INSTANCE_ADDRESS : msg.sender;

    // Add the attester to the instance's checkpointed set of attesters.
    require(
      instances[recipientInstance].attesters.add(_attester), Errors.GSE__AlreadyRegistered(recipientInstance, _attester)
    );

    _checkProofOfPossession(_attester, _publicKeyInG1, _publicKeyInG2, _proofOfPossession);

    // This is the ONLY place where we set the configuration for an attester.
    // This means that their withdrawer and public keys are set once, globally.
    // If they exit, they must re-deposit with a new key.
    configOf[_attester] = AttesterConfig({withdrawer: _withdrawer, publicKey: _publicKeyInG1});

    delegation.delegate(recipientInstance, _attester, recipientInstance);
    delegation.increaseBalance(recipientInstance, _attester, ACTIVATION_THRESHOLD);

    ASSET.safeTransferFrom(msg.sender, address(this), ACTIVATION_THRESHOLD);

    Governance gov = getGovernance();
    ASSET.approve(address(gov), ACTIVATION_THRESHOLD);
    gov.deposit(address(this), ACTIVATION_THRESHOLD);

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
   * @param _amount   - The amount of staking asset to withdraw. Has 1:1 ratio with voting power.
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
    InstanceAttesterRegistry storage attesterRegistry = instances[msg.sender];
    bool foundAttester = attesterRegistry.attesters.contains(_attester);

    // If we haven't found the attester in the rollup instance, and we are latest rollup, go look in the "bonus"
    // instance.
    if (
      !foundAttester && getLatestRollup() == msg.sender
        && instances[BONUS_INSTANCE_ADDRESS].attesters.contains(_attester)
    ) {
      withdrawingInstance = BONUS_INSTANCE_ADDRESS;
      attesterRegistry = instances[BONUS_INSTANCE_ADDRESS];
      foundAttester = true;
    }

    require(foundAttester, Errors.GSE__NothingToExit(_attester));

    uint256 balance = delegation.getBalanceOf(withdrawingInstance, _attester);
    require(balance >= _amount, Errors.GSE__InsufficientBalance(balance, _amount));

    // First assume we are only withdrawing the amount specified.
    uint256 amountWithdrawn = _amount;
    // If the balance after withdrawal is less than the ejection threshold,
    // we will remove the attester from the instance.
    bool isRemoved = balance - _amount < EJECTION_THRESHOLD;

    // Note that the current implementation of the rollup does not allow for partial withdrawals,
    // via `initiateWithdraw`, so a "normal" withdrawal will always remove the attester from the instance.
    // However, if the attester is slashed, we might just reduce the balance.
    if (isRemoved) {
      require(attesterRegistry.attesters.remove(_attester), Errors.GSE__FailedToRemove(_attester));
      amountWithdrawn = balance;

      // When removing the user, remove the delegating as well.
      delegation.undelegate(withdrawingInstance, _attester);

      // NOTE
      // We intentionally did not remove the attester config.
      // Attester config is set ONCE when the attester is first seen by the GSE,
      // and is shared across all instances.
    }

    // Decrease the balance of the attester in the instance.
    // Move voting power from the attester's delegatee to address(0) (unless the delegatee is already address(0))
    // Reduce the supply of the instance and the total supply.
    delegation.decreaseBalance(withdrawingInstance, _attester, amountWithdrawn);

    // The withdrawal contains a pending amount that may be claimed using the withdrawal ID when a delay enforced by
    // the Governance contract has passed.
    // Note that the rollup is the one that receives the funds when the withdrawal is claimed.
    uint256 withdrawalId = getGovernance().initiateWithdraw(msg.sender, amountWithdrawn);

    return (amountWithdrawn, isRemoved, withdrawalId);
  }

  /**
   * @notice  A helper function to make it easy for users of the GSE to finalize
   *          a pending exit in the governance.
   *
   *          Kept in here since it is already connected to Governance:
   *          we don't want the rollup to have to deal with links to gov etc.
   *
   * @dev     Will be a no operation if the withdrawal is already collected.
   *
   * @param _withdrawalId - The id of the withdrawal
   */
  function finalizeWithdraw(uint256 _withdrawalId) external override(IGSECore) {
    Governance gov = getGovernance();
    if (!gov.getWithdrawal(_withdrawalId).claimed) {
      gov.finalizeWithdraw(_withdrawalId);
    }
  }

  /**
   * @notice Make a proposal to Governance via `Governance.proposeWithLock`
   *
   * @dev It is required to expose this on the GSE, since it is assumed that only the GSE can hold
   * power in Governance (see the comment at the top of Governance.sol).
   *
   * @dev Transfers governance's configured `lockAmount` of ASSET from msg.sender to the GSE,
   * and then into Governance.
   *
   * @dev Immediately creates a withdrawal from Governance for the `lockAmount`.
   *
   * @dev The delay until the withdrawal may be finalized is equal to the current `lockDelay` in Governance.
   *
   * @param _payload - The IPayload address, which is a contract that contains the proposed actions to be executed by
   * the governance.
   * @param _to - The address that will receive the withdrawn funds when the withdrawal is finalized (see
   * `finalizeWithdraw`)
   *
   * @return The id of the proposal
   */
  function proposeWithLock(IPayload _payload, address _to) external override(IGSECore) returns (uint256) {
    Governance gov = getGovernance();
    uint256 amount = gov.getConfiguration().proposeConfig.lockAmount;

    ASSET.safeTransferFrom(msg.sender, address(this), amount);
    ASSET.approve(address(gov), amount);

    gov.deposit(address(this), amount);

    return gov.proposeWithLock(_payload, _to);
  }

  /**
   * @notice  Delegates the voting power of `_attester` at `_instance` to `_delegatee`
   *
   *          Only callable by the `withdrawer` for the given `_attester` at the given
   *          `_instance`. This is to ensure that the depositor in poor mans delegation;
   *          listing another entity as the `attester`, still controls his voting power,
   *          even if someone else is running the node. Separately, it makes it simpler
   *          to use cold-storage for more impactful actions.
   *
   * @dev The delegatee may use this voting power to vote on proposals in Governance.
   *
   * Note that voting power for a delegatee is timestamped. The delegatee must have this
   * power before a proposal becomes "active" in order to use it.
   * See `Governance.getProposalState` for more details.
   *
   * @param _instance   - The address of the rollup instance (or bonus instance address)
   *                      to which the `_attester` deposit is pledged.
   * @param _attester   - The address of the attester to delegate on behalf of
   * @param _delegatee  - The delegatee that should receive the power
   */
  function delegate(address _instance, address _attester, address _delegatee) external override(IGSECore) {
    require(isRollupRegistered(_instance), Errors.GSE__InstanceDoesNotExist(_instance));
    address withdrawer = configOf[_attester].withdrawer;
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
   * @notice  Votes at the governance using the power delegated to the bonus instance.
   *          Only callable by the rollup that was the latest rollup at the time of the proposal.
   *
   * @param _proposalId - The id of the proposal in the governance to vote on
   * @param _amount     - The amount of voting power to use in the vote
   *                      In the gov, it is possible to do a vote with partial power
   */
  function voteWithBonus(uint256 _proposalId, uint256 _amount, bool _support) external override(IGSECore) {
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
  function isRegistered(address _instance, address _attester) public view override(IGSECore) returns (bool) {
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

  function _checkProofOfPossession(
    address _attester,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession
  ) internal virtual {
    // Make sure the attester has not registered before
    G1Point memory previouslyRegisteredPoint = configOf[_attester].publicKey;
    require(
      (previouslyRegisteredPoint.x == 0 && previouslyRegisteredPoint.y == 0),
      Errors.GSE__CannotChangePublicKeys(previouslyRegisteredPoint.x, previouslyRegisteredPoint.y)
    );

    // Make sure the incoming point has not been seen before
    // NOTE: we only need to check for the existence of Pk1, and not also for Pk2,
    // as the Pk2 will be constrained to have the same underlying secret key as part of the proofOfPossession,
    // so existence/correctness of Pk2 is implied by existence/correctness of Pk1.
    bytes32 hashedIncomingPoint = keccak256(abi.encodePacked(_publicKeyInG1.x, _publicKeyInG1.y));
    require((!ownedPKs[hashedIncomingPoint]), Errors.GSE__ProofOfPossessionAlreadySeen(hashedIncomingPoint));
    ownedPKs[hashedIncomingPoint] = true;

    // We validate the proof of possession using an external contract to limit gas potentially "sacrificed"
    // in case of failure.
    require(
      BN254_LIB_WRAPPER.proofOfPossession{gas: proofOfPossessionGasLimit}(
        _publicKeyInG1, _publicKeyInG2, _proofOfPossession
      ),
      Errors.GSE__InvalidProofOfPossession()
    );
  }

  function _pendingThrough(uint256 _proposalId) internal view returns (Timestamp) {
    // Directly compute pendingThrough for memory proposal
    Proposal memory proposal = getGovernance().getProposal(_proposalId);
    return proposal.creation + proposal.config.votingDelay;
  }
}

contract GSE is IGSE, GSECore {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;
  using SafeCast for uint224;
  using Checkpoints for Checkpoints.Trace224;
  using DepositDelegationLib for DepositAndDelegationAccounting;

  constructor(address __owner, IERC20 _asset, uint256 _activationThreshold, uint256 _ejectionThreshold)
    GSECore(__owner, _asset, _activationThreshold, _ejectionThreshold)
  {}

  /**
   * @notice  Get the registration digest of a public key
   *          by hashing the the public key to a point on the curve which may subsequently
   *          be signed by the corresponding private key.
   *
   * @param _publicKey - The public key to get the registration digest of
   *
   * @return The registration digest of the public key. Sign and submit as a proof of possession.
   */
  function getRegistrationDigest(G1Point memory _publicKey) external view override(IGSE) returns (G1Point memory) {
    return BN254_LIB_WRAPPER.g1ToDigestPoint(_publicKey);
  }

  function getConfig(address _attester) external view override(IGSE) returns (AttesterConfig memory) {
    return configOf[_attester];
  }

  function getWithdrawer(address _attester) external view override(IGSE) returns (address withdrawer) {
    AttesterConfig memory config = configOf[_attester];

    return config.withdrawer;
  }

  function balanceOf(address _instance, address _attester) external view override(IGSE) returns (uint256) {
    return delegation.getBalanceOf(_instance, _attester);
  }

  /**
   * @notice  Get the effective balance of the attester at the instance.
   *
   *          The effective balance is the balance of the attester at the specific instance or at the bonus if the
   *          instance is the latest rollup and he was not at the specific. We can do this as an `or` since the
   *          attester may only be active at one of them.
   *
   * @param _instance   - The instance to look at
   * @param _attester   - The attester to look at
   *
   * @return The effective balance of the attester at the instance
   */
  function effectiveBalanceOf(address _instance, address _attester) external view override(IGSE) returns (uint256) {
    uint256 balance = delegation.getBalanceOf(_instance, _attester);
    if (balance == 0 && getLatestRollup() == _instance) {
      return delegation.getBalanceOf(BONUS_INSTANCE_ADDRESS, _attester);
    }
    return balance;
  }

  function supplyOf(address _instance) external view override(IGSE) returns (uint256) {
    return delegation.getSupplyOf(_instance);
  }

  function totalSupply() external view override(IGSE) returns (uint256) {
    return delegation.getSupply();
  }

  function getDelegatee(address _instance, address _attester) external view override(IGSE) returns (address) {
    return delegation.getDelegatee(_instance, _attester);
  }

  function getVotingPower(address _delegatee) external view override(IGSE) returns (uint256) {
    return delegation.getVotingPower(_delegatee);
  }

  function getAttestersFromIndicesAtTime(address _instance, Timestamp _timestamp, uint256[] memory _indices)
    external
    view
    override(IGSE)
    returns (address[] memory)
  {
    return _getAddressFromIndicesAtTimestamp(_instance, _indices, _timestamp);
  }

  /**
   * @notice  Get the G1 public keys of the attesters
   *
   * NOTE: this function does NOT check if the attesters are CURRENTLY ACTIVE.
   *
   * @param _attesters  - The attesters to lookup
   *
   * @return The G1 public keys of the attesters
   */
  function getG1PublicKeysFromAddresses(address[] memory _attesters)
    external
    view
    override(IGSE)
    returns (G1Point[] memory)
  {
    G1Point[] memory keys = new G1Point[](_attesters.length);
    for (uint256 i = 0; i < _attesters.length; i++) {
      keys[i] = configOf[_attesters[i]].publicKey;
    }

    return keys;
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

  function getPowerUsed(address _delegatee, uint256 _proposalId) external view override(IGSE) returns (uint256) {
    return delegation.getPowerUsed(_delegatee, _proposalId);
  }

  function getBonusInstanceAddress() external pure override(IGSE) returns (address) {
    return BONUS_INSTANCE_ADDRESS;
  }

  function getVotingPowerAt(address _delegatee, Timestamp _timestamp) public view override(IGSE) returns (uint256) {
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
  function getAttesterCountAtTime(address _instance, Timestamp _timestamp) public view override(IGSE) returns (uint256) {
    InstanceAttesterRegistry storage store = instances[_instance];
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
  function _getAddressFromIndicesAtTimestamp(address _instance, uint256[] memory _indices, Timestamp _timestamp)
    internal
    view
    returns (address[] memory)
  {
    address[] memory attesters = new address[](_indices.length);

    // Note: This function could get called where _instance is the bonus instance.
    // This is okay, because we know that in this case, `isLatestRollup` will be false.
    // So we won't double count.
    InstanceAttesterRegistry storage instanceStore = instances[_instance];
    InstanceAttesterRegistry storage bonusStore = instances[BONUS_INSTANCE_ADDRESS];
    bool isLatestRollup = getLatestRollupAt(_timestamp) == _instance;

    uint32 ts = Timestamp.unwrap(_timestamp).toUint32();

    // The effective size of the set will be the size of the instance attesters, plus the size of the bonus attesters
    // if the instance is the latest rollup. This will effectively work as one long list with [...instance, ...bonus]
    uint256 storeSize = instanceStore.attesters.lengthAtTimestamp(ts);
    uint256 canonicalSize = isLatestRollup ? bonusStore.attesters.lengthAtTimestamp(ts) : 0;
    uint256 totalSize = storeSize + canonicalSize;

    // We loop through the indices, and for each index we get the attester from the instance or bonus instance
    // depending on value in the collective list [...instance, ...bonus]
    for (uint256 i = 0; i < _indices.length; i++) {
      uint256 index = _indices[i];
      require(index < totalSize, Errors.GSE__OutOfBounds(index, totalSize));

      // since we have ensured that the index is not out of bounds, we can use the unsafe function in
      // `AddressSnapshotLib` to fetch if. We use the `recent` variant as we expect the attesters to
      // mainly be from recent history when fetched during tx execution.

      if (index < storeSize) {
        attesters[i] = instanceStore.attesters.unsafeGetRecentAddressFromIndexAtTimestamp(index, ts);
      } else if (isLatestRollup) {
        attesters[i] = bonusStore.attesters.unsafeGetRecentAddressFromIndexAtTimestamp(index - storeSize, ts);
      } else {
        revert Errors.GSE__FatalError("SHOULD NEVER HAPPEN");
      }
    }

    return attesters;
  }
}
