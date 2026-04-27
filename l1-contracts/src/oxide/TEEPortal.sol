// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {CheckpointLog, IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {IHaveVersion, IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";
import {Caps} from "./Caps.sol";
import {ITEEPortal} from "./interfaces/ITEEPortal.sol";
import {IPredicate} from "./IPredicate.sol";

/**
 * @title TEEPortal
 * @notice L1 escrow for the Oxide bridge.
 * @dev The L1 content hashes and finalization digest are protocol interfaces:
 *      keep them byte-for-byte aligned with Noir and the TS TEE signer.
 */
contract TEEPortal is Caps, Ownable, ITEEPortal {
  using SafeERC20 for IERC20;

  /**
   * @notice Secret hash shared by Oxide L1 -> L2 messages.
   * @dev The L2 side consumes these messages with the zero secret preimage. Changing this
   *      breaks both deposits and signer-registration messages.
   */
  bytes32 public constant CONSTANT_SECRET_HASH =
    bytes32(0x1f8eff65d91ed781c2e7a28a2ff99b7f7506b7293121b5ffcf3cd339c84d2250);

  /// @notice Domain byte for final L1 withdrawal attestations; must match `oxide/digest.ts`.
  uint8 public constant TEE_SIG_DOMAIN_EXIT_FINALIZED = 2;

  /// @notice Domain byte for forced-exit attestations; must match `oxide/digest.ts`.
  uint8 public constant TEE_SIG_DOMAIN_FORCED_EXIT = 3;

  /// @notice Number of source nullifier slots exposed by the forced-exit Noir circuit.
  uint256 public constant FORCED_EXIT_NULLIFIER_COUNT = 10;

  /// @notice Number of public inputs passed to the forced-exit Noir verifier.
  uint256 public constant FORCED_EXIT_PUBLIC_INPUT_COUNT = FORCED_EXIT_NULLIFIER_COUNT + 3;

  /// @notice Authorisation predicate gating deposits.
  IPredicate public immutable PREDICATE;

  /**
   * @notice ERC20 escrowed by this portal.
   * @dev Fee-on-transfer and rebasing tokens are unsupported: the bridge message commits to
   *      `_amount`, so the escrowed balance must move by exactly that amount.
   */
  IERC20 public immutable UNDERLYING;

  /// @notice Aztec inbox used to enqueue L1 -> L2 claim messages.
  IInbox public immutable INBOX;

  /// @notice Aztec outbox used to verify L2 -> L1 withdrawal messages.
  IOutbox public immutable OUTBOX;

  /// @notice Aztec rollup used to authenticate archive roots.
  IRollup public immutable ROLLUP;

  /// @notice Registry used to check whether `ROLLUP` is still canonical.
  IRegistry public immutable REGISTRY;

  /// @notice Noir verifier for frozen archive note exits.
  IVerifier public immutable FORCED_EXIT_VERIFIER;

  /// @notice Aztec rollup version this portal is paired with.
  uint256 public immutable ROLLUP_VERSION;

  /// @notice Registry of trusted TEE signers, keyed by their L1 Secp256k1 address.
  mapping(address tee => TeeBinding binding) public $teeBindings;

  /// @notice Address of the paired L2 `OxideBridge` contract.
  bytes32 public $l2Bridge;

  /// @notice Whether `initialize` has been called.
  bool public $initialized;

  /// @notice Withdrawal digests already finalized on L1.
  /// @dev This replay guard is independent of outbox leaf consumption.
  mapping(bytes32 digest => bool spent) public $isWithdrawalSpent;

  /// @notice Frozen archive note nullifiers already spent through forced exits.
  mapping(bytes32 nullifier => bool spent) public $isForcedExitNullifierSpent;

  /// @notice Whether the portal has been frozen for old-rollup recovery.
  bool public $frozen;

  /// @notice Proven checkpoint captured when the portal was frozen.
  uint256 public $freezeCheckpointNumber;

  /// @notice Epoch containing the frozen proven checkpoint.
  uint256 public $freezeEpochNumber;

  /// @notice Proven archive captured when the portal was frozen.
  bytes32 public $freezeArchive;

  /// @notice Accumulated epoch out hash captured when the portal was frozen.
  bytes32 public $freezeEpochOutHash;

  /// @notice Emitted once when the portal is bound to its L2 counterpart.
  event Initialized(bytes32 l2Bridge);

  /// @notice Emitted when the portal freezes normal operation for old-rollup recovery.
  event Frozen(uint256 indexed checkpointNumber, uint256 indexed epochNumber, bytes32 archive, bytes32 epochOutHash);

  /// @notice Emitted when a deposit enqueues an L1 -> L2 claim message.
  event Deposit(bytes32 indexed recipientHash, uint256 amount, bytes32 key, uint256 index);

  /// @notice Emitted when escrowed tokens are released on L1.
  event WithdrawFromAztec(address indexed recipient, uint256 amount);

  /// @notice Emitted when a TEE signer is registered and its L2 mirror message is enqueued.
  event TeeAdded(address indexed tee, bytes32 grumpkinX, bytes32 grumpkinY, bytes32 key, uint256 index);

  /// @notice Raised if `initialize` is called more than once.
  error AlreadyInitialized();
  /// @notice Raised if deposit or withdrawal is attempted before `initialize`.
  error Uninitialized();
  /// @notice Raised if `initialize` is passed the zero address for the L2 bridge.
  error ZeroL2Bridge();
  /// @notice Raised when the deposit predicate rejects the caller.
  error PredicateFailed();
  /// @notice Raised when a withdrawal digest has already been consumed.
  error WithdrawalAlreadyClaimed();
  /// @notice Raised when the TEE signature recovers a signer not registered via `addTee`.
  error UnregisteredTee();
  /// @notice Raised when a deposit amount exceeds `type(uint128).max`, which is the
  /// largest value the L2 `claim` path (taking `u128`) can accept.
  error AmountTooLarge();
  /// @notice Raised when `addTee` is passed the zero address.
  error ZeroTee();
  /// @notice Raised when `addTee` is called for a signer already registered.
  error AlreadyRegistered();
  /// @notice Raised when the rollup has no archive for the requested checkpoint.
  error UnknownCheckpoint();
  /// @notice Raised when the withdrawal anchor is not proven yet.
  error UnprovenCheckpoint();
  /// @notice Raised when normal operation is attempted after the portal has frozen.
  error FrozenPortal();
  /// @notice Raised when recovery operation is attempted before the portal has frozen.
  error NotFrozen();
  /// @notice Raised when trying to freeze an already frozen portal.
  error AlreadyFrozen();
  /// @notice Raised when a non-owner tries to freeze while the rollup is still canonical.
  error RollupStillCanonical();
  /// @notice Raised when a frozen withdrawal targets an epoch after the freeze epoch.
  error EpochAfterFreeze();
  /// @notice Raised when frozen and current outbox paths do not identify the same occurrence.
  error FrozenPathLengthMismatch();
  /// @notice Raised when a forced exit does not publish any note nullifier.
  error EmptyForcedExitNullifiers();
  /// @notice Raised when a forced exit publishes more nullifiers than the Noir circuit accepts.
  error TooManyForcedExitNullifiers(uint256 count);
  /// @notice Raised when a forced exit includes the zero padding value as an active nullifier.
  error ZeroForcedExitNullifier();
  /// @notice Raised when a forced exit tries to reuse an already spent note nullifier.
  error ForcedExitNullifierAlreadySpent(bytes32 nullifier);
  /// @notice Raised when the Noir forced exit verifier rejects the proof.
  error InvalidForcedExitProof();

  constructor(
    address _owner,
    IPredicate _predicate,
    IERC20 _underlying,
    IInbox _inbox,
    IOutbox _outbox,
    IRollup _rollup,
    IRegistry _registry,
    IVerifier _forcedExitVerifier,
    uint256 _rollupVersion,
    uint256 _rate,
    uint256 _globalLimit,
    uint256 _txLimit
  ) Caps(_rate, _globalLimit, _txLimit) Ownable(_owner) {
    PREDICATE = _predicate;
    UNDERLYING = _underlying;
    INBOX = _inbox;
    OUTBOX = _outbox;
    ROLLUP = _rollup;
    REGISTRY = _registry;
    FORCED_EXIT_VERIFIER = _forcedExitVerifier;
    ROLLUP_VERSION = _rollupVersion;
  }

  /**
   * @notice Register a TEE's Ethereum address and separate Grumpkin key, then mirror it to L2.
   * @dev L2 signer approval must come from this portal's inbox message, not from an L2-only write.
   */
  function addTee(address _tee, bytes32 _grumpkinX, bytes32 _grumpkinY)
    external
    override(ITEEPortal)
    onlyOwner
    returns (bytes32 key, uint256 index)
  {
    require($initialized, Uninitialized());
    require(_tee != address(0), ZeroTee());
    require(!$teeBindings[_tee].registered, AlreadyRegistered());
    $teeBindings[_tee] = TeeBinding({registered: true, grumpkinX: _grumpkinX, grumpkinY: _grumpkinY});

    bytes32 contentHash = Hash.sha256ToField(
      abi.encodeWithSignature("register_signer(address,bytes32,bytes32)", _tee, _grumpkinX, _grumpkinY)
    );

    (key, index) = INBOX.sendL2Message(
      DataStructures.L2Actor({actor: $l2Bridge, version: ROLLUP_VERSION}), contentHash, CONSTANT_SECRET_HASH
    );

    emit TeeAdded(_tee, _grumpkinX, _grumpkinY, key, index);
  }

  /**
   * @notice Bind this portal to its L2 counterpart. One-shot, owner-only.
   */
  function initialize(bytes32 _l2Bridge) external override(ITEEPortal) onlyOwner {
    require(!$initialized, AlreadyInitialized());
    require(_l2Bridge != bytes32(0), ZeroL2Bridge());
    $l2Bridge = _l2Bridge;
    $initialized = true;
    emit Initialized(_l2Bridge);
  }

  /**
   * @notice Escrow underlying and enqueue an L1 -> L2 claim message.
   * @dev The claim content hash is `claim(bytes32,uint256)`. The recipient hash hides the
   *      L2 recipient until claim time; the amount remains public and must fit the L2 `u128`.
   */
  function deposit(bytes32 _recipientHash, uint256 _amount, bytes calldata _predicateAuth)
    external
    override(ITEEPortal)
    returns (bytes32 key, uint256 index)
  {
    require($initialized, Uninitialized());
    require(!$frozen, FrozenPortal());
    require(_amount <= type(uint128).max, AmountTooLarge());
    require(PREDICATE.verify(msg.sender, _predicateAuth), PredicateFailed());
    _markUsage(_amount);

    bytes32 contentHash = Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", _recipientHash, _amount));

    UNDERLYING.safeTransferFrom(msg.sender, address(this), _amount);

    (key, index) = INBOX.sendL2Message(
      DataStructures.L2Actor({actor: $l2Bridge, version: ROLLUP_VERSION}), contentHash, CONSTANT_SECRET_HASH
    );

    emit Deposit(_recipientHash, _amount, key, index);
  }

  /**
   * @notice Consume an L2 -> L1 withdrawal message and release escrowed tokens.
   * @dev The TEE finalization digest binds an archive root containing the L2
   *      operation anchor. L1 derives that root from `_checkpointNumber`, so callers
   *      cannot choose an uncommitted root. The outbox path is intentionally excluded:
   *      `OUTBOX.consume` is the source of truth for membership and leaf consumption.
   */
  function withdraw(
    address _recipient,
    uint256 _amount,
    uint256 _epochNumber,
    uint256 _leafIndex,
    bytes32[] calldata _path,
    uint256 _checkpointNumber,
    bytes32 _withdrawalDigest,
    bytes calldata _teeSignature
  ) external override(ITEEPortal) {
    require($initialized, Uninitialized());
    require(!$frozen, FrozenPortal());
    require(!$isWithdrawalSpent[_withdrawalDigest], WithdrawalAlreadyClaimed());
    $isWithdrawalSpent[_withdrawalDigest] = true;

    DataStructures.L2ToL1Msg memory message = _buildWithdrawalMessage(_recipient, _amount);

    bytes32 archiveRoot = ROLLUP.archiveAt(_checkpointNumber);
    require(archiveRoot != bytes32(0), UnknownCheckpoint());
    // If not proven we should be failing at the OUTBOX anyway, but fails earlier and more explicit here.
    require(_checkpointNumber <= ROLLUP.getProvenCheckpointNumber(), UnprovenCheckpoint());

    bytes32 messageHash = Hash.sha256ToField(message);
    _validateWithdrawalTeeSignature(archiveRoot, _withdrawalDigest, messageHash, _teeSignature);

    OUTBOX.consume(message, Epoch.wrap(_epochNumber), _leafIndex, _path);

    UNDERLYING.safeTransfer(_recipient, _amount);

    emit WithdrawFromAztec(_recipient, _amount);
  }

  /**
   * @notice Freeze normal portal operation and snapshot the old rollup's proven outbox boundary.
   * @dev The owner may freeze explicitly. Otherwise the old rollup must already be non-canonical.
   */
  function freeze() external override(ITEEPortal) {
    require($initialized, Uninitialized());
    require(!$frozen, AlreadyFrozen());

    if (msg.sender != owner()) {
      IHaveVersion canonicalRollup = REGISTRY.getCanonicalRollup();
      require(address(canonicalRollup) != address(ROLLUP), RollupStillCanonical());
    }

    uint256 checkpointNumber = ROLLUP.getProvenCheckpointNumber();
    bytes32 archiveRoot = ROLLUP.archiveAt(checkpointNumber);
    require(archiveRoot != bytes32(0), UnknownCheckpoint());

    CheckpointLog memory checkpoint = ROLLUP.getCheckpoint(checkpointNumber);
    uint256 epochNumber = Epoch.unwrap(ROLLUP.getEpochForCheckpoint(checkpointNumber));

    $frozen = true;
    $freezeCheckpointNumber = checkpointNumber;
    $freezeEpochNumber = epochNumber;
    $freezeArchive = archiveRoot;
    $freezeEpochOutHash = checkpoint.outHash;

    emit Frozen(checkpointNumber, epochNumber, archiveRoot, checkpoint.outHash);
  }

  /**
   * @notice Exit directly from notes proven against the frozen archive.
   * @dev Public inputs are encoded for the Noir verifier as
   *      `[archive, amount, recipient, nullifier_0, ..., nullifier_n]`.
   */
  function withdrawFrozenNotes(
    address _recipient,
    uint256 _amount,
    bytes32[] calldata _nullifiers,
    bytes calldata _proof,
    bytes calldata _teeSignature
  ) external override(ITEEPortal) {
    require($initialized, Uninitialized());
    require($frozen, NotFrozen());
    require(_nullifiers.length > 0, EmptyForcedExitNullifiers());
    require(_nullifiers.length <= FORCED_EXIT_NULLIFIER_COUNT, TooManyForcedExitNullifiers(_nullifiers.length));

    bytes32[] memory publicInputs = new bytes32[](FORCED_EXIT_PUBLIC_INPUT_COUNT);
    publicInputs[0] = $freezeArchive;
    publicInputs[1] = bytes32(_amount);
    publicInputs[2] = bytes32(uint256(uint160(_recipient)));

    for (uint256 i = 0; i < _nullifiers.length; i++) {
      bytes32 nullifier = _nullifiers[i];
      require(nullifier != bytes32(0), ZeroForcedExitNullifier());
      publicInputs[i + 3] = nullifier;
      require(!$isForcedExitNullifierSpent[nullifier], ForcedExitNullifierAlreadySpent(nullifier));
      $isForcedExitNullifierSpent[nullifier] = true;
    }

    bytes32 finalDigest = sha256(abi.encodePacked(TEE_SIG_DOMAIN_FORCED_EXIT, publicInputs));
    address signer = ECDSA.recover(finalDigest, _teeSignature);
    require($teeBindings[signer].registered, UnregisteredTee());

    require(FORCED_EXIT_VERIFIER.verify(_proof, publicInputs), InvalidForcedExitProof());

    UNDERLYING.safeTransfer(_recipient, _amount);

    emit WithdrawFromAztec(_recipient, _amount);
  }

  /**
   * @notice Recover a proven pre-freeze L2 -> L1 withdrawal after normal operation has stopped.
   * @dev For the freeze epoch, `_frozenPath` proves the same occurrence against the frozen
   *      epoch out hash. `_currentPath` is then consumed through the outbox so the normal
   *      outbox nullifier remains the source of truth for replay protection.
   */
  function withdrawPendingMessage(
    address _recipient,
    uint256 _amount,
    uint256 _epochNumber,
    uint256 _leafIndex,
    bytes32[] calldata _frozenPath,
    bytes32[] calldata _currentPath,
    bytes32 _withdrawalDigest,
    bytes calldata _teeSignature
  ) external override(ITEEPortal) {
    require($initialized, Uninitialized());
    require($frozen, NotFrozen());
    require(_epochNumber <= $freezeEpochNumber, EpochAfterFreeze());
    require(!$isWithdrawalSpent[_withdrawalDigest], WithdrawalAlreadyClaimed());
    $isWithdrawalSpent[_withdrawalDigest] = true;

    DataStructures.L2ToL1Msg memory message = _buildWithdrawalMessage(_recipient, _amount);
    bytes32 messageHash = Hash.sha256ToField(message);

    _validateWithdrawalTeeSignature($freezeArchive, _withdrawalDigest, messageHash, _teeSignature);

    if (_epochNumber == $freezeEpochNumber) {
      require(_frozenPath.length == _currentPath.length, FrozenPathLengthMismatch());
      MerkleLib.verifyMembership(_frozenPath, messageHash, _leafIndex, $freezeEpochOutHash);
    }

    OUTBOX.consume(message, Epoch.wrap(_epochNumber), _leafIndex, _currentPath);

    UNDERLYING.safeTransfer(_recipient, _amount);

    emit WithdrawFromAztec(_recipient, _amount);
  }

  /// @notice Convenience view mirroring the pre-binding `isRegisteredTee` shape.
  function isRegisteredTee(address _tee) external view override(ITEEPortal) returns (bool) {
    return $teeBindings[_tee].registered;
  }

  function _buildWithdrawalMessage(address _recipient, uint256 _amount)
    internal
    view
    returns (DataStructures.L2ToL1Msg memory)
  {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({actor: $l2Bridge, version: ROLLUP_VERSION}),
      recipient: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      content: Hash.sha256ToField(abi.encodeWithSignature("withdraw(address,uint256)", _recipient, _amount))
    });
  }

  function _validateWithdrawalTeeSignature(
    bytes32 _archiveRoot,
    bytes32 _withdrawalDigest,
    bytes32 _messageHash,
    bytes calldata _teeSignature
  ) internal view {
    bytes32 finalDigest = sha256(
      abi.encodePacked(TEE_SIG_DOMAIN_EXIT_FINALIZED, _archiveRoot, _withdrawalDigest, _messageHash)
    );
    address signer = ECDSA.recover(finalDigest, _teeSignature);
    require($teeBindings[signer].registered, UnregisteredTee());
  }
}
