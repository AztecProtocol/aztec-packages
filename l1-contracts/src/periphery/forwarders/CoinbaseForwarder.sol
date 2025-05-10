// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {Address} from "@oz/utils/Address.sol";
import {IForwarder} from "./../interfaces/IForwarder.sol";

struct CoinbaseLocation {
  address contractAddress;
  uint256 offset;
  bytes4 proposeSignature;
}

contract CoinbaseForwarder is Ownable, IForwarder {
  using Address for address;

  error CoinbaseForwarder__Mismatch(address expected, address actual);
  error CoinbaseForwarder__NoCoinbaseLocationSet();

  address public immutable COINBASE;
  CoinbaseLocation public COINBASE_LOCATION;

  constructor(address __owner, address _coinbase) Ownable(__owner) {
    COINBASE = _coinbase;
  }

  /**
   * @notice Enforce that the coinbase in the calldata is set to an address expected by the forwarder
   * @param _coinbaseLocation The coinbase location to enforce
   */
  function _enforceCoinbaseLocation(CoinbaseLocation memory _coinbaseLocation, uint256 _callIndex)
    internal
    view
  {
    uint256 coinbaseOffset = _coinbaseLocation.offset;
    address recoveredCoinbase;

    assembly {
      // Get the memory offset of the correct calldata
      // (to[], data[])
      // (0x04, 0x24)
      let calldataArrayOffset := calldataload(0x24)

      // Get the start of the calldata array
      // [0x04, ......... [data.length, data[0].offset, data[1].offset, ...]]
      //                               ^
      //                     targetCalldataArrayOffset
      let targetCalldataArrayOffset := add(0x04, add(calldataArrayOffset, 0x20))

      // Get the offset of the target calldata
      // In the case the callIndex parameter is 1
      // [0x04, ......... [data.length, data[0].offset, data[1].offset, ...]]
      //                                               ^
      //                                      targetCalldataOffsetPointer
      let targetCalldataOffsetPointer := add(targetCalldataArrayOffset, mul(0x20, _callIndex))

      // Since the targetCalldataOffsetPointer is relative to the start of the calldata array, we get the true pointer
      // for calldata by adding it to the calldata location of the start of the array
      // [0x04, ......... [data.length, data[0].offset, data[1].offset, ..., targetCalldata.length, targetCalldata.......]]
      // .                                                                   ^
      //                                                                targetCalldataOffset
      let targetCalldataOffset :=
        add(targetCalldataArrayOffset, calldataload(targetCalldataOffsetPointer))

      // Get the start of the target calldata
      // [0x04, ......... [data.length, data[0].offset, data[1].offset, ..., targetCalldata.length, targetCalldata.......]]
      //                                                                                            ^
      //                                                                                         calldataStart
      let calldataStart := add(0x20, targetCalldataOffset) // it contains its length

      // The forwarder provides the expected location of the coinbase value in calldata
      // [0x04, ......... [data.length, data[0].offset, data[1].offset, ..., targetCalldata.length, [something, something, coinbase, something, ...]...]]
      //                                                                                                                    ^
      //                                                                                                           coinbaseOffset
      recoveredCoinbase := calldataload(add(calldataStart, coinbaseOffset))
    }

    // If the coinbase in the calldata is incorrect, then the entire call will revert
    if (recoveredCoinbase != COINBASE) {
      revert CoinbaseForwarder__Mismatch(COINBASE, recoveredCoinbase);
    }
  }

  /**
   * @notice Set the coinbase location for the forwarder
   *         This is the rollup contract address and the offset of the coinbase location
   * @param _coinbaseLocation The coinbase location to set
   */
  function setCoinbaseLocation(CoinbaseLocation memory _coinbaseLocation) external onlyOwner {
    COINBASE_LOCATION = _coinbaseLocation;
  }

  function forward(address[] calldata _to, bytes[] calldata _data)
    external
    override(IForwarder)
    onlyOwner
  {
    // Enforce coinbase is set the coinbase address
    CoinbaseLocation memory coinbaseLocation = COINBASE_LOCATION;
    if (coinbaseLocation.contractAddress == address(0)) {
      revert CoinbaseForwarder__NoCoinbaseLocationSet();
    }

    require(
      _to.length == _data.length, IForwarder.ForwarderLengthMismatch(_to.length, _data.length)
    );
    for (uint256 i = 0; i < _to.length; i++) {
      if (
        coinbaseLocation.contractAddress == _to[i]
          && coinbaseLocation.proposeSignature == bytes4(_data[i][0:4])
      ) {
        _enforceCoinbaseLocation(coinbaseLocation, i);
      }

      _to[i].functionCall(_data[i]);
    }
  }
}
