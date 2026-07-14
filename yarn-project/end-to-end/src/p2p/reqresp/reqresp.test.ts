import type { AztecNodeService } from '@aztec/aztec-node';

import { jest } from '@jest/globals';

import type { P2PNetworkTest } from '../p2p_network.js';
import { cleanupReqrespTest, createReqrespTest, runReqrespTxTest } from './utils.js';

// Under pipelining a 36s aztec slot plus build-slot/target-slot round trip + L1
// publish exceeds the default 5 min jest test timeout. Allow 15 min.
jest.setTimeout(15 * 60 * 1000);

// Tests the reqresp tx-collection path over real libp2p: 6 validators, ethSlot=8s, aztecSlot=36s,
// blockDurationMs=6s, enforceTimeTable, min=1/max=2 txs, proofSubEpochs=1024, epoch=64 (stable committee),
// inboxLag=2. Non-proposer nodes have tx gossip disabled so they must request the tx over reqresp.
// Also verifies multi-blocks-per-slot (mbps) checkpoint is produced. jest.setTimeout=15m.
describe('e2e_p2p_reqresp_tx', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await createReqrespTest();
  });

  afterEach(async () => {
    await cleanupReqrespTest({ t, nodes });
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
     *
     * Delegates to runReqrespTxTest in utils.ts; see that helper for the full flow.
     */
    nodes = await runReqrespTxTest({ t });
  });
});
