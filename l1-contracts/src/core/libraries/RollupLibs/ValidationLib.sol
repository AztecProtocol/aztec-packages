// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {BlockLog} from "@aztec/core/interfaces/IRollup.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "./../DataStructures.sol";
import {Errors} from "./../Errors.sol";
import {Timestamp, Slot, Epoch} from "./../TimeMath.sol";
import {SignedEpochProofQuote} from "./EpochProofQuoteLib.sol";
import {Header} from "./HeaderLib.sol";

struct ValidateHeaderArgs {
  Header header;
  Timestamp currentTime;
  uint256 manaBaseFee;
  bytes32 txsEffectsHash;
  uint256 pendingBlockNumber;
  DataStructures.ExecutionFlags flags;
  uint256 version;
  IFeeJuicePortal feeJuicePortal;
  function(Slot) external view returns (Timestamp) getTimestampForSlot;
}

library ValidationLib {
  function validateHeaderForSubmissionBase(
    ValidateHeaderArgs memory _args,
    mapping(uint256 blockNumber => BlockLog log) storage _blocks
  ) internal view {
    require(
      block.chainid == _args.header.globalVariables.chainId,
      Errors.Rollup__InvalidChainId(block.chainid, _args.header.globalVariables.chainId)
    );

    require(
      _args.header.globalVariables.version == _args.version,
      Errors.Rollup__InvalidVersion(_args.version, _args.header.globalVariables.version)
    );

    require(
      _args.header.globalVariables.blockNumber == _args.pendingBlockNumber + 1,
      Errors.Rollup__InvalidBlockNumber(
        _args.pendingBlockNumber + 1, _args.header.globalVariables.blockNumber
      )
    );

    bytes32 tipArchive = _blocks[_args.pendingBlockNumber].archive;
    require(
      tipArchive == _args.header.lastArchive.root,
      Errors.Rollup__InvalidArchive(tipArchive, _args.header.lastArchive.root)
    );

    Slot slot = Slot.wrap(_args.header.globalVariables.slotNumber);
    Slot lastSlot = _blocks[_args.pendingBlockNumber].slotNumber;
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Timestamp timestamp = _args.getTimestampForSlot(slot);
    require(
      Timestamp.wrap(_args.header.globalVariables.timestamp) == timestamp,
      Errors.Rollup__InvalidTimestamp(
        timestamp, Timestamp.wrap(_args.header.globalVariables.timestamp)
      )
    );

    // @note  If you are hitting this error, it is likely because the chain you use have a blocktime that differs
    //        from the value that we have in the constants.
    //        When you are encountering this, it will likely be as the sequencer expects to be able to include
    //        an Aztec block in the "next" ethereum block based on a timestamp that is 12 seconds in the future
    //        from the last block. However, if the actual will only be 1 second in the future, you will end up
    //        expecting this value to be in the future.
    require(
      timestamp <= _args.currentTime, Errors.Rollup__TimestampInFuture(_args.currentTime, timestamp)
    );

    // Check if the data is available
    require(
      _args.flags.ignoreDA || _args.header.contentCommitment.txsEffectsHash == _args.txsEffectsHash,
      Errors.Rollup__UnavailableTxs(_args.header.contentCommitment.txsEffectsHash)
    );

    // If not canonical rollup, require that the fees are zero
    if (address(this) != _args.feeJuicePortal.canonicalRollup()) {
      require(_args.header.globalVariables.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
      require(_args.header.globalVariables.gasFees.feePerL2Gas == 0, Errors.Rollup__NonZeroL2Fee());
    } else {
      require(_args.header.globalVariables.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
      require(
        _args.header.globalVariables.gasFees.feePerL2Gas == _args.manaBaseFee,
        Errors.Rollup__InvalidManaBaseFee(
          _args.manaBaseFee, _args.header.globalVariables.gasFees.feePerL2Gas
        )
      );
    }
  }

  function validateEpochProofRightClaimAtTime(
    Slot _currentSlot,
    address _currentProposer,
    Epoch _epochToProve,
    uint256 _posInEpoch,
    SignedEpochProofQuote calldata _quote,
    bytes32 _digest,
    DataStructures.EpochProofClaim storage _proofClaim,
    uint256 _claimDurationInL2Slots,
    uint256 _proofCommitmentMinBondAmountInTst,
    IProofCommitmentEscrow _proofCommitmentEscrow
  ) internal view {
    SignatureLib.verify(_quote.signature, _quote.quote.prover, _digest);

    require(
      _quote.quote.validUntilSlot >= _currentSlot,
      Errors.Rollup__QuoteExpired(_currentSlot, _quote.quote.validUntilSlot)
    );

    require(
      _quote.quote.basisPointFee <= 10_000,
      Errors.Rollup__InvalidBasisPointFee(_quote.quote.basisPointFee)
    );

    require(
      _currentProposer == address(0) || _currentProposer == msg.sender,
      Errors.Leonidas__InvalidProposer(_currentProposer, msg.sender)
    );

    require(
      _quote.quote.epochToProve == _epochToProve,
      Errors.Rollup__NotClaimingCorrectEpoch(_epochToProve, _quote.quote.epochToProve)
    );

    require(
      _posInEpoch < _claimDurationInL2Slots,
      Errors.Rollup__NotInClaimPhase(_posInEpoch, _claimDurationInL2Slots)
    );

    // if the epoch to prove is not the one that has been claimed,
    // then whatever is in the proofClaim is stale
    require(
      _proofClaim.epochToProve != _epochToProve || _proofClaim.proposerClaimant == address(0),
      Errors.Rollup__ProofRightAlreadyClaimed()
    );

    require(
      _quote.quote.bondAmount >= _proofCommitmentMinBondAmountInTst,
      Errors.Rollup__InsufficientBondAmount(
        _proofCommitmentMinBondAmountInTst, _quote.quote.bondAmount
      )
    );

    uint256 availableFundsInEscrow = _proofCommitmentEscrow.deposits(_quote.quote.prover);
    require(
      _quote.quote.bondAmount <= availableFundsInEscrow,
      Errors.Rollup__InsufficientFundsInEscrow(_quote.quote.bondAmount, availableFundsInEscrow)
    );
  }
}
