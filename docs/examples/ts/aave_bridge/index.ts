import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { SetPublicAuthwitContractInteraction } from "@aztec/aztec.js/authorization";
import { Fr } from "@aztec/aztec.js/fields";
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { deployL1Contract } from "@aztec/ethereum/deploy-l1-contract";
import { sha256ToField } from "@aztec/foundation/crypto/sha256";
import {
  computeL2ToL1MessageHash,
  computeSecretHash,
} from "@aztec/stdlib/hash";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { decodeEventLog, pad, toFunctionSelector } from "@aztec/viem";
import { foundry } from "@aztec/viem/chains";
import AavePortal from "../../../target/solidity/aave_bridge/AavePortal.sol/AavePortal.json" with { type: "json" };
import MockERC20 from "../../../target/solidity/aave_bridge/MockERC20.sol/MockERC20.json" with { type: "json" };
import MockAToken from "../../../target/solidity/aave_bridge/MockAToken.sol/MockAToken.json" with { type: "json" };
import MockAavePool from "../../../target/solidity/aave_bridge/MockAavePool.sol/MockAavePool.json" with { type: "json" };
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { AaveBridgeContract } from "./artifacts/AaveBridge.js";

// docs:start:setup
// Setup L1 client using anvil's default mnemonic
const MNEMONIC = "test test test test test test test test test test test junk";
const l1Client = createExtendedL1Client(
  [process.env.ETHEREUM_HOST ?? "http://localhost:8545"],
  MNEMONIC,
);

// Setup L2 using Aztec's local network
console.log("Setting up L2...\n");
const node = createAztecNodeClient(
  process.env.AZTEC_NODE_URL ?? "http://localhost:8080",
);
await waitForNode(node);
const aztecWallet = await EmbeddedWallet.create(node, { ephemeral: true });
const [accData] = await getInitialTestAccountsData();
const account = await aztecWallet.createSchnorrInitializerlessAccount(
  accData.secret,
  accData.salt,
  accData.signingKey,
);
console.log(`Account: ${account.address.toString()}\n`);

// Get node info
const nodeInfo = await node.getNodeInfo();
const registryAddress = nodeInfo.l1ContractAddresses.registryAddress.toString();
const inboxAddress = nodeInfo.l1ContractAddresses.inboxAddress.toString();
// docs:end:setup

// docs:start:deploy_l1
console.log("Deploying L1 contracts...\n");

// Deploy MockERC20 (underlying token, e.g. DAI)
const { address: underlyingAddress } = await deployL1Contract(
  l1Client,
  MockERC20.abi,
  MockERC20.bytecode.object as `0x${string}`,
  ["Mock DAI", "mDAI"],
);

// Deploy MockAToken (Aave's yield-bearing token)
const { address: aTokenAddress } = await deployL1Contract(
  l1Client,
  MockAToken.abi,
  MockAToken.bytecode.object as `0x${string}`,
  ["Aave Mock DAI", "amDAI"],
);

// Deploy MockAavePool with 10% yield (1000 basis points)
const { address: poolAddress } = await deployL1Contract(
  l1Client,
  MockAavePool.abi,
  MockAavePool.bytecode.object as `0x${string}`,
  [underlyingAddress.toString(), aTokenAddress.toString(), 1000n],
);

// Deploy AavePortal
const { address: portalAddress } = await deployL1Contract(
  l1Client,
  AavePortal.abi,
  AavePortal.bytecode.object as `0x${string}`,
);

console.log(`MockERC20 (DAI): ${underlyingAddress}`);
console.log(`MockAToken (aDAI): ${aTokenAddress}`);
console.log(`MockAavePool: ${poolAddress}`);
console.log(`AavePortal: ${portalAddress}\n`);
// docs:end:deploy_l1

// docs:start:deploy_l2
console.log("Deploying L2 contracts...\n");

// Deploy the Token contract on L2 (this is the standard Aztec token)
const { contract: l2Token } = await TokenContract.deploy(
  aztecWallet,
  account.address, // admin
  "Bridged DAI",
  "bDAI",
  18,
).send({ from: account.address });

// Deploy the AaveBridge on L2
const { contract: l2Bridge } = await AaveBridgeContract.deploy(
  aztecWallet,
  l2Token.address,
  EthAddress.fromString(portalAddress.toString()),
).send({ from: account.address });

console.log(`L2 Token: ${l2Token.address.toString()}`);
console.log(`L2 Bridge: ${l2Bridge.address.toString()}\n`);
// docs:end:deploy_l2

// docs:start:initialize
console.log("Initializing contracts...");

// Initialize the L1 portal
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initHash = await l1Client.writeContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: AavePortal.abi,
  functionName: "initialize",
  args: [
    registryAddress,
    underlyingAddress.toString(),
    aTokenAddress.toString(),
    poolAddress.toString(),
    l2Bridge.address.toString(),
  ],
});
await l1Client.waitForTransactionReceipt({ hash: initHash });

// Set the bridge as a minter on the L2 token so it can mint when claiming
await l2Token.methods
  .set_minter(l2Bridge.address, true)
  .send({ from: account.address });

