// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
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

  /// @notice Emitted once when the portal is bound to its L2 counterpart.
  event Initialized(bytes32 l2Bridge);

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

  constructor(
    address _owner,
    IPredicate _predicate,
    IERC20 _underlying,
    IInbox _inbox,
    IOutbox _outbox,
    IRollup _rollup,
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
    require(!$isWithdrawalSpent[_withdrawalDigest], WithdrawalAlreadyClaimed());
    $isWithdrawalSpent[_withdrawalDigest] = true;

    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({actor: $l2Bridge, version: ROLLUP_VERSION}),
      recipient: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      content: Hash.sha256ToField(abi.encodeWithSignature("withdraw(address,uint256)", _recipient, _amount))
    });

    bytes32 archiveRoot = ROLLUP.archiveAt(_checkpointNumber);
    require(archiveRoot != bytes32(0), UnknownCheckpoint());

    bytes32 messageHash = Hash.sha256ToField(message);
    bytes32 finalDigest =
      sha256(abi.encodePacked(TEE_SIG_DOMAIN_EXIT_FINALIZED, archiveRoot, _withdrawalDigest, messageHash));
    address signer = ECDSA.recover(finalDigest, _teeSignature);
    require($teeBindings[signer].registered, UnregisteredTee());

    OUTBOX.consume(message, Epoch.wrap(_epochNumber), _leafIndex, _path);

    UNDERLYING.safeTransfer(_recipient, _amount);

    emit WithdrawFromAztec(_recipient, _amount);
  }

  /// @notice Convenience view mirroring the pre-binding `isRegisteredTee` shape.
  function isRegisteredTee(address _tee) external view override(ITEEPortal) returns (bool) {
    return $teeBindings[_tee].registered;
  }
}
