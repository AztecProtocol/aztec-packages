// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";

import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";

import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";

interface ITestRollup {
  function setEpochVerifier(address _verifier) external;
  function setVkTreeRoot(bytes32 _vkTreeRoot) external;
  function setProtocolContractTreeRoot(bytes32 _protocolContractTreeRoot) external;
  function setAssumeProvenThroughBlockNumber(uint256 blockNumber) external;
}

interface IRollup {
  event L2BlockProposed(uint256 indexed blockNumber, bytes32 indexed archive);
  event L2ProofVerified(uint256 indexed blockNumber, bytes32 indexed proverId);
  event PrunedPending(uint256 provenBlockNumber, uint256 pendingBlockNumber);
  event ProofRightClaimed(
    Epoch indexed epoch,
    address indexed bondProvider,
    address indexed proposer,
    uint256 bondAmount,
    Slot currentSlot
  );

  function prune() external;

  function claimEpochProofRight(EpochProofQuoteLib.SignedEpochProofQuote calldata _quote) external;

  function propose(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _blockHash,
    bytes32[] memory _txHashes,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body
  ) external;

  function proposeAndClaim(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _blockHash,
    bytes32[] memory _txHashes,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body,
    EpochProofQuoteLib.SignedEpochProofQuote calldata _quote
  ) external;

  function submitEpochRootProof(
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _aggregationObject,
    bytes calldata _proof
  ) external;

  function canProposeAtTime(Timestamp _ts, bytes32 _archive) external view returns (Slot, uint256);

  function validateHeader(
    bytes calldata _header,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    bytes32 _txsEffecstHash,
    DataStructures.ExecutionFlags memory _flags
  ) external view;

  // solhint-disable-next-line func-name-mixedcase
  function INBOX() external view returns (IInbox);

  // solhint-disable-next-line func-name-mixedcase
  function OUTBOX() external view returns (IOutbox);

  // solhint-disable-next-line func-name-mixedcase
  function L1_BLOCK_AT_GENESIS() external view returns (uint256);

  function status(uint256 myHeaderBlockNumber)
    external
    view
    returns (
      uint256 provenBlockNumber,
      bytes32 provenArchive,
      uint256 pendingBlockNumber,
      bytes32 pendingArchive,
      bytes32 archiveOfMyBlock,
      Epoch provenEpochNumber
    );

  function quoteToDigest(EpochProofQuoteLib.EpochProofQuote memory quote)
    external
    view
    returns (bytes32);

  function archive() external view returns (bytes32);
  function archiveAt(uint256 _blockNumber) external view returns (bytes32);
  function canPrune() external view returns (bool);
  function getProvenBlockNumber() external view returns (uint256);
  function getPendingBlockNumber() external view returns (uint256);
  function getEpochToProve() external view returns (Epoch);
  function getClaimableEpoch() external view returns (Epoch);
  function getEpochForBlock(uint256 blockNumber) external view returns (Epoch);
  function validateEpochProofRightClaimAtTime(
    Timestamp _ts,
    EpochProofQuoteLib.SignedEpochProofQuote calldata _quote
  ) external view;
  function getEpochProofPublicInputs(
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _aggregationObject
  ) external view returns (bytes32[] memory);
  function computeTxsEffectsHash(bytes calldata _body) external pure returns (bytes32);
}
