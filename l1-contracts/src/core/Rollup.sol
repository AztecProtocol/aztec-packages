// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {
  IRollup,
  ITestRollup,
  FeeHeader,
  ManaBaseFeeComponents,
  BlockLog,
  L1FeeData,
  SubmitEpochRootProofArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {FeeMath} from "@aztec/core/libraries/FeeMath.sol";
import {HeaderLib} from "@aztec/core/libraries/HeaderLib.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/ProposeLib.sol";
import {Timestamp, Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeMath.sol";
import {TxsDecoder} from "@aztec/core/libraries/TxsDecoder.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {ProofCommitmentEscrow} from "@aztec/core/ProofCommitmentEscrow.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Vm} from "forge-std/Vm.sol";

struct ChainTips {
  uint256 pendingBlockNumber;
  uint256 provenBlockNumber;
}

struct Config {
  uint256 aztecSlotDuration;
  uint256 aztecEpochDuration;
  uint256 targetCommitteeSize;
  uint256 aztecEpochProofClaimWindowInL2Slots;
}

struct SubmitEpochRootProofInterimValues {
  uint256 previousBlockNumber;
  uint256 endBlockNumber;
  Epoch epochToProve;
  Epoch startEpoch;
}

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that is concerned about readability and velocity of development
 * not giving a damn about gas costs.
 */
