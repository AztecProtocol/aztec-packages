// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

struct Queue {
  mapping(uint256 index => address addr) attester;
  mapping(uint256 index => address addr) proposer;
  uint256 first;
  uint256 last;
}

library QueueLib {
  function init(Queue storage self) internal {
    self.first = 1;
    self.last = 1;
  }

  function enqueue(Queue storage self, address attester, address proposer) internal {
    self.attester[self.last] = attester;
    self.proposer[self.last] = proposer;
    self.last += 1;
  }

  function dequeue(Queue storage self) internal returns (address attester, address proposer) {
    require(self.last > self.first);

    attester = self.attester[self.first];
    proposer = self.proposer[self.first];

    delete self.attester[self.first];
    delete self.proposer[self.first];

    self.first += 1;
  }

  function length(Queue storage self) internal view returns (uint256 len) {
    len = self.last - self.first;
  }
}
