import { AztecAddress, AztecRPCClient, ContractDeployer } from '@aztec/aztec.js';
import abi from '@aztec/noir-contracts/examples/zk_token_contract.json';
import { createTestAztecRPCClient } from './create_aztec_rpc_client.js';

describe('e2e_zk_token', () => {
  let arc: AztecRPCClient;
  let account: AztecAddress;

  beforeEach(async () => {
    arc = await createTestAztecRPCClient();
    [account] = await arc.getAccounts();
  });

  it('should deploy zk token contract with initial token minted to the account', async () => {
    const initialBalance = 987n;

    const deployer = new ContractDeployer(abi, arc);
    const contract = await deployer.deploy(initialBalance).send().getContract();

    const balance = await contract.methods.getBalance(account);
    expect(balance).toBe(initialBalance);
  });
});
