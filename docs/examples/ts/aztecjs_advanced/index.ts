import {
  createAztecNodeClient,
  waitForNode,
  waitForTx,
} from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TokenContract, type Transfer } from "@aztec/noir-contracts.js/Token";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { Fr } from "@aztec/aztec.js/fields";
import { NO_WAIT, BatchCall, Contract } from "@aztec/aztec.js/contracts";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { PublicKeys } from "@aztec/stdlib/keys";
import { getPublicEvents } from "@aztec/aztec.js/events";
import { GasSettings } from "@aztec/stdlib/gas";

// Setup: connect to network
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

// docs:start:deploy_basic_local
// wallet and aliceAddress are from the connection guide
// Deploy with constructor arguments
const { contract: token } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "TestToken",
  "TST",
  18,
).send({ from: aliceAddress }); // alice has fee juice and is registered in the wallet
// docs:end:deploy_basic_local

// docs:start:deploy_sponsored_fpc_contract
// Set up the Sponsored FPC (see fees guide for full setup)
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

// wallet is from the connection guide; sponsoredPaymentMethod is from the fees guide
const { contract: sponsoredContract } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "SponsoredToken",
  "SPT",
  18,
).send({ from: aliceAddress, fee: { paymentMethod: sponsoredPaymentMethod } });
// docs:end:deploy_sponsored_fpc_contract

// docs:start:deploy_custom_salt
// wallet and aliceAddress are from the connection guide
const customSalt = Fr.random();

const { contract: saltedContract } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "SaltedToken",
  "SALT",
  18,
  { salt: customSalt },
).send({
  from: aliceAddress,
});
// docs:end:deploy_custom_salt

// docs:start:calculate_address_before_deploy
// Calculate address without deploying
// wallet is from the connection guide (see prerequisites)
const deploymentSalt = Fr.random();
const deployMethod = TokenContract.deploy(
  wallet,
  aliceAddress,
  "PredictedToken",
  "PRED",
  18,
  { salt: deploymentSalt, deployer: aliceAddress },
);
const instance = await deployMethod.getInstance();
const predictedAddress = instance.address;

console.log(`Contract will deploy at: ${predictedAddress}`);
// docs:end:calculate_address_before_deploy

// docs:start:verify_contract_callable
// token is from the deployment step above; aliceAddress is from the connection guide
try {
  // Try calling a view function
  const { result: balance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });
  console.log("Contract is callable, balance:", balance);
} catch (error) {
  console.error("Contract not accessible:", (error as Error).message);
}
// docs:end:verify_contract_callable

// docs:start:register_external_contract
// wallet is from the connection guide; contractAddress is the address of the deployed contract
const contractAddress = token.address;

// Get the contract metadata from the node (includes the instance)
const metadata = await wallet.getContractMetadata(contractAddress);

// Register the contract with the wallet
// The registerContract method takes positional parameters:
// - instance: ContractInstanceWithAddress (required)
// - artifact: ContractArtifact (optional)
// - secretKey: Fr (optional)
await wallet.registerContract(metadata.instance!, TokenContract.artifact);

// Now you can interact with the contract
const externalContract = await TokenContract.at(contractAddress, wallet);
// docs:end:register_external_contract

await token.methods
  .mint_to_public(aliceAddress, 10000n)
  .send({ from: aliceAddress });

await token.methods
  .mint_to_private(aliceAddress, 10000n)
  .send({ from: aliceAddress });

// docs:start:no_wait_deploy
// Use NO_WAIT to get the transaction hash immediately and track deployment
const { txHash } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "AnotherToken",
  "ATK",
  18,
).send({
  from: aliceAddress,
  wait: NO_WAIT,
});

console.log(`Deployment tx: ${txHash}`);

// Wait for the transaction to be mined using the node
const receipt = await waitForTx(node, txHash);
console.log(`Deployed in block ${receipt.blockNumber}`);
// docs:end:no_wait_deploy

