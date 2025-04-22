import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/index.js';

/** Exposed API to the P2P bootstrap node. */
export interface P2PBootstrapApi {
  /**
   * Returns the ENR for this node.
   */
  getEncodedEnr(): Promise<string>;

  /**
   * Returns ENRs for all nodes in the routing table.
   */
  getRoutingTable(): Promise<string[]>;
}

export const P2PBootstrapApiSchema: ApiSchemaFor<P2PBootstrapApi> = {
  getEncodedEnr: z.function().returns(z.string()),
  getRoutingTable: z.function().returns(z.array(z.string())),
};
