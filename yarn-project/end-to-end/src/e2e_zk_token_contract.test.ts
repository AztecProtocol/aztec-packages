import { AztecAddress, AztecRPCClient, Contract, ContractDeployer } from '@aztec/aztec.js';
import abi from '@aztec/noir-contracts/examples/zk_token_contract.json';
import { createTestAztecRPCClient } from './create_aztec_rpc_client.js';

describe('e2e_zk_token', () => {
  let arc: AztecRPCClient;
  let accounts: AztecAddress[];
  let contract: Contract;

  const expectBalance = async (accountIdx: number, expectedBalance: bigint) => {
    const balance = await contract.methods.getBalance().call({ from: accounts[accountIdx] });
    console.log(`Account ${accountIdx} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const deployContract = async (initialBalance = 0n) => {
    const deployer = new ContractDeployer(abi, arc);
    return await deployer.deploy(initialBalance).send().getContract();
  };

  beforeEach(async () => {
    arc = await createTestAztecRPCClient(2);
    accounts = await arc.getAccounts();
  });

  it('should deploy zk token contract with initial token minted to the account', async () => {
    const initialBalance = 987n;
    await deployContract(initialBalance);
    await expectBalance(0, initialBalance);
    await expectBalance(1, 0n);
  });

  it('should call mint and increase balance', async () => {
    const mintAmount = 65n;

    await deployContract();

    await expectBalance(0, 0n);
    await expectBalance(1, 0n);

    const receipt = await contract.methods.mint(mintAmount).send({ from: accounts[1] }).getReceipt();
    expect(receipt.status).toBe(true);

    await expectBalance(0, 0n);
    await expectBalance(1, mintAmount);
  });

  it('should call transfer and increase balance of another account', async () => {
    const initialBalance = 987n;
    const transferAmount = 654n;

    await deployContract(initialBalance);

    await expectBalance(0, initialBalance);
    await expectBalance(1, 0n);

    const receipt = await contract.methods.transfer(accounts[1]).send({ from: accounts[0] }).getReceipt();
    expect(receipt.status).toBe(true);

    await expectBalance(0, initialBalance - transferAmount);
    await expectBalance(1, transferAmount);
  });
});
