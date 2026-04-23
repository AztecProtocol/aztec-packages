// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

interface IPredicate {
    function verify(address caller, bytes calldata auth) external view returns (bool);
}
