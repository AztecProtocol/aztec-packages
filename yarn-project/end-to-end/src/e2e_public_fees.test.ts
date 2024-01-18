import { AztecNode, CompleteAddress, DebugLogger, PXE, Wallet } from '@aztec/aztec.js';

import { setup } from './fixtures/utils.js';

describe('e2e_public_fees', () => {
  let pxe: PXE;
  let logger: DebugLogger;

  let sender: Wallet;
  let senderAddress: CompleteAddress;
  let recipient: Wallet;
  let recipientAddress: CompleteAddress;
  let sequencer: Wallet;
  let sequencerAddress: CompleteAddress;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    ({
      aztecNode,
      pxe: pxe,
      accounts: [senderAddress, recipientAddress, sequencerAddress],
      wallets: [sender, recipient, sequencer],
      logger,
      teardown: teardown,
    } = await setup(3, {
      enableFees: true,
    }));
  }, 100_000);

  it('should be able to specify a fee with transaction', async () => {});
});
