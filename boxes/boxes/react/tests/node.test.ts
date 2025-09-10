import { AztecAddress, Contract, Fr, Wallet, createLogger } from '@aztec/aztec.js';
import { BoxReactContract } from '../artifacts/BoxReact.js';
import { deployerEnv } from '../src/config.js';

const logger = createLogger('aztec:http-pxe-client');

describe('BoxReact Contract Tests', () => {
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let contract: Contract;
  const numberToSet = Fr.random();

  beforeAll(async () => {
    wallet = await deployerEnv.getWallet();
    defaultAccountAddress = deployerEnv.getDefaultAccountAddress();
    const salt = Fr.random();

    contract = await BoxReactContract.deploy(wallet, Fr.random(), defaultAccountAddress)
      .send({ from: defaultAccountAddress, contractAddressSalt: salt })
      .deployed();

    logger.info(`L2 contract deployed at ${contract.address}`);
  }, 60000);

  test('Can set a number', async () => {
    await contract.methods.setNumber(numberToSet, defaultAccountAddress).send({ from: defaultAccountAddress }).wait();
  }, 40000);

  test('Can read a number', async () => {
    const viewTxReceipt = await contract.methods
      .getNumber(defaultAccountAddress)
      .simulate({ from: defaultAccountAddress });
    expect(numberToSet.toBigInt()).toEqual(viewTxReceipt.value);
  }, 40000);
});
