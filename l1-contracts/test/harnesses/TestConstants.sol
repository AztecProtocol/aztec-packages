// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.

pragma solidity >=0.8.27;

import {RollupConfigInput, GenesisState, EthValue} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";

library TestConstants {
  uint256 internal constant ETHEREUM_SLOT_DURATION = 12;
  uint256 internal constant AZTEC_SLOT_DURATION = 36;
  uint256 internal constant AZTEC_EPOCH_DURATION = 32;
  uint256 internal constant AZTEC_TARGET_COMMITTEE_SIZE = 48;
  uint256 internal constant AZTEC_PROOF_SUBMISSION_WINDOW = AZTEC_EPOCH_DURATION * 2 - 1;
  uint256 internal constant AZTEC_SLASHING_QUORUM = 6;
  uint256 internal constant AZTEC_SLASHING_ROUND_SIZE = 10;
  uint256 internal constant AZTEC_MANA_TARGET = 100000000;
  EthValue internal constant AZTEC_PROVING_COST_PER_MANA = EthValue.wrap(100);

  // Genesis state
  bytes32 internal constant GENESIS_ARCHIVE_ROOT = bytes32(Constants.GENESIS_ARCHIVE_ROOT);
  bytes32 internal constant GENESIS_VK_TREE_ROOT = bytes32(0);
  bytes32 internal constant GENESIS_PROTOCOL_CONTRACT_TREE_ROOT = bytes32(0);

  function getGenesisState() internal pure returns (GenesisState memory) {
    return GenesisState({
      vkTreeRoot: GENESIS_VK_TREE_ROOT,
      protocolContractTreeRoot: GENESIS_PROTOCOL_CONTRACT_TREE_ROOT,
      genesisArchiveRoot: GENESIS_ARCHIVE_ROOT
    });
  }

  function getRollupConfigInput() internal pure returns (RollupConfigInput memory) {
    return RollupConfigInput({
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      aztecEpochDuration: AZTEC_EPOCH_DURATION,
      targetCommitteeSize: AZTEC_TARGET_COMMITTEE_SIZE,
      aztecProofSubmissionWindow: AZTEC_PROOF_SUBMISSION_WINDOW,
      slashingQuorum: AZTEC_SLASHING_QUORUM,
      slashingRoundSize: AZTEC_SLASHING_ROUND_SIZE,
      manaTarget: AZTEC_MANA_TARGET,
      provingCostPerMana: AZTEC_PROVING_COST_PER_MANA
    });
  }
}
