import { AztecAddress } from '../circuits.js';
import { ContractAbi } from '../noir.js';
import { contractAbiToContractDao, ContractDao } from './contract_dao.js';
import { ContractDataSource } from './contract_data_source.js';

export class MemoryContractDataSource implements ContractDataSource {
  private contracts: ContractDao[] = [];

  public addContract(address: AztecAddress, abi: ContractAbi, deployed = false) {
    this.contracts.push(contractAbiToContractDao(address, abi, deployed));
    return Promise.resolve();
  }

  public getContract(address: AztecAddress) {
    return Promise.resolve(this.contracts.find(c => c.address.equals(address)));
  }

  public async getCode(contractAddress: AztecAddress, functionSelector: Buffer) {
    const contract = await this.getContract(contractAddress);
    return contract?.functions.find(f => f.selector.equals(functionSelector))?.bytecode;
  }
}
