// docs:start:setup
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { SetPublicAuthwitContractInteraction } from "@aztec/aztec.js/authorization";
import { Fr } from "@aztec/aztec.js/fields";
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { deployL1Contract } from "@aztec/ethereum/deploy-l1-contract";
import { sha256ToField } from "@aztec/foundation/crypto/sha256";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TokenBridgeContract } from "@aztec/noir-contracts.js/TokenBridge";
import {
  computeL2ToL1MessageHash,
  computeSecretHash,
} from "@aztec/stdlib/hash";
import { createAztecNodeDebugClient } from "@aztec/stdlib/interfaces/client";
import { decodeEventLog, encodeFunctionData, pad } from "@aztec/viem";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { foundry } from "@aztec/viem/chains";
import ExampleERC20 from "../../../target/solidity/example_swap/ExampleERC20.sol/ExampleERC20.json" with { type: "json" };
import ExampleTokenPortal from "../../../target/solidity/example_swap/ExampleTokenPortal.sol/ExampleTokenPortal.json" with { type: "json" };
import ExampleUniswapPortal from "../../../target/solidity/example_swap/ExampleUniswapPortal.sol/ExampleUniswapPortal.json" with { type: "json" };
import { ExampleUniswapContract } from "./artifacts/ExampleUniswap.js";

// Setup L1 client
const MNEMONIC = "test test test test test test test test test test test junk";
const l1RpcUrl = process.env.ETHEREUM_HOST ?? "http://localhost:8545";
const l1Client = createExtendedL1Client([l1RpcUrl], MNEMONIC);
const ownerEthAddress = l1Client.account.address;

// Setup L2 client
console.log("Setting up L2...\n");
const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });
const [accData] = await getInitialTestAccountsData();
const account = await wallet.createSchnorrInitializerlessAccount(
  accData.secret,
  accData.salt,
  accData.signingKey,
);
console.log(`Account: ${account.address.toString()}\n`);

const nodeInfo = await node.getNodeInfo();
const registryAddress = nodeInfo.l1ContractAddresses.registryAddress.toString();
const inboxAddress = nodeInfo.l1ContractAddresses.inboxAddress.toString();
// docs:end:setup

// docs:start:deploy_l1
console.log("Deploying L1 contracts...\n");

// Deploy two ERC20 tokens: WETH (input) and DAI (output)
const { address: wethAddress } = await deployL1Contract(
  l1Client,
  ExampleERC20.abi,
  ExampleERC20.bytecode.object as `0x${string}`,
  ["Wrapped Ether", "WETH"],
);

const { address: daiAddress } = await deployL1Contract(
  l1Client,
  ExampleERC20.abi,
  ExampleERC20.bytecode.object as `0x${string}`,
  ["Dai Stablecoin", "DAI"],
);

// Deploy two token portals (one per token)
const { address: wethPortalAddress } = await deployL1Contract(
  l1Client,
  ExampleTokenPortal.abi,
  ExampleTokenPortal.bytecode.object as `0x${string}`,
);

const { address: daiPortalAddress } = await deployL1Contract(
  l1Client,
  ExampleTokenPortal.abi,
  ExampleTokenPortal.bytecode.object as `0x${string}`,
);

// Deploy the uniswap portal
const { address: uniswapPortalAddress } = await deployL1Contract(
  l1Client,
  ExampleUniswapPortal.abi,
  ExampleUniswapPortal.bytecode.object as `0x${string}`,
);

console.log(`WETH: ${wethAddress}`);
console.log(`DAI: ${daiAddress}`);
console.log(`WETH Portal: ${wethPortalAddress}`);
console.log(`DAI Portal: ${daiPortalAddress}`);
console.log(`Uniswap Portal: ${uniswapPortalAddress}\n`);
// docs:end:deploy_l1

// docs:start:deploy_l2
console.log("Deploying L2 contracts...\n");

// Deploy L2 tokens (using the standard TokenContract from @aztec/noir-contracts.js)
const { contract: l2Weth } = await TokenContract.deploy(
  wallet,
  account.address,
  "Wrapped Ether",
  "WETH",
  18,
).send({ from: account.address });

