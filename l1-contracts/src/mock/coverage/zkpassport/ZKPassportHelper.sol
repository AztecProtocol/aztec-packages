// SPDX-License-Identifier: Apache-2.0
// Coverage-only mock with intentionally minimal interface behavior.
// solhint-disable imports-order
// solhint-disable immutable-vars-naming
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {BoundData} from "./Types.sol";
import {IRootRegistry} from "./IRootRegistry.sol";

contract ZKPassportHelper {
  address internal constant BOUND_ADDRESS = 0x04Fb06E8BF44eC60b6A99D2F98551172b2F2dED8;

  IRootRegistry public immutable rootRegistry;

  constructor(IRootRegistry _rootRegistry) {
    rootRegistry = _rootRegistry;
  }

  function getBoundData(bytes calldata) external view returns (BoundData memory) {
    return BoundData({senderAddress: BOUND_ADDRESS, chainId: block.chainid, customData: ""});
  }

  function isNationalityOut(string[] calldata, bytes calldata) external pure returns (bool) {
    return true;
  }
}
