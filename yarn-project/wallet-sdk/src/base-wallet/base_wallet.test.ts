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
  OFFCHAIN_MESSAGE_IDENTIFIER,
  type OffchainEffect,
  PrivateExecutionResult,
  Tx,
  TxEffect,
  TxHash,
  TxProvingResult,
  TxSimulationResult,
  UtilityExecutionResult,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { BaseWallet } from './base_wallet.js';

class BasicWallet extends BaseWallet {
  mockAccount = mock<Account>();
  registeredAccounts: Aliased<AztecAddress>[] = [];

  constructor(pxe: PXE, node: AztecNode) {
    super(pxe, node);
  }

  protected override getAccountFromAddress(_address: AztecAddress): Promise<Account> {
    return Promise.resolve(this.mockAccount);
  }

  override getAccounts(): Promise<Aliased<AztecAddress>[]> {
    return Promise.resolve(this.registeredAccounts);
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
      debugLogs: [],
    };
    node.simulatePublicCalls.mockResolvedValue(optimizedPublicOutput);

    // Mock pxe.simulateTx — called by simulateViaEntrypoint for the private call
    const normalPublicOutput = {
      revertReason: undefined,
      globalVariables: GlobalVariables.empty(),
      txEffect: TxEffect.empty(),
      publicReturnValues: [normalRv0],
      gasUsed: { totalGas: Gas.empty(), teardownGas: Gas.empty(), publicGas: Gas.empty(), billedGas: Gas.empty() },
      debugLogs: [],
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

  describe('offchain message self-delivery', () => {
    /** Helper: builds an offchain effect with OFFCHAIN_MESSAGE_IDENTIFIER prefix. */
    function makeOffchainEffect(recipient: AztecAddress, contractAddress: AztecAddress): OffchainEffect {
      return {
        data: [OFFCHAIN_MESSAGE_IDENTIFIER, recipient.toField(), Fr.random(), Fr.random()],
        contractAddress,
      };
    }

    /** Returns the real offchain_receive ABI from the Token contract artifact. */
    function getOffchainReceiveAbi() {
      const abi = TokenContract.artifact.functions.find(f => f.name === 'offchain_receive');
      if (!abi) {
        throw new Error('Token contract artifact has no offchain_receive function');
      }
      return abi;
    }

    /** Helper: sets up the full sendTx mock chain and returns the proven tx mock. */
    function setupSendTxMocks(
      pxe: MockProxy<PXE>,
      node: MockProxy<AztecNode>,
      wallet: BasicWallet,
      offchainEffects: OffchainEffect[],
      anchorBlockTimestamp = 55555n,
    ) {
      const provenTx = mock<TxProvingResult>();
      provenTx.getOffchainEffects.mockReturnValue(offchainEffects);
      Object.defineProperty(provenTx, 'publicInputs', {
        value: {
          constants: { anchorBlockHeader: { globalVariables: { timestamp: anchorBlockTimestamp } } },
        },
      });

      const mockTx = mock<Tx>();
      mockTx.getTxHash.mockReturnValue(TxHash.random());
      provenTx.toTx.mockResolvedValue(mockTx);

      node.getCurrentMinFees.mockResolvedValue(new GasFees(2, 2));
      node.getNodeInfo.mockResolvedValue({ ...mock<NodeInfo>(), l1ChainId: 1, rollupVersion: 1 });
      pxe.getSyncedBlockHeader.mockResolvedValue(BlockHeader.empty());
      wallet.mockAccount.createTxExecutionRequest.mockResolvedValue(mock());
      pxe.proveTx.mockResolvedValue(provenTx);
      node.getTxEffect.mockResolvedValue(undefined);
      node.sendTx.mockResolvedValue();

      return provenTx;
    }

    it('self-delivers offchain messages to registered accounts on sendTx', async () => {
      pxe = mock<PXE>();
      node = mock<AztecNode>();
      const wallet = new BasicWallet(pxe, node);
      const alice = await AztecAddress.random();
      const contractAddr = await AztecAddress.random();

      wallet.registeredAccounts = [{ alias: 'alice', item: alice }];

      const offchainEffects = [makeOffchainEffect(alice, contractAddr)];
      setupSendTxMocks(pxe, node, wallet, offchainEffects);

      // Mock contract artifact lookup with offchain_receive
      pxe.getContractInstance.mockResolvedValue({ currentContractClassId: Fr.random() } as any);
      pxe.getContractArtifact.mockResolvedValue({ functions: [getOffchainReceiveAbi()] } as any);
      pxe.executeUtility.mockResolvedValue(new UtilityExecutionResult([], [], 0n));

      const payload = new ExecutionPayload([await makeFunctionCall(FunctionType.PRIVATE, false, 'transfer')], [], []);
      await wallet.sendTx(payload, { from: alice, wait: 'NO_WAIT' });

      // executeUtility should have been called for self-delivery
      expect(pxe.executeUtility).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'offchain_receive' }),
        expect.objectContaining({ scopes: [alice] }),
      );
    });

    it('does not self-deliver when no registered accounts match', async () => {
      pxe = mock<PXE>();
      node = mock<AztecNode>();
      const wallet = new BasicWallet(pxe, node);
      const alice = await AztecAddress.random();
      const bob = await AztecAddress.random();
      const contractAddr = await AztecAddress.random();

      // Only alice is registered, but the message is for bob
      wallet.registeredAccounts = [{ alias: 'alice', item: alice }];

      const offchainEffects = [makeOffchainEffect(bob, contractAddr)];
      setupSendTxMocks(pxe, node, wallet, offchainEffects);

      const payload = new ExecutionPayload([await makeFunctionCall(FunctionType.PRIVATE, false, 'transfer')], [], []);
      await wallet.sendTx(payload, { from: alice, wait: 'NO_WAIT' });

      // executeUtility should NOT have been called (no self-delivery needed)
      expect(pxe.executeUtility).not.toHaveBeenCalled();
    });

