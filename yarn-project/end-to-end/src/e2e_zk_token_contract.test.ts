import { AztecAddress, AztecRPCClient, Contract, ContractDeployer } from '@aztec/aztec.js';
import abi from '@aztec/noir-contracts/examples/zk_token_contract.json';
import { createTestAztecRPCClient } from './create_aztec_rpc_client.js';

describe('e2e_zk_token', () => {
  let arc: AztecRPCClient;
  let accounts: AztecAddress[];
  let contract: Contract;
  const initialBalance = 987n;
  const mintAmount = 65n;

  const expectBalance = async (accountIdx: number, expectedBalance: bigint) => {
    const balance = await contract.methods.getBalance().call({ from: accounts[accountIdx] });
    console.log(`Account ${accountIdx} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  beforeAll(async () => {
    arc = await createTestAztecRPCClient(2);
    accounts = await arc.getAccounts();

    const deployer = new ContractDeployer(abi, arc);
    const receipt = await deployer.deploy(initialBalance).send().getReceipt();
    const contractAddress = receipt.contractAddress!;
    contract = new Contract(contractAddress, abi, arc);
  });

  it('should call mint and increase account balance', async () => {
    await expectBalance(0, initialBalance);
    await expectBalance(1, 0n);

    const receipt = await contract.methods.mint(mintAmount).send({ from: accounts[1] }).getReceipt();
    expect(receipt.status).toBe(true);

    await expectBalance(0, initialBalance);
    await expectBalance(1, mintAmount);
  });
});
