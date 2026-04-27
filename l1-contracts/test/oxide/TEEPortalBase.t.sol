// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {IPredicate} from "@aztec/oxide/IPredicate.sol";
import {MockPredicate} from "@aztec/oxide/mocks/MockPredicate.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IHaveVersion, IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {MockForcedExitVerifier} from "@test/oxide/fixtures/MockForcedExitVerifier.sol";
import {MockInbox} from "@test/oxide/fixtures/MockInbox.sol";
import {MockOutbox} from "@test/oxide/fixtures/MockOutbox.sol";
import {MockRegistry} from "@test/oxide/fixtures/MockRegistry.sol";
import {MockRollup} from "@test/oxide/fixtures/MockRollup.sol";

abstract contract TEEPortalBase is Test {
  TEEPortal internal portal;
  TestERC20 internal underlying;
  MockInbox internal inbox;
  MockOutbox internal outbox;
  MockRollup internal rollup;
  MockRegistry internal registry;
  MockForcedExitVerifier internal forcedExitVerifier;
  MockPredicate internal predicate;

  bytes32 internal constant L2_BRIDGE = bytes32(uint256(0xB12D6E));
  uint256 internal constant ROLLUP_VERSION = 7;
  uint256 internal constant DEFAULT_CHECKPOINT_NUMBER = 11;
  bytes32 internal constant DEFAULT_ARCHIVE_ROOT = bytes32(uint256(0xA11CE));

  uint256 internal constant RATE = 1 ether;
  uint256 internal constant GLOBAL_LIMIT = 500_000 ether;
  uint256 internal constant TX_LIMIT = 2500 ether;
  uint256 internal constant FORCED_EXIT_NULLIFIER_COUNT = 10;
  uint256 internal constant FORCED_EXIT_PUBLIC_INPUT_COUNT = FORCED_EXIT_NULLIFIER_COUNT + 3;

  address internal constant OWNER = address(0x0FFE);
  address internal constant USER = address(0xA11CE);

  bytes32 internal constant DUMMY_GRUMPKIN_X = bytes32(uint256(0xA1));
  bytes32 internal constant DUMMY_GRUMPKIN_Y = bytes32(uint256(0xA2));

  event Initialized(bytes32 l2Bridge);
  event Frozen(uint256 indexed checkpointNumber, uint256 indexed epochNumber, bytes32 archive, bytes32 epochOutHash);
  event Deposit(bytes32 indexed recipientHash, uint256 amount, bytes32 key, uint256 index);
  event WithdrawFromAztec(address indexed recipient, uint256 amount);
  event TeeAdded(address indexed tee, bytes32 grumpkinX, bytes32 grumpkinY, bytes32 key, uint256 index);

  address internal teeSigner;
  uint256 internal teePk;

  struct WithdrawParams {
    address recipient;
    uint256 amount;
    uint256 epochNumber;
    uint256 leafIndex;
    uint256 checkpointNumber;
    bytes32 archiveRoot;
    bytes32 withdrawalDigest;
  }

  function setUp() public virtual {
    underlying = new TestERC20("Test", "TST", address(this));
    inbox = new MockInbox();
    outbox = new MockOutbox();
    rollup = new MockRollup();
    registry = new MockRegistry();
    forcedExitVerifier = new MockForcedExitVerifier();
    predicate = new MockPredicate(true);

    _setCheckpoint(2, bytes32(uint256(0xF3EE5E)));
    rollup.setProvenCheckpointNumber(DEFAULT_CHECKPOINT_NUMBER);
    registry.setCanonicalRollup(IHaveVersion(address(rollup)));

    portal = new TEEPortal(
      OWNER,
      IPredicate(address(predicate)),
      IERC20(address(underlying)),
      IInbox(address(inbox)),
      IOutbox(address(outbox)),
      IRollup(address(rollup)),
      IRegistry(address(registry)),
      IVerifier(address(forcedExitVerifier)),
      ROLLUP_VERSION,
      RATE,
      GLOBAL_LIMIT,
      TX_LIMIT
    );

    underlying.mint(USER, TX_LIMIT * 10);
    vm.prank(USER);
    underlying.approve(address(portal), type(uint256).max);
  }

  modifier givenPortalIsInitialized() {
    _initialize();
    _;
  }

  modifier givenPortalIsFrozen() {
    _freezeAsOwner();
    _;
  }

  modifier givenRollupIsNonCanonical() {
    registry.setCanonicalRollup(IHaveVersion(address(0xBEEF)));
    _;
  }

  modifier givenTeeIsRegistered(string memory _label) {
    (teeSigner, teePk) = makeAddrAndKey(_label);
    _registerSigner(teeSigner);
    _;
  }

  function _initialize() internal {
    vm.prank(OWNER);
    portal.initialize(L2_BRIDGE);
  }

  function _freezeAsOwner() internal {
    vm.prank(OWNER);
    portal.freeze();
  }

  function _registerSigner(address _signer) internal {
    vm.prank(OWNER);
    portal.addTee(_signer, DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y);
  }

  function _setCheckpoint(uint256 _epochNumber, bytes32 _outHash) internal {
    rollup.setCheckpoint(DEFAULT_CHECKPOINT_NUMBER, DEFAULT_ARCHIVE_ROOT, _epochNumber, _outHash);
  }

  function _defaultWithdrawParams() internal pure returns (WithdrawParams memory p) {
    p = WithdrawParams({
      recipient: USER,
      amount: 75 ether,
      epochNumber: 9,
      leafIndex: 3,
      checkpointNumber: DEFAULT_CHECKPOINT_NUMBER,
      archiveRoot: DEFAULT_ARCHIVE_ROOT,
      withdrawalDigest: bytes32(uint256(0xDEADBEEF))
    });
  }

  function _messageHash(address _recipient, uint256 _amount) internal view returns (bytes32) {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({actor: L2_BRIDGE, version: ROLLUP_VERSION}),
      recipient: DataStructures.L1Actor({actor: address(portal), chainId: block.chainid}),
      content: Hash.sha256ToField(abi.encodeWithSignature("withdraw(address,uint256)", _recipient, _amount))
    });
    return Hash.sha256ToField(message);
  }

  function _finalDigest(WithdrawParams memory p) internal view returns (bytes32) {
    return _teeWithdrawalFinalDigest(p.archiveRoot, p.withdrawalDigest, _messageHash(p.recipient, p.amount));
  }

  function _forcedExitFinalDigest(WithdrawParams memory p, bytes32[] memory _nullifiers)
    internal
    view
    returns (bytes32)
  {
    bytes32[] memory publicInputs = _forcedExitPublicInputs(p.recipient, p.amount, _nullifiers);
    return _teeForcedExitFinalDigest(publicInputs);
  }

  function _teeWithdrawalFinalDigest(bytes32 _archiveRoot, bytes32 _withdrawalDigest, bytes32 _exitHash)
    internal
    view
    returns (bytes32)
  {
    return sha256(abi.encodePacked(portal.TEE_SIG_DOMAIN_EXIT_FINALIZED(), _archiveRoot, _withdrawalDigest, _exitHash));
  }

  function _teeForcedExitFinalDigest(bytes32[] memory _publicInputs) internal view returns (bytes32) {
    return sha256(abi.encodePacked(portal.TEE_SIG_DOMAIN_FORCED_EXIT(), _publicInputs));
  }

  function _withdraw(WithdrawParams memory p, bytes32[] memory _path, bytes memory _signature) internal {
    portal.withdraw(
      p.recipient, p.amount, p.epochNumber, p.leafIndex, _path, p.checkpointNumber, p.withdrawalDigest, _signature
    );
  }

  function _withdrawWithCheckpoint(
    WithdrawParams memory p,
    bytes32[] memory _path,
    uint256 _checkpointNumber,
    bytes memory _signature
  ) internal {
    portal.withdraw(
      p.recipient, p.amount, p.epochNumber, p.leafIndex, _path, _checkpointNumber, p.withdrawalDigest, _signature
    );
  }

  function _withdrawPendingMessage(
    WithdrawParams memory p,
    uint256 _leafIndex,
    bytes32[] memory _frozenPath,
    bytes32[] memory _currentPath,
    bytes memory _signature
  ) internal {
    portal.withdrawPendingMessage(
      p.recipient, p.amount, p.epochNumber, _leafIndex, _frozenPath, _currentPath, p.withdrawalDigest, _signature
    );
  }

  function _withdrawFrozenNotes(
    WithdrawParams memory p,
    bytes32[] memory _nullifiers,
    bytes memory _proof,
    bytes memory _signature
  ) internal {
    portal.withdrawFrozenNotes(p.recipient, p.amount, _nullifiers, _proof, _signature);
  }

  function _forcedExitPublicInputs(address _recipient, uint256 _amount, bytes32[] memory _nullifiers)
    internal
    view
    returns (bytes32[] memory)
  {
    bytes32[] memory publicInputs = new bytes32[](FORCED_EXIT_PUBLIC_INPUT_COUNT);
    publicInputs[0] = portal.$freezeArchive();
    publicInputs[1] = bytes32(_amount);
    publicInputs[2] = bytes32(uint256(uint160(_recipient)));

    for (uint256 i = 0; i < _nullifiers.length; i++) {
      publicInputs[i + 3] = _nullifiers[i];
    }

    return publicInputs;
  }

  function _signTee(uint256 _pk, bytes32 _digest) internal pure returns (bytes memory) {
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_pk, _digest);
    return abi.encodePacked(r, s, v);
  }

  function _dummyPath() internal pure returns (bytes32[] memory path) {
    path = new bytes32[](4);
    path[0] = bytes32(uint256(0x1111));
    path[1] = bytes32(uint256(0x2222));
    path[2] = bytes32(uint256(0x3333));
    path[3] = bytes32(uint256(0x4444));
  }
}
