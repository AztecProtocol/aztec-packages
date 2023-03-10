/* eslint-disable */
// @ts-nocheck
import { EthAddress } from '../../eth_address/index.js';
import { EthereumRpc, EventLog, TransactionReceipt } from '../../eth_rpc/index.js';
import { Contract, Options, TxCall, TxSend } from '../../contract/index.js';
import * as Bytes from '../../contract/bytes.js';
import abi from './TestContractAbi.js';
export type ChangedEvent = {
  from: EthAddress;
  amount: bigint;
  t1: bigint;
  t2: bigint;
};
export type UnchangedEvent = {
  value: bigint;
  addressFrom: EthAddress;
  t1: bigint;
};
export type ChangedEventLog = EventLog<ChangedEvent, 'Changed'>;
export type UnchangedEventLog = EventLog<UnchangedEvent, 'Unchanged'>;
interface TestContractEvents {
  Changed: ChangedEvent;
  Unchanged: UnchangedEvent;
}
interface TestContractEventLogs {
  Changed: ChangedEventLog;
  Unchanged: UnchangedEventLog;
}
interface TestContractTxEventLogs {
  Changed: ChangedEventLog[];
  Unchanged: UnchangedEventLog[];
}
export type TestContractTransactionReceipt = TransactionReceipt<TestContractTxEventLogs>;
interface TestContractMethods {
  addStruct(nestedStruct: { status: boolean }): TxSend<TestContractTransactionReceipt>;
  listOfNestedStructs(a0: EthAddress): TxCall<{
    status: boolean;
  }>;
  balance(who: EthAddress): TxCall<bigint>;
  hasALotOfParams(
    _var1: number,
    _var2: string,
    _var3: Bytes.Bytes32[],
  ): TxSend<TestContractTransactionReceipt, EthAddress>;
  getStr(): TxCall<string>;
  owner(): TxCall<EthAddress>;
  mySend(to: EthAddress, value: bigint): TxSend<TestContractTransactionReceipt>;
  myDisallowedSend(to: EthAddress, value: bigint): TxSend<TestContractTransactionReceipt>;
  testArr(value: bigint[]): TxCall<bigint>;
  overloadedFunction(a: bigint): TxCall<bigint>;
  overloadedFunction(): TxCall<bigint>;
}
export interface TestContractDefinition {
  methods: TestContractMethods;
  events: TestContractEvents;
  eventLogs: TestContractEventLogs;
}
export class TestContract extends Contract<TestContractDefinition> {
  constructor(eth: EthereumRpc, address?: EthAddress, options?: Options) {
    super(eth, abi, address, options);
  }
  deploy(who: EthAddress, myValue: bigint): TxSend<TestContractTransactionReceipt> {
    return super.deployBytecode('0x01234567', who, myValue) as any;
  }
}
export var TestContractAbi = abi;
