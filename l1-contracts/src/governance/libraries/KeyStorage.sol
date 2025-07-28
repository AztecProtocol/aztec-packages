// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @title KeyStorage
 * @notice Library for managing BLS signature keys and validator state in governance
 * @dev Provides secure key registration, deactivation, and reactivation with anti-reuse protections.
 *      Maintains efficient data structures for validator management and active set tracking.
 */

/**
 * @notice Represents a BLS signature validator with their public key components
 * @dev Stores both G1 and G2 components of BLS public keys along with activation status
 */
struct Validator {
  uint256 g1x;
  /// @dev G1 point x-coordinate
  uint256 g1y;
  /// @dev G1 point y-coordinate
  uint256 g2x0;
  /// @dev G2 point x-coordinate (real component)
  uint256 g2x1;
  /// @dev G2 point x-coordinate (imaginary component)
  uint256 g2y0;
  /// @dev G2 point y-coordinate (real component)
  uint256 g2y1;
  /// @dev G2 point y-coordinate (imaginary component)
  bool active;
}
/// @dev Whether this validator is currently active

/**
 * @notice Storage structure for managing validator keys and active set
 * @dev Efficiently tracks all validators while maintaining dense active validator array.
 */
struct Keys {
  /// @dev Complete validator registry (ID == index + 1). Never shrinks to preserve ID stability.
  Validator[] validators;
  /// @dev Dense array containing only active validator IDs.
  uint32[] liveIds;
  /// @dev Maps validator ID to its position in liveIds array.
  mapping(uint32 => uint32) posInLive;
  /// @dev Maps address to validator ID. Enforces one registration per address.
  mapping(address => uint32) idOf;
  /// @dev Maps key hash to validator ID (+1 offset). Prevents key reuse across validators.
  mapping(bytes32 => uint32) keyIdOf;
}

/**
 * @title KeyStorage Library
 * @notice Core library for BLS key management with security guarantees
 * @dev Implements validator registration, activation control, and secure key tracking
 */
