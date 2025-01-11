// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Rollup as RealRollup, Config} from "@aztec/core/Rollup.sol";
import {TestConstants} from "./TestConstants.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

contract Rollup is RealRollup {
  constructor(
    IFeeJuicePortal _fpcJuicePortal,
    IRewardDistributor _rewardDistributor,
    IERC20 _stakingAsset,
    bytes32 _vkTreeRoot,
    bytes32 _protocolContractTreeRoot,
    address _ares
  )
    RealRollup(
      _fpcJuicePortal,
      _rewardDistributor,
      _stakingAsset,
      _vkTreeRoot,
      _protocolContractTreeRoot,
      _ares,
      Config({
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        targetCommitteeSize: TestConstants.AZTEC_TARGET_COMMITTEE_SIZE,
        aztecEpochProofClaimWindowInL2Slots: TestConstants.AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS,
        minimumStake: TestConstants.AZTEC_MINIMUM_STAKE,
        slashingQuorum: TestConstants.AZTEC_SLASHING_QUORUM,
        slashingRoundSize: TestConstants.AZTEC_SLASHING_ROUND_SIZE
      })
    )
  {}
}
