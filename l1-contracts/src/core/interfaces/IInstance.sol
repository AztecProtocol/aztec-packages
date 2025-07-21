// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollup} from "./IRollup.sol";
import {IStaking} from "./IStaking.sol";
import {IValidatorSelection} from "./IValidatorSelection.sol";

interface IInstance is IStaking, IValidatorSelection, IRollup {}
