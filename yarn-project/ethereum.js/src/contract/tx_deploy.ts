import { EthAddress } from '../eth_address/index.js';
import { EthereumRpc, SendTx } from '../eth_rpc/index.js';
import { ContractAbi, ContractFunctionEntry } from './abi/index.js';
import { SentDeployContractTx } from './sent_deploy_contract_tx.js';
import { Options, SendOptions, Tx } from './tx.js';

export class TxDeploy extends Tx {
  constructor(
    eth: EthereumRpc,
    contractEntry: ContractFunctionEntry,
    contractAbi: ContractAbi,
    private deployData: Buffer,
    args: any[] = [],
    defaultOptions: Options = {},
    private onDeployed: (address: EthAddress) => void = x => x,
  ) {
    super(eth, contractEntry, contractAbi, undefined, args, defaultOptions);
  }

  public send(options: SendOptions): SendTx {
    const sentTx = super.send(options);
    return new SentDeployContractTx(this.eth, this.contractAbi, sentTx.getTxHash(), this.onDeployed);
  }

  public encodeABI() {
    return Buffer.concat([this.deployData, this.contractEntry.encodeParameters(this.args)]);
  }
}
