import type { Account } from '@aztec/aztec.js/account';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Aliased, PrivateEvent } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/fields';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';
import { PXE, type PackedPrivateEvent } from '@aztec/pxe/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { BaseWallet } from './base_wallet.js';

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
  function privateEventFor(serial: Fr[]): PackedPrivateEvent {
    return {
      packedEvent: serial,
      l2BlockHash: L2BlockHash.random(),
      l2BlockNumber: BlockNumber(42),
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

    const packedPrivateEventTransfer1: PackedPrivateEvent = privateEventFor(transfer1Serialized);
    const packedPrivateEventTransfer2: PackedPrivateEvent = privateEventFor(transfer2Serialized);

    const privateEventTransfer1: PrivateEvent<Transfer> = {
      event: transfer1,
      metadata: {
        l2BlockNumber: packedPrivateEventTransfer1.l2BlockNumber,
        l2BlockHash: packedPrivateEventTransfer1.l2BlockHash,
        txHash: packedPrivateEventTransfer1.txHash,
      },
    };

    const privateEventTransfer2: PrivateEvent<Transfer> = {
      event: transfer2,
      metadata: {
        l2BlockNumber: packedPrivateEventTransfer2.l2BlockNumber,
        l2BlockHash: packedPrivateEventTransfer2.l2BlockHash,
        txHash: packedPrivateEventTransfer2.txHash,
      },
    };

    pxe.getPrivateEvents.mockResolvedValue([packedPrivateEventTransfer1, packedPrivateEventTransfer2]);

    const basicWallet = new BasicWallet(pxe, node);

    const events = await basicWallet.getPrivateEvents<Transfer>(TokenContract.events.Transfer, {
      contractAddress: await AztecAddress.random(),
      fromBlock: BlockNumber(42),
      toBlock: BlockNumber(43),
      scopes: [await AztecAddress.random()],
    });

    expect(events).toEqual([privateEventTransfer1, privateEventTransfer2]);
  });
});
