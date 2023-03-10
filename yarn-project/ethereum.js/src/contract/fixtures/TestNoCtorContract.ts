/* eslint-disable */
// @ts-nocheck
import { EthAddress } from '../../eth_address/index.js';
import { EthereumRpc, EventLog, TransactionReceipt } from '../../eth_rpc/index.js';
import { Contract, Options, TxCall, TxSend } from '../../contract/index.js';
import * as Bytes from '../../contract/bytes.js';
import abi from './TestNoCtorContractAbi.js';
interface TestNoCtorContractEvents {}
interface TestNoCtorContractEventLogs {}
interface TestNoCtorContractTxEventLogs {}
export type TestNoCtorContractTransactionReceipt = TransactionReceipt<TestNoCtorContractTxEventLogs>;
interface TestNoCtorContractMethods {
  addStruct(nestedStruct: { status: boolean }): TxSend<TestNoCtorContractTransactionReceipt>;
}
export interface TestNoCtorContractDefinition {
  methods: TestNoCtorContractMethods;
  events: TestNoCtorContractEvents;
  eventLogs: TestNoCtorContractEventLogs;
}
export class TestNoCtorContract extends Contract<TestNoCtorContractDefinition> {
  constructor(eth: EthereumRpc, address?: EthAddress, options?: Options) {
    super(eth, abi, address, options);
  }
  deploy(): TxSend<TestNoCtorContractTransactionReceipt> {
    return super.deployBytecode('0x01234567') as any;
  }
}
export var TestNoCtorContractAbi = abi;