const { contract: l2Dai } = await TokenContract.deploy(
  wallet,
  account.address,
  "Dai Stablecoin",
  "DAI",
  18,
).send({ from: account.address });

// Deploy L2 token bridges
const { contract: l2WethBridge } = await TokenBridgeContract.deploy(
  wallet,
  l2Weth.address,
  wethPortalAddress,
).send({ from: account.address });

const { contract: l2DaiBridge } = await TokenBridgeContract.deploy(
  wallet,
  l2Dai.address,
  daiPortalAddress,
).send({ from: account.address });

// Deploy L2 uniswap contract
const { contract: l2Uniswap } = await ExampleUniswapContract.deploy(
  wallet,
  EthAddress.fromString(uniswapPortalAddress.toString()),
).send({ from: account.address });

console.log(`L2 WETH: ${l2Weth.address}`);
console.log(`L2 DAI: ${l2Dai.address}`);
console.log(`L2 WETH Bridge: ${l2WethBridge.address}`);
console.log(`L2 DAI Bridge: ${l2DaiBridge.address}`);
console.log(`L2 Uniswap: ${l2Uniswap.address}\n`);
// docs:end:deploy_l2

// docs:start:initialize
console.log("Initializing contracts...\n");

// Make bridges minters on their respective tokens
await l2Weth.methods
  .set_minter(l2WethBridge.address, true)
  .send({ from: account.address });
await l2Dai.methods
  .set_minter(l2DaiBridge.address, true)
  .send({ from: account.address });

// Initialize L1 portals with registry, underlying token, and L2 bridge addresses
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initWethPortal = await l1Client.writeContract({
  address: wethPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "initialize",
  args: [
    registryAddress,
    wethAddress.toString(),
    l2WethBridge.address.toString(),
  ],
});
await l1Client.waitForTransactionReceipt({ hash: initWethPortal });

// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initDaiPortal = await l1Client.writeContract({
  address: daiPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "initialize",
  args: [
    registryAddress,
    daiAddress.toString(),
    l2DaiBridge.address.toString(),
  ],
});
await l1Client.waitForTransactionReceipt({ hash: initDaiPortal });

// Initialize uniswap portal
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initUniswapPortal = await l1Client.writeContract({
  address: uniswapPortalAddress.toString() as `0x${string}`,
  abi: ExampleUniswapPortal.abi,
  functionName: "initialize",
  args: [registryAddress, l2Uniswap.address.toString()],
});
await l1Client.waitForTransactionReceipt({ hash: initUniswapPortal });

console.log("All contracts initialized\n");
// docs:end:initialize

// docs:start:fund
console.log("Funding accounts...\n");

const SWAP_AMOUNT = 100n * 10n ** 18n; // 100 tokens

// Mint WETH on L1 for the user
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const mintWethHash = await l1Client.writeContract({
  address: wethAddress.toString() as `0x${string}`,
  abi: ExampleERC20.abi,
  functionName: "mint",
  args: [ownerEthAddress, SWAP_AMOUNT],
});
await l1Client.waitForTransactionReceipt({ hash: mintWethHash });

// Pre-fund the uniswap portal with DAI (for the mock 1:1 swap)
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const mintDaiHash = await l1Client.writeContract({
  address: daiAddress.toString() as `0x${string}`,
  abi: ExampleERC20.abi,
  functionName: "mint",
  args: [uniswapPortalAddress.toString(), SWAP_AMOUNT * 2n],
});
await l1Client.waitForTransactionReceipt({ hash: mintDaiHash });

console.log(`Minted ${SWAP_AMOUNT} WETH to user`);
console.log(`Pre-funded uniswap portal with ${SWAP_AMOUNT * 2n} DAI\n`);
// docs:end:fund

// docs:start:deposit_to_l2
console.log("Depositing WETH to Aztec (L1 -> L2)...\n");

const depositSecret = Fr.random();
const depositSecretHash = await computeSecretHash(depositSecret);