console.log("All contracts initialized\n");
// docs:end:initialize

// docs:start:fund_user
// Pre-fund the portal with L1 tokens and mint L2 tokens to the user
// In a real scenario, tokens would already exist on L2 from a prior bridge
console.log("Funding user with tokens on L2...");

const depositAmount = 1000n * 10n ** 18n; // 1000 DAI

// Mint underlying tokens on L1
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const mintHash = await l1Client.writeContract({
  address: underlyingAddress.toString() as `0x${string}`,
  abi: MockERC20.abi,
  functionName: "mint",
  args: [portalAddress.toString(), depositAmount],
});
await l1Client.waitForTransactionReceipt({ hash: mintHash });

// Also mint tokens directly to the user on L2 (admin mints for simplicity)
await l2Token.methods
  .mint_to_public(account.address, depositAmount)
  .send({ from: account.address });

console.log(`User funded with ${depositAmount / 10n ** 18n} tokens on L2\n`);
// docs:end:fund_user

// docs:start:mine_blocks
// On the local network, L2 blocks are only produced when transactions are submitted.
// L1-to-L2 messages require 2 L2 blocks before they can be consumed, so we deploy
// two dummy contracts (with random salts for unique addresses) to force block production.
async function mine2Blocks(
  aztecWallet: EmbeddedWallet,
  accountAddress: AztecAddress,
) {
  await AaveBridgeContract.deploy(
    aztecWallet,
    accountAddress,
    EthAddress.ZERO,
  ).send({
    from: accountAddress,
  });
  await AaveBridgeContract.deploy(
    aztecWallet,
    accountAddress,
    EthAddress.ZERO,
  ).send({
    from: accountAddress,
  });
}
// docs:end:mine_blocks

// docs:start:deposit_to_aave
// ============================================================
// STEP 1: Deposit to Aave (L2 -> L1 flow)
// ============================================================
console.log("=== Depositing to Aave ===\n");

const amountToDeposit = 500n * 10n ** 18n; // 500 DAI

// Create authwit for the bridge to burn tokens on our behalf.
// The bridge calls Token::burn_public(user, amount, nonce), where msg_sender
// is the bridge, so the token contract requires a public authwit.
const burnNonce = Fr.random();
const burnAuthwit = await SetPublicAuthwitContractInteraction.create(
  aztecWallet,
  account.address,
  {
    caller: l2Bridge.address,
    action: l2Token.methods.burn_public(
      account.address,
      amountToDeposit,
      burnNonce,
    ),
  },
  true,
);
await burnAuthwit.send();

// On L2: burn tokens and send L2->L1 message.
// exit_to_l1_public sends tokens to the portal as the L1 recipient,
// and caller_on_l1 is set to ZERO so anyone can relay the message.
const { receipt: exitReceipt } = await l2Bridge.methods
  .exit_to_l1_public(
    EthAddress.fromString(portalAddress.toString()), // recipient on L1 (the portal itself)
    amountToDeposit,
    EthAddress.ZERO, // caller_on_l1: anyone can relay
    burnNonce, // authwit nonce authorizing the bridge to burn on our behalf
  )
  .send({ from: account.address });

console.log(`Exit sent (block: ${exitReceipt.blockNumber})`);
// docs:end:deposit_to_aave

// docs:start:get_deposit_witness
// Compute the L2->L1 content hash for the withdrawal witness.
// This must match what the L1 portal reconstructs via abi.encodeWithSignature.
// toFunctionSelector computes keccak256 of the signature and takes the first 4 bytes.
const portalEthAddress = EthAddress.fromString(portalAddress.toString());
const withdrawContent = sha256ToField([
  Buffer.from(
    toFunctionSelector("withdraw(address,uint256,address)").substring(2),
    "hex",
  ),
  portalEthAddress.toBuffer32(),
  new Fr(amountToDeposit).toBuffer(),
  EthAddress.ZERO.toBuffer32(),
]);

// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const version = (await l1Client.readContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: AavePortal.abi,
  functionName: "rollupVersion",
})) as bigint;

const msgLeaf = computeL2ToL1MessageHash({
  l2Sender: l2Bridge.address,
  l1Recipient: portalEthAddress,
  content: withdrawContent,
  rollupVersion: new Fr(version),
  chainId: new Fr(foundry.id),
});

// Wait for the block to be proven
if (!exitReceipt.blockNumber) {
  throw new Error("Exit transaction was not included in a block");
}
const exitBlockNumber = exitReceipt.blockNumber;
console.log("Waiting for block to be proven...");
let provenBlockNumber = await node.getBlockNumber("proven");
while (provenBlockNumber < exitBlockNumber) {
  console.log(
    `   Waiting... (proven: ${provenBlockNumber}, needed: ${exitBlockNumber})`,
  );
  await new Promise((resolve) => setTimeout(resolve, 10000));
  provenBlockNumber = await node.getBlockNumber("proven");
}
console.log("Block proven!\n");

