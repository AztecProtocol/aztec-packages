// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

contract DepositToAztecPublic is Test {
  using Hash for DataStructures.L1ToL2Msg;

  address internal constant OWNER = address(0x1);
  Registry internal registry;
  TestERC20 internal token;
  FeeJuicePortal internal feeJuicePortal;
  Rollup internal rollup;
  RewardDistributor internal rewardDistributor;

  address internal constant MAGIC_FEE_JUICE_ADDRESS = address(uint160(Constants.FEE_JUICE_ADDRESS));

  struct InboxLagTestState {
    Rollup testRollup;
    FeeJuicePortal testFeeJuicePortal;
    TestERC20 testToken;
    Inbox testInbox;
    uint256 lag;
    uint256 SIZE;
    uint256 initialInProgress;
    bytes32 to;
    bytes32 secretHash1;
    bytes32 secretHash2;
    uint256 amount;
    uint256 expectedIndex1;
    uint256 expectedIndex2;
    uint256 expectedInProgress;
  }

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();

    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    token = builder.getConfig().testERC20;

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));
  }

  function test_RevertGiven_InsufficientBalance() external {
    // it should revert
    vm.expectRevert(
      abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(feeJuicePortal), 0, 1)
    );
    feeJuicePortal.depositToAztecPublic(bytes32(0x0), 1, bytes32(0x0));

    token.approve(address(feeJuicePortal), 1);
    vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, 1));
    feeJuicePortal.depositToAztecPublic(bytes32(0x0), 1, bytes32(0x0));
  }

  function test_GivenSufficientBalance() external {
    // it should create a message for the inbox (and its rollup version)
    // it should transfer the tokens to the portal
    // it should insert the message into the inbox
    // it should emit a {DepositToAztecPublic} event
    // it should return the key

    bytes32 to = bytes32(0x0);
    bytes32 secretHash = bytes32(uint256(0x01));
    uint256 amount = 100 ether;

    Inbox inbox = Inbox(address(Rollup(address(registry.getCanonicalRollup())).getInbox()));
    // The first message goes into tree (INITIAL_CHECKPOINT_NUMBER + LAG) at index 0
    // Global index = (inProgress - INITIAL_CHECKPOINT_NUMBER) * SIZE + 0
    //              = ((INITIAL_CHECKPOINT_NUMBER + LAG) - INITIAL_CHECKPOINT_NUMBER) * SIZE
    //              = LAG * SIZE
    uint256 SIZE = 2 ** Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT;
    uint256 expectedIndex = TestConstants.AZTEC_INBOX_LAG * SIZE;

    // The purpose of including the function selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    // Separately, NOTE that the sender is the MAGIC_FEE_JUICE_ADDRESS, not the feeJuicePortal address in
    // this special case.
    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(MAGIC_FEE_JUICE_ADDRESS, block.chainid),
      recipient: DataStructures.L2Actor(feeJuicePortal.L2_TOKEN_ADDRESS(), rollup.getVersion()),
      content: Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", to, amount)),
      secretHash: secretHash,
      index: expectedIndex
    });

    bytes32 expectedKey = message.sha256ToField();

    vm.prank(token.owner());
    token.mint(address(this), amount);
    token.approve(address(feeJuicePortal), amount);

    assertEq(inbox.getTotalMessagesInserted(), 0);

    bytes16 expectedHash = bytes16(keccak256(abi.encodePacked(inbox.getState().rollingHash, expectedKey)));
    uint256 expectedInProgress = Constants.INITIAL_CHECKPOINT_NUMBER + TestConstants.AZTEC_INBOX_LAG;
    vm.expectEmit(true, true, true, true, address(inbox));
    emit IInbox.MessageSent(expectedInProgress, expectedIndex, expectedKey, expectedHash);
    vm.expectEmit(true, true, true, true, address(feeJuicePortal));
    emit IFeeJuicePortal.DepositToAztecPublic(to, amount, secretHash, expectedKey, expectedIndex);

    (bytes32 key, uint256 index) = feeJuicePortal.depositToAztecPublic(to, amount, secretHash);

    assertEq(inbox.getTotalMessagesInserted(), 1);
    assertEq(key, expectedKey);
    assertEq(index, expectedIndex);
  }

  function testFuzz_InboxLag(uint256 _lag) external {
    // Bound lag to reasonable values (1-10) to test different lag configurations
    uint256 lag = bound(_lag, 1, 10);

    RollupBuilder builder = new RollupBuilder(address(this));
    builder.setInboxLag(lag);
    builder.deploy();

    InboxLagTestState memory state = InboxLagTestState({
      testRollup: builder.getConfig().rollup,
      testFeeJuicePortal: FeeJuicePortal(address(builder.getConfig().rollup.getFeeAssetPortal())),
      testToken: builder.getConfig().testERC20,
      testInbox: Inbox(address(builder.getConfig().rollup.getInbox())),
      lag: lag,
      SIZE: 2 ** Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT,
      initialInProgress: 0, // Will be set below
      to: bytes32(0x0),
      secretHash1: bytes32(uint256(0x01)),
      secretHash2: bytes32(uint256(0x02)),
      amount: 100 ether,
      expectedIndex1: 0, // Will be set below
      expectedIndex2: 0, // Will be set below
      expectedInProgress: Constants.INITIAL_CHECKPOINT_NUMBER + lag
    });

    // Verify initial state: inProgress should be INITIAL_CHECKPOINT_NUMBER + lag
    assertEq(
      state.testInbox.getInProgress(),
      state.expectedInProgress,
      "Initial inProgress should be INITIAL_CHECKPOINT_NUMBER + lag"
    );
    state.initialInProgress = state.testInbox.getInProgress();
    state.expectedIndex1 = state.lag * state.SIZE;
    state.expectedIndex2 = state.lag * state.SIZE + 1;

    vm.prank(state.testToken.owner());
    state.testToken.mint(address(this), state.amount * 2);
    state.testToken.approve(address(state.testFeeJuicePortal), state.amount * 2);

    // Send first message
    (, uint256 index1) = state.testFeeJuicePortal.depositToAztecPublic(state.to, state.amount, state.secretHash1);
    assertEq(index1, state.expectedIndex1, "First message index should be lag * SIZE");
    assertEq(
      state.testInbox.getInProgress(),
      state.expectedInProgress,
      "inProgress should not change after sending first message"
    );
    assertEq(state.testInbox.getTotalMessagesInserted(), 1, "Should have 1 message after first deposit");

    // Send second message
    (, uint256 index2) = state.testFeeJuicePortal.depositToAztecPublic(state.to, state.amount, state.secretHash2);
    assertEq(index2, state.expectedIndex2, "Second message index should be lag * SIZE + 1");
    assertEq(
      state.testInbox.getInProgress(),
      state.expectedInProgress,
      "inProgress should not change after sending second message"
    );
    assertEq(state.testInbox.getTotalMessagesInserted(), 2, "Should have 2 messages after second deposit");

    // Test consume logic: consume checkpoints to verify lag behavior
    // Initially: inProgress = INITIAL_CHECKPOINT_NUMBER + lag
    // When checkpoint N is consumed:
    //   - If N + lag == inProgress, then inProgress advances to inProgress + 1
    //   - Otherwise, inProgress stays the same

    // Consume checkpoints starting from INITIAL_CHECKPOINT_NUMBER
    // We need to consume them sequentially to test the lag behavior
    for (
      uint256 checkpointNum = Constants.INITIAL_CHECKPOINT_NUMBER;
      checkpointNum < state.initialInProgress;
      checkpointNum++
    ) {
      uint256 inProgressBefore = state.testInbox.getInProgress();

      // Call consume as the rollup
      vm.prank(address(state.testRollup));
      bytes32 root = state.testInbox.consume(checkpointNum);

      uint256 inProgressAfter = state.testInbox.getInProgress();
      bool shouldAdvance = (checkpointNum + state.lag == inProgressBefore);

      if (shouldAdvance) {
        assertEq(
          inProgressAfter, inProgressBefore + 1, "inProgress should advance when checkpointNum + lag == inProgress"
        );
      } else {
        assertEq(
          inProgressAfter, inProgressBefore, "inProgress should not advance when checkpointNum + lag != inProgress"
        );
      }

      // Verify root is correct for non-initial checkpoints
      if (checkpointNum > Constants.INITIAL_CHECKPOINT_NUMBER) {
        assertEq(root, state.testInbox.getRoot(checkpointNum), "Root should match getRoot for checkpoint");
      }
    }

    // After consuming all checkpoints up to the lag point, inProgress should have advanced
    uint256 finalInProgress = state.testInbox.getInProgress();
    assertEq(
      finalInProgress,
      state.initialInProgress + state.lag,
      "Final inProgress should advance by lag after consuming all checkpoints"
    );
  }
}
