// docs:start:imports
import { BobTokenContract } from './artifacts/BobToken.js';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { TestWallet } from '@aztec/test-wallet/server';
import { openTmpStore } from '@aztec/kv-store/lmdb';
// docs:end:imports

// docs:start:get_balances
async function getBalances(contract: BobTokenContract, aliceAddress: AztecAddress, bobAddress: AztecAddress) {
    Promise.all([
        contract.methods
            .public_balance_of(aliceAddress)
            .simulate({ from: aliceAddress }),
        contract.methods
            .private_balance_of(aliceAddress)
            .simulate({ from: aliceAddress }),
        contract.methods
            .public_balance_of(bobAddress)
            .simulate({ from: bobAddress }),
        contract.methods
            .private_balance_of(bobAddress)
            .simulate({ from: bobAddress })
    ]).then(([alicePublicBalance, alicePrivateBalance, bobPublicBalance, bobPrivateBalance]) => {
        console.log(`📊 Alice has ${alicePublicBalance} public BOB tokens and ${alicePrivateBalance} private BOB tokens`);
        console.log(`📊 Bob's Clinic has ${bobPublicBalance} public BOB tokens and ${bobPrivateBalance} private BOB tokens`);
    });
}
// docs:end:get_balances

// docs:start:checkpoint_1
async function main() {
    // Connect to sandbox
    const node = createAztecNodeClient('http://localhost:8080');

    const store = await openTmpStore();

    const wallet = await TestWallet.create(node);

    const [giggleWalletData, aliceWalletData, bobClinicWalletData] = await getInitialTestAccountsData();
    const giggleAccount = await wallet.createSchnorrAccount(giggleWalletData.secret, giggleWalletData.salt);
    const aliceAccount = await wallet.createSchnorrAccount(aliceWalletData.secret, aliceWalletData.salt);
    const bobClinicAccount = await wallet.createSchnorrAccount(bobClinicWalletData.secret, bobClinicWalletData.salt);

    const giggleAddress = (await giggleAccount.getAccount()).getAddress();
    const aliceAddress = (await aliceAccount.getAccount()).getAddress();
    const bobClinicAddress = (await bobClinicAccount.getAccount()).getAddress();

    const bobToken = await BobTokenContract
        .deploy(
            wallet,
        )
        .send({ from: giggleAddress })
        .deployed();

    await bobToken.methods
        .mint_public(aliceAddress, 100n)
        .send({ from: giggleAddress })
        .wait();

    await bobToken.methods
        .transfer_public(bobClinicAddress, 10n)
        .send({ from: aliceAddress })
        .wait();
    // docs:end:checkpoint_1

    // docs:start:checkpoint_2
    await bobToken.methods
        .mint_public(aliceAddress, 100n)
        .send({ from: giggleAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .transfer_public(bobClinicAddress, 10n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .public_to_private(90n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .transfer_private(bobClinicAddress, 50n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .private_to_public(10n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .mint_private(aliceAddress, 100n)
        .send({ from: giggleAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);
}

main().catch(console.error);
// docs:end:checkpoint_2