// Compute the membership witness using the message hash and the L2 tx hash.
// The node picks the smallest partial-proof root that covers the tx's checkpoint.
const witness = await node.getL2ToL1MembershipWitness(
  exitReceipt.txHash,
  msgLeaf,
);
const epoch = witness!.epochNumber;
const numCheckpointsInEpoch = witness!.numCheckpointsInEpoch;

const siblingPathHex = witness!.siblingPath
  .toBufferArray()
  .map((buf: Buffer) => `0x${buf.toString("hex")}` as `0x${string}`);
// docs:end:get_deposit_witness

// docs:start:execute_deposit_l1
// On L1: consume the outbox message and deposit into Aave
console.log("Depositing into Aave on L1...");
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const depositToAaveHash = await l1Client.writeContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: AavePortal.abi,
  functionName: "depositToAave",
  args: [
    portalAddress.toString(), // recipient (matches L2 exit)
    amountToDeposit,
    false, // withCaller = false (matches caller_on_l1 = address(0))
    BigInt(epoch),
    BigInt(numCheckpointsInEpoch),
    BigInt(witness!.leafIndex),
    siblingPathHex,
  ],
});
await l1Client.waitForTransactionReceipt({ hash: depositToAaveHash });
console.log("Tokens deposited into Aave!\n");
// docs:end:execute_deposit_l1

// docs:start:claim_from_aave_l1
// ============================================================
// STEP 2: Claim from Aave with yield (L1 -> L2 flow)
// ============================================================
console.log("=== Claiming from Aave (with yield) ===\n");

const secret = Fr.random();
const secretHash = await computeSecretHash(secret);

// On L1: withdraw from Aave and send L1->L2 message
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const claimHash = await l1Client.writeContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: AavePortal.abi,
  functionName: "claimFromAavePublic",
  args: [
    amountToDeposit, // aToken amount to withdraw
    pad(account.address.toString() as `0x${string}`, { dir: "left", size: 32 }), // L2 recipient
    pad(secretHash.toString() as `0x${string}`, { dir: "left", size: 32 }),
  ],
});
const claimReceipt = await l1Client.waitForTransactionReceipt({
  hash: claimHash,
});
console.log("Aave withdrawal complete, L1->L2 message sent");
// docs:end:claim_from_aave_l1

// docs:start:get_claim_leaf_index
// Extract the message leaf index from the MessageSent event
const INBOX_ABI = [
  {
    type: "event",
    name: "MessageSent",
    inputs: [
      { name: "checkpointNumber", type: "uint256", indexed: true },
      { name: "index", type: "uint256", indexed: false },
      { name: "hash", type: "bytes32", indexed: true },
      { name: "rollingHash", type: "bytes16", indexed: false },
    ],
  },
] as const;

const messageSentLogs = claimReceipt.logs
  .filter((log) => log.address.toLowerCase() === inboxAddress.toLowerCase())
  .map((log: any) => {
    try {
      const decoded = decodeEventLog({
        abi: INBOX_ABI,
        data: log.data,
        topics: log.topics,
      });
      return { log, decoded };
    } catch {
      return null;
    }
  })
  .filter(
    (item): item is { log: any; decoded: any } =>
      item !== null && (item.decoded as any).eventName === "MessageSent",
  );

const messageLeafIndex = new Fr(messageSentLogs[0].decoded.args.index);
console.log(`Message leaf index: ${messageLeafIndex}\n`);
// docs:end:get_claim_leaf_index

// docs:start:claim_on_l2
// Mine blocks so the L1->L2 message is available
await mine2Blocks(aztecWallet, account.address);

// The mock Aave pool returns 10% yield, so 500 DAI becomes 550 DAI
const expectedWithYield = amountToDeposit + (amountToDeposit * 1000n) / 10000n;
console.log(
  `Expected amount with yield: ${expectedWithYield / 10n ** 18n} tokens`,
);

// On L2: consume the L1->L2 message and mint tokens (with yield)
console.log("Claiming tokens on L2...");
await l2Bridge.methods
  .claim_public(account.address, expectedWithYield, secret, messageLeafIndex)
  .send({ from: account.address });
console.log("Tokens claimed on L2!\n");
// docs:end:claim_on_l2

// docs:start:verify
// Verify the user's balance includes yield
console.log("=== Verifying balances ===\n");

const { result: finalBalance } = await l2Token.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });

const initialRemaining = depositAmount - amountToDeposit; // 500 DAI not deposited
const expectedFinal = initialRemaining + expectedWithYield; // 500 + 550 = 1050 DAI

console.log(`Initial deposit:     ${depositAmount / 10n ** 18n} tokens`);
console.log(`Deposited to Aave:   ${amountToDeposit / 10n ** 18n} tokens`);
console.log(
  `Yield earned (10%):  ${(expectedWithYield - amountToDeposit) / 10n ** 18n} tokens`,
);
console.log(`Expected balance:    ${expectedFinal / 10n ** 18n} tokens`);
console.log(`Actual balance:      ${finalBalance / 10n ** 18n} tokens`);
console.log(
  `\nYield earned successfully: ${finalBalance >= expectedFinal ? "YES" : "NO"}`,
);
// docs:end:verify
