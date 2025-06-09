// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {QueueLib, Queue} from "@aztec/mock/staking_asset_handler/Queue.sol";
import {Test} from "forge-std/Test.sol";

contract Wrapper {
  using QueueLib for Queue;

  Queue queue;

  constructor() {
    queue.init();
  }

  function enqueue(address _attester) public {
    queue.enqueue(_attester);
  }

  function dequeue() public returns (address) {
    return queue.dequeue();
  }

  function length() public view returns (uint256) {
    return queue.length();
  }
}

contract QueueTest is Test {
  Wrapper queue;

  constructor() {
    queue = new Wrapper();
  }

  function test_WhenNotInitializedAndQueueIsEmpty() external {
    // it reverts when calling dequeue
    // it has length of 0
    vm.expectRevert(abi.encodeWithSelector(QueueLib.QueueEmpty.selector));
    queue.dequeue();

    assertEq(queue.length(), 0);
  }

  function test_WhenIncludingAlreadySeenAttesterProposerPair(address _attester, address _proposer)
    external
  {
    // it reverts
    queue.enqueue(_attester);

    vm.expectRevert(abi.encodeWithSelector(QueueLib.AlreadySeen.selector, _attester, _proposer));
    queue.enqueue(_attester);
  }

  function test_WhenEnqueuingValidators(uint8 _validatorsToAdd) external {
    // it updates length correctly
    // it can dequeue

    // Add them all
    for (uint256 i = 1; i < _validatorsToAdd; ++i) {
      queue.enqueue(address(uint160(i)));
      assertEq(queue.length(), i);
    }

    // dequeue them all
    for (uint256 i = 1; i < _validatorsToAdd; ++i) {
      address attester = queue.dequeue();
      // First come first served
      assertEq(attester, address(uint160(i)));

      assertEq(queue.length(), _validatorsToAdd - i - 1);
    }
  }
}
