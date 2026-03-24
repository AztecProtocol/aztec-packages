// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Economics} from "@aztec/core/Economics.sol";
import {IEconomicsCore} from "@aztec/core/interfaces/IEconomicsCore.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

/**
 * @title EconomicsDeploymentExtLib
 * @notice External rollup library that deploys the economics engine.
 * @dev Splitting deployment into an external library keeps the rollup constructor below the size
 *      limit while preserving the same runtime behavior and initialization inputs.
 */
library EconomicsDeploymentExtLib {
  function deployEconomics(
    address _rollup,
    address _governance,
    IERC20 _feeAsset,
    RollupConfigInput memory _config,
    uint256 _genesisTime
  ) external returns (IEconomicsCore) {
    return IEconomicsCore(
      address(
        new Economics(
          _governance,
          _rollup,
          _feeAsset,
          EconomicsInitArgs({
            manaTarget: _config.manaTarget,
            provingCostPerMana: _config.provingCostPerMana,
            initialEthPerFeeAsset: _config.initialEthPerFeeAsset,
            rewardConfig: _config.rewardConfig,
            rewardBoostConfig: _config.rewardBoostConfig,
            genesisTime: _genesisTime,
            aztecSlotDuration: _config.aztecSlotDuration,
            aztecEpochDuration: _config.aztecEpochDuration,
            aztecProofSubmissionEpochs: _config.aztecProofSubmissionEpochs
          })
        )
      )
    );
  }
}
