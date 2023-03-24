import { createAztecRPCServer, EthAddress } from '@aztec/aztec.js';

const {
  ETHEREUM_HOST = 'http://localhost:8545',
  ROLLUP_ROLLUP_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  YEETER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
} = process.env;

export async function createTestAztecRPCClient(numberOfAccounts = 1) {
  const arc = await createAztecRPCServer({
    ethRpcUrl: ETHEREUM_HOST,
    rollupAddress: EthAddress.fromString(ROLLUP_ROLLUP_ADDRESS),
    yeeterAddress: EthAddress.fromString(YEETER_ADDRESS),
  });

  for (let i = 0; i < numberOfAccounts; ++i) {
    await arc.addAccount();
  }

  return arc;
}
