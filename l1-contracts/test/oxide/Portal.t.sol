// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Portal} from "@aztec/oxide/Portal.sol";
import {Caps} from "@aztec/oxide/Caps.sol";
import {IPredicate} from "@aztec/oxide/IPredicate.sol";
import {TeeRegistry} from "@aztec/oxide/TeeRegistry.sol";
import {MockPredicate} from "@aztec/oxide/mocks/MockPredicate.sol";
import {MockERC20} from "@aztec/oxide/mocks/MockERC20.sol";
import {MockInbox} from "./fixtures/MockInbox.sol";
import {MockOutbox} from "./fixtures/MockOutbox.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";

contract PortalTest is Test {
    Portal internal portal;
    MockERC20 internal underlying;
    MockInbox internal inbox;
    MockOutbox internal outbox;
    MockPredicate internal predicate;
    TeeRegistry internal registry;

    bytes32 internal constant L2_BRIDGE = bytes32(uint256(0xB12D6E));
    uint256 internal constant ROLLUP_VERSION = 7;

    uint256 internal constant RATE = 1 ether;
    uint256 internal constant GLOBAL_LIMIT = 500_000 ether;
    uint256 internal constant TX_LIMIT = 2_500 ether;

    address internal constant OWNER = address(0x0FFE);
    address internal constant USER = address(0xA11CE);

    // Mirrors `Portal.HISTORY_CONTRACT` (EIP-2935 predeploy address).
    address internal constant HISTORY_CONTRACT = 0x0000F90827F1C53a10cb7A02335B175320002935;

    event Initialized(bytes32 l2Bridge);
    event Deposit(bytes32 indexed recipientHash, uint256 amount, bytes32 key, uint256 index);
    event WithdrawFromAztec(address indexed recipient, uint256 amount);

    function setUp() public {
        underlying = new MockERC20();
        inbox = new MockInbox();
        outbox = new MockOutbox();
        predicate = new MockPredicate(true);
        registry = new TeeRegistry(OWNER);
        portal = new Portal(
            OWNER,
            IPredicate(address(predicate)),
            IERC20(address(underlying)),
            IInbox(address(inbox)),
            IOutbox(address(outbox)),
            registry,
            ROLLUP_VERSION,
            RATE,
            GLOBAL_LIMIT,
            TX_LIMIT
        );

        underlying.mint(USER, TX_LIMIT * 10);
        vm.prank(USER);
        underlying.approve(address(portal), type(uint256).max);
    }

    function _initialize() internal {
        vm.prank(OWNER);
        portal.initialize(L2_BRIDGE);
    }

    function test_initialize_setsBridgeAndEmitsEvent() public {
        vm.expectEmit(true, true, true, true, address(portal));
        emit Initialized(L2_BRIDGE);
        _initialize();
        assertEq(portal.$l2Bridge(), L2_BRIDGE);
        assertTrue(portal.$initialized());
    }

    function test_initialize_revertsOnSecondCall() public {
        _initialize();
        vm.expectRevert(Portal.AlreadyInitialized.selector);
        vm.prank(OWNER);
        portal.initialize(L2_BRIDGE);
    }

    function test_initialize_revertsOnZeroBridge() public {
        vm.expectRevert(Portal.ZeroL2Bridge.selector);
        vm.prank(OWNER);
        portal.initialize(bytes32(0));
    }

    function test_initialize_revertsWhenNotOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, USER));
        vm.prank(USER);
        portal.initialize(L2_BRIDGE);
    }

    function test_deposit_revertsWhenUninitialized() public {
        vm.expectRevert(Portal.Uninitialized.selector);
        vm.prank(USER);
        portal.deposit(bytes32(uint256(1)), 10 ether, "");
    }

    function test_deposit_revertsWhenPredicateFails() public {
        _initialize();
        predicate.setShouldPass(false);
        vm.expectRevert(Portal.PredicateFailed.selector);
        vm.prank(USER);
        portal.deposit(bytes32(uint256(1)), 10 ether, "");
    }

    function test_deposit_revertsWhenOverTxLimit() public {
        _initialize();
        vm.expectRevert(Caps.TxLimitSurpassed.selector);
        vm.prank(USER);
        portal.deposit(bytes32(uint256(1)), TX_LIMIT + 1, "");
    }

    function test_deposit_happyPath() public {
        _initialize();

        bytes32 recipientHash = bytes32(uint256(0xDEADBEEF));
        uint256 amount = 100 ether;

        bytes32 expectedContentHash =
            Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", recipientHash, amount));
        bytes32 primedKey = bytes32(uint256(0x1234));
        uint256 primedIndex = 42;
        inbox.primeNext(primedKey, primedIndex);

        uint256 userBalanceBefore = underlying.balanceOf(USER);

        vm.expectEmit(true, true, true, true, address(portal));
        emit Deposit(recipientHash, amount, primedKey, primedIndex);

        vm.prank(USER);
        (bytes32 key, uint256 index) = portal.deposit(recipientHash, amount, "");

        assertEq(key, primedKey);
        assertEq(index, primedIndex);

        assertEq(underlying.balanceOf(USER), userBalanceBefore - amount);
        assertEq(underlying.balanceOf(address(portal)), amount);

        assertEq(inbox.callCount(), 1);
        (bytes32 recipientActor, uint256 recipientVersion, bytes32 contentHash, bytes32 secretHash) = inbox.calls(0);
        assertEq(recipientActor, L2_BRIDGE);
        assertEq(recipientVersion, ROLLUP_VERSION);
        assertEq(contentHash, expectedContentHash);
        assertEq(secretHash, portal.CONSTANT_SECRET_HASH());

        assertEq(portal.getCurrentAvailable(), GLOBAL_LIMIT - amount);
    }

    // ---------------------------------------------------------------------
    // TEE_SEAM withdraw path. Helpers below drive the same preimage layout
    // the portal rebuilds and a mocked EIP-2935 history contract so each
    // named error can be pinned down without a real L1 chain context.
    // ---------------------------------------------------------------------

    struct WithdrawParams {
        address recipient;
        uint256 amount;
        uint256 epochNumber;
        uint256 leafIndex;
        uint256 l1BlockNumber;
        bytes32 l1BlockHash;
        bytes32 withdrawalDigest;
    }

    function _defaultWithdrawParams() internal pure returns (WithdrawParams memory p) {
        p = WithdrawParams({
            recipient: USER,
            amount: 75 ether,
            epochNumber: 9,
            leafIndex: 3,
            l1BlockNumber: 123_456,
            l1BlockHash: bytes32(uint256(0xABCDEF)),
            withdrawalDigest: bytes32(uint256(0xDEADBEEF))
        });
    }

    function _mockHistory(uint256 _blockNumber, bytes32 _hash) internal {
        vm.mockCall(HISTORY_CONTRACT, abi.encode(_blockNumber), abi.encode(_hash));
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
        return _finalDigestWithConfig(p, L2_BRIDGE, address(underlying), address(portal), block.chainid, ROLLUP_VERSION);
    }

    // Like `_finalDigest` but lets a test sign over a tampered config blob
    // while the portal rebuilds the digest with its own (correct) config
    // inline. Used by the `test_withdraw_revertsOnTamperedConfig*` cases.
    function _finalDigestWithConfig(
        WithdrawParams memory p,
        bytes32 _l2Bridge,
        address _token,
        address _portal,
        uint256 _chainId,
        uint256 _rollupVersion
    ) internal view returns (bytes32) {
        return sha256(
            abi.encodePacked(
                p.withdrawalDigest,
                p.l1BlockNumber,
                p.l1BlockHash,
                _messageHash(p.recipient, p.amount),
                p.epochNumber,
                p.leafIndex,
                _l2Bridge,
                _token,
                _portal,
                _chainId,
                _rollupVersion
            )
        );
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

    function _registerSigner(address _signer) internal {
        vm.prank(OWNER);
        registry.addTee(_signer);
    }

    function test_withdraw_revertsWhenUninitialized() public {
        bytes32[] memory path = new bytes32[](0);
        vm.expectRevert(Portal.Uninitialized.selector);
        portal.withdraw(USER, 1 ether, 0, 0, path, 0, bytes32(0), "");
    }

    function test_withdraw_happyPath() public {
        _initialize();

        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-happy");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();

        underlying.mint(address(portal), p.amount);
        uint256 userBalanceBefore = underlying.balanceOf(p.recipient);

        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectEmit(true, true, true, true, address(portal));
        emit WithdrawFromAztec(p.recipient, p.amount);

        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );

        assertEq(underlying.balanceOf(p.recipient), userBalanceBefore + p.amount);
        assertEq(underlying.balanceOf(address(portal)), 0);
        assertTrue(portal.$isWithdrawalSpent(p.withdrawalDigest));

        assertEq(outbox.callCount(), 1);
        (
            bytes32 senderActor,
            uint256 senderVersion,
            address recipientActor,
            uint256 recipientChainId,
            bytes32 content,
            uint256 epoch,
            uint256 calledLeafIndex,
            uint256 pathLength
        ) = outbox.calls(0);
        assertEq(senderActor, L2_BRIDGE);
        assertEq(senderVersion, ROLLUP_VERSION);
        assertEq(recipientActor, address(portal));
        assertEq(recipientChainId, block.chainid);
        bytes32 expectedContent =
            Hash.sha256ToField(abi.encodeWithSignature("withdraw(address,uint256)", p.recipient, p.amount));
        assertEq(content, expectedContent);
        assertEq(epoch, p.epochNumber);
        assertEq(calledLeafIndex, p.leafIndex);
        assertEq(pathLength, path.length);
    }

    function test_withdraw_revertsOnReplay() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-replay");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount * 2);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );

        vm.expectRevert(Portal.WithdrawalAlreadyClaimed.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_revertsWhenSignerUnregistered() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-unreg");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.prank(OWNER);
        registry.removeTee(teeSigner);

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    // Tampering with any signed field recovers a *different* address that is
    // not in the registry, so the observable error is `UnregisteredTee`, not a
    // raw ECDSA failure. The portal's `TeeSignatureInvalid` error is reserved
    // for the raw-malleability rejection inside `ECDSA.recover`, which the
    // happy-path low-`s` signer never produces - documenting the choice so a
    // reader doesn't chase the wrong selector.
    function test_withdraw_revertsOnTamperedRecipient() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-tamper-recipient");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            address(0xBEEF), p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_revertsOnTamperedAmount() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-tamper-amount");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            p.recipient, p.amount + 1, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_revertsOnTamperedEpochNumber() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-tamper-epoch");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber + 1, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_revertsOnTamperedLeafIndex() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-tamper-leaf");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex + 1, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_revertsOnTamperedL1BlockNumber() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-tamper-l1block");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        _mockHistory(p.l1BlockNumber + 1, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber + 1, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_revertsOnTamperedWithdrawalDigest() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-tamper-digest");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, bytes32(uint256(0xFEEDFACE)), sig
        );
    }

    function test_withdraw_revertsOnUnknownL1BlockNumber() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-unknown-block");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        // History contract returns zero for blocks outside the 8192-slot window.
        _mockHistory(p.l1BlockNumber, bytes32(0));
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        vm.expectRevert(Portal.UnknownL1BlockHash.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_propagatesOutboxRevert() public {
        _initialize();
        (address teeSigner, uint256 teePk) = makeAddrAndKey("tee-outbox-revert");
        _registerSigner(teeSigner);

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);
        bytes memory sig = _signTee(teePk, _finalDigest(p));

        // Any outbox-side revert (unproven epoch, bad path, already consumed) should
        // bubble up unchanged.
        bytes memory customErr = abi.encodeWithSignature("OutboxReverted()");
        outbox.primeRevert(customErr);

        vm.expectRevert(customErr);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    // Config-mismatch coverage for §1.4: each of the five `TeeConfig` fields
    // the portal rebuilds inline must be part of the signed preimage. A TEE
    // that signs with the wrong value produces a final digest the portal
    // cannot match; `ECDSA.recover` returns a garbage signer that is not in
    // the registry, so `UnregisteredTee()` fires. All five fields are
    // exercised to pin the byte layout and ordering of `abi.encodePacked`.

    function _withdrawWithTamperedConfig(
        bytes32 _l2Bridge,
        address _token,
        address _portal,
        uint256 _chainId,
        uint256 _rollupVersion
    ) internal {
        _initialize();
        (, uint256 teePk) = makeAddrAndKey("tee-config-mismatch");
        // Deliberately do NOT register the signer: the recovered address is
        // garbage anyway, so the registry check is what we are actually
        // asserting against.

        WithdrawParams memory p = _defaultWithdrawParams();
        bytes32[] memory path = _dummyPath();
        underlying.mint(address(portal), p.amount);
        _mockHistory(p.l1BlockNumber, p.l1BlockHash);

        bytes memory sig =
            _signTee(teePk, _finalDigestWithConfig(p, _l2Bridge, _token, _portal, _chainId, _rollupVersion));

        vm.expectRevert(Portal.UnregisteredTee.selector);
        portal.withdraw(
            p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.l1BlockNumber, p.withdrawalDigest, sig
        );
    }

    function test_withdraw_revertsOnTamperedConfigL2Bridge() public {
        _withdrawWithTamperedConfig(
            bytes32(uint256(0xBAD)), address(underlying), address(portal), block.chainid, ROLLUP_VERSION
        );
    }

    function test_withdraw_revertsOnTamperedConfigToken() public {
        _withdrawWithTamperedConfig(L2_BRIDGE, address(0xBAD), address(portal), block.chainid, ROLLUP_VERSION);
    }

    function test_withdraw_revertsOnTamperedConfigPortal() public {
        _withdrawWithTamperedConfig(L2_BRIDGE, address(underlying), address(0xBAD), block.chainid, ROLLUP_VERSION);
    }

    function test_withdraw_revertsOnTamperedConfigChainId() public {
        _withdrawWithTamperedConfig(L2_BRIDGE, address(underlying), address(portal), block.chainid + 1, ROLLUP_VERSION);
    }

    function test_withdraw_revertsOnTamperedConfigRollupVersion() public {
        _withdrawWithTamperedConfig(L2_BRIDGE, address(underlying), address(portal), block.chainid, ROLLUP_VERSION + 1);
    }
}
