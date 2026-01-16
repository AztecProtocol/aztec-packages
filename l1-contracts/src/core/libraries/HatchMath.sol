// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @title Hatch
 *
 * @notice A time unit representing a potential escape hatch opening.
 *         Similar to Epoch, but at a coarser granularity.
 */
type Hatch is uint256;

function addHatch(Hatch _a, Hatch _b) pure returns (Hatch) {
  return Hatch.wrap(Hatch.unwrap(_a) + Hatch.unwrap(_b));
}

function subHatch(Hatch _a, Hatch _b) pure returns (Hatch) {
  return Hatch.wrap(Hatch.unwrap(_a) - Hatch.unwrap(_b));
}

using {addHatch as +, subHatch as -} for Hatch global;
