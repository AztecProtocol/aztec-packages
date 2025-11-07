// Why test BaseWallet here and not at Aztec.js?
// We need a PXE to instantiate a BaseWallet, and due to
// circular dependencies we can't have it.
// Current plans involve creating a Wallet SDK which would be
// a natural new home for both BaseWallet and this test,
// but that's out of scope for now.
import type { Account } from '@aztec/aztec.js/account';
import type { AztecNode } from '@aztec/aztec.js/node';
import { type Aliased, BaseWallet } from '@aztec/aztec.js/wallet';
import { Fr } from '@aztec/foundation/fields';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';
import { PXE, type PrivateEvent } from '@aztec/pxe/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

/**
 * Just a construct to test BaseWallet
 */
class BasicWallet extends BaseWallet {
  constructor(pxe: PXE, node: AztecNode) {
    super(pxe, node);
  }

  protected override getAccountFromAddress(_address: AztecAddress): Promise<Account> {
    throw new Error('Method not implemented.');
  }
  override getAccounts(): Promise<Aliased<AztecAddress>[]> {
    throw new Error('Method not implemented.');
  }
}

describe('BaseWallet', () => {
  let pxe: MockProxy<PXE>;
  let node: MockProxy<AztecNode>;

  // eslint-disable-next-line jsdoc/require-jsdoc
  async function makeTransferEvent(amount: number): Promise<Transfer> {
    return {
      from: await AztecAddress.random(),
      to: await AztecAddress.random(),
      amount: BigInt(amount),
    };
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  function encodeTransfer(transfer: Transfer): Fr[] {
    return [
      (transfer.from as AztecAddress).toField(),
      (transfer.to as AztecAddress).toField(),
      new Fr(transfer.amount),
    ];
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  async function privateEventFor(serial: Fr[]): Promise<PrivateEvent> {
    return {
      packedEvent: serial,
      recipient: await AztecAddress.random(),
      blockHash: L2BlockHash.random(),
      blockNumber: 42,
      txHash: TxHash.random(),
      eventSelector: TokenContract.events.Transfer.eventSelector,
    };
  }

  it('decodes private events', async () => {
    pxe = mock<PXE>();
    node = mock<AztecNode>();

    const transfer1: Transfer = await makeTransferEvent(120);
    const transfer2: Transfer = await makeTransferEvent(235);

    const transfer1Serialized: Fr[] = encodeTransfer(transfer1);
    const transfer2Serialized: Fr[] = encodeTransfer(transfer2);

    pxe.getPrivateEvents.mockResolvedValue([
      await privateEventFor(transfer1Serialized),
      await privateEventFor(transfer2Serialized),
    ]);

    const basicWallet = new BasicWallet(pxe, node);

    const events = await basicWallet.getPrivateEvents<Transfer>(
      await AztecAddress.random(),
      TokenContract.events.Transfer,
      42,
      1,
      [await AztecAddress.random()],
    );

    expect(events).toEqual([transfer1, transfer2]);
  });
});
