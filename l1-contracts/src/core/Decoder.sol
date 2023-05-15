// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import "forge-std/console.sol";

/**
 * @title Decoder
 * @author Aztec Labs
 * @notice Decoding a L2 block, concerned with readability and velocity of development
 * not giving a damn about gas costs.
 * @dev there is currently no padding of the elements, so we are for now assuming nice trees as inputs.
 * Furthermore, if no contract etc are deployed, we expect there to be address(0) for input.
 *
 * -------------------
 * L2 Block Data specification
 * -------------------
 *
 *  | byte start                                           | num bytes  | name
 *  | ---                                                  | ---        | ---
 *  | 0x00                                                 | 0x04       | L2 block number
 *  | 0x04                                                 | 0x20       | startPrivateDataTreeSnapshot.root
 *  | 0x24                                                 | 0x04       | startPrivateDataTreeSnapshot.nextAvailableLeafIndex
 *  | 0x28                                                 | 0x20       | startNullifierTreeSnapshot.root
 *  | 0x48                                                 | 0x04       | startNullifierTreeSnapshot.nextAvailableLeafIndex
 *  | 0x4c                                                 | 0x20       | startContractTreeSnapshot.root
 *  | 0x6c                                                 | 0x04       | startContractTreeSnapshot.nextAvailableLeafIndex
 *  | 0x70                                                 | 0x20       | startTreeOfHistoricPrivateDataTreeRootsSnapshot.root
 *  | 0x90                                                 | 0x04       | startTreeOfHistoricPrivateDataTreeRootsSnapshot.nextAvailableLeafIndex
 *  | 0x94                                                 | 0x20       | startTreeOfHistoricContractTreeRootsSnapshot.root
 *  | 0xb4                                                 | 0x04       | startTreeOfHistoricContractTreeRootsSnapshot.nextAvailableLeafIndex
 *  | 0xb8                                                 | 0x20       | startPublicDataTreeRoot
 *  | 0xd8                                                 | 0x20       | startL1ToL2MessagesTreeSnapshot.root
 *  | 0xf8                                                 | 0x04       | startL1ToL2MessagesTreeSnapshot.nextAvailableLeafIndex
 *  | 0xfc                                                 | 0x20       | startTreeOfHistoricL1ToL2MessagesTreeRootsSnapshot.root
 *  | 0x11c                                                | 0x04       | startTreeOfHistoricL1ToL2MessagesTreeRootsSnapshot.nextAvailableLeafIndex
 *  | 0x120                                                | 0x20       | endPrivateDataTreeSnapshot.root
 *  | 0x140                                                | 0x04       | endPrivateDataTreeSnapshot.nextAvailableLeafIndex
 *  | 0x144                                                | 0x20       | endNullifierTreeSnapshot.root
 *  | 0x164                                                | 0x04       | endNullifierTreeSnapshot.nextAvailableLeafIndex
 *  | 0x168                                                | 0x20       | endContractTreeSnapshot.root
 *  | 0x188                                                | 0x04       | endContractTreeSnapshot.nextAvailableLeafIndex
 *  | 0x18c                                                | 0x20       | endTreeOfHistoricPrivateDataTreeRootsSnapshot.root
 *  | 0x1ac                                                | 0x04       | endTreeOfHistoricPrivateDataTreeRootsSnapshot.nextAvailableLeafIndex
 *  | 0x1b0                                                | 0x20       | endTreeOfHistoricContractTreeRootsSnapshot.root
 *  | 0x1d0                                                | 0x04       | endTreeOfHistoricContractTreeRootsSnapshot.nextAvailableLeafIndex
 *  | 0x1d4                                                | 0x20       | endPublicDataTreeRoot
 *  | 0x1f4                                                | 0x20       | endL1ToL2MessagesTreeSnapshot.root
 *  | 0x214                                                | 0x04       | endL1ToL2MessagesTreeSnapshot.nextAvailableLeafIndex
 *  | 0x218                                                | 0x20       | endTreeOfHistoricL1ToL2MessagesTreeRootsSnapshot.root
 *  | 0x238                                                | 0x04       | endTreeOfHistoricL1ToL2MessagesTreeRootsSnapshot.nextAvailableLeafIndex
 *  | 0x23c                                                | 0x04       | len(newCommitments) denoted a
 *  | 0x240                                                | a * 0x20   | newCommits (each element 32 bytes)
 *  | 0x240 + a * 0x20                                     | 0x04       | len(newNullifiers) denoted b
 *  | 0x244 + a * 0x20                                     | b * 0x20   | newNullifiers (each element 32 bytes)
 *  | 0x244 + (a + b) * 0x20                               | 0x04       | len(newPublicDataWrites) denoted c
 *  | 0x248 + (a + b) * 0x20                               | c * 0x40   | newPublicDataWrites (each element 64 bytes)
 *  | 0x248 + (a + b) * 0x20 + c * 0x40                    | 0x04       | len(newL2ToL1msgs) denoted d
 *  | 0x24c + (a + b) * 0x20 + c * 0x40                    | d * 0x20   | newL2ToL1msgs (each element 32 bytes)
 *  | 0x24c + (a + b + d) * 0x20 + c * 0x40                | 0x04       | len(newContracts) denoted e
 *  | 0x250 + (a + b + d) * 0x20 + c * 0x40                | e * 0x20   | newContracts (each element 32 bytes)
 *  | 0x250 + (a + b + d) * 0x20 + c * 0x40 + e * 0x20     | e * 0x34   | newContractData (each element 52 bytes)
 *  | 0x250 + (a + b + d) * 0x20 + c * 0x40 + e * 0x54     | 0x04       | len(l1ToL2Messages) denoted f
 *  | 0x254 + (a + b + d) * 0x20 + c * 0x40 + e * 0x54     | f * 0x20   | l1ToL2Messages (each element 32 bytes)
 *  |---                                                   |---         | ---
 */
