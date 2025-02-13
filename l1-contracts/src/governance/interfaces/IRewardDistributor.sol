// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRegistry} from "./IRegistry.sol";

interface IRewardDistributor {
  event RegistryUpdated(IRegistry indexed registry);

  function updateRegistry(IRegistry _registry) external;
  function claim(address _to) external returns (uint256);
  function canonicalRollup() external view returns (address);
}
