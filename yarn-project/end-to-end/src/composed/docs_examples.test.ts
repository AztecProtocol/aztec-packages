/* eslint-disable import/no-duplicates */
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { Fr, GrumpkinScalar, createAztecNodeClient } from '@aztec/aztec.js';
import { Contract } from '@aztec/aztec.js';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { TestWallet } from '@aztec/test-wallet/server';

// To run these tests against a local sandbox:
// 1. Start a local Ethereum node (Anvil):
//    anvil --host 127.0.0.1 --port 8545
//
// 2. Start the Aztec sandbox:
//    cd yarn-project/aztec
//    NODE_NO_WARNINGS=1 ETHEREUM_HOSTS=http://127.0.0.1:8545 node ./dest/bin/index.js start --sandbox
//
// 3. Run the tests:
//    yarn test:e2e docs_examples.test.ts
describe('docs_examples', () => {
  it('deploys and interacts with a token contract', async () => {
    const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
    const node = createAztecNodeClient(AZTEC_NODE_URL);

    const wallet = await TestWallet.create(node);
    const secretKey = Fr.random();
    const signingPrivateKey = GrumpkinScalar.random();

    // Use a pre-funded wallet to pay for the fees for the deployments.
    const [accountData] = await getInitialTestAccountsData();
    const prefundedAccount = await wallet.createSchnorrAccount(accountData.secret, accountData.salt);
    const newAccountManager = await wallet.createSchnorrAccount(secretKey, Fr.random(), signingPrivateKey);
    const newAccountDeployMethod = await newAccountManager.getDeployMethod();
    await newAccountDeployMethod.send({ from: prefundedAccount.address }).wait();
    const newAccountAddress = newAccountManager.address;
    const defaultAccountAddress = prefundedAccount.address;

    const deployedContract = await TokenContract.deploy(
      wallet, // wallet instance
      defaultAccountAddress, // account
      'TokenName', // constructor arg1
      'TokenSymbol', // constructor arg2
      18,
    )
      .send({ from: defaultAccountAddress })
      .deployed();

    const contract = await Contract.at(deployedContract.address, TokenContractArtifact, wallet);

    await contract.methods.mint_to_public(newAccountAddress, 1).send({ from: defaultAccountAddress }).wait();

    // docs:start:simulate_function
    const balance = await contract.methods.balance_of_public(newAccountAddress).simulate({ from: newAccountAddress });
    expect(balance).toEqual(1n);
    // docs:end:simulate_function
  });
});