contract Decoder {
  uint256 internal constant COMMITMENTS_PER_KERNEL = 4;
  uint256 internal constant NULLIFIERS_PER_KERNEL = 4;
  uint256 internal constant PUBLIC_DATA_WRITES_PER_KERNEL = 4;
  uint256 internal constant L2_TO_L1_MSGS_PER_KERNEL = 2;
  uint256 internal constant CONTRACTS_PER_KERNEL = 1;
  uint256 internal constant L1_TO_L2_MESSAGES_PER_ROLLUP = 16;

  uint256 internal constant BASES = 2;
  uint256 internal constant KERNELS = 2;
  uint256 internal constant COMMITMENTS_PER_BASE = KERNELS * COMMITMENTS_PER_KERNEL;
  uint256 internal constant NULLIFIERS_PER_BASE = KERNELS * NULLIFIERS_PER_KERNEL;
  uint256 internal constant L2_TO_L1_MSGS_PER_BASE = KERNELS * L2_TO_L1_MSGS_PER_KERNEL;
  uint256 internal constant PUBLIC_DATA_WRITES_PER_BASE = KERNELS * PUBLIC_DATA_WRITES_PER_KERNEL;
  uint256 internal constant CONTRACTS_PER_BASE = KERNELS * CONTRACTS_PER_KERNEL;

  // Prime field order
  uint256 internal constant P =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

  struct TreeSnapshot {
    uint256 root;
    uint32 nextAvailableLeafIndex;
  }

  struct ContractData {
    uint256 aztecAddress;
    address portalAddress;
  }

  struct PublicDataWrite {
    uint256 leafIndex;
    uint256 newValue;
  }

  struct Block {
    uint256 blockNumber;
    TreeSnapshot startPrivateDataTreeSnapshot;
    TreeSnapshot startNullifierTreeSnapshot;
    TreeSnapshot startContractTreeSnapshot;
    TreeSnapshot startTreeOfHistoricPrivateDataTreeRootsSnapshot;
    TreeSnapshot startTreeOfHistoricContractTreeRootsSnapshot;
    uint256 startPublicDataTreeRoot;
    TreeSnapshot startL1ToL2MessagesTreeSnapshot;
    TreeSnapshot startTreeOfHistoricL1ToL2MessagesTreeRootsSnapshot;
    TreeSnapshot endPrivateDataTreeSnapshot;
    TreeSnapshot endNullifierTreeSnapshot;
    TreeSnapshot endContractTreeSnapshot;
    TreeSnapshot endTreeOfHistoricPrivateDataTreeRootsSnapshot;
    TreeSnapshot endTreeOfHistoricContractTreeRootsSnapshot;
    uint256 endPublicDataTreeRoot;
    TreeSnapshot endL1ToL2MessagesTreeSnapshot;
    TreeSnapshot endTreeOfHistoricL1ToL2MessagesTreeRootsSnapshot;
    uint256[] newCommitments;
    uint256[] newNullifiers;
    PublicDataWrite[] newPublicDataWrites;
    uint256[] newL2ToL1msgs;
    uint256[] newContract;
    ContractData[] newContractData;
    uint256[] newl1ToL2Messages;
  }

  /**
   * @notice Decodes the inputs and computes values to check state against
   * @param _l2Block - The L2 block calldata.
   * @return l2BlockNumber  - The L2 block number.
   * @return startStateHash - The state hash expected prior the execution.
   * @return endStateHash - The state hash expected after the execution.
   * @return publicInputHash - The hash of the public inputs
   */
  function _decode(Block calldata _l2Block)
    internal
    view
    returns (
      uint256 l2BlockNumber,
      bytes32 startStateHash,
      bytes32 endStateHash,
      bytes32 publicInputHash
    )
  {
    l2BlockNumber = _getL2BlockNumber(_l2Block);
    // Note, for startStateHash to match the storage, the l2 block number must be new - 1.
    // Only jumping 1 block at a time.
    startStateHash = _computeStateHash(l2BlockNumber - 1, 0x20, _l2Block);
    endStateHash = _computeStateHash(l2BlockNumber, 0x200, _l2Block);
    publicInputHash = _computePublicInputsHash(_l2Block);
  }

  /**
   * Computes a hash of the public inputs from the calldata
   * @param _l2Block - The L2 block calldata.
   * @return sha256(header[0x4: 0x23c], diffRoot, l1Tol2MessagesHash)
   */
  function _computePublicInputsHash(Block calldata _l2Block) internal view returns (bytes32) {
    // header size - block number size + one value for the diffRoot + one value for l1ToL2MessagesHash
    uint256 size = 0x3c0 + 0x20 + 0x20;

    // Compute the public inputs hash
    bytes memory temp = new bytes(size);
    // perform a memcpy into the temp variable
    assembly {
      calldatacopy(add(temp, 0x20), add(_l2Block, 0x20), size)
    }

    (bytes32 diffRoot, bytes32 l1ToL2messagesHash) = _computeDiffRootAndMessagesHash(_l2Block);
    assembly {
      let endOfTreesData := 0x3c0
      mstore(add(temp, add(0x20, endOfTreesData)), diffRoot)
      mstore(add(temp, add(0x40, endOfTreesData)), l1ToL2messagesHash)
    }

    return bytes32(uint256(sha256(temp)) % P);
  }

  /**
   * @notice Extract the L2 block number from the block
   * @param _l2Block - The L2 block calldata
   * @return l2BlockNumber - The L2 block number
   */
  function _getL2BlockNumber(Block calldata _l2Block) internal pure returns (uint256 l2BlockNumber) {
    // assembly {
    //   l2BlockNumber := and(shr(224, calldataload(_l2Block)), 0xffffffff)
    // }
    l2BlockNumber = _l2Block.blockNumber;
  }

  /**
   * @notice Computes a state hash
   * @param _l2BlockNumber - The L2 block number
   * @param _offset - The offset into the data, 0x04 for start, 0xd8 for end
   * @param _l2Block - The L2 block calldata.
   * @return The state hash
   */
  function _computeStateHash(uint256 _l2BlockNumber, uint256 _offset, Block calldata _l2Block)
    internal
    view
    returns (bytes32)
  {
    bytes memory temp = new bytes(0x200);

    assembly {
      mstore(add(0x20, temp), _l2BlockNumber)
      // Copy header elements (not including block number) for start or end (size 0xd4)
      calldatacopy(add(temp, 0x40), add(_l2Block, _offset), 0x1e0)
    }

    return sha256(temp);
  }

  struct ArrayOffsets {
    uint256 commitmentOffset;
    uint256 nullifierOffset;
    uint256 publicDataOffset;
    uint256 l2ToL1MsgsOffset;
    uint256 contractOffset;
    uint256 contractDataOffset;
    uint256 l1ToL2MessagesOffset;
  }

  /**
   * @notice Creates a "diff" tree and compute its root
   * @param _l2Block - The L2 block calldata.
   */
  function _computeDiffRootAndMessagesHash(Block calldata _l2Block)
    internal
    view
    returns (bytes32, bytes32)
  {
    // Find the lengths of the different inputs
    // TOOD: Naming / getting the messages root within this function is a bit weird
    ArrayOffsets memory offsets;

    bytes32[] memory baseLeafs = new bytes32[](
            _l2Block.newCommitments.length / (COMMITMENTS_PER_KERNEL * 2)
        );

    // Data starts after header. Look at L2 Block Data specification at the top of this file.
    {
      offsets.commitmentOffset = 0x4e0;
      offsets.nullifierOffset =
        offsets.commitmentOffset + 0x20 + _l2Block.newCommitments.length * 0x20;
      offsets.publicDataOffset =
        offsets.nullifierOffset + 0x20 + _l2Block.newNullifiers.length * 0x20;
      offsets.l2ToL1MsgsOffset =
        offsets.publicDataOffset + 0x20 + _l2Block.newPublicDataWrites.length * 0x40;
      offsets.contractOffset =
        offsets.l2ToL1MsgsOffset + 0x20 + _l2Block.newL2ToL1msgs.length * 0x20;
      offsets.contractDataOffset =
        offsets.contractOffset + 0x20 + _l2Block.newContract.length * 0x20;
      offsets.l1ToL2MessagesOffset =
        offsets.contractDataOffset + 0x20 + _l2Block.newContractData.length * 0x40;

      for (uint256 i = 0; i < baseLeafs.length; i++) {
        /**
         * Compute the leaf to insert.
         * Leaf_i = (
         *    newCommitmentsKernel1,
         *    newCommitmentsKernel2,
         *    newNullifiersKernel1,
         *    newNullifiersKernel2,
         *    newPublicDataWritesKernel1,
         *    newPublicDataWritesKernel2,
         *    newL2ToL1MsgsKernel1,
         *    newL2ToL1MsgsKernel2,
         *    newContractLeafKernel1,
         *    newContractLeafKernel2,
         *    newContractDataKernel1.aztecAddress,
         *    newContractDataKernel1.ethAddress (padded to 32 bytes)
         *    newContractDataKernel2.aztecAddress,
         *    newContractDataKernel2.ethAddress (padded to 32 bytes)
         * );
         * Note that we always read data, the l2Block (atm) must therefore include dummy or zero-notes for
         * Zero values.
         */
        // Create the leaf to contain commitments (8 * 0x20) + nullifiers (8 * 0x20)
        // + new public data writes (8 * 0x40) + contract deployments (2 * 0x60)

        bytes32[] memory baseLeaf = new bytes32[](42);

        for (uint256 j = 0; j < BASES; j++ ) {
          uint256 offset = 0;
          for (uint256 k = 0; k < COMMITMENTS_PER_KERNEL; k++) {
            baseLeaf[j * COMMITMENTS_PER_KERNEL + k] = bytes32(_l2Block.newCommitments[i * COMMITMENTS_PER_BASE +  j * COMMITMENTS_PER_KERNEL + k]);
          }

          offset += KERNELS * COMMITMENTS_PER_KERNEL; // 8
          for (uint256 k = 0; k < NULLIFIERS_PER_KERNEL; k++) {
            baseLeaf[offset + j * NULLIFIERS_PER_KERNEL + k] = bytes32(_l2Block.newNullifiers[i * NULLIFIERS_PER_BASE + j * NULLIFIERS_PER_KERNEL + k]);
          }

          offset += KERNELS * NULLIFIERS_PER_KERNEL; // 16
          for (uint256 k = 0; k < PUBLIC_DATA_WRITES_PER_KERNEL; k++) {
            PublicDataWrite memory write = _l2Block.newPublicDataWrites[i * PUBLIC_DATA_WRITES_PER_BASE + j * PUBLIC_DATA_WRITES_PER_KERNEL + k];

            baseLeaf[offset + j * 2 * PUBLIC_DATA_WRITES_PER_KERNEL + k * 2] = bytes32(write.leafIndex);
            baseLeaf[offset + j * 2 * PUBLIC_DATA_WRITES_PER_KERNEL + k * 2 + 1] = bytes32(write.newValue);
          }

          offset += KERNELS * 2 * PUBLIC_DATA_WRITES_PER_KERNEL; // 32
          for (uint256 k = 0; k < L2_TO_L1_MSGS_PER_KERNEL; k++) {
            baseLeaf[offset + j * L2_TO_L1_MSGS_PER_KERNEL + k] = bytes32(_l2Block.newL2ToL1msgs[ i *  L2_TO_L1_MSGS_PER_BASE + j * L2_TO_L1_MSGS_PER_KERNEL + k]);
          }
          
          offset += KERNELS * L2_TO_L1_MSGS_PER_KERNEL; // 36
          for (uint256 k = 0; k < CONTRACTS_PER_KERNEL; k++) {
            baseLeaf[offset + j * CONTRACTS_PER_KERNEL + k] = bytes32(_l2Block.newContract[i * CONTRACTS_PER_BASE + j * CONTRACTS_PER_KERNEL + k]);

            ContractData memory contractData = _l2Block.newContractData[i * CONTRACTS_PER_BASE + j * CONTRACTS_PER_KERNEL + k];
            baseLeaf[offset + 2 * CONTRACTS_PER_KERNEL + j * 2 * CONTRACTS_PER_KERNEL + k * 2] = bytes32(contractData.aztecAddress);
            baseLeaf[offset + 2 * CONTRACTS_PER_KERNEL + j * 2 * CONTRACTS_PER_KERNEL + k * 2 + 1] = bytes32(uint256(uint160(contractData.portalAddress)));
          }
        }
        
        baseLeafs[i] = sha256(abi.encodePacked(baseLeaf));
      }
    }

    bytes32 diffRoot = _computeRoot(baseLeafs);

    bytes32 messagesHash;
    {
      uint256 messagesHashPreimageSize = 0x20 * L1_TO_L2_MESSAGES_PER_ROLLUP;
      bytes memory messagesHashPreimage = new bytes(
                messagesHashPreimageSize
            );
      assembly {
        calldatacopy(
          add(messagesHashPreimage, 0x20),
          add(_l2Block, mload(add(offsets, 0xc0))),
          messagesHashPreimageSize
        )
      }

      messagesHash = sha256(messagesHashPreimage);
    }

    return (diffRoot, messagesHash);
  }

  /**
   * @notice Computes the root for a binary Merkle-tree given the leafs.
   * @dev Uses sha256.
   * @param _leafs - The 32 bytes leafs to build the tree of.
   * @return The root of the Merkle tree.
   */
  function _computeRoot(bytes32[] memory _leafs) internal pure returns (bytes32) {
    // @todo Must pad the tree
    uint256 treeDepth = 0;
    while (2 ** treeDepth < _leafs.length) {
      treeDepth++;
    }
    uint256 treeSize = 2 ** treeDepth;
    assembly {
      mstore(_leafs, treeSize)
    }

    for (uint256 i = 0; i < treeDepth; i++) {
      for (uint256 j = 0; j < treeSize; j += 2) {
        _leafs[j / 2] = sha256(abi.encode(_leafs[j], _leafs[j + 1]));
      }
    }

    return _leafs[0];
  }
}
