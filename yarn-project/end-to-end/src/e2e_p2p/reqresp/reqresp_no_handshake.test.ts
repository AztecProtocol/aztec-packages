import type { AztecNodeService } from '@aztec/aztec-node';

import type { P2PNetworkTest } from '../p2p_network.js';
import { cleanupReqrespTest, createReqrespDataDir, createReqrespTest, runReqrespTxTest } from './utils.js';

// TODO: DELETE THIS FILE
// This is a temporary copy of reqresp.test.ts with status handshake disabled
// Delete this file once we have settled on the cause of the reqresp flakes.

const DATA_DIR = createReqrespDataDir();

describe('e2e_p2p_reqresp_tx_no_handshake', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await createReqrespTest({ disableStatusHandshake: true });
  });

  afterEach(async () => {
    await cleanupReqrespTest({ t, nodes, dataDir: DATA_DIR });
  });

  it('should produce an attestation by requesting tx data over the p2p network', async () => {
    /**
     * Birds eye overview of the test
     * 1. We spin up x nodes
     * 2. We turn off receiving a tx via gossip from two of the nodes
     * 3. We send a transactions and gossip it to other nodes
     * 4. The disabled nodes will receive an attestation that it does not have the data for
     * 5. They will request this data over the p2p layer
     * 6. We receive all of the attestations that we need and we produce the block
     *
     * Note: we do not attempt to let this node produce a block, as it will not have received any transactions
     *       from the other pxes.
     */
    nodes = await runReqrespTxTest({ t, dataDir: DATA_DIR, disableStatusHandshake: true });
  });
});