// Approve WETH portal to take tokens
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const approveHash = await l1Client.writeContract({
  address: wethAddress.toString() as `0x${string}`,
  abi: ExampleERC20.abi,
  functionName: "approve",
  args: [wethPortalAddress.toString(), SWAP_AMOUNT],
});
await l1Client.waitForTransactionReceipt({ hash: approveHash });

// Deposit to Aztec publicly
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const depositHash = await l1Client.writeContract({
  address: wethPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "depositToAztecPublic",
  args: [
    account.address.toString(),
    SWAP_AMOUNT,
    pad(depositSecretHash.toString() as `0x${string}`, {
      dir: "left",
      size: 32,
    }),
  ],
});
const depositReceipt = await l1Client.waitForTransactionReceipt({
  hash: depositHash,
});

// Extract message leaf index from Inbox event
const INBOX_ABI = [
  {
    type: "event",
    name: "MessageSent",
    inputs: [
      { name: "checkpointNumber", type: "uint256", indexed: true },
      { name: "index", type: "uint256", indexed: false },
      { name: "hash", type: "bytes32", indexed: true },
      { name: "rollingHash", type: "bytes16", indexed: false },
      { name: "inboxRollingHash", type: "bytes32", indexed: false },
      { name: "bucketSeq", type: "uint256", indexed: false },
    ],
  },
] as const;

const messageSentLogs = depositReceipt.logs
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

if (messageSentLogs.length === 0) {
  throw new Error("No MessageSent events found in deposit transaction");
}
const depositLeafIndex = new Fr(messageSentLogs[0].decoded.args.index);
console.log(`Deposit message leaf index: ${depositLeafIndex}\n`);
// docs:end:deposit_to_l2

// docs:start:mine_blocks
// Utility: mine 2 blocks (required before L1->L2 messages can be consumed)
async function mine2Blocks(
  wallet: EmbeddedWallet,
  accountAddress: AztecAddress,
) {
  await TokenContract.deploy(wallet, accountAddress, "T", "T", 18).send({
    from: accountAddress,
  });
  await TokenContract.deploy(wallet, accountAddress, "T", "T", 18).send({
    from: accountAddress,
  });
}
// docs:end:mine_blocks

// docs:start:claim_on_l2
console.log("Claiming WETH on L2...\n");

await mine2Blocks(wallet, account.address);

await l2WethBridge.methods
  .claim_public(account.address, SWAP_AMOUNT, depositSecret, depositLeafIndex)
  .send({ from: account.address });

const { result: wethBalanceBefore } = await l2Weth.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });
console.log(`L2 WETH balance after claim: ${wethBalanceBefore}\n`);
if (wethBalanceBefore !== SWAP_AMOUNT) {
  throw new Error(
    `Expected WETH balance ${SWAP_AMOUNT}, got ${wethBalanceBefore}`,
  );
}
console.log("✓ WETH claimed successfully on L2\n");
// docs:end:claim_on_l2

// docs:start:public_swap
console.log("=== PUBLIC SWAP FLOW ===\n");
console.log("Initiating public swap on L2 (WETH -> DAI)...\n");

// Force L2 block production so the claim message is included in a block before the swap
await mine2Blocks(wallet, account.address);

const swapSecret = Fr.random();
const swapSecretHash = await computeSecretHash(swapSecret);

// Create authwit for the uniswap contract to transfer WETH on our behalf
const transferAction = l2Weth.methods.transfer_in_public(
  account.address,
  l2Uniswap.address,
  SWAP_AMOUNT,
  0xdeadbeefn,
);
const authwit = await SetPublicAuthwitContractInteraction.create(
  wallet,
  account.address,
  { caller: l2Uniswap.address, action: transferAction },
  true,
);
await authwit.send();

// Call swap_public on the L2 uniswap contract
const { receipt: swapReceipt } = await l2Uniswap.methods
  .swap_public(
    account.address,
    l2WethBridge.address,
    SWAP_AMOUNT,
    l2DaiBridge.address,
    3000n, // fee tier
    0n, // minimum output
    account.address, // recipient
    swapSecretHash,
  )
  .send({ from: account.address });

