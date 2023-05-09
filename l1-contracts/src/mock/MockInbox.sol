// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.18;


contract MockInbox {

  event MessageAdded(
    bytes32 indexed msgHash,
    bytes32 indexed l2Address,
    address indexed portal,
    uint256 deadline,
    uint256 fee,
    bytes content
  );


  mapping(address account => uint256 balance) public feesAccrued;


  /**
   * @notice Computes an entry key for the Inbox
   * @param _portal - The ethereum address of the portal
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _fee - The fee provided to sequencer for including the entry
   * @param _content - The content of the entry (application specific)
   * @return The key of the entry in the set
   */
  function computeMsgHash(address _portal, uint256 _deadline, uint256 _fee, bytes memory _content)
    public
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(_portal, _deadline, _fee,_content));
  }

  /**
   * @notice Inserts an entry into the Inbox
   * @dev Only callable by contracts that are portals according to the Rolodex
   * @dev Will emit `MessageAdded` with data for easy access by the sequencer
   * @dev msg.value - The fee provided to sequencer for including the entry
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _content - The content of the entry (application specific)
   * @return The key of the entry in the set
   */
  function sendL2Message(uint256 _deadline, bytes memory _content)
    external
    payable
    returns (bytes32)
  {
    bytes32 entryKey = computeMsgHash(msg.sender, _deadline, msg.value, _content);
    // TODO(sean): address(0) should be the aztec2 address from the registry
    emit MessageAdded(entryKey, bytes32(0x0), msg.sender, _deadline, msg.value, _content);
    return entryKey;
  }

  /**
   * @notice Cancel a pending L2 message
   * @dev Will revert if the deadline have not been crossed
   * @dev Must be called by portal that inserted the entry
   * @param _feeCollector - The address to receive the "fee"
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _fee - The fee provided to sequencer for including the entry
   * @param _content - The content of the entry (application specific)
   * @return The key of the entry removed
   */
  function cancelL2Message(
    address _feeCollector,
    uint256 _deadline,
    uint256 _fee,
    bytes memory _content
  ) external returns (bytes32) {
    bytes32 entryKey = computeMsgHash(msg.sender, _deadline, _fee, _content);
    return entryKey;
  }

  /**
   * @notice Consumes an entry from the Inbox
   * @dev Only callable by the rollup contract
   * @param _feeCollector - The address to receive the "fee"
   * @param _portal - The ethereum address of the portal
   * @param _deadline - The timestamp after which the entry can be cancelled
   * @param _fee - The fee provided to sequencer for including the entry
   * @param _content - The content of the entry (application specific)
   * @return The key of the entry removed
   */
  function consume(
    address _feeCollector,
    address _portal,
    uint256 _deadline,
    uint256 _fee,
    bytes memory _content
  ) external returns (bytes32) {
    bytes32 entryKey = computeMsgHash(msg.sender, _deadline, _fee, _content);
    return entryKey;
  }
}