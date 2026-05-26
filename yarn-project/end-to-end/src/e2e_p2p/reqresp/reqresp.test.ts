import type { AztecNodeService } from '@aztec/aztec-node';

import { jest } from '@jest/globals';

import type { P2PNetworkTest } from '../p2p_network.js';
import { cleanupReqrespTest, createReqrespDataDir, createReqrespTest, runReqrespTxTest } from './utils.js';

const DATA_DIR = createReqrespDataDir();

// Under pipelining a 36s aztec slot plus build-slot/target-slot round trip + L1
// publish exceeds the default 5 min jest test timeout. Allow 15 min.
jest.setTimeout(15 * 60 * 1000);

describe('e2e_p2p_reqresp_tx', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await createReqrespTest();
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
    nodes = await runReqrespTxTest({ t, dataDir: DATA_DIR });
  });
});
