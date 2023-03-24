import { AztecAddress, AztecRPCClient, ContractDeployer } from '@aztec/aztec.js';
import { createAztecRPCServer, EthAddress } from '@aztec/aztec-rpc';
import abi from '@aztec/noir-contracts/examples/test_contract.json';

const {
  ETHEREUM_HOST = 'http://localhost:8545',
  ROLLUP_ROLLUP_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  YEETER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
} = process.env;

describe('e2e_deploy_contract', () => {
  let arc: AztecRPCClient;
  let accounts: AztecAddress[];

  beforeAll(async () => {
    arc = await createAztecRPCServer({
      rpcUrl: ETHEREUM_HOST,
      rollupAddress: EthAddress.fromString(ROLLUP_ROLLUP_ADDRESS),
      yeeterAddress: EthAddress.fromString(YEETER_ADDRESS),
    });
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
