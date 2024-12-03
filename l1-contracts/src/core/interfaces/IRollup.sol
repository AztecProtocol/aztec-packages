// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";
import {ManaBaseFeeComponents} from "@aztec/core/libraries/FeeMath.sol";
import {ProposeArgs} from "@aztec/core/libraries/ProposeLib.sol";
import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";

struct SubmitEpochRootProofArgs {
  uint256 epochSize;
  bytes32[7] args;
  bytes32[] fees;
  bytes aggregationObject;
  bytes proof;
}

struct FeeHeader {
  uint256 excessMana;
  uint256 feeAssetPriceNumerator;
  uint256 manaUsed;
  uint256 provingCostPerManaNumerator;
  uint256 congestionCost;
}

struct BlockLog {
  FeeHeader feeHeader;
  bytes32 archive;
  bytes32 blockHash;
  Slot slotNumber;
}

struct L1FeeData {
  uint256 baseFee;
  uint256 blobFee;
}

interface ITestRollup {
  function setEpochVerifier(address _verifier) external;
  function setVkTreeRoot(bytes32 _vkTreeRoot) external;
  function setProtocolContractTreeRoot(bytes32 _protocolContractTreeRoot) external;
  function setAssumeProvenThroughBlockNumber(uint256 _blockNumber) external;
  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    returns (ManaBaseFeeComponents memory);
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
  function updateL1GasFeeOracle() external;

  function claimEpochProofRight(EpochProofQuoteLib.SignedEpochProofQuote calldata _quote) external;

  function propose(
    ProposeArgs calldata _args,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body
  ) external;

  function proposeAndClaim(
    ProposeArgs calldata _args,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body,
    EpochProofQuoteLib.SignedEpochProofQuote calldata _quote
  ) external;

  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external;

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

  function status(uint256 _myHeaderBlockNumber)
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

  function quoteToDigest(EpochProofQuoteLib.EpochProofQuote memory _quote)
    external
    view
    returns (bytes32);
  function getBlock(uint256 _blockNumber) external view returns (BlockLog memory);
  function getFeeAssetPrice() external view returns (uint256);
  function getManaBaseFeeAt(Timestamp _timestamp, bool _inFeeAsset) external view returns (uint256);
  function getL1FeesAt(Timestamp _timestamp) external view returns (L1FeeData memory);

  function archive() external view returns (bytes32);
  function archiveAt(uint256 _blockNumber) external view returns (bytes32);
  function canPrune() external view returns (bool);
  function canPruneAtTime(Timestamp _ts) external view returns (bool);
  function getProvenBlockNumber() external view returns (uint256);
  function getPendingBlockNumber() external view returns (uint256);
  function getEpochToProve() external view returns (Epoch);
  function getClaimableEpoch() external view returns (Epoch);
  function validateEpochProofRightClaimAtTime(
    Timestamp _ts,
    EpochProofQuoteLib.SignedEpochProofQuote calldata _quote
  ) external view;
  function getEpochForBlock(uint256 _blockNumber) external view returns (Epoch);
  function getEpochProofPublicInputs(
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _aggregationObject
  ) external view returns (bytes32[] memory);
  function computeTxsEffectsHash(bytes calldata _body) external pure returns (bytes32);
}
