// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

struct Queue {
  mapping(uint256 index => address addr) attester;
  mapping(uint256 index => address addr) proposer;
  mapping(bytes32 attesterProposerHash => bool) seen;
  uint256 first;
  uint256 last;
}

library QueueLib {
  error AlreadySeen(address _attester, address _proposer);

  function init(Queue storage self) internal {
    self.first = 1;
    self.last = 1;
  }

  function enqueue(Queue storage self, address _attester, address _proposer) internal {
    bytes32 attesterProposerHash = getAttesterProposerHash(_attester, _proposer);
    require(!self.seen[attesterProposerHash], AlreadySeen(_attester, _proposer));

    self.attester[self.last] = _attester;
    self.proposer[self.last] = _proposer;
    self.seen[attesterProposerHash] = true;
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

  function getAttesterProposerHash(address _attester, address _proposer)
    internal
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(_attester, _proposer));
  }
}
