import { BoxReactContract } from '../artifacts/BoxReact.js';
import { AccountWallet, Fr, Contract, TxStatus, createDebugLogger, ContractDeployer } from '@aztec/aztec.js';
import { deployerEnv } from '../src/config.js';

const logger = createDebugLogger('aztec:http-pxe-client');

describe('BoxReact Contract Tests', () => {
  let wallet: AccountWallet;
  let contract: Contract;
  const { artifact } = BoxReactContract;
  const numberToSet = Fr.random();

  test('Can deploy a contract', async () => {
    wallet = await deployerEnv.getWallet();
    const pxe = deployerEnv.pxe;
    const deployer = new ContractDeployer(artifact, wallet);
    const salt = Fr.random();
    const { address: contractAddress } = await deployer
      .deploy(Fr.random(), wallet.getCompleteAddress().address)
      .send({ contractAddressSalt: salt })
      .deployed();
    contract = await BoxReactContract.at(contractAddress!, wallet);

    logger(`L2 contract deployed at ${contractAddress}`);
  }, 60000);
});
