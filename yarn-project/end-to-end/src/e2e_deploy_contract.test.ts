import { AztecAddress, AztecRPCClient, ContractDeployer } from '@aztec/aztec.js';
import { createAztecNode } from '@aztec/aztec-node';
import { createAztecRPCServer } from '@aztec/aztec-rpc';
import abi from '@aztec/noir-contracts/examples/test_contract.json';

describe('e2e_deploy_contract', () => {
  let arc: AztecRPCClient;
  let accounts: AztecAddress[];

  beforeAll(async () => {
    const node = await createAztecNode();
    arc = await createAztecRPCServer({ node });
    await arc.addAccount();
    accounts = await arc.getAccounts();
  });

  it('should deploy a contract', async () => {
    const deployer = new ContractDeployer(abi, arc);
    const receipt = await deployer.deploy().send().getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        from: accounts[0],
        status: true,
      }),
    );

    const { contractAddress } = receipt;
    const constructor = abi.functions.find(f => f.name === 'constructor')!;
    const bytecode = await arc.getCode(contractAddress!);
    expect(bytecode).toEqual(constructor.bytecode);
  });
});
