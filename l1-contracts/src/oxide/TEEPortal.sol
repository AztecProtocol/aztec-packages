// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

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
 * @notice L1 escrow for deposits into and withdrawals out of the Aztec-side
 *         `OxideBridge`. Deposits enqueue an inbox message; withdrawals
 *         consume an outbox message gated by a TEE attestation.
 * @dev The content-hash encodings on both sides must stay in lockstep with
 *      `oxide_bridge_contract/src/content_hash.nr` or the L2 side cannot
 *      locate the message.
 */
contract TEEPortal is Caps, Ownable, ITEEPortal {
  using SafeERC20 for IERC20;

  /**
   * @notice Shared secret-hash preimage pairing L1 deposits with the L2
   *         claim flow.
   * @dev Parity is pinned by
   *      `oxide_bridge_test/src/lib.nr::constant_secret_matches_portal`
   *      and the e2e test in
   *      `packages/l2-contracts/test/e2e/claim.test.ts`. See also
   *      `oxide_bridge_contract/src/content_hash.nr::CONSTANT_SECRET`.
   */
  bytes32 public constant CONSTANT_SECRET_HASH =
    bytes32(0x1f8eff65d91ed781c2e7a28a2ff99b7f7506b7293121b5ffcf3cd339c84d2250);

  /**
   * @notice Domain separator prepended to the final-phase TEE attestation
   *         preimage so a signature produced for this flow cannot collide
   *         with any other SHA256-based digest the TEE emits.
   * @dev Must stay in lockstep with
   *      `packages/tee/src/digest.ts::TEE_SIG_DOMAIN_EXIT_FINALIZED`.
   */
  uint8 public constant TEE_SIG_DOMAIN_EXIT_FINALIZED = 2;

  /// @notice Authorisation predicate gating deposits.
  IPredicate public immutable PREDICATE;

  /**
   * @notice ERC20 escrowed by this portal.
   * @dev Must be a standard ERC20. Fee-on-transfer and rebasing tokens are not supported since the content hash
   *      commits to the caller-supplied `_amount`.
   */
  IERC20 public immutable UNDERLYING;

  /// @notice Aztec inbox used to enqueue L1 -> L2 claim messages.
  IInbox public immutable INBOX;

  /// @notice Aztec outbox used to verify L2 -> L1 withdrawal messages.
  IOutbox public immutable OUTBOX;

  /// @notice Aztec rollup version this portal is paired with.
  uint256 public immutable ROLLUP_VERSION;

  /// @notice Registry of trusted TEE signers, keyed by their L1 Secp256k1 address.
  mapping(address tee => TeeBinding binding) public $teeBindings;

  /// @notice Address of the paired L2 `OxideBridge` contract.
  bytes32 public $l2Bridge;

  /// @notice Whether `initialize` has been called.
  bool public $initialized;

  /**
   * @notice Tracks withdrawal digests already consumed.
   * @dev Prevents replay at the afternoon-digest level, independent of the
   *      outbox's own per-leaf dedupe.
   */
  mapping(bytes32 digest => bool spent) public $isWithdrawalSpent;

  /**
   * @notice Emitted once when the portal is bound to its L2 counterpart.
   * @param l2Bridge Address of the paired L2 bridge.
   */
  event Initialized(bytes32 l2Bridge);

  /**
   * @notice Emitted on successful deposit.
   * @param recipientHash Hash committing to the intended L2 recipient.
   * @param amount        Amount of underlying escrowed.
   * @param key           Inbox message key.
   * @param index         Inbox message index.
   */
  event Deposit(bytes32 indexed recipientHash, uint256 amount, bytes32 key, uint256 index);

  /**
   * @notice Emitted on successful withdrawal.
   * @param recipient L1 address that received the underlying.
   * @param amount    Amount released from escrow.
   */
  event WithdrawFromAztec(address indexed recipient, uint256 amount);

  /**
   * @notice Emitted when a TEE signer is added to the registry.
   * @param tee        L1 Secp256k1 address of the registered TEE.
   * @param grumpkinX  X coordinate of the bound Grumpkin public key.
   * @param grumpkinY  Y coordinate of the bound Grumpkin public key.
   * @param key        Inbox message key for the L1 -> L2 registration message.
   * @param index      Inbox message index for that message.
   */
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

  /**
   * @param _owner          Contract owner authorised to call `initialize` and `addTee`.
   * @param _predicate      Deposit authorisation predicate.
   * @param _underlying     ERC20 to escrow.
   * @param _inbox          Aztec inbox used for L1 -> L2 messages.
   * @param _outbox         Aztec outbox used for L2 -> L1 messages.
   * @param _rollupVersion  Aztec rollup version this portal binds to.
   * @param _rate           Per-block refill rate for the rate limiter.
   * @param _globalLimit    Global cap enforced by `Caps`.
   * @param _txLimit        Per-transaction cap enforced by `Caps`.
   */
  constructor(
    address _owner,
    IPredicate _predicate,
    IERC20 _underlying,
    IInbox _inbox,
    IOutbox _outbox,
    uint256 _rollupVersion,
    uint256 _rate,
    uint256 _globalLimit,
    uint256 _txLimit
  ) Caps(_rate, _globalLimit, _txLimit) Ownable(_owner) {
    PREDICATE = _predicate;
    UNDERLYING = _underlying;
    INBOX = _inbox;
    OUTBOX = _outbox;
    ROLLUP_VERSION = _rollupVersion;
  }

  /**
   * @notice Register a TEE signer. Owner-only.
   * @dev Stores the binding `(tee, grumpkinX, grumpkinY)` and emits an L1 -> L2
   *      message so the paired L2 bridge can mirror the same binding in its
   *      `approved_signers` map. L2 signer approval must flow from L1 registry
   *      state, not from arbitrary public writes - a compromise of either
   *      identity half is useless without the matching other half.
   *
   *      The L1 -> L2 content hash mirrors
   *      `asserted_token_contract/src/content_hash.nr::get_register_signer_content_hash`
   *      byte-for-byte: `selector || tee(32) || grumpkinX(32) || grumpkinY(32)` = 100 bytes.
   *
   *      Requires the portal to already be initialized so `$l2Bridge` routes the
   *      message.
   * @param _tee        L1 Secp256k1 address of the TEE used for `withdraw` finalization.
   * @param _grumpkinX  X coordinate of the TEE's Grumpkin public key, used for L2 attestations.
   * @param _grumpkinY  Y coordinate of the TEE's Grumpkin public key, used for L2 attestations.
   * @return key        Inbox message key for the emitted registration message.
   * @return index      Inbox message index for the emitted registration message.
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
   * @param _l2Bridge Address of the paired L2 `OxideBridge` contract.
   */
  function initialize(bytes32 _l2Bridge) external override(ITEEPortal) onlyOwner {
    require(!$initialized, AlreadyInitialized());
    require(_l2Bridge != bytes32(0), ZeroL2Bridge());
    $l2Bridge = _l2Bridge;
    $initialized = true;
    emit Initialized(_l2Bridge);
  }

  /**
   * @notice  Escrow `_amount` of underlying and enqueue an L1 -> L2 claim message so the recipient committed to by
   *          `_recipientHash` can mint on L2.
   * @dev Mirrors `oxide_bridge_contract/src/content_hash.nr::get_claim_content_hash`:
   *      both sides must produce the same 68-byte `selector || recipientHash || amount` preimage or the L2
   *      `consume_l1_to_l2_message` call cannot find the message.
   * @param _recipientHash  Hash committing to the intended L2 recipient.
   * @param _amount         Amount of underlying to escrow.
   * @param _predicateAuth  Opaque bytes forwarded to the predicate.
   * @return key   Inbox message key.
   * @return index Inbox message index.
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
   * @notice Consume an L2 -> L1 withdrawal message and release the underlying to `_recipient`.
   * @dev Reconstructs the withdrawal content hash as defined by
   *      `oxide_bridge_contract/src/content_hash.nr::get_withdraw_content_hash`
   *      and asks the rollup's outbox to verify the sibling path.
   *
   *      The trailing three arguments are the TEE's off-chain attestation
   *      that the caller-supplied inputs are consistent with a state anchor
   *      (`_blockhash`) and with the afternoon-signed init digest
   *      (`_withdrawalDigest`). The call reverts unless the recovered
   *      signer is registered via `addTee` and the digest reconstruction
   *      matches the signature byte-for-byte; see
   *      `packages/tee/src/digest.ts::buildWithdrawalFinalDigest` for the
   *      preimage layout.
   *
   *      `$isWithdrawalSpent[_withdrawalDigest]` dedupes at the afternoon-
   *      digest level so a TEE attestation cannot be rebound to a second
   *      outbox leaf even if the outbox's own per-leaf dedupe were to slip.
   *      The outbox path (`_epochNumber`, `_leafIndex`, `_path`) is verified
   *      by `OUTBOX.consume`; it is deliberately *not* bound into the TEE
   *      digest - the TEE has no business revalidating outbox membership.
   * @param _recipient           L1 address to receive the underlying.
   * @param _amount              Amount of underlying to release.
   * @param _epochNumber         Epoch that produced the outbox leaf.
   * @param _leafIndex           Leaf index within that epoch's outbox tree.
   * @param _path                Sibling path proving leaf inclusion.
   * @param _freshAnchorBlockHash TEE's fresh L2-state anchor, bound into the
   *                              final-phase preimage. Not verified against the
   *                              rollup archive yet - see TODO below.
   * @param _withdrawalDigest    Afternoon-phase digest bound to this withdrawal.
   * @param _teeSignature        TEE signature over the final digest.
   */
  function withdraw(
    address _recipient,
    uint256 _amount,
    uint256 _epochNumber,
    uint256 _leafIndex,
    bytes32[] calldata _path,
    bytes32 _freshAnchorBlockHash,
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

    // TODO(oxide/archive-migration): `_freshAnchorBlockHash` is bound into the
    // signed preimage but not yet validated against the rollup's on-chain
    // archive. Once the TEE produces actual archive roots, assert
    // `Rollup.archiveAt(checkpointNumber) == _freshAnchorBlockHash` here so a
    // compromised TEE cannot sign over stale/forged L2 state.
    _verifyTeeAttestation(Hash.sha256ToField(message), _freshAnchorBlockHash, _withdrawalDigest, _teeSignature);

    OUTBOX.consume(message, Epoch.wrap(_epochNumber), _leafIndex, _path);

    UNDERLYING.safeTransfer(_recipient, _amount);

    emit WithdrawFromAztec(_recipient, _amount);
  }

  /// @notice Convenience view mirroring the pre-binding `isRegisteredTee` shape.
  function isRegisteredTee(address _tee) external view override(ITEEPortal) returns (bool) {
    return $teeBindings[_tee].registered;
  }

  /**
   * @dev Recompute the final digest the TEE signed and require the
   *      recovered signer to be registered.
   *
   *      The preimage must match
   *      `packages/tee/src/digest.ts::buildWithdrawalFinalDigest`
   *      byte-for-byte:
   *      `domain(1) || freshAnchorBlockHash(32) || withdrawalDigest(32) ||
   *       messageHash(32)`.
   *
   *      Per-network config fields (`l2Bridge`, `portal`, `chainId`,
   *      `rollupVersion`) are already bound via `_messageHash`, which is
   *      built from `DataStructures.L2ToL1Msg` using the portal's own
   *      immutables / storage. A TEE configured against a different
   *      network produces a different `_messageHash`, and therefore a
   *      final digest the portal cannot match; `ECDSA.recover` returns a
   *      garbage signer and the registry check rejects it.
   * @param _messageHash           Outbox leaf hash for this withdrawal.
   * @param _freshAnchorBlockHash  TEE's fresh L2-state anchor.
   * @param _withdrawalDigest      Afternoon-phase digest.
   * @param _teeSignature          Signature over the final digest.
   */
  function _verifyTeeAttestation(
    bytes32 _messageHash,
    bytes32 _freshAnchorBlockHash,
    bytes32 _withdrawalDigest,
    bytes calldata _teeSignature
  ) internal view {
    bytes32 finalDigest = sha256(
      abi.encodePacked(TEE_SIG_DOMAIN_EXIT_FINALIZED, _freshAnchorBlockHash, _withdrawalDigest, _messageHash)
    );
    address signer = ECDSA.recover(finalDigest, _teeSignature);
    require($teeBindings[signer].registered, UnregisteredTee());
  }
}
