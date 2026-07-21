// docs:start:connect_to_network
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);

// Wait for the network to be ready
await waitForNode(node);

// Create an EmbeddedWallet connected to the node
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });
// docs:end:connect_to_network

// docs:start:verify_connection
const nodeInfo = await node.getNodeInfo();
console.log("Connected to local network version:", nodeInfo.nodeVersion);
console.log("Chain ID:", nodeInfo.l1ChainId);
// docs:end:verify_connection

// docs:start:load_accounts
const testAccounts = await getInitialTestAccountsData();
const [aliceAddress, bobAddress] = await Promise.all(
  testAccounts.slice(0, 2).map(async (account) => {
    return (
      await wallet.createSchnorrInitializerlessAccount(
        account.secret,
        account.salt,
        account.signingKey,
      )
    ).address;
  }),
);

console.log(`Alice's address: ${aliceAddress.toString()}`);
console.log(`Bob's address: ${bobAddress.toString()}`);
// docs:end:load_accounts

// docs:start:check_fee_juice
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";

const aliceBalance = await getFeeJuiceBalance(aliceAddress, node);
console.log(`Alice's fee juice balance: ${aliceBalance}`);
// docs:end:check_fee_juice

// docs:start:create_account
import { Fr } from "@aztec/aztec.js/fields";

const secret = Fr.random();
const salt = Fr.random();
const newAccount = await wallet.createSchnorrAccount(secret, salt);
console.log("New account address:", newAccount.address.toString());
// docs:end:create_account

// docs:start:deploy_account_sponsored_fpc
// Additional imports needed for account deployment examples
import { NO_FROM } from "@aztec/aztec.js/account";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";

// Set up the Sponsored FPC payment method (see fees guide for details)
const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(
  SponsoredFPCContract.artifact,
  { salt: new Fr(0) },
);
await wallet.registerContract(
  sponsoredFPCInstance,
  SponsoredFPCContract.artifact,
);
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
  sponsoredFPCInstance.address,
);

// newAccount is the account created in the previous section
const deployMethod = await newAccount.getDeployMethod();
await deployMethod.send({
  from: NO_FROM,
  fee: { paymentMethod: sponsoredPaymentMethod },
});
// docs:end:deploy_account_sponsored_fpc

// docs:start:create_fee_juice_account
// `feeJuiceAccount` is just another Schnorr account, the same kind as
// `newAccount` above. It gets its own name here so both deploy paths
// can coexist in one example; in your own code, pick whichever name fits.
const feeJuiceSecret = Fr.random();
const feeJuiceSalt = Fr.random();
const feeJuiceAccount = await wallet.createSchnorrAccount(
  feeJuiceSecret,
  feeJuiceSalt,
);
// docs:end:create_fee_juice_account

// docs:start:bridge_fee_juice_setup
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { createLogger } from "@aztec/aztec.js/log";

// Create an L1 client (accepts a mnemonic or 0x-prefixed private key)
const l1RpcUrl = process.env.ETHEREUM_HOST ?? "http://localhost:8545";
const l1Mnemonic =
  "test test test test test test test test test test test junk";
const l1Client = createExtendedL1Client([l1RpcUrl], l1Mnemonic);

// Create a portal manager to interact with the L1 fee juice portal
const logger = createLogger("docs:fee-juice-bridge");
const portalManager = await L1FeeJuicePortalManager.new(node, l1Client, logger);
// docs:end:bridge_fee_juice_setup

// docs:start:bridge_fee_juice_execute
// portalManager is from the L1FeeJuicePortalManager setup above
// feeJuiceAccount.address is an Aztec address from createSchnorrAccount
const claim = await portalManager.bridgeTokensPublic(
  feeJuiceAccount.address, // the L2 address
  1000000000000000000000n, // the amount to send to the L1 portal
  true, // whether to mint or not (set to false if your L1 account already has fee juice!)
);

console.log("Claim secret:", claim.claimSecret);
console.log("Claim amount:", claim.claimAmount);
// docs:end:bridge_fee_juice_execute

// docs:start:deploy_contract
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const { contract: token } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "TestToken",
  "TST",
  18,
).send({ from: aliceAddress });

console.log(`Token deployed at: ${token.address.toString()}`);
// docs:end:deploy_contract

// docs:start:send_transaction
const { receipt } = await token.methods
  .mint_to_public(aliceAddress, 1000n)
  .send({ from: aliceAddress });

console.log(`Transaction mined in block ${receipt.blockNumber}`);
console.log(`Transaction fee: ${receipt.transactionFee}`);
// docs:end:send_transaction

// docs:start:simulate_function
const { result: balance } = await token.methods
  .balance_of_public(aliceAddress)
  .simulate({ from: aliceAddress });

console.log(`Alice's token balance: ${balance}`);
// docs:end:simulate_function

// The bridged Fee Juice claim only becomes consumable once the network's inbox lag (2 checkpoints)
// has elapsed since the L1->L2 message was inserted. The token deploy and mint above produced two
// blocks; mine one more here so the claim is available when we pay with it below.
await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({ from: aliceAddress });

// docs:start:bridge_fee_juice_claim
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";

// claim is from the bridgeTokensPublic step above
// Create a payment method that claims the bridged Fee Juice and uses it to pay
const bridgePaymentMethod = new FeeJuicePaymentMethodWithClaim(
  feeJuiceAccount.address,
  claim,
);

// Use it to pay for any transaction; here we deploy the account in one step
const deployMethodBridged = await feeJuiceAccount.getDeployMethod();
await deployMethodBridged.send({
  from: NO_FROM,
  fee: { paymentMethod: bridgePaymentMethod },
});
// docs:end:bridge_fee_juice_claim

// docs:start:verify_account_deployment
// `newAccount` refers to whichever account you just deployed,
// either the Sponsored FPC account or `feeJuiceAccount` from the Fee Juice path.
const metadata = await wallet.getContractMetadata(newAccount.address);
console.log("Account deployed:", metadata.initializationStatus);
// docs:end:verify_account_deployment

const feeJuiceMetadata = await wallet.getContractMetadata(
  feeJuiceAccount.address,
);
console.log(
  "Fee Juice account deployed:",
  feeJuiceMetadata.initializationStatus,
);