// docs:start:no_wait_transaction
// Use NO_WAIT for regular transactions too
const { txHash: transferTxHash } = await token.methods
  .transfer(bobAddress, 100n)
  .send({ from: aliceAddress, wait: NO_WAIT });

console.log(`Transaction sent: ${transferTxHash.toString()}`);

// Wait for inclusion later using the node
const transferReceipt = await waitForTx(node, transferTxHash);
console.log(`Transaction mined in block ${transferReceipt.blockNumber}`);
// docs:end:no_wait_transaction

// docs:start:batch_call
// Execute multiple calls atomically using BatchCall
const batch = new BatchCall(wallet, [
  token.methods.mint_to_public(aliceAddress, 500n),
  token.methods.transfer(bobAddress, 200n),
]);

const { receipt: batchReceipt } = await batch.send({ from: aliceAddress });
console.log(`Batch executed in block ${batchReceipt.blockNumber}`);
// docs:end:batch_call

// docs:start:reconstruct_contract_instance
// Reconstruct a contract instance from deployment parameters
// Use this when you need to register a contract deployed by someone else
const reconstructedInstance = await getContractInstanceFromInstantiationParams(
  TokenContract.artifact,
  {
    publicKeys: PublicKeys.default(),
    constructorArtifact: "constructor",
    constructorArgs: [aliceAddress, "ReconstructedToken", "RTK", 18],
    deployer: aliceAddress,
    salt: new Fr(12345), // The original deployment salt
  },
);

// Register the reconstructed contract with the wallet
await wallet.registerContract(reconstructedInstance, TokenContract.artifact);
console.log(
  `Reconstructed contract address: ${reconstructedInstance.address.toString()}`,
);
// docs:end:reconstruct_contract_instance

// docs:start:query_tx_status
// Query transaction status after sending without waiting
const { txHash: statusTxHash } = await token.methods
  .transfer(bobAddress, 10n)
  .send({ from: aliceAddress, wait: NO_WAIT });

// Check status using the node
const txReceipt = await node.getTxReceipt(statusTxHash);

console.log(`Status: ${txReceipt.status}`);
console.log(`Block number: ${txReceipt.blockNumber}`);
console.log(`Transaction fee: ${txReceipt.transactionFee}`);
// docs:end:query_tx_status

// docs:start:deploy_with_dependencies
// Deploy contracts with dependencies - deploy sequentially and pass addresses
const { contract: baseToken } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "BaseToken",
  "BASE",
  18,
).send({ from: aliceAddress });

// A second contract could reference the first (example pattern)
const { contract: derivedToken } = await TokenContract.deploy(
  wallet,
  baseToken.address, // Use first contract's address as admin
  "DerivedToken",
  "DERIV",
  18,
).send({ from: aliceAddress });

console.log(`Base token at: ${baseToken.address.toString()}`);
console.log(`Derived token at: ${derivedToken.address.toString()}`);
// docs:end:deploy_with_dependencies

// docs:start:parallel_deploy
// Deploy contracts in parallel using Promise.all
const contracts = await Promise.all([
  TokenContract.deploy(wallet, aliceAddress, "Token1", "T1", 18)
    .send({
      from: aliceAddress,
    })
    .then(({ contract }) => contract),
  TokenContract.deploy(wallet, aliceAddress, "Token2", "T2", 18)
    .send({
      from: aliceAddress,
    })
    .then(({ contract }) => contract),
  TokenContract.deploy(wallet, aliceAddress, "Token3", "T3", 18)
    .send({
      from: aliceAddress,
    })
    .then(({ contract }) => contract),
]);

console.log(`Contract 1 at: ${contracts[0].address}`);
console.log(`Contract 2 at: ${contracts[1].address}`);
console.log(`Contract 3 at: ${contracts[2].address}`);
// docs:end:parallel_deploy

