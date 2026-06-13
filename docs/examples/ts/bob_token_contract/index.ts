// docs:start:imports
import { BobTokenContract } from "./artifacts/BobToken.js";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
// docs:end:imports

// docs:start:get_balances
async function getBalances(
  contract: BobTokenContract,
  aliceAddress: AztecAddress,
  bobAddress: AztecAddress,
) {
  await Promise.all([
    contract.methods
      .public_balance_of(aliceAddress)
      .simulate({ from: aliceAddress })
      .then(({ result }) => result),
    contract.methods
      .private_balance_of(aliceAddress)
      .simulate({ from: aliceAddress })
      .then(({ result }) => result),
    contract.methods
      .public_balance_of(bobAddress)
      .simulate({ from: bobAddress })
      .then(({ result }) => result),
    contract.methods
      .private_balance_of(bobAddress)
      .simulate({ from: bobAddress })
      .then(({ result }) => result),
  ]).then(
    ([
      alicePublicBalance,
      alicePrivateBalance,
      bobPublicBalance,
      bobPrivateBalance,
    ]) => {
      console.log(
        `📊 Alice has ${alicePublicBalance} public BOB tokens and ${alicePrivateBalance} private BOB tokens`,
      );
      console.log(
        `📊 Bob's Clinic has ${bobPublicBalance} public BOB tokens and ${bobPrivateBalance} private BOB tokens`,
      );
    },
  );
}
// docs:end:get_balances

// docs:start:checkpoint_1
async function main() {
  // Connect to local network
  const node = createAztecNodeClient("http://localhost:8080");

  // `ephemeral: true` keeps PXE state in memory, so restarting the local
  // network won't leave this script pointing at stale block hashes.
  const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

  const [giggleWalletData, aliceWalletData, bobClinicWalletData] =
    await getInitialTestAccountsData();
  const giggleAccountManager = await wallet.createSchnorrInitializerlessAccount(
    giggleWalletData.secret,
    giggleWalletData.salt,
  );
  const aliceAccountManager = await wallet.createSchnorrInitializerlessAccount(
    aliceWalletData.secret,
    aliceWalletData.salt,
  );
  const bobClinicAccountManager =
    await wallet.createSchnorrInitializerlessAccount(
      bobClinicWalletData.secret,
      bobClinicWalletData.salt,
    );

  const giggleAddress = giggleAccountManager.address;
  const aliceAddress = aliceAccountManager.address;
  const bobClinicAddress = bobClinicAccountManager.address;

  const { contract: bobToken } = await BobTokenContract.deploy(wallet).send({
    from: giggleAddress,
  });

  await bobToken.methods
    .mint_public(aliceAddress, 100n)
    .send({ from: giggleAddress });

  await bobToken.methods
    .transfer_public(bobClinicAddress, 10n)
    .send({ from: aliceAddress });
  // docs:end:checkpoint_1

  // docs:start:checkpoint_2
  await bobToken.methods
    .mint_public(aliceAddress, 100n)
    .send({ from: giggleAddress });
  await getBalances(bobToken, aliceAddress, bobClinicAddress);

  await bobToken.methods
    .transfer_public(bobClinicAddress, 10n)
    .send({ from: aliceAddress });
  await getBalances(bobToken, aliceAddress, bobClinicAddress);

  await bobToken.methods.public_to_private(90n).send({ from: aliceAddress });
  await getBalances(bobToken, aliceAddress, bobClinicAddress);

  await bobToken.methods
    .transfer_private(bobClinicAddress, 50n)
    .send({ from: aliceAddress });
  await getBalances(bobToken, aliceAddress, bobClinicAddress);

  await bobToken.methods.private_to_public(10n).send({ from: aliceAddress });
  await getBalances(bobToken, aliceAddress, bobClinicAddress);

  await bobToken.methods
    .mint_private(aliceAddress, 100n)
    .send({ from: giggleAddress });
  await getBalances(bobToken, aliceAddress, bobClinicAddress);
}

main().catch(console.error);
// docs:end:checkpoint_2
