// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {IATPStaker} from "@test/reward-calculators/IATP.sol";
import {IPremiumATP, IPremiumATPStaker, IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PremiumATPStaker
 * @author Aztec Labs
 * @notice The staker of a premium-eligible Aztec Token Position (ATP). It stakes only from its position's allocation
 *         and records every attester it deposits, so that a sequencer reward calculator can tell stake funded by the
 *         allocation from any other stake that names this staker as its withdrawer.
 *
 * @dev Security argument. `Rollup.deposit` lets anyone name any withdrawer, so "the GSE withdrawer of an attester is
 *      this staker" says nothing about where its stake came from. What the staker guarantees instead:
 *
 *      1. An attester is recorded only by `stake` or `stakeWithProvider`, and only after the position reserved one
 *         activation threshold of its allocation for it (`IPremiumATP.reserveForStake`, which also sends the tokens
 *         here). The position refuses a reservation beyond `allocation - claimed`, and refuses a claim that would
 *         eat into what is reserved, so `claimed + reserved <= allocation` always holds. Each recorded attester holds
 *         exactly its own reservation (`getStake`), and an attester is recorded at most once, so
 *         `recorded attesters x threshold <= reserved <= allocation - claimed`: premium-earning stake never exceeds
 *         the allocation, and as much of the allocation as is earning premiums stays out of the beneficiary's hands.
 *      2. Every exit this staker initiates pays the position, never this contract or the operator: the staker always
 *         names its ATP as the recipient, and an exit initiated by the attester can only be finalized after the
 *         withdrawer (this staker) set a recipient. The position has no sweep, so returning stake stays under the
 *         lock and the reservation.
 *      3. Tokens that reach this contract any other way (a deposit that failed at flush refunds its withdrawer)
 *         can only go to the position (`returnTokensToATP`, permissionless). A refund never frees a reservation.
 *      4. Releasing a record (`release`) is voluntary and only the operator can do it, at any time. It only removes
 *         that attester's premium. It is not tied to the attester's rollup status, because `NONE` also means queued,
 *         moved to another rollup, or fully slashed. A released attester cannot come back through a fresh liquid
 *         deposit: the GSE never lets an attester address register twice.
 *
 *      An attester that someone else deposited with this staker as withdrawer, from any funds, is not recorded and
 *      earns no premium. If that deposit front-ran the staker's own deposit of the same attester (the keys and proof
 *      of possession are public once the staker's transaction is), the attester is recorded and validating while the
 *      staker's deposit is refunded here: the premium is then backed by the reservation rather than by the deposited
 *      tokens, and the deposited tokens can only exit to the position. Accepted.
 *
 *      Trust roots: the token, the rollup registry (only its rollups receive stake) and the staking registry are
 *      immutables of the implementation, set by the factory. The staker is not upgradeable: an upgradeable staker
 *      would make every implementation its upgrader can install a trust root that must preserve records,
 *      reservations and the no-sweep property, and a calculator could not check that from the staker's own answers.
 *      A production staker that must be upgradeable has to make its upgrade authority such a trust root.
 *
 *      Each position gets an EIP-1167 clone of one implementation, bound once to the position that initializes it.
 *      The implementation itself is bound to a dead address at construction, so it can never be initialized.
 */
contract PremiumATPStaker is IPremiumATPStaker {
  using SafeERC20 for IERC20;

  IERC20 internal immutable TOKEN;
  IRegistry internal immutable ROLLUP_REGISTRY;
  IStakingRegistry internal immutable STAKING_REGISTRY;

  address internal atp;
  mapping(address attester => uint256 amount) internal stakeOf;

  /**
   * @notice Emitted when an attester is recorded
   * @param attester The attester
   * @param rollup The rollup it was deposited into
   * @param amount The reservation it holds
   */
  event AttesterRecorded(address indexed attester, address indexed rollup, uint256 amount);

  /**
   * @notice Emitted when the operator releases an attester
   * @param attester The attester
   * @param amount The reservation freed
   */
  event AttesterReleased(address indexed attester, uint256 amount);

  /**
   * @notice Emitted when tokens held by the staker are returned to the position
   * @param amount The amount returned
   */
  event TokensReturnedToATP(uint256 amount);

  error PremiumATPStaker__AlreadyInitialized();
  error PremiumATPStaker__NotOperator(address caller, address operator);
  error PremiumATPStaker__AlreadyRecorded(address attester);
  error PremiumATPStaker__NotRecorded(address attester);
  error PremiumATPStaker__ZeroActivationThreshold();
  error PremiumATPStaker__UnexpectedEntryQueueLength(uint256 expected, uint256 actual);
  error PremiumATPStaker__UnexpectedWithdrawer(address withdrawer);

  modifier onlyOperator() {
    address operator = IPremiumATP(atp).getOperator();
    require(msg.sender == operator, PremiumATPStaker__NotOperator(msg.sender, operator));
    _;
  }

  /**
   * @param _token The staking asset
   * @param _rollupRegistry The registry of the rollups the staker may deposit into
   * @param _stakingRegistry The provider staking registry
   */
  constructor(IERC20 _token, IRegistry _rollupRegistry, IStakingRegistry _stakingRegistry) {
    TOKEN = _token;
    ROLLUP_REGISTRY = _rollupRegistry;
    STAKING_REGISTRY = _stakingRegistry;
    atp = address(0xdead);
  }

  /**
   * @notice Binds the staker to the caller, its position
   * @dev Callable once. The position calls it in the transaction that creates the clone.
   */
  function initialize() external {
    require(atp == address(0), PremiumATPStaker__AlreadyInitialized());
    atp = msg.sender;
  }

  /**
   * @notice Stakes one activation threshold of the position's allocation for `_attester`, with this staker as the
   *         withdrawer, and records the attester
   * @dev Only the operator. Reserves before depositing, so it reverts if the allocation has no room left.
   * @param _version The rollup version to deposit into
   * @param _attester The attester
   * @param _publicKeyInG1 The attester's BLS public key in G1
   * @param _publicKeyInG2 The attester's BLS public key in G2
   * @param _proofOfPossession The proof of possession of the key
   * @param _moveWithLatestRollup Whether the stake follows the latest rollup
   */
  function stake(
    uint256 _version,
    address _attester,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) external onlyOperator {
    IStaking rollup = _getRollup(_version);
    uint256 amount = _reserve(rollup);
    _record(_attester, address(rollup), amount);

    TOKEN.forceApprove(address(rollup), amount);
    rollup.deposit(_attester, address(this), _publicKeyInG1, _publicKeyInG2, _proofOfPossession, _moveWithLatestRollup);
  }

  /**
   * @notice Stakes one activation threshold of the position's allocation with a provider's next key, with this
   *         staker as the withdrawer, and records the attester the provider used
   * @dev Only the operator. The staking registry does not return the attester, so the staker reads it from the tail
   *      of the rollup's entry queue, after checking that the call added exactly one entry and that the entry names
   *      this staker as its withdrawer. A staking registry that returns the attester is the preferred production
   *      path: it does not couple the staker to the queue's internals.
   * @param _version The rollup version to deposit into
   * @param _providerIdentifier The provider
   * @param _expectedProviderTakeRate The provider take rate the operator agreed to
   * @param _userRewardsRecipient The recipient of the user's share of the rewards
   * @param _moveWithLatestRollup Whether the stake follows the latest rollup
   */
  function stakeWithProvider(
    uint256 _version,
    uint256 _providerIdentifier,
    uint16 _expectedProviderTakeRate,
    address _userRewardsRecipient,
    bool _moveWithLatestRollup
  ) external onlyOperator {
    IStaking rollup = _getRollup(_version);
    uint256 amount = _reserve(rollup);

    uint256 lengthBefore = rollup.getEntryQueueLength();
    TOKEN.forceApprove(address(STAKING_REGISTRY), amount);
    STAKING_REGISTRY.stake(
      _providerIdentifier,
      _version,
      address(this),
      _expectedProviderTakeRate,
      _userRewardsRecipient,
      _moveWithLatestRollup
    );
    TOKEN.forceApprove(address(STAKING_REGISTRY), 0);

    uint256 lengthAfter = rollup.getEntryQueueLength();
    require(
      lengthAfter == lengthBefore + 1, PremiumATPStaker__UnexpectedEntryQueueLength(lengthBefore + 1, lengthAfter)
    );
    DepositArgs memory entry = rollup.getEntryQueueAt(lengthAfter - 1);
    require(entry.withdrawer == address(this), PremiumATPStaker__UnexpectedWithdrawer(entry.withdrawer));
    _record(entry.attester, address(rollup), amount);
  }

  /**
   * @notice Starts the exit of `_attester`, paying the position when it finalizes
   * @dev Only the operator. Works for any attester whose withdrawer is this staker, recorded or not, and also sets
   *      the position as the recipient of an exit the attester initiated. The record is kept: the attester keeps
   *      earning premiums for checkpoints it proposed until the operator releases it.
   * @param _version The rollup version the attester is on
   * @param _attester The attester
   */
  function initiateWithdraw(uint256 _version, address _attester) external onlyOperator {
    _getRollup(_version).initiateWithdraw(_attester, atp);
  }

  /**
   * @notice Finalizes the exit of `_attester`, which pays the recipient set at initiation, the position
   * @dev Anyone can finalize on the rollup directly; this exists for convenience.
   * @param _version The rollup version the attester is on
   * @param _attester The attester
   */
  function finalizeWithdraw(uint256 _version, address _attester) external {
    _getRollup(_version).finalizeWithdraw(_attester);
  }

  /**
   * @notice Stops recording `_attester` and frees its reservation
   * @dev Only the operator, at any time. The attester earns no premium afterwards.
   * @param _attester A recorded attester
   */
  function release(address _attester) external onlyOperator {
    uint256 amount = stakeOf[_attester];
    require(amount > 0, PremiumATPStaker__NotRecorded(_attester));
    delete stakeOf[_attester];
    IPremiumATP(atp).releaseReservation(amount);
    emit AttesterReleased(_attester, amount);
  }

  /**
   * @notice Sends every token this staker holds to its position
   * @dev Permissionless. Recovers refunds of deposits that failed at flush. Does not change any reservation.
   */
  function returnTokensToATP() external {
    uint256 balance = TOKEN.balanceOf(address(this));
    TOKEN.safeTransfer(atp, balance);
    emit TokensReturnedToATP(balance);
  }

  /**
   * @notice Returns the position this staker belongs to
   * @return The ATP address
   */
  function getATP() external view override(IATPStaker) returns (address) {
    return atp;
  }

  /**
   * @notice Returns the operator of the position
   * @return The operator address
   */
  function getOperator() external view returns (address) {
    return IPremiumATP(atp).getOperator();
  }

  /**
   * @notice Returns whether `_attester` is recorded
   * @param _attester The attester
   * @return True if this staker deposited the attester from the allocation and has not released it
   */
  function isAttester(address _attester) external view override(IPremiumATPStaker) returns (bool) {
    return stakeOf[_attester] > 0;
  }

  /**
   * @notice Returns the reservation `_attester` holds
   * @param _attester The attester
   * @return The reserved amount, zero if not recorded
   */
  function getStake(address _attester) external view returns (uint256) {
    return stakeOf[_attester];
  }

  function _record(address _attester, address _rollup, uint256 _amount) internal {
    require(stakeOf[_attester] == 0, PremiumATPStaker__AlreadyRecorded(_attester));
    stakeOf[_attester] = _amount;
    emit AttesterRecorded(_attester, _rollup, _amount);
  }

  function _reserve(IStaking _rollup) internal returns (uint256 amount) {
    amount = _rollup.getActivationThreshold();
    require(amount > 0, PremiumATPStaker__ZeroActivationThreshold());
    IPremiumATP(atp).reserveForStake(amount);
  }

  function _getRollup(uint256 _version) internal view returns (IStaking) {
    return IStaking(address(ROLLUP_REGISTRY.getRollup(_version)));
  }
}
