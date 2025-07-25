/* eslint-disable import/no-duplicates */
// docs:start:create_account_imports
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { Fr, GrumpkinScalar, createPXEClient } from '@aztec/aztec.js';
// docs:end:create_account_imports
// docs:start:import_contract
import { Contract } from '@aztec/aztec.js';
// docs:end:import_contract
// docs:start:import_token_contract
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

// docs:end:import_token_contract

describe('docs_examples', () => {
  it('deploys and interacts with a token contract', async () => {
    // docs:start:full_deploy
    // docs:start:define_account_vars
    const PXE_URL = process.env.PXE_URL || 'http://localhost:8080';
    const pxe = createPXEClient(PXE_URL);
    const secretKey = Fr.random();
    const signingPrivateKey = GrumpkinScalar.random();
    // docs:end:define_account_vars

    // docs:start:create_wallet
    // Use a pre-funded wallet to pay for the fees for the deployments.
    const wallet = (await getDeployedTestAccountsWallets(pxe))[0];
    const newAccount = await getSchnorrAccount(pxe, secretKey, signingPrivateKey);
    await newAccount.deploy({ deployWallet: wallet }).wait();
    const newWallet = await newAccount.getWallet();
    // docs:end:create_wallet

    const deployedContract = await TokenContract.deploy(
      wallet, // wallet instance
      wallet.getAddress(), // account
      'TokenName', // constructor arg1
      'TokenSymbol', // constructor arg2
      18,
    )
      .send()
      .deployed();

    // docs:start:get_contract
    const contract = await Contract.at(deployedContract.address, TokenContractArtifact, wallet);
    // docs:end:get_contract
    // docs:end:full_deploy

    // docs:start:send_transaction
    const _tx = await contract.methods.mint_to_public(newWallet.getAddress(), 1).send().wait();
    // docs:end:send_transaction

    // docs:start:simulate_function
    const balance = await contract.methods.balance_of_public(newWallet.getAddress()).simulate();
    expect(balance).toEqual(1n);
    // docs:end:simulate_function
  });
});