library KeyStorage {
  /**
   * @notice Register a new BLS key for the calling address
   * @dev Validates uniqueness constraints and initializes validator state.
   *      Keys are permanently bound to the registering address and cannot be reused.
   * @param keys The storage reference to the Keys struct
   * @param pk1 G1 point coordinates [x, y] of the BLS public key
   * @param pk2 G2 point coordinates [x0, x1, y0, y1] of the BLS public key
   */
  function addKey(Keys storage keys, uint256[2] memory pk1, uint256[4] memory pk2) internal {
    bytes32 keyHash = keccak256(abi.encodePacked(pk1, pk2));
    require(keys.keyIdOf[keyHash] == 0, "key already registered");
    require(keys.idOf[msg.sender] == 0, "key already registered");

    uint32 id = uint32(keys.validators.length) + 1; // Start IDs from 1, keep 0 as "not registered"

    keys.keyIdOf[keyHash] = id;

    keys.validators.push(
      Validator({
        g1x: pk1[0],
        g1y: pk1[1],
        g2x0: pk2[0],
        g2x1: pk2[1],
        g2y0: pk2[2],
        g2y1: pk2[3],
        active: true
      })
    );

    /* add to liveIds */
    keys.posInLive[id] = uint32(keys.liveIds.length);
    keys.liveIds.push(id);

    keys.idOf[msg.sender] = id;
  }

  /**
   * @notice Deactivate the caller's registered BLS key
   * @dev Removes validator from active set using efficient swap-and-pop.
   *      Preserves validator data and ID for potential reactivation.
   * @param keys The storage reference to the Keys struct
   */
  function deactivateKey(Keys storage keys) internal {
    uint32 id = keys.idOf[msg.sender];
    require(id != 0, "not validator");
    require(keys.validators[id - 1].active, "already inactive"); // Convert ID to array index

    uint32 pos = keys.posInLive[id];
    uint32 last = uint32(keys.liveIds.length - 1);
    if (pos != last) {
      uint32 movedId = keys.liveIds[last];
      keys.liveIds[pos] = movedId;
      keys.posInLive[movedId] = pos;
    }
    keys.liveIds.pop();
    delete keys.posInLive[id];

    keys.validators[id - 1].active = false; // Convert ID to array index
  }

  /**
   * @notice Reactivate the caller's previously registered BLS key
   * @dev Adds validator back to active set. Only original registrant can reactivate.
   * @param keys The storage reference to the Keys struct
   */
  function reactivateKey(Keys storage keys) internal {
    uint32 id = keys.idOf[msg.sender];
    require(id != 0, "not validator");

    require(!keys.validators[id - 1].active, "already active");

    keys.validators[id - 1].active = true;

    keys.liveIds.push(id);
    keys.posInLive[id] = uint32(keys.liveIds.length - 1);
  }

  // ===== VIEW FUNCTIONS =====

  /**
   * @notice Retrieve validator data by ID
   * @dev Validates ID bounds and converts to array index
   * @param keys The storage reference to the Keys struct
   * @param _id The validator ID (1-based indexing)
   * @return Validator struct containing BLS key components and status
   */
  function getValidator(Keys storage keys, uint32 _id) external view returns (Validator memory) {
    require(_id > 0 && _id <= keys.validators.length, "Invalid validator ID");
    return keys.validators[_id - 1]; // Convert ID to array index
  }

  /**
   * @notice Get all currently active validators
   * @dev Returns array of Validator structs for all active validators only
   * @param keys The storage reference to the Keys struct
   * @return result Array of active Validator structs
   */
  function getActiveValidators(Keys storage keys) external view returns (Validator[] memory result) {
    uint256 len = keys.liveIds.length;
    result = new Validator[](len);
    for (uint256 i = 0; i < len; ++i) {
      result[i] = keys.validators[keys.liveIds[i] - 1]; // Convert ID to array index
    }
  }

  /**
   * @notice Get total number of registered validators (active + inactive)
   * @param keys The storage reference to the Keys struct
   * @return Total count of validators ever registered
   */
  function getValidatorsCount(Keys storage keys) external view returns (uint256) {
    return keys.validators.length;
  }

  /**
   * @notice Get array of all active validator IDs
   * @param keys The storage reference to the Keys struct
   * @return Array of active validator IDs in current order
   */
  function getLiveIds(Keys storage keys) external view returns (uint32[] memory) {
    return keys.liveIds;
  }

  /**
   * @notice Get count of currently active validators
   * @param keys The storage reference to the Keys struct
   * @return Number of active validators
   */
  function getLiveIdsCount(Keys storage keys) external view returns (uint256) {
    return keys.liveIds.length;
  }

  /**
   * @notice Get position of validator ID in active set
   * @dev Returns 0 if validator is not active (position mapping deleted)
   * @param keys The storage reference to the Keys struct
   * @param _id The validator ID to query
   * @return Position in liveIds array (0-based), or 0 if inactive
   */
  function getPositionInLive(Keys storage keys, uint32 _id) external view returns (uint32) {
    return keys.posInLive[_id];
  }

  /**
   * @notice Get validator ID for a given address
   * @param keys The storage reference to the Keys struct
   * @param _address The address to query
   * @return Validator ID (1-based), or 0 if address has no registered key
   */
  function getIdOf(Keys storage keys, address _address) external view returns (uint32) {
    return keys.idOf[_address];
  }

  /**
   * @notice Check if a validator is currently active
   * @dev Validates ID bounds before checking active status
   * @param keys The storage reference to the Keys struct
   * @param _id The validator ID to check
   * @return True if validator exists and is active
   */
  function isValidatorActive(Keys storage keys, uint32 _id) external view returns (bool) {
    require(_id > 0 && _id <= keys.validators.length, "Invalid validator ID");
    return keys.validators[_id - 1].active; // Convert ID to array index
  }
}
