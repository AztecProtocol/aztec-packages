import type { Account } from '@aztec/aztec.js/account';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Aliased } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';
import { PXE, type PackedPrivateEvent } from '@aztec/pxe/server';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { NodeInfo } from '@aztec/stdlib/contract';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import {
  BlockHeader,
  ExecutionPayload,
  GlobalVariables,
  NestedProcessReturnValues,
  PrivateExecutionResult,
  TxEffect,
  TxHash,
  TxSimulationResult,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { BaseWallet } from './base_wallet.js';

class BasicWallet extends BaseWallet {
  mockAccount = mock<Account>();

  constructor(pxe: PXE, node: AztecNode) {
    super(pxe, node);
  }

  protected override getAccountFromAddress(_address: AztecAddress): Promise<Account> {
    return Promise.resolve(this.mockAccount);
  }

  override getAccounts(): Promise<Aliased<AztecAddress>[]> {
    throw new Error('Method not implemented.');
  }
}

async function makeFunctionCall(type: FunctionType, isStatic: boolean, name: string): Promise<FunctionCall> {
  return FunctionCall.from({
    name,
    to: await AztecAddress.random(),
    selector: FunctionSelector.random(),
    type,
    hideMsgSender: false,
    isStatic,
    args: [Fr.random()],
    returnTypes: [{ kind: 'field' as const }],
  });
}

describe('BaseWallet', () => {
  let pxe: MockProxy<PXE>;
  let node: MockProxy<AztecNode>;

  it('splits a mixed payload into optimized and entrypoint paths and merges results', async () => {
    pxe = mock<PXE>();
    node = mock<AztecNode>();
    const wallet = new BasicWallet(pxe, node);
    const from = await AztecAddress.random();

    // Mixed payload: 2 leading public static calls + 1 private call
    const balanceOf = await makeFunctionCall(FunctionType.PUBLIC, true, 'balanceOf');
    const totalSupply = await makeFunctionCall(FunctionType.PUBLIC, true, 'totalSupply');
    const transfer = await makeFunctionCall(FunctionType.PRIVATE, false, 'transfer');
    const payload = new ExecutionPayload([balanceOf, totalSupply, transfer], [], []);

    const optimizedRv0 = new NestedProcessReturnValues([new Fr(100)]);
    const optimizedRv1 = new NestedProcessReturnValues([new Fr(200)]);
    const normalRv0 = new NestedProcessReturnValues([new Fr(300)]);

    node.getCurrentMinFees.mockResolvedValue(new GasFees(2, 2));
    node.getNodeInfo.mockResolvedValue({ ...mock<NodeInfo>(), l1ChainId: 1, rollupVersion: 1 });
    pxe.getSyncedBlockHeader.mockResolvedValue(BlockHeader.empty());

    wallet.mockAccount.createTxExecutionRequest.mockResolvedValue(mock());

    // Mock node.simulatePublicCalls — called by simulateViaNode for the 2 optimized calls
    const optimizedPublicOutput = {
      revertReason: undefined,
      globalVariables: GlobalVariables.empty(),
      txEffect: TxEffect.empty(),
      publicReturnValues: [optimizedRv0, optimizedRv1],
      gasUsed: { totalGas: Gas.empty(), teardownGas: Gas.empty(), publicGas: Gas.empty(), billedGas: Gas.empty() },
    };
    node.simulatePublicCalls.mockResolvedValue(optimizedPublicOutput);

    // Mock pxe.simulateTx — called by simulateViaEntrypoint for the private call
    const normalPublicOutput = {
      revertReason: undefined,
      globalVariables: GlobalVariables.empty(),
      txEffect: TxEffect.empty(),
      publicReturnValues: [normalRv0],
      gasUsed: { totalGas: Gas.empty(), teardownGas: Gas.empty(), publicGas: Gas.empty(), billedGas: Gas.empty() },
    };
    const normalResult = new TxSimulationResult(
      mock<PrivateExecutionResult>(),
      mock<PrivateKernelTailCircuitPublicInputs>(),
      normalPublicOutput,
      undefined,
    );
    pxe.simulateTx.mockResolvedValue(normalResult);

    const result = await wallet.simulateTx(payload, { from });

    // Both paths should have been called
    expect(node.simulatePublicCalls).toHaveBeenCalled();
    expect(pxe.simulateTx).toHaveBeenCalled();

    // Return values should be merged in order: optimized first, then normal
    const rv = result.publicOutput!.publicReturnValues;
    expect(rv).toHaveLength(3);
    expect(rv[0]).toBe(optimizedRv0);
    expect(rv[1]).toBe(optimizedRv1);
    expect(rv[2]).toBe(normalRv0);
  });

  it('decodes private events', async () => {
    pxe = mock<PXE>();
    node = mock<AztecNode>();

    async function makeTransferEvent(amount: number): Promise<Transfer> {
      return {
        from: await AztecAddress.random(),
        to: await AztecAddress.random(),
        amount: BigInt(amount),
      };
    }

    function encodeTransfer(t: Transfer): Fr[] {
      return [(t.from as AztecAddress).toField(), (t.to as AztecAddress).toField(), new Fr(t.amount)];
    }

    function privateEventFor(serial: Fr[]): PackedPrivateEvent {
      return {
        packedEvent: serial,
        l2BlockHash: BlockHash.random(),
        l2BlockNumber: BlockNumber(42),
        txHash: TxHash.random(),
        eventSelector: TokenContract.events.Transfer.eventSelector,
      };
    }

    const transfer1 = await makeTransferEvent(120);
    const transfer2 = await makeTransferEvent(235);

    const packed1 = privateEventFor(encodeTransfer(transfer1));
    const packed2 = privateEventFor(encodeTransfer(transfer2));

    pxe.getPrivateEvents.mockResolvedValue([packed1, packed2]);

    const wallet = new BasicWallet(pxe, node);

    const events = await wallet.getPrivateEvents<Transfer>(TokenContract.events.Transfer, {
      contractAddress: await AztecAddress.random(),
      fromBlock: BlockNumber(42),
      toBlock: BlockNumber(43),
      scopes: [await AztecAddress.random()],
    });

    expect(events).toEqual([
      {
        event: transfer1,
        metadata: { l2BlockNumber: packed1.l2BlockNumber, l2BlockHash: packed1.l2BlockHash, txHash: packed1.txHash },
      },
      {
        event: transfer2,
        metadata: { l2BlockNumber: packed2.l2BlockNumber, l2BlockHash: packed2.l2BlockHash, txHash: packed2.txHash },
      },
    ]);
  });
});
