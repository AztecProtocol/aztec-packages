// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Exit} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {AttesterExitAuthorization, AttesterExitLimitState} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {CoordinationSignatureLib} from "@aztec/core/libraries/rollup/CoordinationSignatureLib.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {Signature, SignatureLib__InvalidSignature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {GSE, IGSECore} from "@aztec/governance/GSE.sol";

contract InitiateWithdrawByAttesterBatchTest is StakingBase {
  uint256 internal constant POOL_SIZE = 101;
  uint256 internal constant PRIVATE_KEY_OFFSET = 100_000;
  bytes32 internal constant ATTESTER_EXIT_TYPEHASH = keccak256("AttesterExit(address attester,uint256 deadline)");

  GSE internal gse;
  Governance internal governance;
  uint256 internal deadline;

  function setUp() public override {
    super.setUp();

    gse = staking.getGSE();
    governance = gse.getGovernance();

    StakingQueueConfig memory queueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: POOL_SIZE,
      bootstrapFlushSize: POOL_SIZE,
      normalFlushSizeMin: POOL_SIZE,
      normalFlushSizeQuotient: 1,
      maxQueueFlushSize: POOL_SIZE
    });

    vm.prank(address(governance));
    staking.updateStakingQueueConfig(queueConfig);

    uint256 totalStake = POOL_SIZE * ACTIVATION_THRESHOLD;
    mint(address(this), totalStake);
    stakingAsset.approve(address(staking), totalStake);

    for (uint256 i = 0; i < POOL_SIZE; i++) {
      staking.deposit({
        _attester: _attester(i),
        _withdrawer: WITHDRAWER,
        _publicKeyInG1: BN254Lib.g1Zero(),
        _publicKeyInG2: BN254Lib.g2Zero(),
        _proofOfPossession: BN254Lib.g1Zero(),
        _moveWithLatestRollup: false
      });
    }

    staking.flushEntryQueue();
    deadline = block.timestamp + 1 days;
  }

  function test_SignedSingleCanBeRelayed() external {
    AttesterExitAuthorization memory authorization = _authorization(0, PRIVATE_KEY_OFFSET, deadline);

    vm.prank(address(0xDEADBEEF));
    staking.initiateWithdrawByAttesterWithSignature(authorization);

    _assertExited(0);
    assertEq(staking.getActiveAttesterCount(), POOL_SIZE - 1);
  }

  function test_BatchExitsAuthorizedAttesters() external {
    AttesterExitAuthorization[] memory authorizations = _authorizations(4);

    vm.prank(address(0xDEADBEEF));
    staking.initiateWithdrawByAttesterBatch(authorizations);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE - 4);
    AttesterExitLimitState memory state = staking.getAttesterExitLimitState();
    assertEq(state.used, 4);

    for (uint256 i = 0; i < 4; i++) {
      _assertExited(i);
    }
  }

  function test_BatchRejectsMoreThanSequentialCallsAllow() external {
    AttesterExitAuthorization[] memory authorizations = _authorizations(5);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    staking.initiateWithdrawByAttesterBatch(authorizations);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    for (uint256 i = 0; i < 5; i++) {
      assertFalse(staking.getExit(_attester(i)).exists);
    }
  }

  function test_BatchUpToLimitExitsOnlyRemainingCapacity() external {
    for (uint256 i = 0; i < 3; i++) {
      vm.prank(_attester(i));
      staking.initiateWithdrawByAttester(_attester(i));
    }

    AttesterExitAuthorization[] memory authorizations = _authorizationsFrom(3, 4);
    uint256 exitedCount = staking.initiateWithdrawByAttesterBatchUpToLimit(authorizations);

    assertEq(exitedCount, 1);
    assertEq(staking.getActiveAttesterCount(), POOL_SIZE - 4);
    assertEq(staking.getAttesterExitLimitState().used, 4);
    _assertExited(3);
    for (uint256 i = 4; i < 7; i++) {
      assertFalse(staking.getExit(_attester(i)).exists);
    }
  }

  function test_BatchUpToLimitReturnsZeroWhenCapacityIsExhausted() external {
    for (uint256 i = 0; i < 4; i++) {
      vm.prank(_attester(i));
      staking.initiateWithdrawByAttester(_attester(i));
    }

    AttesterExitAuthorization[] memory authorizations = _authorizationsFrom(4, 2);
    uint256 exitedCount = staking.initiateWithdrawByAttesterBatchUpToLimit(authorizations);

    assertEq(exitedCount, 0);
    assertEq(staking.getActiveAttesterCount(), POOL_SIZE - 4);
    assertFalse(staking.getExit(_attester(4)).exists);
    assertFalse(staking.getExit(_attester(5)).exists);
  }

  function test_BatchUpToLimitDoesNotValidateUnprocessedSuffix() external {
    for (uint256 i = 0; i < 3; i++) {
      vm.prank(_attester(i));
      staking.initiateWithdrawByAttester(_attester(i));
    }

    AttesterExitAuthorization[] memory authorizations = _authorizationsFrom(3, 2);
    authorizations[1] = _authorization(4, PRIVATE_KEY_OFFSET + 5, deadline);

    uint256 exitedCount = staking.initiateWithdrawByAttesterBatchUpToLimit(authorizations);

    assertEq(exitedCount, 1);
    _assertExited(3);
    assertFalse(staking.getExit(_attester(4)).exists);
  }

  function test_BatchUpToLimitIsAtomicWithinProcessedPrefix() external {
    AttesterExitAuthorization[] memory authorizations = _authorizations(2);
    authorizations[1] = _authorization(1, PRIVATE_KEY_OFFSET + 2, deadline);

    vm.expectPartialRevert(SignatureLib__InvalidSignature.selector);
    staking.initiateWithdrawByAttesterBatchUpToLimit(authorizations);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    assertEq(staking.getAttesterExitLimitState().used, 0);
    assertFalse(staking.getExit(_attester(0)).exists);
    assertFalse(staking.getExit(_attester(1)).exists);
  }

  function test_BatchDuplicateAuthorizationRevertsAtomically() external {
    AttesterExitAuthorization[] memory authorizations = new AttesterExitAuthorization[](2);
    authorizations[0] = _authorization(0, PRIVATE_KEY_OFFSET, deadline);
    authorizations[1] = authorizations[0];

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, _attester(0)));
    staking.initiateWithdrawByAttesterBatch(authorizations);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    assertEq(staking.getAttesterExitLimitState().used, 0);
    assertFalse(staking.getExit(_attester(0)).exists);
  }

  function test_BatchUpToLimitDuplicateAuthorizationRevertsAtomically() external {
    AttesterExitAuthorization[] memory authorizations = new AttesterExitAuthorization[](2);
    authorizations[0] = _authorization(0, PRIVATE_KEY_OFFSET, deadline);
    authorizations[1] = authorizations[0];

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, _attester(0)));
    staking.initiateWithdrawByAttesterBatchUpToLimit(authorizations);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    assertEq(staking.getAttesterExitLimitState().used, 0);
    assertFalse(staking.getExit(_attester(0)).exists);
  }

  function test_BatchRequiresCanonicalRollup() external {
    AttesterExitAuthorization[] memory authorizations = _authorizations(1);

    vm.mockCall(
      address(registry), abi.encodeWithSelector(IRegistry.getCanonicalRollup.selector), abi.encode(address(0xDEADBEEF))
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotCanonical.selector, address(staking)));
    staking.initiateWithdrawByAttesterBatch(authorizations);

    assertFalse(staking.getExit(_attester(0)).exists);
  }

  function test_BatchRequiresLatestRollup() external {
    AttesterExitAuthorization[] memory authorizations = _authorizations(1);
    address nextRollup = address(0xDEADBEEF);

    vm.mockCall(address(gse), abi.encodeWithSelector(IGSECore.getLatestRollup.selector), abi.encode(nextRollup));

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotLatestRollup.selector, address(staking), nextRollup));
    staking.initiateWithdrawByAttesterBatch(authorizations);

    assertFalse(staking.getExit(_attester(0)).exists);
  }

  function test_BatchCannotReducePoolBelowCommitteeSize() external {
    for (uint256 i = 0; i < 52; i++) {
      vm.prank(WITHDRAWER);
      staking.initiateWithdraw(_attester(i), RECIPIENT);
    }

    AttesterExitAuthorization[] memory authorizations = new AttesterExitAuthorization[](2);
    authorizations[0] = _authorization(52, PRIVATE_KEY_OFFSET + 52, deadline);
    authorizations[1] = _authorization(53, PRIVATE_KEY_OFFSET + 53, deadline);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitPoolTooSmall.selector, uint256(49), uint256(48)));
    staking.initiateWithdrawByAttesterBatch(authorizations);

    assertEq(staking.getActiveAttesterCount(), 49);
    assertFalse(staking.getExit(_attester(52)).exists);
    assertFalse(staking.getExit(_attester(53)).exists);
  }

  function test_EmptyBatchReverts() external {
    AttesterExitAuthorization[] memory authorizations = new AttesterExitAuthorization[](0);

    vm.expectRevert(Errors.Staking__EmptyAttesterExitBatch.selector);
    staking.initiateWithdrawByAttesterBatch(authorizations);

    vm.expectRevert(Errors.Staking__EmptyAttesterExitBatch.selector);
    staking.initiateWithdrawByAttesterBatchUpToLimit(authorizations);
  }

  function test_ExpiredAuthorizationReverts() external {
    uint256 expiredDeadline = block.timestamp - 1;
    AttesterExitAuthorization memory authorization = _authorization(0, PRIVATE_KEY_OFFSET, expiredDeadline);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__AttesterExitAuthorizationExpired.selector, expiredDeadline, block.timestamp
      )
    );
    staking.initiateWithdrawByAttesterWithSignature(authorization);

    assertFalse(staking.getExit(_attester(0)).exists);
  }

  function test_AuthorizationMustBeSignedByAttester() external {
    AttesterExitAuthorization memory authorization = _authorization(0, PRIVATE_KEY_OFFSET + 1, deadline);

    vm.expectRevert(abi.encodeWithSelector(SignatureLib__InvalidSignature.selector, _attester(0), _attester(1)));
    staking.initiateWithdrawByAttesterWithSignature(authorization);

    assertFalse(staking.getExit(_attester(0)).exists);
  }

  function test_ReplayedAuthorizationCannotCreateAnotherExit() external {
    AttesterExitAuthorization memory authorization = _authorization(0, PRIVATE_KEY_OFFSET, deadline);

    staking.initiateWithdrawByAttesterWithSignature(authorization);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, _attester(0)));
    staking.initiateWithdrawByAttesterWithSignature(authorization);
  }

  function test_BatchIsAtomicWhenOneSignatureIsInvalid() external {
    AttesterExitAuthorization[] memory authorizations = _authorizations(2);
    authorizations[1] = _authorization(1, PRIVATE_KEY_OFFSET + 2, deadline);

    vm.expectPartialRevert(SignatureLib__InvalidSignature.selector);
    staking.initiateWithdrawByAttesterBatch(authorizations);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    for (uint256 i = 0; i < 2; i++) {
      assertFalse(staking.getExit(_attester(i)).exists);
    }
  }

  function _authorizations(uint256 _count) private view returns (AttesterExitAuthorization[] memory) {
    return _authorizationsFrom(0, _count);
  }

  function _authorizationsFrom(uint256 _start, uint256 _count)
    private
    view
    returns (AttesterExitAuthorization[] memory authorizations)
  {
    authorizations = new AttesterExitAuthorization[](_count);
    for (uint256 i = 0; i < _count; i++) {
      uint256 index = _start + i;
      authorizations[i] = _authorization(index, PRIVATE_KEY_OFFSET + index, deadline);
    }
  }

  function _authorization(uint256 _index, uint256 _signerPrivateKey, uint256 _deadline)
    private
    view
    returns (AttesterExitAuthorization memory)
  {
    address attester = _attester(_index);
    bytes32 structHash = keccak256(abi.encode(ATTESTER_EXIT_TYPEHASH, attester, _deadline));
    bytes32 digest = CoordinationSignatureLib.toTypedDataHash(structHash, address(staking));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_signerPrivateKey, digest);

    return
      AttesterExitAuthorization({attester: attester, deadline: _deadline, signature: Signature({v: v, r: r, s: s})});
  }

  function _attester(uint256 _index) private pure returns (address) {
    return vm.addr(PRIVATE_KEY_OFFSET + _index);
  }

  function _assertExited(uint256 _index) private view {
    address attester = _attester(_index);
    Exit memory exit = staking.getExit(attester);

    assertTrue(exit.exists);
    assertFalse(exit.isRecipient);
    assertEq(exit.recipientOrWithdrawer, WITHDRAWER);
    assertEq(exit.amount, ACTIVATION_THRESHOLD);
    assertEq(gse.effectiveBalanceOf(address(staking), attester), 0);
  }
}
