// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";

import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {Header, ContentCommitment, GasFees} from "@aztec/core/libraries/rollup/HeaderLib.sol";

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

  struct AlphabeticalFull {
    AlphabeticalData block;
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

  struct AlphabeticalContentCommitment {
    bytes32 blobsHash;
    bytes32 inHash;
    uint256 numTxs;
    bytes32 outHash;
  }

  struct AlphabeticalHeader {
    address coinbase;
    AlphabeticalContentCommitment contentCommitment;
    bytes32 feeRecipient;
    GasFees gasFees;
    bytes32 lastArchiveRoot;
    uint256 slotNumber;
    uint256 timestamp;
    uint256 totalManaUsed;
  }

  struct Data {
    bytes32 archive;
    bytes blobInputs;
    uint256 blockNumber;
    bytes body;
    Header header;
    uint32 numTxs;
  }

  struct AlphabeticalData {
    bytes32 archive;
    bytes blobInputs;
    uint256 blockNumber;
    bytes body;
    AlphabeticalHeader header;
    uint32 numTxs;
  }

  function load(string memory name) internal view returns (Full memory) {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/", name, ".json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    AlphabeticalFull memory full = abi.decode(jsonBytes, (AlphabeticalFull));
    return fromAlphabeticalToNormal(full);
  }

  // Decode does not support the custom types
  function fromAlphabeticalToNormal(AlphabeticalFull memory full)
    internal
    pure
    returns (Full memory)
  {
    return Full({
      block: Data({
        archive: full.block.archive,
        blobInputs: full.block.blobInputs,
        blockNumber: full.block.blockNumber,
        body: full.block.body,
        header: Header({
          lastArchiveRoot: full.block.header.lastArchiveRoot,
          contentCommitment: ContentCommitment({
            blobsHash: full.block.header.contentCommitment.blobsHash,
            inHash: full.block.header.contentCommitment.inHash,
            outHash: full.block.header.contentCommitment.outHash,
            numTxs: full.block.header.contentCommitment.numTxs
          }),
          slotNumber: Slot.wrap(full.block.header.slotNumber),
          timestamp: Timestamp.wrap(full.block.header.timestamp),
          coinbase: full.block.header.coinbase,
          feeRecipient: full.block.header.feeRecipient,
          gasFees: full.block.header.gasFees,
          totalManaUsed: full.block.header.totalManaUsed
        }),
        numTxs: full.block.numTxs
      }),
      messages: full.messages,
      populate: full.populate
    });
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

  function updateHeaderDaFee(bytes memory _header, uint256 _fee)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x00fc)), _fee)
    }
    return _header;
  }

  function updateHeaderBaseFee(bytes memory _header, uint256 _baseFee)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x011c)), _baseFee)
    }
    return _header;
  }

  function updateHeaderManaUsed(bytes memory _header, uint256 _manaUsed)
    internal
    pure
    returns (bytes memory)
  {
    assembly {
      mstore(add(_header, add(0x20, 0x013c)), _manaUsed)
    }
    return _header;
  }
}
