// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

interface IPayload {
  struct Action {
    address target;
    bytes data;
  }

  function getActions() external view returns (Action[] memory);
}
