import { EthAddress } from '../eth_address/index.js';
import { EthereumRpc, TransactionReceipt, TxHash } from '../eth_rpc/index.js';
import { ContractAbi } from './abi/index.js';
import { Contract } from './contract.js';
import { SentContractTx } from './sent_contract_tx.js';

export class SentDeployContractTx extends SentContractTx {
  constructor(
    eth: EthereumRpc,
    contractAbi: ContractAbi,
    promise: Promise<TxHash>,
    private onDeployed: (address: EthAddress) => void,
  ) {
    super(eth, contractAbi, promise);
  }

  protected async handleReceipt(receipt: TransactionReceipt) {
    receipt = await super.handleReceipt(receipt);

    if (!receipt.contractAddress) {
      throw new Error('The contract deployment receipt did not contain a contract address.');
    }

    const code = await this.eth.getCode(receipt.contractAddress);
    if (code.length === 0) {
      throw new Error(`Contract code could not be stored at ${receipt.contractAddress}.`);
    }

    this.onDeployed(receipt.contractAddress);

    return receipt;
  }

  public async getContract() {
    const receipt = await this.getReceipt();
    return new Contract(this.eth, this.contractAbi, receipt.contractAddress);
  }
}