console.log(`Swap tx sent (block: ${swapReceipt.blockNumber})\n`);

// Verify WETH was spent (balance should be 0 after swap)
const { result: wethAfterSwap } = await l2Weth.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });
if (wethAfterSwap !== 0n) {
  throw new Error(`Expected WETH balance 0 after swap, got ${wethAfterSwap}`);
}
console.log("✓ WETH transferred to bridge for swap\n");
// docs:end:public_swap

// docs:start:wait_for_proof
const isLocalNetwork =
  nodeUrl.includes("localhost") ||
  nodeUrl.includes("127.0.0.1") ||
  nodeUrl.includes("local-network");
const nodeDebug = isLocalNetwork
  ? createAztecNodeDebugClient(nodeUrl)
  : undefined;

console.log("Waiting for block to be proven...\n");

let provenBlockNumber = await node.getBlockNumber("proven");
while (provenBlockNumber < swapReceipt.blockNumber!) {
  console.log(
    `   Waiting... (proven: ${provenBlockNumber}, needed: ${swapReceipt.blockNumber})`,
  );
  if (nodeDebug) {
    await nodeDebug.mineBlock();
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
  provenBlockNumber = await node.getBlockNumber("proven");
}

console.log("Block proven!\n");
// docs:end:wait_for_proof

// docs:start:consume_l1_messages_setup
console.log("Consuming L2->L1 messages on L1...\n");

// The swap generates 2 L2->L1 messages:
// 1. Token bridge exit (withdraw WETH to uniswap portal)
// 2. Uniswap swap intent

// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const portalRollupVersion = (await l1Client.readContract({
  address: wethPortalAddress.toString() as `0x${string}`,
  abi: ExampleTokenPortal.abi,
  functionName: "rollupVersion",
})) as bigint;

// Compute message 1: token bridge exit
// Encode using the same approach as Solidity's abi.encodeWithSignature("withdraw(address,uint256,address)", ...)
const withdrawContentEncoded = encodeFunctionData({
  abi: [
    {
      name: "withdraw",
      type: "function",
      inputs: [
        { name: "", type: "address" },
        { name: "", type: "uint256" },
        { name: "", type: "address" },
      ],
      outputs: [],
    },
  ],
  args: [
    uniswapPortalAddress.toString() as `0x${string}`,
    SWAP_AMOUNT,
    uniswapPortalAddress.toString() as `0x${string}`,
  ],
});
const withdrawContentHash = sha256ToField([
  Buffer.from(withdrawContentEncoded.slice(2), "hex"),
]);

// Message 1: Token bridge exit message
const exitMsgLeaf = computeL2ToL1MessageHash({
  l2Sender: l2WethBridge.address,
  l1Recipient: wethPortalAddress,
  content: withdrawContentHash,
  rollupVersion: new Fr(portalRollupVersion),
  chainId: new Fr(foundry.id),
});
// docs:end:consume_l1_messages_setup