// docs:start:skip_initialization
// Deploy without running the constructor using skipInitialization
const { contract: delayedToken } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "DelayedToken",
  "DLY",
  18,
).send({
  from: aliceAddress,
  skipInitialization: true,
});

console.log(`Contract deployed at: ${delayedToken.address}`);

// Initialize later by calling the constructor manually
await delayedToken.methods
  .constructor(aliceAddress, "DelayedToken", "DLY", 18)
  .send({ from: aliceAddress });

console.log("Contract initialized");
// docs:end:skip_initialization

// docs:start:poll_for_events
// Poll for new events at regular intervals
let lastProcessedBlock = await node.getBlockNumber();

async function pollForTransferEvents() {
  const currentBlock = await node.getBlockNumber();

  if (currentBlock > lastProcessedBlock) {
    const { events } = await getPublicEvents<Transfer>(
      node,
      TokenContract.events.Transfer,
      {
        contractAddress: token.address,
        fromBlock: BlockNumber(lastProcessedBlock + 1),
        toBlock: BlockNumber(currentBlock + 1), // toBlock is exclusive
      },
    );

    for (const { event, metadata } of events) {
      // Process each transfer event
      console.log(
        `Transfer: ${event.amount} from ${event.from} to ${event.to}`,
      );
      console.log(
        `  in block ${metadata.l2BlockNumber}, tx ${metadata.txHash}`,
      );
    }

    lastProcessedBlock = currentBlock;
  }
}

// Example: poll once (in production, use setInterval)
await pollForTransferEvents();
// docs:end:poll_for_events

// docs:start:connect_to_contract
// wallet is from the connection guide; token is the contract deployed in the deploy guide
const contract = await Contract.at(
  token.address,
  TokenContract.artifact,
  wallet,
);
// docs:end:connect_to_contract

// docs:start:basic_send_transaction
// contract is from the step above; aliceAddress is from the connection guide
const { receipt: sendReceipt } = await contract.methods
  .transfer_in_public(aliceAddress, bobAddress, 100n, 0n)
  .send({ from: aliceAddress });
console.log(`Transaction mined in block ${sendReceipt.blockNumber}`);
console.log(`Transaction fee: ${sendReceipt.transactionFee}`);
// docs:end:basic_send_transaction

// docs:start:set_gas_padding
wallet.setEstimatedGasPadding(0.2); // 20% padding instead of the default 10%
// docs:end:set_gas_padding

// docs:start:simulate_with_metadata
const metaResult = await token.methods
  .balance_of_public(aliceAddress)
  .simulate({ from: aliceAddress, includeMetadata: true });
console.log("Balance:", metaResult.result);
console.log("L2 gas limit:", metaResult.estimatedGas.gasLimits.l2Gas);
console.log("DA gas limit:", metaResult.estimatedGas.gasLimits.daGas);
// docs:end:simulate_with_metadata

// docs:start:read_public_logs
// Raw public logs are carried on each block's transaction effects.
const latestBlockNumber = await node.getBlockNumber();
const block = await node.getBlock(latestBlockNumber, {
  includeTransactions: true,
});
const publicLogs = block?.body.txEffects.flatMap((tx) => tx.publicLogs) ?? [];
if (publicLogs.length > 0) {
  const rawFields = publicLogs[0].getEmittedFields(); // Fr[]
  console.log("Raw log fields:", rawFields.length);
}
// docs:end:read_public_logs

// docs:start:estimate_mana
const { estimatedGas } = await token.methods
  .transfer_in_public(aliceAddress, bobAddress, 1n, 0n)
  .simulate({
    from: aliceAddress,
    fee: { estimateGas: true, estimatedGasPadding: 0.1 },
  });
// docs:end:estimate_mana

// docs:start:compute_fee_from_estimate
const currentFees = await node.getCurrentMinFees();
const estimatedFee = estimatedGas.gasLimits.computeFee(currentFees).toBigInt();
console.log("Estimated fee:", estimatedFee);
// docs:end:compute_fee_from_estimate

