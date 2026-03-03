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
      await wallet.createSchnorrAccount(
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
import { AztecAddress } from "@aztec/aztec.js/addresses";
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
  from: AztecAddress.ZERO,
  fee: { paymentMethod: sponsoredPaymentMethod },
});
// docs:end:deploy_account_sponsored_fpc

// docs:start:bridge_account_fee_juice
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { createLogger } from "@aztec/aztec.js/log";

// Create a separate account to deploy with Fee Juice bridged from L1
const feeJuiceSecret = Fr.random();
const feeJuiceSalt = Fr.random();
const feeJuiceAccount = await wallet.createSchnorrAccount(
  feeJuiceSecret,
  feeJuiceSalt,
);

// Bridge Fee Juice from L1 to the new account
const l1RpcUrl = process.env.ETHEREUM_HOST ?? "http://localhost:8545";
const l1Mnemonic =
  "test test test test test test test test test test test junk";
const l1Client = createExtendedL1Client([l1RpcUrl], l1Mnemonic);
const logger = createLogger("docs:fee-juice-bridge");
const portalManager = await L1FeeJuicePortalManager.new(node, l1Client, logger);
const claim = await portalManager.bridgeTokensPublic(
  feeJuiceAccount.address,
  1000000000000000000000n, // 1000 Fee Juice
  true, // mint on L1 (local network only)
);
// docs:end:bridge_account_fee_juice

// docs:start:deploy_contract
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const token = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "TestToken",
  "TST",
  18,
).send({ from: aliceAddress });

console.log(`Token deployed at: ${token.address.toString()}`);
// docs:end:deploy_contract

// docs:start:send_transaction
const receipt = await token.methods
  .mint_to_public(aliceAddress, 1000n)
  .send({ from: aliceAddress });

console.log(`Transaction mined in block ${receipt.blockNumber}`);
console.log(`Transaction fee: ${receipt.transactionFee}`);
// docs:end:send_transaction

// docs:start:simulate_function
const balance = await token.methods
  .balance_of_public(aliceAddress)
  .simulate({ from: aliceAddress });

console.log(`Alice's token balance: ${balance}`);
// docs:end:simulate_function

// docs:start:deploy_account_fee_juice
// Deploy the account using the bridged Fee Juice
const deployMethodFeeJuice = await feeJuiceAccount.getDeployMethod();
await deployMethodFeeJuice.send({
  from: AztecAddress.ZERO,
  fee: {
    paymentMethod: new FeeJuicePaymentMethodWithClaim(
      feeJuiceAccount.address,
      claim,
    ),
  },
});
// docs:end:deploy_account_fee_juice

// docs:start:verify_account_deployment
const metadata = await wallet.getContractMetadata(feeJuiceAccount.address);
console.log("Account deployed:", metadata.isContractInitialized);
// docs:end:verify_account_deployment