    it('self-delivers offchain messages from executeUtility', async () => {
      pxe = mock<PXE>();
      node = mock<AztecNode>();
      const wallet = new BasicWallet(pxe, node);
      const alice = await AztecAddress.random();
      const contractAddr = await AztecAddress.random();

      wallet.registeredAccounts = [{ alias: 'alice', item: alice }];

      const offchainEffects = [makeOffchainEffect(alice, contractAddr)];

      // First call: the original utility execution returns offchain effects
      const firstResult = new UtilityExecutionResult([], offchainEffects, 55555n);
      // Second call: the self-delivery offchain_receive
      const secondResult = new UtilityExecutionResult([], [], 0n);
      pxe.executeUtility.mockResolvedValueOnce(firstResult).mockResolvedValueOnce(secondResult);

      pxe.getContractInstance.mockResolvedValue({ currentContractClassId: Fr.random() } as any);
      pxe.getContractArtifact.mockResolvedValue({ functions: [getOffchainReceiveAbi()] } as any);

      const call = FunctionCall.from({
        name: 'some_utility',
        to: contractAddr,
        selector: FunctionSelector.random(),
        type: FunctionType.UTILITY,
        hideMsgSender: false,
        isStatic: false,
        args: [],
        returnTypes: [],
      });

      await wallet.executeUtility(call, { scope: alice });

      // executeUtility should have been called twice: original + self-delivery
      expect(pxe.executeUtility).toHaveBeenCalledTimes(2);
      expect(pxe.executeUtility).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'offchain_receive' }),
        expect.objectContaining({ scopes: [alice] }),
      );
    });

    it('does not recurse when executeUtility is called for offchain_receive', async () => {
      pxe = mock<PXE>();
      node = mock<AztecNode>();
      const wallet = new BasicWallet(pxe, node);
      const alice = await AztecAddress.random();
      const contractAddr = await AztecAddress.random();

      wallet.registeredAccounts = [{ alias: 'alice', item: alice }];

      // Even if offchain_receive returns offchain effects, we should not recurse
      const offchainEffects = [makeOffchainEffect(alice, contractAddr)];
      const result = new UtilityExecutionResult([], offchainEffects, 55555n);
      pxe.executeUtility.mockResolvedValue(result);

      const call = FunctionCall.from({
        name: 'offchain_receive',
        to: contractAddr,
        selector: FunctionSelector.random(),
        type: FunctionType.UTILITY,
        hideMsgSender: false,
        isStatic: false,
        args: [],
        returnTypes: [],
      });

      await wallet.executeUtility(call, { scope: alice });

      // Should only be called once — no recursive self-delivery
      expect(pxe.executeUtility).toHaveBeenCalledTimes(1);
    });
  });

  it('should extract offchain messages with anchor block timestamp on sendTx', async () => {
    pxe = mock<PXE>();
    node = mock<AztecNode>();
    const wallet = new BasicWallet(pxe, node);
    const from = await AztecAddress.random();

    const recipient = await AztecAddress.random();
    const contractAddress = await AztecAddress.random();
    const msgPayload = [Fr.random(), Fr.random()];
    const anchorBlockTimestamp = 55555n;

    const offchainEffects: OffchainEffect[] = [
      {
        data: [OFFCHAIN_MESSAGE_IDENTIFIER, recipient.toField(), ...msgPayload],
        contractAddress,
      },
    ];

    // Mock the proven tx returned by pxe.proveTx
    const provenTx = mock<TxProvingResult>();
    provenTx.getOffchainEffects.mockReturnValue(offchainEffects);
    Object.defineProperty(provenTx, 'publicInputs', {
      value: {
        constants: { anchorBlockHeader: { globalVariables: { timestamp: anchorBlockTimestamp } } },
      },
    });

    const mockTx = mock<Tx>();
    mockTx.getTxHash.mockReturnValue(TxHash.random());
    provenTx.toTx.mockResolvedValue(mockTx);

    // Mock dependencies for completeFeeOptions and createTxExecutionRequestFromPayloadAndFee
    node.getCurrentMinFees.mockResolvedValue(new GasFees(2, 2));
    node.getNodeInfo.mockResolvedValue({ ...mock<NodeInfo>(), l1ChainId: 1, rollupVersion: 1 });
    pxe.getSyncedBlockHeader.mockResolvedValue(BlockHeader.empty());
    wallet.mockAccount.createTxExecutionRequest.mockResolvedValue(mock());
    pxe.proveTx.mockResolvedValue(provenTx);
    node.getTxEffect.mockResolvedValue(undefined);
    node.sendTx.mockResolvedValue();

    const payload = new ExecutionPayload([await makeFunctionCall(FunctionType.PRIVATE, false, 'transfer')], [], []);

    const result = await wallet.sendTx(payload, { from, wait: 'NO_WAIT' });

    expect(result.offchainMessages).toHaveLength(1);
    expect(result.offchainMessages[0]).toEqual({
      recipient,
      payload: msgPayload,
      contractAddress,
      anchorBlockTimestamp,
    });
    expect(result.offchainEffects).toEqual([]);
  });
});