// docs:start:get_fee_from_receipt
const { receipt: feeReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({ from: aliceAddress });
console.log("Transaction fee:", feeReceipt.transactionFee);
// docs:end:get_fee_from_receipt

// docs:start:check_receipt_status
console.log("Succeeded:", feeReceipt.hasExecutionSucceeded());
console.log("Block:", feeReceipt.blockNumber);
console.log("Fee paid:", feeReceipt.transactionFee);
// docs:end:check_receipt_status

// docs:start:pay_with_fee_juice
// contract is a deployed contract instance; aliceAddress is from the connection guide
const { receipt: feeJuiceReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({
    from: aliceAddress,
    // no fee payment method needed; Fee Juice is used automatically
  });
console.log("Transaction fee:", feeJuiceReceipt.transactionFee);
// docs:end:pay_with_fee_juice

// docs:start:custom_gas_settings
// Query current network fees to set realistic limits
const networkFees = await node.getCurrentMinFees();
const gasSettings = GasSettings.from({
  gasLimits: { daGas: 100_000, l2Gas: 2_000_000 },
  teardownGasLimits: { daGas: 100_000, l2Gas: 2_000_000 },
  maxFeesPerGas: {
    feePerDaGas: networkFees.feePerDaGas * 2n,
    feePerL2Gas: networkFees.feePerL2Gas * 2n,
  },
  maxPriorityFeesPerGas: { feePerDaGas: 0n, feePerL2Gas: 0n },
});
// docs:end:custom_gas_settings

// docs:start:send_with_gas_settings
const { receipt: gsReceipt } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .send({
    from: aliceAddress,
    fee: { gasSettings },
  });
// docs:end:send_with_gas_settings

// docs:start:read_logs_by_filter
// Get raw public logs for a specific transaction by locating its block and tx effect.
const txReceiptForLogs = await node.getTxReceipt(gsReceipt.txHash);
const txBlock = await node.getBlock(txReceiptForLogs.blockNumber!, {
  includeTransactions: true,
});
const txLogs =
  txBlock?.body.txEffects
    .filter((tx) => tx.txHash.equals(gsReceipt.txHash))
    .flatMap((tx) => tx.publicLogs) ?? [];

// Get raw public logs for a block range by reading each block's tx effects.
const tipBlockNumber = await node.getBlockNumber();
const rangeLogs = (
  await Promise.all(
    Array.from({ length: tipBlockNumber }, (_, i) => BlockNumber(i + 1)).map(
      async (blockNumber) => {
        const rangeBlock = await node.getBlock(blockNumber, {
          includeTransactions: true,
        });
        return rangeBlock?.body.txEffects.flatMap((tx) => tx.publicLogs) ?? [];
      },
    ),
  )
).flat();
// docs:end:read_logs_by_filter

// docs:start:auto_gas_estimation
// Estimate gas for a transaction before sending
const { estimatedGas: autoEstimate } = await token.methods
  .mint_to_public(aliceAddress, 1n)
  .simulate({
    from: aliceAddress,
    fee: {
      estimateGas: true,
      estimatedGasPadding: 0.2, // 20% padding
    },
  });
console.log("Auto-estimated L2 gas:", autoEstimate.gasLimits.l2Gas);
// docs:end:auto_gas_estimation

// docs:start:import_get_public_events
import { getPublicEvents as _importCheck } from "@aztec/aztec.js/events";
// docs:end:import_get_public_events

// docs:start:import_private_event_types
import type { PrivateEventFilter } from "@aztec/aztec.js/wallet";
import { BlockNumber } from "@aztec/aztec.js/fields";
// docs:end:import_private_event_types

// docs:start:simulate_private_access
// This works if aliceAddress owns the notes
const { result: privateBalance } = await token.methods
  .balance_of_private(aliceAddress)
  .simulate({ from: aliceAddress });
// docs:end:simulate_private_access

console.log("All advanced examples completed successfully");