contract Rollup is EIP712("Aztec Rollup", "1"), Leonidas, IRollup, ITestRollup {
  using SafeCast for uint256;
  using SlotLib for Slot;
  using EpochLib for Epoch;
  using SafeERC20 for IERC20;
  using ProposeLib for ProposeArgs;
  using FeeMath for uint256;
  using FeeMath for ManaBaseFeeComponents;

  struct L1GasOracleValues {
    L1FeeData pre;
    L1FeeData post;
    Slot slotOfChange;
  }

  uint256 internal constant BLOB_GAS_PER_BLOB = 2 ** 17;
  uint256 internal constant GAS_PER_BLOB_POINT_EVALUATION = 50_000;

  Slot public constant LIFETIME = Slot.wrap(5);
  Slot public constant LAG = Slot.wrap(2);

  // See https://github.com/AztecProtocol/engineering-designs/blob/main/in-progress/8401-proof-timeliness/proof-timeliness.ipynb
  // for justification of CLAIM_DURATION_IN_L2_SLOTS.
  uint256 public constant PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST = 1000;

  // A Cuauhxicalli [kʷaːʍʃiˈkalːi] ("eagle gourd bowl") is a ceremonial Aztec vessel or altar used to hold offerings,
  // such as sacrificial hearts, during rituals performed within temples.
  address public constant CUAUHXICALLI = address(bytes20("CUAUHXICALLI"));

  address public constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
  bool public immutable IS_FOUNDRY_TEST;

  uint256 public immutable CLAIM_DURATION_IN_L2_SLOTS;
  uint256 public immutable L1_BLOCK_AT_GENESIS;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  IProofCommitmentEscrow public immutable PROOF_COMMITMENT_ESCROW;
  uint256 public immutable VERSION;
  IFeeJuicePortal public immutable FEE_JUICE_PORTAL;
  IRewardDistributor public immutable REWARD_DISTRIBUTOR;
  IERC20 public immutable ASSET;

  IVerifier public epochProofVerifier;

  ChainTips public tips;
  DataStructures.EpochProofClaim public proofClaim;

  // @todo  Validate assumption:
  //        Currently we assume that the archive root following a block is specific to the block
  //        e.g., changing any values in the block or header should in the end make its way to the archive
  //
  //        More direct approach would be storing keccak256(header) as well
  mapping(uint256 blockNumber => BlockLog log) internal blocks;

  bytes32 public vkTreeRoot;
  bytes32 public protocolContractTreeRoot;

  // @note  Assume that all blocks up to this value (inclusive) are automatically proven. Speeds up bootstrapping.
  //        Testing only. This should be removed eventually.
  uint256 private assumeProvenThroughBlockNumber;

  L1GasOracleValues public l1GasOracleValues;

  constructor(
    IFeeJuicePortal _fpcJuicePortal,
    IRewardDistributor _rewardDistributor,
    bytes32 _vkTreeRoot,
    bytes32 _protocolContractTreeRoot,
    address _ares,
    address[] memory _validators,
    Config memory _config
  )
    Leonidas(
      _ares,
      _config.aztecSlotDuration,
      _config.aztecEpochDuration,
      _config.targetCommitteeSize
    )
  {
    epochProofVerifier = new MockVerifier();
    FEE_JUICE_PORTAL = _fpcJuicePortal;
    REWARD_DISTRIBUTOR = _rewardDistributor;
    ASSET = _fpcJuicePortal.UNDERLYING();
    PROOF_COMMITMENT_ESCROW = new ProofCommitmentEscrow(
      ASSET, address(this), _config.aztecSlotDuration, _config.aztecEpochDuration
    );
    INBOX = IInbox(address(new Inbox(address(this), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT)));
    OUTBOX = IOutbox(address(new Outbox(address(this))));
    vkTreeRoot = _vkTreeRoot;
    protocolContractTreeRoot = _protocolContractTreeRoot;
    VERSION = 1;
    L1_BLOCK_AT_GENESIS = block.number;
    CLAIM_DURATION_IN_L2_SLOTS = _config.aztecEpochProofClaimWindowInL2Slots;

    IS_FOUNDRY_TEST = VM_ADDRESS.code.length > 0;

    // Genesis block
    blocks[0] = BlockLog({
      feeHeader: FeeHeader({
        excessMana: 0,
        feeAssetPriceNumerator: 0,
        manaUsed: 0,
        provingCostPerManaNumerator: 0,
        congestionCost: 0
      }),
      archive: bytes32(Constants.GENESIS_ARCHIVE_ROOT),
      blockHash: bytes32(0), // TODO(palla/prover): The first block does not have hash zero
      slotNumber: Slot.wrap(0)
    });
    l1GasOracleValues = L1GasOracleValues({
      pre: L1FeeData({baseFee: 1 gwei, blobFee: 1}),
      post: L1FeeData({baseFee: block.basefee, blobFee: _getBlobBaseFee()}),
      slotOfChange: LIFETIME
    });
    for (uint256 i = 0; i < _validators.length; i++) {
      _addValidator(_validators[i]);
    }
    setupEpoch();
  }

  /**
   * @notice  Prune the pending chain up to the last proven block
   *
   * @dev     Will revert if there is nothing to prune or if the chain is not ready to be pruned
   */
  function prune() external override(IRollup) {
    require(canPrune(), Errors.Rollup__NothingToPrune());
    _prune();
  }

  /**
   * Sets the assumeProvenThroughBlockNumber. Only the contract deployer can set it.
   * @param _blockNumber - New value.
   */
  function setAssumeProvenThroughBlockNumber(uint256 _blockNumber)
    external
    override(ITestRollup)
    onlyOwner
  {
    _fakeBlockNumberAsProven(_blockNumber);
    assumeProvenThroughBlockNumber = _blockNumber;
  }

  /**
   * @notice  Set the verifier contract
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _verifier - The new verifier contract
   */
  function setEpochVerifier(address _verifier) external override(ITestRollup) onlyOwner {
    epochProofVerifier = IVerifier(_verifier);
  }

  /**
   * @notice  Set the vkTreeRoot
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _vkTreeRoot - The new vkTreeRoot to be used by proofs
   */
  function setVkTreeRoot(bytes32 _vkTreeRoot) external override(ITestRollup) onlyOwner {
    vkTreeRoot = _vkTreeRoot;
  }

  /**
   * @notice  Set the protocolContractTreeRoot
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _protocolContractTreeRoot - The new protocolContractTreeRoot to be used by proofs
   */
  function setProtocolContractTreeRoot(bytes32 _protocolContractTreeRoot)
    external
    override(ITestRollup)
    onlyOwner
  {
    protocolContractTreeRoot = _protocolContractTreeRoot;
  }

  /**
   * @notice  Publishes the body and propose the block
   * @dev     `eth_log_handlers` rely on this function
   *
   * @param _args - The arguments to propose the block
   * @param _signatures - Signatures from the validators
   * @param _body - The body of the L2 block
   */
  function proposeAndClaim(
    ProposeArgs calldata _args,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body,
    EpochProofQuoteLib.SignedEpochProofQuote calldata _quote
  ) external override(IRollup) {
    propose(_args, _signatures, _body);
    claimEpochProofRight(_quote);
  }

  /**
   * @notice  Submit a proof for an epoch in the pending chain
   *
   * @dev     Will emit `L2ProofVerified` if the proof is valid
   *
   * @dev     Will throw if:
   *          - The block number is past the pending chain
   *          - The last archive root of the header does not match the archive root of parent block
   *          - The archive root of the header does not match the archive root of the proposed block
   *          - The proof is invalid
   *
   * @dev     We provide the `_archive` and `_blockHash` even if it could be read from storage itself because it allow for
   *          better error messages. Without passing it, we would just have a proof verification failure.
   *
   * @param _args - The arguments to submit the epoch root proof:
   *          _epochSize - The size of the epoch (to be promoted to a constant)
   *          _args - Array of public inputs to the proof (previousArchive, endArchive, previousBlockHash, endBlockHash, endTimestamp, outHash, proverId)
   *          _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   *          _aggregationObject - The aggregation object for the proof
   *          _proof - The proof to verify
   */
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external override(IRollup) {
    if (canPrune()) {
      _prune();
    }

    SubmitEpochRootProofInterimValues memory interimValues;

    interimValues.previousBlockNumber = tips.provenBlockNumber;
    interimValues.endBlockNumber = interimValues.previousBlockNumber + _args.epochSize;

    // @note The getEpochForBlock is expected to revert if the block is beyond pending.
    //       If this changes you are gonna get so rekt you won't believe it.
    //       I mean proving blocks that have been pruned rekt.
    interimValues.epochToProve = getEpochForBlock(interimValues.endBlockNumber);
    interimValues.startEpoch = getEpochForBlock(interimValues.previousBlockNumber + 1);

    // Ensure that the proof is not across epochs
    require(
      interimValues.startEpoch == interimValues.epochToProve,
      Errors.Rollup__InvalidEpoch(interimValues.startEpoch, interimValues.epochToProve)
    );

    bytes32[] memory publicInputs =
      getEpochProofPublicInputs(_args.epochSize, _args.args, _args.fees, _args.aggregationObject);

    require(epochProofVerifier.verify(_args.proof, publicInputs), Errors.Rollup__InvalidProof());

    if (proofClaim.epochToProve == interimValues.epochToProve) {
      PROOF_COMMITMENT_ESCROW.unstakeBond(proofClaim.bondProvider, proofClaim.bondAmount);
    }

    tips.provenBlockNumber = interimValues.endBlockNumber;

    // @note  Only if the rollup is the canonical will it be able to meaningfully claim fees
    //        Otherwise, the fees are unbacked #7938.
    bool isFeeCanonical = address(this) == FEE_JUICE_PORTAL.canonicalRollup();
    bool isRewardDistributorCanonical = address(this) == REWARD_DISTRIBUTOR.canonicalRollup();

    uint256 totalProverReward = 0;
    uint256 totalBurn = 0;

    if (isFeeCanonical || isRewardDistributorCanonical) {
      for (uint256 i = 0; i < _args.epochSize; i++) {
        address coinbase = address(uint160(uint256(publicInputs[9 + i * 2])));
        uint256 reward = 0;
        uint256 toProver = 0;
        uint256 burn = 0;

        if (isFeeCanonical) {
          uint256 fees = uint256(publicInputs[10 + i * 2]);
          if (fees > 0) {
            // This is insanely expensive, and will be fixed as part of the general storage cost reduction.
            // See #9826.
            FeeHeader storage feeHeader =
              blocks[interimValues.previousBlockNumber + 1 + i].feeHeader;
            burn += feeHeader.congestionCost * feeHeader.manaUsed;

            reward += (fees - burn);
            FEE_JUICE_PORTAL.distributeFees(address(this), fees);
          }
        }

        if (isRewardDistributorCanonical) {
          reward += REWARD_DISTRIBUTOR.claim(address(this));
        }

        if (coinbase == address(0)) {
          toProver = reward;
        } else {
          // @note  We are getting value from the `proofClaim`, which are not cleared.
          //        So if someone is posting the proof before a new claim is made,
          //        the reward will calculated based on the previous values.
          toProver = Math.mulDiv(reward, proofClaim.basisPointFee, 10_000);
        }

        uint256 toCoinbase = reward - toProver;
        if (toCoinbase > 0) {
          ASSET.safeTransfer(coinbase, toCoinbase);
        }

        totalProverReward += toProver;
        totalBurn += burn;
      }

      if (totalProverReward > 0) {
        // If there is a bond-provider give him the reward, otherwise give it to the submitter.
        address proofRewardRecipient =
          proofClaim.bondProvider == address(0) ? msg.sender : proofClaim.bondProvider;
        ASSET.safeTransfer(proofRewardRecipient, totalProverReward);
      }

      if (totalBurn > 0) {
        ASSET.safeTransfer(CUAUHXICALLI, totalBurn);
      }
    }

    emit L2ProofVerified(interimValues.endBlockNumber, _args.args[6]);
  }

  function status(uint256 _myHeaderBlockNumber)
    external
    view
    override(IRollup)
    returns (
      uint256 provenBlockNumber,
      bytes32 provenArchive,
      uint256 pendingBlockNumber,
      bytes32 pendingArchive,
      bytes32 archiveOfMyBlock,
      Epoch provenEpochNumber
    )
  {
    return (
      tips.provenBlockNumber,
      blocks[tips.provenBlockNumber].archive,
      tips.pendingBlockNumber,
      blocks[tips.pendingBlockNumber].archive,
      archiveAt(_myHeaderBlockNumber),
      getEpochForBlock(tips.provenBlockNumber)
    );
  }

  /**
   * @notice  Check if msg.sender can propose at a given time
   *
   * @param _ts - The timestamp to check
   * @param _archive - The archive to check (should be the latest archive)
   *
   * @return uint256 - The slot at the given timestamp
   * @return uint256 - The block number at the given timestamp
   */
  function canProposeAtTime(Timestamp _ts, bytes32 _archive)
    external
    view
    override(IRollup)
    returns (Slot, uint256)
  {
    Slot slot = getSlotAt(_ts);

    // Consider if a prune will hit in this slot
    uint256 pendingBlockNumber =
      canPruneAtTime(_ts) ? tips.provenBlockNumber : tips.pendingBlockNumber;

    Slot lastSlot = blocks[pendingBlockNumber].slotNumber;

    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    // Make sure that the proposer is up to date and on the right chain (ie no reorgs)
    bytes32 tipArchive = blocks[pendingBlockNumber].archive;
    require(tipArchive == _archive, Errors.Rollup__InvalidArchive(tipArchive, _archive));

    SignatureLib.Signature[] memory sigs = new SignatureLib.Signature[](0);
    DataStructures.ExecutionFlags memory flags =
      DataStructures.ExecutionFlags({ignoreDA: true, ignoreSignatures: true});
    _validateLeonidas(slot, sigs, _archive, flags);

    return (slot, pendingBlockNumber + 1);
  }

  /**
   * @notice  Validate a header for submission
   *
   * @dev     This is a convenience function that can be used by the sequencer to validate a "partial" header
   *          without having to deal with viem or anvil for simulating timestamps in the future.
   *
   * @param _header - The header to validate
   * @param _signatures - The signatures to validate
   * @param _digest - The digest to validate
   * @param _currentTime - The current time
   * @param _flags - The flags to validate
   */
  function validateHeader(
    bytes calldata _header,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    bytes32 _txsEffectsHash,
    DataStructures.ExecutionFlags memory _flags
  ) external view override(IRollup) {
    uint256 manaBaseFee = getManaBaseFeeAt(_currentTime, true);
    HeaderLib.Header memory header = HeaderLib.decode(_header);
    _validateHeader(
      header, _signatures, _digest, _currentTime, manaBaseFee, _txsEffectsHash, _flags
    );
  }

  /**
   * @notice  Get the next epoch that can be claimed
   * @dev     Will revert if the epoch has already been claimed or if there is no epoch to prove
   */
  function getClaimableEpoch() external view override(IRollup) returns (Epoch) {
    Epoch epochToProve = getEpochToProve();
    require(
      // If the epoch has been claimed, it cannot be claimed again
      proofClaim.epochToProve != epochToProve
      // Edge case for if no claim has been made yet.
      // We know that the bondProvider is always set,
      // Since otherwise the claimEpochProofRight would have reverted,
      // because the zero address cannot have deposited funds into escrow.
      || proofClaim.bondProvider == address(0),
      Errors.Rollup__ProofRightAlreadyClaimed()
    );
    return epochToProve;
  }

  function computeTxsEffectsHash(bytes calldata _body)
    external
    pure
    override(IRollup)
    returns (bytes32)
  {
    return TxsDecoder.decode(_body);
  }

  function claimEpochProofRight(EpochProofQuoteLib.SignedEpochProofQuote calldata _quote)
    public
    override(IRollup)
  {
    validateEpochProofRightClaimAtTime(Timestamp.wrap(block.timestamp), _quote);

    Slot currentSlot = getCurrentSlot();
    Epoch epochToProve = getEpochToProve();

    // We don't currently unstake,
    // but we will as part of https://github.com/AztecProtocol/aztec-packages/issues/8652.
    // Blocked on submitting epoch proofs to this contract.
    PROOF_COMMITMENT_ESCROW.stakeBond(_quote.quote.prover, _quote.quote.bondAmount);

    proofClaim = DataStructures.EpochProofClaim({
      epochToProve: epochToProve,
      basisPointFee: _quote.quote.basisPointFee,
      bondAmount: _quote.quote.bondAmount,
      bondProvider: _quote.quote.prover,
      proposerClaimant: msg.sender
    });

    emit ProofRightClaimed(
      epochToProve, _quote.quote.prover, msg.sender, _quote.quote.bondAmount, currentSlot
    );
  }

  /**
   * @notice  Publishes the body and propose the block
   * @dev     `eth_log_handlers` rely on this function
   *
   * @param _args - The arguments to propose the block
   * @param _signatures - Signatures from the validators
   * @param _body - The body of the L2 block
   */
  function propose(
    ProposeArgs calldata _args,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body
  ) public override(IRollup) {
    if (canPrune()) {
      _prune();
    }
    updateL1GasFeeOracle();

    // The `body` is passed outside the "args" as it does not directly need to be in the digest
    // as long as the `txsEffectsHash` is included and matches what is in the header.
    // Which we are checking in the `_validateHeader` call below.
    bytes32 txsEffectsHash = TxsDecoder.decode(_body);

    // Decode and validate header
    HeaderLib.Header memory header = HeaderLib.decode(_args.header);

    setupEpoch();
    ManaBaseFeeComponents memory components =
      getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
    uint256 manaBaseFee = FeeMath.summedBaseFee(components);
    _validateHeader({
      _header: header,
      _signatures: _signatures,
      _digest: _args.digest(),
      _currentTime: Timestamp.wrap(block.timestamp),
      _manaBaseFee: manaBaseFee,
      _txEffectsHash: txsEffectsHash,
      _flags: DataStructures.ExecutionFlags({ignoreDA: false, ignoreSignatures: false})
    });

    uint256 blockNumber = ++tips.pendingBlockNumber;

    {
      FeeHeader memory parentFeeHeader = blocks[blockNumber - 1].feeHeader;
      uint256 excessMana = (parentFeeHeader.excessMana + parentFeeHeader.manaUsed).clampedAdd(
        -int256(FeeMath.MANA_TARGET)
      );

      blocks[blockNumber] = BlockLog({
        archive: _args.archive,
        blockHash: _args.blockHash,
        slotNumber: Slot.wrap(header.globalVariables.slotNumber),
        feeHeader: FeeHeader({
          excessMana: excessMana,
          feeAssetPriceNumerator: parentFeeHeader.feeAssetPriceNumerator.clampedAdd(
            _args.oracleInput.feeAssetPriceModifier
          ),
          manaUsed: header.totalManaUsed,
          provingCostPerManaNumerator: parentFeeHeader.provingCostPerManaNumerator.clampedAdd(
            _args.oracleInput.provingCostModifier
          ),
          congestionCost: components.congestionCost
        })
      });
    }

    // @note  The block number here will always be >=1 as the genesis block is at 0
    {
      bytes32 inHash = INBOX.consume(blockNumber);
      require(
        header.contentCommitment.inHash == inHash,
        Errors.Rollup__InvalidInHash(inHash, header.contentCommitment.inHash)
      );
    }

    // TODO(#7218): Revert to fixed height tree for outbox, currently just providing min as interim
    // Min size = smallest path of the rollup tree + 1
    (uint256 min,) = MerkleLib.computeMinMaxPathLength(header.contentCommitment.numTxs);
    uint256 l2ToL1TreeMinHeight = min + 1;
    OUTBOX.insert(blockNumber, header.contentCommitment.outHash, l2ToL1TreeMinHeight);

    emit L2BlockProposed(blockNumber, _args.archive);

    // Automatically flag the block as proven if we have cheated and set assumeProvenThroughBlockNumber.
    if (blockNumber <= assumeProvenThroughBlockNumber) {
      _fakeBlockNumberAsProven(blockNumber);

      bool isFeeCanonical = address(this) == FEE_JUICE_PORTAL.canonicalRollup();
      bool isRewardDistributorCanonical = address(this) == REWARD_DISTRIBUTOR.canonicalRollup();

      if (isFeeCanonical && header.globalVariables.coinbase != address(0) && header.totalFees > 0) {
        // @note  This will currently fail if there are insufficient funds in the bridge
        //        which WILL happen for the old version after an upgrade where the bridge follow.
        //        Consider allowing a failure. See #7938.
        FEE_JUICE_PORTAL.distributeFees(header.globalVariables.coinbase, header.totalFees);
      }
      if (isRewardDistributorCanonical && header.globalVariables.coinbase != address(0)) {
        REWARD_DISTRIBUTOR.claim(header.globalVariables.coinbase);
      }

      emit L2ProofVerified(blockNumber, "CHEAT");
    }
  }

  /**
   * @notice  Updates the l1 gas fee oracle
   * @dev     This function is called by the `propose` function
   */
  function updateL1GasFeeOracle() public override(IRollup) {
    Slot slot = getCurrentSlot();
    // The slot where we find a new queued value acceptable
    Slot acceptableSlot = l1GasOracleValues.slotOfChange + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    l1GasOracleValues.pre = l1GasOracleValues.post;
    l1GasOracleValues.post = L1FeeData({baseFee: block.basefee, blobFee: _getBlobBaseFee()});
    l1GasOracleValues.slotOfChange = slot + LAG;
  }

  /**
   * @notice  Gets the fee asset price as fee_asset / eth with 1e9 precision
   *
   * @return The fee asset price
   */
  function getFeeAssetPrice() public view override(IRollup) returns (uint256) {
    return FeeMath.feeAssetPriceModifier(
      blocks[tips.pendingBlockNumber].feeHeader.feeAssetPriceNumerator
    );
  }

  function getL1FeesAt(Timestamp _timestamp)
    public
    view
    override(IRollup)
    returns (L1FeeData memory)
  {
    Slot slot = getSlotAt(_timestamp);
    if (slot < l1GasOracleValues.slotOfChange) {
      return l1GasOracleValues.pre;
    }
    return l1GasOracleValues.post;
  }

  /**
   * @notice  Gets the mana base fee
   *
   * @param _inFeeAsset - Whether to return the fee in the fee asset or ETH
   *
   * @return The mana base fee
   */
  function getManaBaseFeeAt(Timestamp _timestamp, bool _inFeeAsset)
    public
    view
    override(IRollup)
    returns (uint256)
  {
    return getManaBaseFeeComponentsAt(_timestamp, _inFeeAsset).summedBaseFee();
  }

  /**
   * @notice  Gets the mana base fee components
   *          For more context, consult:
   *          https://github.com/AztecProtocol/engineering-designs/blob/main/in-progress/8757-fees/design.md
   *
   * @dev     TODO #10004 - As part of the refactor, will likely get rid of this function or make it private
   *          keeping it public for now makes it simpler to test.
   *
   * @param _inFeeAsset - Whether to return the fee in the fee asset or ETH
   *
   * @return The mana base fee components
   */
  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    public
    view
    override(ITestRollup)
    returns (ManaBaseFeeComponents memory)
  {
    // If we can prune, we use the proven block, otherwise the pending block
    uint256 blockOfInterest =
      canPruneAtTime(_timestamp) ? tips.provenBlockNumber : tips.pendingBlockNumber;

    FeeHeader storage parentFeeHeader = blocks[blockOfInterest].feeHeader;
    uint256 excessMana = (parentFeeHeader.excessMana + parentFeeHeader.manaUsed).clampedAdd(
      -int256(FeeMath.MANA_TARGET)
    );

    L1FeeData memory fees = getL1FeesAt(_timestamp);
    uint256 dataCost =
      Math.mulDiv(3 * BLOB_GAS_PER_BLOB, fees.blobFee, FeeMath.MANA_TARGET, Math.Rounding.Ceil);
    uint256 gasUsed = FeeMath.L1_GAS_PER_BLOCK_PROPOSED + 3 * GAS_PER_BLOB_POINT_EVALUATION
      + FeeMath.L1_GAS_PER_EPOCH_VERIFIED / EPOCH_DURATION;
    uint256 gasCost = Math.mulDiv(gasUsed, fees.baseFee, FeeMath.MANA_TARGET, Math.Rounding.Ceil);
    uint256 provingCost = FeeMath.provingCostPerMana(
      blocks[tips.pendingBlockNumber].feeHeader.provingCostPerManaNumerator
    );

    uint256 congestionMultiplier = FeeMath.congestionMultiplier(excessMana);
    uint256 total = dataCost + gasCost + provingCost;
    uint256 congestionCost = Math.mulDiv(
      total, congestionMultiplier, FeeMath.MINIMUM_CONGESTION_MULTIPLIER, Math.Rounding.Floor
    ) - total;

    uint256 feeAssetPrice = _inFeeAsset ? getFeeAssetPrice() : 1e9;

    // @todo @lherskind. The following is a crime against humanity, but it makes it
    // very neat to plot etc from python, #10004 will fix it across the board
    return ManaBaseFeeComponents({
      dataCost: Math.mulDiv(dataCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      gasCost: Math.mulDiv(gasCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      provingCost: Math.mulDiv(provingCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      congestionCost: Math.mulDiv(congestionCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      congestionMultiplier: congestionMultiplier
    });
  }

  function quoteToDigest(EpochProofQuoteLib.EpochProofQuote memory _quote)
    public
    view
    override(IRollup)
    returns (bytes32)
  {
    return _hashTypedDataV4(EpochProofQuoteLib.hash(_quote));
  }

  /**
   * @notice Returns the computed public inputs for the given epoch proof.
   *
   * @dev Useful for debugging and testing. Allows submitter to compare their
   * own public inputs used for generating the proof vs the ones assembled
   * by this contract when verifying it.
   *
   * @param  _epochSize - The size of the epoch (to be promoted to a constant)
   * @param  _args - Array of public inputs to the proof (previousArchive, endArchive, previousBlockHash, endBlockHash, endTimestamp, outHash, proverId)
   * @param  _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   * @param  _aggregationObject - The aggregation object for the proof
   */
  function getEpochProofPublicInputs(
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _aggregationObject
  ) public view override(IRollup) returns (bytes32[] memory) {
    uint256 previousBlockNumber = tips.provenBlockNumber;
    uint256 endBlockNumber = previousBlockNumber + _epochSize;

    // Args are defined as an array because Solidity complains with "stack too deep" otherwise
    // 0 bytes32 _previousArchive,
    // 1 bytes32 _endArchive,
    // 2 bytes32 _previousBlockHash,
    // 3 bytes32 _endBlockHash,
    // 4 bytes32 _endTimestamp,
    // 5 bytes32 _outHash,
    // 6 bytes32 _proverId,

    // TODO(#7373): Public inputs are not fully verified

    {
      // We do it this way to provide better error messages than passing along the storage values
      bytes32 expectedPreviousArchive = blocks[previousBlockNumber].archive;
      require(
        expectedPreviousArchive == _args[0],
        Errors.Rollup__InvalidPreviousArchive(expectedPreviousArchive, _args[0])
      );

      bytes32 expectedEndArchive = blocks[endBlockNumber].archive;
      require(
        expectedEndArchive == _args[1], Errors.Rollup__InvalidArchive(expectedEndArchive, _args[1])
      );

      bytes32 expectedPreviousBlockHash = blocks[previousBlockNumber].blockHash;
      // TODO: Remove 0 check once we inject the proper genesis block hash
      require(
        expectedPreviousBlockHash == 0 || expectedPreviousBlockHash == _args[2],
        Errors.Rollup__InvalidPreviousBlockHash(expectedPreviousBlockHash, _args[2])
      );

      bytes32 expectedEndBlockHash = blocks[endBlockNumber].blockHash;
      require(
        expectedEndBlockHash == _args[3],
        Errors.Rollup__InvalidBlockHash(expectedEndBlockHash, _args[3])
      );
    }

    bytes32[] memory publicInputs = new bytes32[](
      Constants.ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH + Constants.AGGREGATION_OBJECT_LENGTH
    );

    // Structure of the root rollup public inputs we need to reassemble:
    //
    // struct RootRollupPublicInputs {
    //   previous_archive: AppendOnlyTreeSnapshot,
    //   end_archive: AppendOnlyTreeSnapshot,
    //   previous_block_hash: Field,
    //   end_block_hash: Field,
    //   end_timestamp: u64,
    //   end_block_number: Field,
    //   out_hash: Field,
    //   fees: [FeeRecipient; Constants.AZTEC_EPOCH_DURATION],
    //   vk_tree_root: Field,
    //   protocol_contract_tree_root: Field,
    //   prover_id: Field
    // }

    // previous_archive.root: the previous archive tree root
    publicInputs[0] = _args[0];

    // previous_archive.next_available_leaf_index: the previous archive next available index
    // normally this should be equal to the block number (since leaves are 0-indexed and blocks 1-indexed)
    // but in yarn-project/merkle-tree/src/new_tree.ts we prefill the tree so that block N is in leaf N
    publicInputs[1] = bytes32(previousBlockNumber + 1);

    // end_archive.root: the new archive tree root
    publicInputs[2] = _args[1];

    // end_archive.next_available_leaf_index: the new archive next available index
    publicInputs[3] = bytes32(endBlockNumber + 1);

    // previous_block_hash: the block hash just preceding this epoch
    publicInputs[4] = _args[2];

    // end_block_hash: the last block hash in the epoch
    publicInputs[5] = _args[3];

    // end_timestamp: the timestamp of the last block in the epoch
    publicInputs[6] = _args[4];

    // end_block_number: last block number in the epoch
    publicInputs[7] = bytes32(endBlockNumber);

    // out_hash: root of this epoch's l2 to l1 message tree
    publicInputs[8] = _args[5];

    uint256 feesLength = Constants.AZTEC_MAX_EPOCH_DURATION * 2;
    // fees[9 to (9+feesLength-1)]: array of recipient-value pairs
    for (uint256 i = 0; i < feesLength; i++) {
      publicInputs[9 + i] = _fees[i];
    }
    uint256 feesEnd = 9 + feesLength;

    // vk_tree_root
    publicInputs[feesEnd] = vkTreeRoot;

    // protocol_contract_tree_root
    publicInputs[feesEnd + 1] = protocolContractTreeRoot;

    // prover_id: id of current epoch's prover
    publicInputs[feesEnd + 2] = _args[6];

    // the block proof is recursive, which means it comes with an aggregation object
    // this snippet copies it into the public inputs needed for verification
    // it also guards against empty _aggregationObject used with mocked proofs
    uint256 aggregationLength = _aggregationObject.length / 32;
    for (uint256 i = 0; i < Constants.AGGREGATION_OBJECT_LENGTH && i < aggregationLength; i++) {
      bytes32 part;
      assembly {
        part := calldataload(add(_aggregationObject.offset, mul(i, 32)))
      }
      publicInputs[i + feesEnd + 3] = part;
    }

    return publicInputs;
  }

  function validateEpochProofRightClaimAtTime(
    Timestamp _ts,
    EpochProofQuoteLib.SignedEpochProofQuote calldata _quote
  ) public view override(IRollup) {
    SignatureLib.verify(_quote.signature, _quote.quote.prover, quoteToDigest(_quote.quote));

    Slot currentSlot = getSlotAt(_ts);
    address currentProposer = getProposerAt(_ts);
    Epoch epochToProve = getEpochToProve();

    require(
      _quote.quote.validUntilSlot >= currentSlot,
      Errors.Rollup__QuoteExpired(currentSlot, _quote.quote.validUntilSlot)
    );

    require(
      _quote.quote.basisPointFee <= 10_000,
      Errors.Rollup__InvalidBasisPointFee(_quote.quote.basisPointFee)
    );

    require(
      currentProposer == address(0) || currentProposer == msg.sender,
      Errors.Leonidas__InvalidProposer(currentProposer, msg.sender)
    );

    require(
      _quote.quote.epochToProve == epochToProve,
      Errors.Rollup__NotClaimingCorrectEpoch(epochToProve, _quote.quote.epochToProve)
    );

    require(
      positionInEpoch(currentSlot) < CLAIM_DURATION_IN_L2_SLOTS,
      Errors.Rollup__NotInClaimPhase(positionInEpoch(currentSlot), CLAIM_DURATION_IN_L2_SLOTS)
    );

    // if the epoch to prove is not the one that has been claimed,
    // then whatever is in the proofClaim is stale
    require(
      proofClaim.epochToProve != epochToProve || proofClaim.proposerClaimant == address(0),
      Errors.Rollup__ProofRightAlreadyClaimed()
    );

    require(
      _quote.quote.bondAmount >= PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST,
      Errors.Rollup__InsufficientBondAmount(
        PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST, _quote.quote.bondAmount
      )
    );

    uint256 availableFundsInEscrow = PROOF_COMMITMENT_ESCROW.deposits(_quote.quote.prover);
    require(
      _quote.quote.bondAmount <= availableFundsInEscrow,
      Errors.Rollup__InsufficientFundsInEscrow(_quote.quote.bondAmount, availableFundsInEscrow)
    );
  }

  /**
   * @notice  Get the current archive root
   *
   * @return bytes32 - The current archive root
   */
  function archive() public view override(IRollup) returns (bytes32) {
    return blocks[tips.pendingBlockNumber].archive;
  }

  function getProvenBlockNumber() public view override(IRollup) returns (uint256) {
    return tips.provenBlockNumber;
  }

  function getPendingBlockNumber() public view override(IRollup) returns (uint256) {
    return tips.pendingBlockNumber;
  }

  function getBlock(uint256 _blockNumber) public view override(IRollup) returns (BlockLog memory) {
    require(
      _blockNumber <= tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(tips.pendingBlockNumber, _blockNumber)
    );
    return blocks[_blockNumber];
  }

  function getEpochForBlock(uint256 _blockNumber) public view override(IRollup) returns (Epoch) {
    require(
      _blockNumber <= tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(tips.pendingBlockNumber, _blockNumber)
    );
    return getEpochAt(getTimestampForSlot(blocks[_blockNumber].slotNumber));
  }

  /**
   * @notice  Get the epoch that should be proven
   *
   * @dev    This is the epoch that should be proven. It does so by getting the epoch of the block
   *        following the last proven block. If there is no such block (i.e. the pending chain is
   *        the same as the proven chain), then revert.
   *
   * @return uint256 - The epoch to prove
   */
  function getEpochToProve() public view override(IRollup) returns (Epoch) {
    require(tips.provenBlockNumber != tips.pendingBlockNumber, Errors.Rollup__NoEpochToProve());
    return getEpochForBlock(getProvenBlockNumber() + 1);
  }

  /**
   * @notice  Get the archive root of a specific block
   *
   * @param _blockNumber - The block number to get the archive root of
   *
   * @return bytes32 - The archive root of the block
   */
  function archiveAt(uint256 _blockNumber) public view override(IRollup) returns (bytes32) {
    if (_blockNumber <= tips.pendingBlockNumber) {
      return blocks[_blockNumber].archive;
    }
    return bytes32(0);
  }

  function canPrune() public view override(IRollup) returns (bool) {
    return canPruneAtTime(Timestamp.wrap(block.timestamp));
  }

  function canPruneAtTime(Timestamp _ts) public view override(IRollup) returns (bool) {
    if (
      tips.pendingBlockNumber == tips.provenBlockNumber
        || tips.pendingBlockNumber <= assumeProvenThroughBlockNumber
    ) {
      return false;
    }

    Slot currentSlot = getSlotAt(_ts);
    Epoch oldestPendingEpoch = getEpochForBlock(tips.provenBlockNumber + 1);
    Slot startSlotOfPendingEpoch = toSlots(oldestPendingEpoch);

    // suppose epoch 1 is proven, epoch 2 is pending, epoch 3 is the current epoch.
    // we prune the pending chain back to the end of epoch 1 if:
    // - the proof claim phase of epoch 3 has ended without a claim to prove epoch 2 (or proof of epoch 2)
    // - we reach epoch 4 without a proof of epoch 2 (regardless of whether a proof claim was submitted)
    bool inClaimPhase = currentSlot
      < startSlotOfPendingEpoch + toSlots(Epoch.wrap(1)) + Slot.wrap(CLAIM_DURATION_IN_L2_SLOTS);

    bool claimExists = currentSlot < startSlotOfPendingEpoch + toSlots(Epoch.wrap(2))
      && proofClaim.epochToProve == oldestPendingEpoch && proofClaim.proposerClaimant != address(0);

    if (inClaimPhase || claimExists) {
      // If we are in the claim phase, do not prune
      return false;
    }
    return true;
  }

  function _prune() internal {
    // TODO #8656
    delete proofClaim;

    uint256 pending = tips.pendingBlockNumber;

    // @note  We are not deleting the blocks, but we are "winding back" the pendingTip to the last block that was proven.
    //        We can do because any new block proposed will overwrite a previous block in the block log,
    //        so no values should "survive".
    //        People must therefore read the chain using the pendingTip as a boundary.
    tips.pendingBlockNumber = tips.provenBlockNumber;

    emit PrunedPending(tips.provenBlockNumber, pending);
  }

  /**
   * @notice  Validates the header for submission
   *
   * @param _header - The proposed block header
   * @param _signatures - The signatures for the attestations
   * @param _digest - The digest that signatures signed
   * @param _currentTime - The time of execution
   * @dev                - This value is provided to allow for simple simulation of future
   * @param _flags - Flags specific to the execution, whether certain checks should be skipped
   */
  function _validateHeader(
    HeaderLib.Header memory _header,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    uint256 _manaBaseFee,
    bytes32 _txEffectsHash,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    uint256 pendingBlockNumber =
      canPruneAtTime(_currentTime) ? tips.provenBlockNumber : tips.pendingBlockNumber;
    _validateHeaderForSubmissionBase(
      _header, _currentTime, _manaBaseFee, _txEffectsHash, pendingBlockNumber, _flags
    );
    _validateHeaderForSubmissionSequencerSelection(
      Slot.wrap(_header.globalVariables.slotNumber), _signatures, _digest, _currentTime, _flags
    );
  }

  /**
   * @notice  Validate a header for submission to the pending chain (sequencer selection checks)
   *
   *          These validation checks are directly related to Leonidas.
   *          Note that while these checks are strict, they can be relaxed with some changes to
   *          message boxes.
   *
   *          Each of the following validation checks must pass, otherwise an error is thrown and we revert.
   *          - The slot MUST be the current slot
   *            This might be relaxed for allow consensus set to better handle short-term bursts of L1 congestion
   *          - The slot MUST be in the current epoch
   *
   * @param _slot - The slot of the header to validate
   * @param _signatures - The signatures to validate
   * @param _digest - The digest that signatures sign over
   */
  function _validateHeaderForSubmissionSequencerSelection(
    Slot _slot,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    // Ensure that the slot proposed is NOT in the future
    Slot currentSlot = getSlotAt(_currentTime);
    require(_slot == currentSlot, Errors.HeaderLib__InvalidSlotNumber(currentSlot, _slot));

    // @note  We are currently enforcing that the slot is in the current epoch
    //        If this is not the case, there could potentially be a weird reorg
    //        of an entire epoch if no-one from the new epoch committee have seen
    //        those blocks or behaves as if they did not.

    Epoch epochNumber = getEpochAt(getTimestampForSlot(_slot));
    Epoch currentEpoch = getEpochAt(_currentTime);
    require(epochNumber == currentEpoch, Errors.Rollup__InvalidEpoch(currentEpoch, epochNumber));

    _validateLeonidas(_slot, _signatures, _digest, _flags);
  }

  /**
   * @notice  Validate a header for submission to the pending chain (base checks)
   *          Base checks here being the checks that we wish to do regardless of the sequencer
   *          selection mechanism.
   *
   *         Each of the following validation checks must pass, otherwise an error is thrown and we revert.
   *          - The chain ID MUST match the current chain ID
   *          - The version MUST match the current version
   *          - The block id MUST be the next block in the chain
   *          - The last archive root in the header MUST match the current archive
   *          - The slot MUST be larger than the slot of the previous block (ensures single block per slot)
   *          - The timestamp MUST be equal to GENESIS_TIME + slot * SLOT_DURATION
   *          - The `txsEffectsHash` of the header must match the computed `_txsEffectsHash`
   *            - This can be relaxed to happen at the time of `submitProof` instead
   *
   * @param _header - The header to validate
   */
  function _validateHeaderForSubmissionBase(
    HeaderLib.Header memory _header,
    Timestamp _currentTime,
    uint256 _manaBaseFee,
    bytes32 _txsEffectsHash,
    uint256 _pendingBlockNumber,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    require(
      block.chainid == _header.globalVariables.chainId,
      Errors.Rollup__InvalidChainId(block.chainid, _header.globalVariables.chainId)
    );

    require(
      _header.globalVariables.version == VERSION,
      Errors.Rollup__InvalidVersion(VERSION, _header.globalVariables.version)
    );

    require(
      _header.globalVariables.blockNumber == _pendingBlockNumber + 1,
      Errors.Rollup__InvalidBlockNumber(
        _pendingBlockNumber + 1, _header.globalVariables.blockNumber
      )
    );

    bytes32 tipArchive = blocks[_pendingBlockNumber].archive;
    require(
      tipArchive == _header.lastArchive.root,
      Errors.Rollup__InvalidArchive(tipArchive, _header.lastArchive.root)
    );

    Slot slot = Slot.wrap(_header.globalVariables.slotNumber);
    Slot lastSlot = blocks[_pendingBlockNumber].slotNumber;
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Timestamp timestamp = getTimestampForSlot(slot);
    require(
      Timestamp.wrap(_header.globalVariables.timestamp) == timestamp,
      Errors.Rollup__InvalidTimestamp(timestamp, Timestamp.wrap(_header.globalVariables.timestamp))
    );

    // @note  If you are hitting this error, it is likely because the chain you use have a blocktime that differs
    //        from the value that we have in the constants.
    //        When you are encountering this, it will likely be as the sequencer expects to be able to include
    //        an Aztec block in the "next" ethereum block based on a timestamp that is 12 seconds in the future
    //        from the last block. However, if the actual will only be 1 second in the future, you will end up
    //        expecting this value to be in the future.
    require(timestamp <= _currentTime, Errors.Rollup__TimestampInFuture(_currentTime, timestamp));

    // Check if the data is available
    require(
      _flags.ignoreDA || _header.contentCommitment.txsEffectsHash == _txsEffectsHash,
      Errors.Rollup__UnavailableTxs(_header.contentCommitment.txsEffectsHash)
    );

    // If not canonical rollup, require that the fees are zero
    if (address(this) != FEE_JUICE_PORTAL.canonicalRollup()) {
      require(_header.globalVariables.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
      require(_header.globalVariables.gasFees.feePerL2Gas == 0, Errors.Rollup__NonZeroL2Fee());
    } else {
      require(_header.globalVariables.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
      require(
        _header.globalVariables.gasFees.feePerL2Gas == _manaBaseFee,
        Errors.Rollup__InvalidManaBaseFee(_manaBaseFee, _header.globalVariables.gasFees.feePerL2Gas)
      );
    }
  }

  function _fakeBlockNumberAsProven(uint256 _blockNumber) private {
    if (_blockNumber > tips.provenBlockNumber && _blockNumber <= tips.pendingBlockNumber) {
      tips.provenBlockNumber = _blockNumber;

      // If this results on a new epoch, create a fake claim for it
      // Otherwise nextEpochToProve will report an old epoch
      Epoch epoch = getEpochForBlock(_blockNumber);
      if (Epoch.unwrap(epoch) == 0 || Epoch.unwrap(epoch) > Epoch.unwrap(proofClaim.epochToProve)) {
        proofClaim = DataStructures.EpochProofClaim({
          epochToProve: epoch,
          basisPointFee: 0,
          bondAmount: 0,
          bondProvider: address(0),
          proposerClaimant: msg.sender
        });
      }
    }
  }

  /**
   * @notice  Get the blob base fee
   *
   * @dev     If we are in a foundry test, we use the cheatcode to get the blob base fee.
   *          Otherwise, we use the `block.blobbasefee`
   *
   * @return uint256 - The blob base fee
   */
  function _getBlobBaseFee() private view returns (uint256) {
    if (IS_FOUNDRY_TEST) {
      return Vm(VM_ADDRESS).getBlobBaseFee();
    }
    return block.blobbasefee;
  }
}
