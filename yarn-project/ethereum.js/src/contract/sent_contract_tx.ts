import { EthereumRpc, TransactionReceipt, TxHash } from '../eth_rpc/index.js';
import { SentTransaction } from '../eth_rpc/send_tx.js';
import { ContractAbi } from './abi/contract_abi.js';

export class SentContractTx extends SentTransaction {
  constructor(eth: EthereumRpc, protected contractAbi: ContractAbi, promise: Promise<TxHash>) {
    super(eth, promise);
  }

  protected async handleReceipt(receipt: TransactionReceipt) {
    receipt = await super.handleReceipt(receipt);
    const { logs, to, contractAddress = to! } = receipt;

    if (!Array.isArray(logs)) {
      return receipt;
    }

    const isAnonymous = log => !log.address.equals(contractAddress) || !this.contractAbi.findEntryForLog(log);

    const anonymousLogs = logs.filter(isAnonymous);

    const events = logs.reduce((a, log) => {
      if (isAnonymous(log)) {
        return a;
      }
      const ev = this.contractAbi.decodeEvent(log);
      a[ev.event] = a[ev.event] || [];
      a[ev.event].push(ev);
      return a;
    }, {});

    delete receipt.logs;

    return { ...receipt, anonymousLogs, events };
  }
}
