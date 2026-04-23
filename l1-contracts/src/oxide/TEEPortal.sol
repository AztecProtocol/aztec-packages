// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

import {Caps} from "./Caps.sol";
import {IPredicate} from "./IPredicate.sol";
import {TeeRegistry} from "./TeeRegistry.sol";

/**
 * @title TEEPortal
 * @notice L1 escrow for deposits into and withdrawals out of the Aztec-side
 *         `OxideBridge`. Deposits enqueue an inbox message; withdrawals
 *         consume an outbox message gated by a TEE attestation.
 * @dev The content-hash encodings on both sides must stay in lockstep with
 *      `oxide_bridge_contract/src/content_hash.nr` or the L2 side cannot
 *      locate the message.
 */
contract TEEPortal is Caps, Ownable {
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
   * @dev EIP-2935 history predeploy. Returns the 32-byte block hash for a block within the last 8192 slots when
   *      called with `abi.encode(uint256)`, or zero otherwise.
   */
  address internal constant HISTORY_CONTRACT = 0x0000F90827F1C53a10cb7A02335B175320002935;

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

  /// @notice Registry of trusted TEE signers whose attestations unlock withdrawals.
  TeeRegistry public immutable TEE_REGISTRY;

  /// @notice Aztec rollup version this portal is paired with.
  uint256 public immutable ROLLUP_VERSION;

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
  /// @notice Raised when EIP-2935 has no hash recorded for the requested block.
  error UnknownL1BlockHash();
  /// @notice Raised when the TEE signature recovers a signer not in `TEE_REGISTRY`.
  error UnregisteredTee();
  /// @notice Raised when a deposit amount exceeds `type(uint128).max`, which is the
  /// largest value the L2 `claim` path (taking `u128`) can accept.
  error AmountTooLarge();

  /**
   * @param _owner          Contract owner authorised to call `initialize`.
   * @param _predicate      Deposit authorisation predicate.
   * @param _underlying     ERC20 to escrow.
   * @param _inbox          Aztec inbox used for L1 -> L2 messages.
   * @param _outbox         Aztec outbox used for L2 -> L1 messages.
   * @param _teeRegistry    Registry of trusted TEE signers.
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
    TeeRegistry _teeRegistry,
    uint256 _rollupVersion,
    uint256 _rate,
    uint256 _globalLimit,
    uint256 _txLimit
  ) Caps(_rate, _globalLimit, _txLimit) Ownable(_owner) {
    PREDICATE = _predicate;
    UNDERLYING = _underlying;
    INBOX = _inbox;
    OUTBOX = _outbox;
    TEE_REGISTRY = _teeRegistry;
    ROLLUP_VERSION = _rollupVersion;
  }

  /**
   * @notice Bind this portal to its L2 counterpart. One-shot, owner-only.
   * @param _l2Bridge Address of the paired L2 `OxideBridge` contract.
   */
  function initialize(bytes32 _l2Bridge) external onlyOwner {
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
   *      that the caller-supplied inputs are consistent with a specific L1
   *      tip (`_l1BlockNumber`) and with the afternoon-signed init digest
   *      (`_withdrawalDigest`). The call reverts unless the recovered
   *      signer is registered in `TEE_REGISTRY` and the digest
   *      reconstruction matches the signature byte-for-byte; see
   *      `packages/tee/src/digest.ts::buildWithdrawalFinalDigest` for the
   *      preimage layout.
   *
   *      `$isWithdrawalSpent[_withdrawalDigest]` dedupes at the afternoon-
   *      digest level so a TEE attestation cannot be rebound to a second
   *      outbox leaf even if the outbox's own per-leaf dedupe were to slip.
   * @param _recipient        L1 address to receive the underlying.
   * @param _amount           Amount of underlying to release.
   * @param _epochNumber      Epoch that produced the outbox leaf.
   * @param _leafIndex        Leaf index within that epoch's outbox tree.
   * @param _path             Sibling path proving leaf inclusion.
   * @param _l1BlockNumber    L1 block the TEE observed when signing.
   * @param _withdrawalDigest Afternoon-phase digest bound to this withdrawal.
   * @param _teeSignature     TEE signature over the final digest.
   */
  function withdraw(
    address _recipient,
    uint256 _amount,
    uint256 _epochNumber,
    uint256 _leafIndex,
    bytes32[] calldata _path,
    uint256 _l1BlockNumber,
    bytes32 _withdrawalDigest,
    bytes calldata _teeSignature
  ) external {
    require($initialized, Uninitialized());
    require(!$isWithdrawalSpent[_withdrawalDigest], WithdrawalAlreadyClaimed());
    $isWithdrawalSpent[_withdrawalDigest] = true;

    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({actor: $l2Bridge, version: ROLLUP_VERSION}),
      recipient: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      content: Hash.sha256ToField(abi.encodeWithSignature("withdraw(address,uint256)", _recipient, _amount))
    });

    _verifyTeeAttestation(
      Hash.sha256ToField(message), _epochNumber, _leafIndex, _l1BlockNumber, _withdrawalDigest, _teeSignature
    );

    OUTBOX.consume(message, Epoch.wrap(_epochNumber), _leafIndex, _path);

    UNDERLYING.safeTransfer(_recipient, _amount);

    emit WithdrawFromAztec(_recipient, _amount);
  }

  /**
   * @dev Recompute the final digest the TEE signed and require the
   *      recovered signer to be registered.
   *
   *      The preimage must match
   *      `packages/tee/src/digest.ts::buildWithdrawalFinalDigest`
   *      byte-for-byte:
   *      `withdrawalDigest || u256be(l1BlockNumber) || l1BlockHash ||
   *       messageHash || u256be(epochNumber) || u256be(leafIndex) ||
   *       config`,
   *      where `config` matches `digest.ts::encodeConfig`:
   *      `l2Bridge(32) || token(20) || portal(20) || chainId(32) ||
   *       rollupVersion(32)`.
   *
   *      All five config fields are known to the portal, so we rebuild
   *      them inline - a TEE configured against a different network
   *      produces a final digest the portal cannot match,
   *      `ECDSA.recover` returns a garbage signer, and the registry check
   *      rejects it.
   * @param _messageHash      Outbox leaf hash for this withdrawal.
   * @param _epochNumber      Epoch that produced the leaf.
   * @param _leafIndex        Leaf index within the epoch's outbox tree.
   * @param _l1BlockNumber    L1 block the TEE observed.
   * @param _withdrawalDigest Afternoon-phase digest.
   * @param _teeSignature     Signature over the final digest.
   */
  function _verifyTeeAttestation(
    bytes32 _messageHash,
    uint256 _epochNumber,
    uint256 _leafIndex,
    uint256 _l1BlockNumber,
    bytes32 _withdrawalDigest,
    bytes calldata _teeSignature
  ) internal view {
    bytes32 finalDigest = sha256(
      abi.encodePacked(
        _withdrawalDigest,
        _l1BlockNumber,
        _queryL1BlockHash(_l1BlockNumber),
        _messageHash,
        _epochNumber,
        _leafIndex,
        $l2Bridge,
        address(UNDERLYING),
        address(this),
        block.chainid,
        ROLLUP_VERSION
      )
    );
    address signer = ECDSA.recover(finalDigest, _teeSignature);
    require(TEE_REGISTRY.isRegisteredTee(signer), UnregisteredTee());
  }

  /**
   * @dev Look up an L1 block hash via the EIP-2935 history predeploy.
   *      Reverts with `UnknownL1BlockHash` if the block is outside the
   *      8192-slot window or the predeploy returns zero.
   * @param _blockNumber Block number to query.
   * @return Block hash for `_blockNumber`.
   */
  function _queryL1BlockHash(uint256 _blockNumber) internal view returns (bytes32) {
    (bool ok, bytes memory data) = HISTORY_CONTRACT.staticcall(abi.encode(_blockNumber));
    require(ok && data.length == 32, UnknownL1BlockHash());
    bytes32 hash = abi.decode(data, (bytes32));
    require(hash != bytes32(0), UnknownL1BlockHash());
    return hash;
  }
}
