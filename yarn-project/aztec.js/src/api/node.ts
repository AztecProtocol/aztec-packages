/**
 * The `node` module provides utilities for connecting to and interacting with an Aztec node.
 *
 * The primary function is {@link createAztecNodeClient}, which creates a JSON-RPC client
 * that connects to a running Aztec node instance. Use {@link waitForNode} to wait for
 * the node to be ready before proceeding, and {@link waitForTx} to wait for a transaction
 * to be mined.
 *
 * @example
 * ```ts
 * import { createAztecNodeClient, waitForNode, waitForTx } from '@aztec/aztec.js/node';
 *
 * const node = createAztecNodeClient('http://localhost:8080');
 * await waitForNode(node);
 * const blockNumber = await node.getBlockNumber();
 *
 * // Wait for a transaction
 * const receipt = await waitForTx(node, txHash);
 * ```
 *
 * @packageDocumentation
 */
export { createAztecNodeClient, waitForNode, waitForTx, type AztecNode } from '../utils/node.js';
export { type NodeInfo } from '@aztec/stdlib/contract';