// docs:start:consume_l1_messages_witnesses
// The node picks the smallest partial-proof root that covers each tx's checkpoint.
const waitForL2ToL1MembershipWitness = async (
  messageName: string,
  messageLeaf: Fr,
) => {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const witness = await node.getL2ToL1MembershipWitness(
      swapReceipt.txHash,
      messageLeaf,
    );
    if (witness) {
      return witness;
    }

    console.log(
      `   Waiting for ${messageName} L2->L1 witness (${attempt}/${maxAttempts})...`,
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  throw new Error(`Timed out waiting for ${messageName} L2->L1 witness`);
};

const exitWitness = await waitForL2ToL1MembershipWitness(
  "token bridge exit",
  exitMsgLeaf,
);
const exitSiblingPath = exitWitness.siblingPath
  .toBufferArray()
  .map((buf: Buffer) => `0x${buf.toString("hex")}` as `0x${string}`);

// Message 2: Uniswap swap intent message
// Compute using the same encoding as ExampleUniswapPortal.sol
const swapContentEncoded = encodeFunctionData({
  abi: [
    {
      name: "swap_public",
      type: "function",
      inputs: [
        { name: "", type: "address" },
        { name: "", type: "uint256" },
        { name: "", type: "uint24" },
        { name: "", type: "address" },
        { name: "", type: "uint256" },
        { name: "", type: "bytes32" },
        { name: "", type: "bytes32" },
      ],
      outputs: [],
    },
  ],
  args: [
    wethPortalAddress.toString() as `0x${string}`,
    SWAP_AMOUNT,
    3000,
    daiPortalAddress.toString() as `0x${string}`,
    0n,
    account.address.toString() as `0x${string}`,
    pad(swapSecretHash.toString() as `0x${string}`, {
      dir: "left",
      size: 32,
    }),
  ],
});

const swapContentHash = sha256ToField([
  Buffer.from(swapContentEncoded.slice(2), "hex"),
]);

const swapMsgLeaf = computeL2ToL1MessageHash({
  l2Sender: l2Uniswap.address,
  l1Recipient: uniswapPortalAddress,
  content: swapContentHash,
  rollupVersion: new Fr(portalRollupVersion),
  chainId: new Fr(foundry.id),
});

const swapWitness = await waitForL2ToL1MembershipWitness(
  "swap intent",
  swapMsgLeaf,
);
const swapSiblingPath = swapWitness.siblingPath
  .toBufferArray()
  .map((buf: Buffer) => `0x${buf.toString("hex")}` as `0x${string}`);
// docs:end:consume_l1_messages_witnesses

// docs:start:consume_l1_messages_execute
// Execute the swap on L1 (consumes both messages)
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const l1SwapHash = await l1Client.writeContract({
  address: uniswapPortalAddress.toString() as `0x${string}`,
  abi: ExampleUniswapPortal.abi,
  functionName: "swapPublic",
  args: [
    wethPortalAddress.toString(),
    SWAP_AMOUNT,
    3000,
    daiPortalAddress.toString(),
    0n,
    account.address.toString(),
    pad(swapSecretHash.toString() as `0x${string}`, {
      dir: "left",
      size: 32,
    }),
    [BigInt(exitWitness.epochNumber), BigInt(swapWitness.epochNumber)],
    [
      BigInt(exitWitness.numCheckpointsInEpoch),
      BigInt(swapWitness.numCheckpointsInEpoch),
    ],
    [BigInt(exitWitness.leafIndex), BigInt(swapWitness.leafIndex)],
    [exitSiblingPath, swapSiblingPath],
  ],
});
const l1SwapReceipt = await l1Client.waitForTransactionReceipt({
  hash: l1SwapHash,
});
console.log(`L1 swap executed! Tx: ${l1SwapHash}\n`);
// docs:end:consume_l1_messages_execute

// docs:start:claim_output
console.log("Claiming DAI output on L2...\n");

// Extract the deposit message leaf index from the L1 swap receipt
const daiDepositLogs = l1SwapReceipt.logs
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

if (daiDepositLogs.length === 0) {
  throw new Error("No MessageSent events found in L1 swap transaction");
}
const daiDepositLeafIndex = new Fr(daiDepositLogs[0].decoded.args.index);

// Mine blocks and claim
await mine2Blocks(wallet, account.address);

await l2DaiBridge.methods
  .claim_public(account.address, SWAP_AMOUNT, swapSecret, daiDepositLeafIndex)
  .send({ from: account.address });

const { result: daiBalance } = await l2Dai.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });

const { result: wethBalanceAfter } = await l2Weth.methods
  .balance_of_public(account.address)
  .simulate({ from: account.address });

console.log(`L2 WETH balance: ${wethBalanceAfter}`);
console.log(`L2 DAI balance: ${daiBalance}`);

if (wethBalanceAfter !== 0n) {
  throw new Error(`Expected final WETH balance 0, got ${wethBalanceAfter}`);
}
if (daiBalance !== SWAP_AMOUNT) {
  throw new Error(`Expected DAI balance ${SWAP_AMOUNT}, got ${daiBalance}`);
}
console.log("\n✓ All checks passed — public swap complete!\n");
// docs:end:claim_output
