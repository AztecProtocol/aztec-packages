import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { CrowdfundingContract } from "@aztec/noir-contracts.js/Crowdfunding";
import { Fr } from "@aztec/aztec.js/fields";
import { deriveKeys } from "@aztec/aztec.js/keys";
import { CallAuthorizationRequest } from "@aztec/aztec.js/authorization";

// Setup: connect to network, create alice and bob, deploy a token, mint to alice.
// EmbeddedWallet runs every .simulate() call in kernelless mode with a stub-account
// override applied automatically. The examples below rely on that default.
const node = createAztecNodeClient(
  process.env.AZTEC_NODE_URL ?? "http://localhost:8080",
);
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

const testAccounts = await getInitialTestAccountsData();
const [aliceAddress, bobAddress] = await Promise.all(
  testAccounts.slice(0, 2).map(async (account) => {
    return (
      await wallet.createSchnorrAccount(
        account.secret,
        account.salt,
        account.signingKey,
      )
    ).address;
  }),
);

const { contract: tokenContract } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "TestToken",
  "TST",
  18,
).send({ from: aliceAddress });

await tokenContract.methods
  .mint_to_private(aliceAddress, 1000n)
  .send({ from: aliceAddress });

// docs:start:simulate-view-without-signing
// Reading a private view function would normally route through the account
// contract's entrypoint, whose is_valid check would prompt the user to sign.
// With EmbeddedWallet, .simulate() runs kernelless with a stub-account
// override applied to alice's account, so no signing prompt is triggered.
const { result: decimals } = await tokenContract.methods
  .private_get_decimals()
  .simulate({ from: aliceAddress });

console.log("Token decimals (read via private view):", decimals);
// docs:end:simulate-view-without-signing

// Deploy a Crowdfunding contract with Bob as the operator and the previously
// deployed token as the donation token. The contract receives donation notes
// for donors, so it needs its own keys (a contract-account-style deployment).
const crowdfundingSecretKey = Fr.random();
const crowdfundingPublicKeys = (await deriveKeys(crowdfundingSecretKey))
  .publicKeys;
const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

const crowdfundingDeployment = CrowdfundingContract.deploy(
  wallet,
  tokenContract.address,
  bobAddress,
  deadline,
  { publicKeys: crowdfundingPublicKeys, deployer: aliceAddress },
);
const crowdfundingInstance = await crowdfundingDeployment.getInstance();
await wallet.registerContract(
  crowdfundingInstance,
  CrowdfundingContract.artifact,
  crowdfundingSecretKey,
);
const { contract: crowdfundingContract } = await crowdfundingDeployment.send({
  from: aliceAddress,
  additionalScopes: [crowdfundingInstance.address],
});

// docs:start:simulate-and-collect-effects
// Alice calls Crowdfunding.donate(amount). Internally the contract calls
// transfer_in_private(alice, crowdfunding, amount, 0) with msg_sender =
// crowdfunding, so the token's #[authorize_once] macro requires an authwit
// from Alice authorizing the crowdfunding contract. Alice is the sender, so
// her PXE has her notes and nullifier key — no cross-wallet state sharing
// is required.
//
// With kernelless + stub override (default in EmbeddedWallet), the simulation
// runs without prompting Alice to sign; the macro emits a
// CallAuthorizationRequest as an offchain effect that the wallet can turn
// into a real authwit before .send().
const donationAmount = 100n;
const donateAction = crowdfundingContract.methods.donate(donationAmount);

const { offchainEffects } = await donateAction.simulate({
  from: aliceAddress,
  includeMetadata: true,
});

// Filter offchain effects for authwit requests by selector.
const authwitSelector = await CallAuthorizationRequest.getSelector();
const authwitEffects = offchainEffects.filter(
  (effect) =>
    effect.data.length > 0 && effect.data[0].equals(authwitSelector.toField()),
);

if (authwitEffects.length !== 1) {
  throw new Error(
    `Expected exactly one CallAuthorizationRequest, got ${authwitEffects.length}`,
  );
}
// docs:end:simulate-and-collect-effects

// docs:start:decode-call-authorization
// Decode each effect into a CallAuthorizationRequest. The inner hash is the
// piece the authorizing account (Alice) needs to sign.
const authorizationRequests = await Promise.all(
  authwitEffects.map((effect) =>
    CallAuthorizationRequest.fromFields(effect.data),
  ),
);

for (const request of authorizationRequests) {
  console.log("Authwit needed:", {
    onBehalfOf: request.onBehalfOf.toString(),
    msgSender: request.msgSender.toString(),
    functionSelector: request.functionSelector.toString(),
  });
}

if (!authorizationRequests[0].onBehalfOf.equals(aliceAddress)) {
  throw new Error(
    `Expected onBehalfOf to be alice (${aliceAddress.toString()}), got ${authorizationRequests[0].onBehalfOf.toString()}`,
  );
}
// docs:end:decode-call-authorization

// docs:start:build-authwits-and-send
// Alice creates a real authentication witness from each inner hash. The
// `consumer` is the contract that consumes the authwit — here, the token,
// because that's where the inner transfer_in_private (and its #[authorize_once]
// site) runs.
const authWitnesses = await Promise.all(
  authorizationRequests.map((request) =>
    wallet.createAuthWit(request.onBehalfOf, {
      consumer: tokenContract.address,
      innerHash: request.innerHash,
    }),
  ),
);

// Alice now sends the real donate transaction with the collected authwits
// attached.
//
// Note: EmbeddedWallet.sendTx already runs this pre-simulation + authwit
// collection internally, so passing `authWitnesses` here is redundant for
// EmbeddedWallet. We pass them explicitly anyway because this is the pattern
// a wallet that does not auto-collect needs to follow.
await donateAction.send({
  from: aliceAddress,
  authWitnesses,
});
// docs:end:build-authwits-and-send

console.log("Kernelless simulation example completed successfully");
