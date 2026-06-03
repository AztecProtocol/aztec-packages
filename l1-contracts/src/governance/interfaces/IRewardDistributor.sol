// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

interface IRewardDistributor {
  /// @notice Emitted when a funder earmarks ASSET for a specific recipient via `subsidizeAddress`.
  event Subsidized(address indexed funder, address indexed recipient, uint256 amount);

  /// @notice Emitted whenever `claim` or `recoverFrom` debits the distributor.
  /// @dev `implicitAmountUsed` is the share drawn from the canonical-rollup implicit pool,
  ///      `earmarkedAmountUsed` is the share drawn from `from`'s earmarked balance, and the two
  ///      always sum to `amount`. Lets a log-only indexer reconstruct bucket-by-bucket history
  ///      without polling storage at every block.
  event Distributed(
    address indexed from, address indexed to, uint256 amount, uint256 implicitAmountUsed, uint256 earmarkedAmountUsed
  );

  function claim(address _to, uint256 _amount) external;
  function recoverFrom(address _from, address _to, uint256 _amount) external;
  function recoverWrongAsset(address _asset, address _to, uint256 _amount) external;
  function subsidizeAddress(address _recipient, uint256 _amount) external;
  function canonicalRollup() external view returns (address);
  function availableTo(address _recipient) external view returns (uint256);
}
