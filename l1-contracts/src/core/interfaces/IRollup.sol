// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {
  FeeHeader, L1FeeData, ManaBaseFeeComponents
} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";
import {
  FeeAssetPerEthX9, EthValue, FeeAssetValue
} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";
import {ProposeArgs} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";
import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";

struct SubmitEpochRootProofArgs {
  uint256 start; // inclusive
  uint256 end; // inclusive
  bytes32[7] args; // @todo These are obhorrent and so easy to mess up with wrong padding.
  bytes32[] fees;
  bytes blobPublicInputs;
  bytes aggregationObject;
  bytes proof;
}

struct BlockLog {
  FeeHeader feeHeader;
  bytes32 archive;
  bytes32 blockHash;
  Slot slotNumber;
}

struct ChainTips {
  uint256 pendingBlockNumber;
  uint256 provenBlockNumber;
}

struct L1GasOracleValues {
  L1FeeData pre;
  L1FeeData post;
  Slot slotOfChange;
}

struct SubEpochRewards {
  uint256 summedCount;
  mapping(address prover => bool proofSubmitted) hasSubmitted;
}

struct EpochRewards {
  uint256 longestProvenLength;
  uint256 rewards;
  mapping(uint256 length => SubEpochRewards) subEpoch;
}

// The below blobPublicInputsHashes are filled when proposing a block, then used to verify an epoch proof.
// TODO(#8955): When implementing batched kzg proofs, store one instance per epoch rather than block
struct RollupStore {
  mapping(uint256 blockNumber => BlockLog log) blocks;
  mapping(uint256 blockNumber => bytes32) blobPublicInputsHashes;
  ChainTips tips;
  bytes32 vkTreeRoot;
  bytes32 protocolContractTreeRoot;
  L1GasOracleValues l1GasOracleValues;
  IVerifier epochProofVerifier;
  mapping(address => uint256) sequencerRewards;
  mapping(Epoch => EpochRewards) epochRewards;
  EthValue provingCostPerMana;
}

struct CheatDepositArgs {
  address attester;
  address proposer;
  address withdrawer;
  uint256 amount;
}

interface ITestRollup {
  function setEpochVerifier(address _verifier) external;
  function setVkTreeRoot(bytes32 _vkTreeRoot) external;
  function setProtocolContractTreeRoot(bytes32 _protocolContractTreeRoot) external;
  function setAssumeProvenThroughBlockNumber(uint256 _blockNumber) external;
  function cheat__InitialiseValidatorSet(CheatDepositArgs[] memory _args) external;
  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    returns (ManaBaseFeeComponents memory);
}

interface IRollupCore {
  event L2BlockProposed(
    uint256 indexed blockNumber, bytes32 indexed archive, bytes32[] versionedBlobHashes
  );
  event L2ProofVerified(uint256 indexed blockNumber, bytes32 indexed proverId);
  event PrunedPending(uint256 provenBlockNumber, uint256 pendingBlockNumber);

  function prune() external;
  function updateL1GasFeeOracle() external;

  function setProvingCostPerMana(EthValue _provingCostPerMana) external;

  function propose(
    ProposeArgs calldata _args,
    Signature[] memory _signatures,
    bytes calldata _body,
    bytes calldata _blobInput
  ) external;

  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external;

  // solhint-disable-next-line func-name-mixedcase
  function INBOX() external view returns (IInbox);

  // solhint-disable-next-line func-name-mixedcase
  function OUTBOX() external view returns (IOutbox);

  // solhint-disable-next-line func-name-mixedcase
  function L1_BLOCK_AT_GENESIS() external view returns (uint256);

  function getFeeAssetPerEth() external view returns (FeeAssetPerEthX9);
  function getL1FeesAt(Timestamp _timestamp) external view returns (L1FeeData memory);

  function canPrune() external view returns (bool);
  function canPruneAtTime(Timestamp _ts) external view returns (bool);
  function getEpochToProve() external view returns (Epoch);

  function getEpochForBlock(uint256 _blockNumber) external view returns (Epoch);
}

interface IRollup is IRollupCore {
  function getTips() external view returns (ChainTips memory);

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

  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs,
    bytes calldata _aggregationObject
  ) external view returns (bytes32[] memory);

  function validateHeader(
    bytes calldata _header,
    Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    bytes32 _blobsHash,
    DataStructures.ExecutionFlags memory _flags
  ) external view;

  function canProposeAtTime(Timestamp _ts, bytes32 _archive) external view returns (Slot, uint256);

  function validateBlobs(bytes calldata _blobsInputs)
    external
    view
    returns (bytes32[] memory, bytes32, bytes32);

  function getManaBaseFeeAt(Timestamp _timestamp, bool _inFeeAsset) external view returns (uint256);

  function archive() external view returns (bytes32);
  function archiveAt(uint256 _blockNumber) external view returns (bytes32);
  function getProvenBlockNumber() external view returns (uint256);
  function getPendingBlockNumber() external view returns (uint256);
  function getBlock(uint256 _blockNumber) external view returns (BlockLog memory);
  function getBlobPublicInputsHash(uint256 _blockNumber) external view returns (bytes32);

  function getSequencerRewards(address _sequencer) external view returns (uint256);
  function getCollectiveProverRewardsForEpoch(Epoch _epoch) external view returns (uint256);
  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover)
    external
    view
    returns (uint256);
  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover)
    external
    view
    returns (bool);

  function getProofSubmissionWindow() external view returns (uint256);

  function getProvingCostPerManaInEth() external view returns (EthValue);

  function getProvingCostPerManaInFeeAsset() external view returns (FeeAssetValue);
}
