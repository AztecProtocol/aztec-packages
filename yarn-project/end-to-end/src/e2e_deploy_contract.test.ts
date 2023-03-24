import { AztecAddress, AztecRPCClient, ContractDeployer, Fr } from '@aztec/aztec.js';
import abi from '@aztec/noir-contracts/examples/test_contract.json';
import { createTestAztecRPCClient } from './create_aztec_rpc_client.js';

describe('e2e_deploy_contract', () => {
  let arc: AztecRPCClient;
  let accounts: AztecAddress[];

  beforeAll(async () => {
    arc = await createTestAztecRPCClient(1);
    accounts = await arc.getAccounts();
  });

  it('should deploy a contract', async () => {
    const deployer = new ContractDeployer(abi, arc);
    const receipt = await deployer.deploy().send().getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        from: accounts[0],
        to: undefined,
        status: true,
        error: '',
      }),
    );

    const contractAddress = receipt.contractAddress!;
    const constructor = abi.functions.find(f => f.name === 'constructor')!;
    const bytecode = await arc.getCode(contractAddress);
    expect(bytecode).toEqual(constructor.bytecode);
  });

  it('should not deploy a contract with the same salt twice', async () => {
    const contractAddressSalt = Fr.random();
    const deployer = new ContractDeployer(abi, arc, { contractAddressSalt });

    {
      const receipt = await deployer.deploy().send().getReceipt();
      expect(receipt.status).toBe(true);
      expect(receipt.error).toBe('');
    }

    {
      const receipt = await deployer.deploy().send().getReceipt();
      expect(receipt.status).toBe(false);
      expect(receipt.error).not.toBe('');
    }
  });
});
