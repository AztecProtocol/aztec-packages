// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";

import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
// Many of the structs in here match what you see in `header` but with very important exceptions!
// The order of variables is sorted alphabetically in the structs in here to work with the
// JSON cheatcodes.

contract DecoderBase is TestBase {
  // When I had data and messages as one combined struct it failed, but I can have this top-layer and it works :shrug:
  // Note: Members of the struct (and substructs) have to be in ALPHABETICAL order!
  struct Full {
    Data block;
    Messages messages;
    Populate populate;
  }

  struct Populate {
    bytes32[] l1ToL2Content;
    bytes32 recipient;
    address sender;
  }

  struct Messages {
    bytes32[] l2ToL1Messages;
  }

  struct Data {
    bytes32 archive;
    bytes blobInputs;
    uint256 blockNumber;
    bytes body;
    DecodedHeader decodedHeader;
    bytes header;
    // Note: The following could be decoded from body but having it explicitaly here makes tests more robust against
    // decoder changes
    uint32 numTxs;
  }

  struct DecodedHeader {
    address coinbase;
    ContentCommitment contentCommitment;
    bytes32 feeRecipient;
    GasFees gasFees;
    bytes32 lastArchiveRoot;
    uint256 slotNumber;
    uint256 timestamp;
    uint256 totalManaUsed;
  }

  struct GasFees {
    uint128 feePerDaGas;
    uint128 feePerL2Gas;
  }

  struct ContentCommitment {
    bytes32 blobsHash;
    bytes32 inHash;
    uint256 numTxs;
    bytes32 outHash;
  }

  function load(string memory name) internal view returns (Full memory) {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/", name, ".json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    Full memory full = abi.decode(jsonBytes, (Full));
    return full;
  }

  function max(uint256 a, uint256 b) internal pure returns (uint256) {
    return a > b ? a : b;
  }

  function updateHeaderArchive(bytes memory _header, bytes32 _archive)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, 0x20), _archive)
    }
    return _header;
  }

  function updateHeaderNumTxs(bytes memory _header, uint256 _numTxs)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x0020)), _numTxs)
    }
    return _header;
  }

  function updateHeaderBlobsHash(bytes memory _header, bytes32 _blobsHash)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x0040)), _blobsHash)
    }
    return _header;
  }

  function updateHeaderInboxRoot(bytes memory _header, bytes32 _inboxRoot)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x0060)), _inboxRoot)
    }
    return _header;
  }

  function updateHeaderOutboxRoot(bytes memory _header, bytes32 _outboxRoot)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x0080)), _outboxRoot)
    }
    return _header;
  }

  function updateHeaderSlot(bytes memory _header, Slot _slot) internal pure returns (bytes memory) {
    assembly {
      mstore(add(_header, add(0x20, 0x00a0)), _slot)
    }
    return _header;
  }

  function getHeaderSlot(bytes memory _header) internal pure returns (Slot) {
    Slot slot;
    assembly {
      slot := mload(add(_header, add(0x20, 0x00a0)))
    }
    return slot;
  }

  function updateHeaderTimestamp(bytes memory _header, Timestamp _timestamp)
    internal
    pure
    returns (bytes memory)
  {
    return updateHeaderTimestamp(_header, Timestamp.unwrap(_timestamp));
  }

  function updateHeaderTimestamp(bytes memory _header, uint256 _timestamp)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      let ptr := add(_header, add(0x20, 0x00c0))
      // Timestamp is only 8 bytes, so we need to keep the the other 24 bytes.
      let prev := mload(ptr)
      let mask := shr(mul(8, 8), not(0))
      let updated := or(and(prev, mask), shl(mul(24, 8), _timestamp))
      mstore(ptr, updated)
    }
    return _header;
  }

  function updateHeaderCoinbase(bytes memory _header, address _coinbase)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      let ptr := add(_header, add(0x20, 0x00c8))
      // Coinbase is only 20 bytes, so we need to keep the the other 12 bytes.
      let prev := mload(ptr)
      let mask := shr(mul(20, 8), not(0))
      let updated := or(and(prev, mask), shl(mul(12, 8), _coinbase))
      mstore(ptr, updated)
    }
    return _header;
  }

  function updateHeaderFeeRecipient(bytes memory _header, address _feeRecipient)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x00dc)), _feeRecipient)
    }
    return _header;
  }

  function updateHeaderDaFee(bytes memory _header, uint128 _fee)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      let ptr := add(_header, add(0x20, 0x00fc))
      // Da fee per gas is only 16 bytes, so we need to keep the the other 16 bytes.
      let prev := mload(ptr)
      let mask := shr(mul(16, 8), not(0))
      let updated := or(and(prev, mask), shl(mul(16, 8), _fee))
      mstore(ptr, updated)
    }
    return _header;
  }

  function updateHeaderBaseFee(bytes memory _header, uint128 _baseFee)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      let ptr := add(_header, add(0x20, 0x010c))
      // Base fee per gas is only 16 bytes, so we need to keep the the other 16 bytes.
      let prev := mload(ptr)
      let mask := shr(mul(16, 8), not(0))
      let updated := or(and(prev, mask), shl(mul(16, 8), _baseFee))
      mstore(ptr, updated)
    }
    return _header;
  }

  function updateHeaderManaUsed(bytes memory _header, uint256 _manaUsed)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x011c)), _manaUsed)
    }
    return _header;
  }
}
