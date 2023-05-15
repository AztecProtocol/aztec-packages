// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.18;

interface IInbox {
  function sendL2Message(uint256 _deadline, bytes32 secretHash, bytes memory _content)
    external
    payable
    returns (bytes32);

  function cancelL2Message(uint256 _deadline, bytes32 secretHash, bytes memory _content)
    external
    returns (bytes32);

  function consume(
    address _feeCollector,
    address _portal,
    uint256 _deadline,
    uint256 _fee,
    bytes32 secretHash,
    bytes memory _content
  ) external returns (bytes32);
}
