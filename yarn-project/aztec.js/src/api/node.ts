/**
 * The `node` module provides utilities for connecting to and interacting with an Aztec node.
 *
 * The primary function is {@link createAztecNodeClient}, which creates a JSON-RPC client
 * that connects to a running Aztec node instance. Use {@link waitForNode} to wait for
 * the node to be ready before proceeding.
 *
 * @example
 * ```ts
 * import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
 *
 * const node = createAztecNodeClient('http://localhost:8080');
 * await waitForNode(node);
 * const blockNumber = await node.getBlockNumber();
 * ```
 *
 * @packageDocumentation
 */
export { createAztecNodeClient, waitForNode, type AztecNode } from '../utils/node.js';
export { type NodeInfo } from '@aztec/stdlib/contract';
