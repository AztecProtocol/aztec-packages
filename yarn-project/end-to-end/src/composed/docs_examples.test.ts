/* eslint-disable import/no-duplicates */
// docs:start:create_account_imports
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { Fr, GrumpkinScalar, createAztecNodeClient } from '@aztec/aztec.js';
// docs:end:create_account_imports
// docs:start:import_contract
import { Contract } from '@aztec/aztec.js';
// docs:end:import_contract
// docs:start:import_token_contract
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { TestWallet } from '@aztec/test-wallet/server';

// docs:end:import_token_contract

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
    // docs:start:full_deploy
    // docs:start:define_account_vars
    const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
    const node = createAztecNodeClient(AZTEC_NODE_URL);

    const wallet = await TestWallet.create(node);
    const secretKey = Fr.random();
    const signingPrivateKey = GrumpkinScalar.random();
    // docs:end:define_account_vars

    // docs:start:create_wallet
    // Use a pre-funded wallet to pay for the fees for the deployments.
    const [accountData] = await getInitialTestAccountsData();
    const prefundedAccount = await wallet.createSchnorrAccount(accountData.secret, accountData.salt);
    const newAccount = await wallet.createSchnorrAccount(secretKey, Fr.random(), signingPrivateKey);
    await newAccount.deploy({ deployAccount: prefundedAccount.getAddress() }).wait();
    const newAccountAddress = newAccount.getAddress();
    const defaultAccountAddress = prefundedAccount.getAddress();
    // docs:end:create_wallet

    const deployedContract = await TokenContract.deploy(
      wallet, // wallet instance
      defaultAccountAddress, // account
      'TokenName', // constructor arg1
      'TokenSymbol', // constructor arg2
      18,
    )
      .send({ from: defaultAccountAddress })
      .deployed();

    // docs:start:get_contract
    const contract = await Contract.at(deployedContract.address, TokenContractArtifact, wallet);
    // docs:end:get_contract
    // docs:end:full_deploy

    // docs:start:send_transaction
    await contract.methods.mint_to_public(newAccountAddress, 1).send({ from: defaultAccountAddress }).wait();
    // docs:end:send_transaction

    // docs:start:simulate_function
    const balance = await contract.methods.balance_of_public(newAccountAddress).simulate({ from: newAccountAddress });
    expect(balance).toEqual(1n);
    // docs:end:simulate_function
  });
});
