// docs:start:setup
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { deployL1Contract } from "@aztec/ethereum/deploy-l1-contract";
import { sha256ToField } from "@aztec/foundation/crypto/sha256";
import {
  computeL2ToL1MessageHash,
  computeSecretHash,
} from "@aztec/stdlib/hash";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { decodeEventLog, pad } from "@aztec/viem";
import { foundry } from "@aztec/viem/chains";
import NFTPortal from "../../../target/solidity/nft_bridge/NFTPortal.sol/NFTPortal.json" with { type: "json" };
import SimpleNFT from "../../../target/solidity/nft_bridge/SimpleNFT.sol/SimpleNFT.json" with { type: "json" };
import { NFTBridgeContract } from "./artifacts/NFTBridge.js";
import { NFTPunkContract } from "./artifacts/NFTPunk.js";

// Setup L1 client using anvil's default mnemonic (same as e2e tests)
const MNEMONIC = "test test test test test test test test test test test junk";
const l1Client = createExtendedL1Client(["http://localhost:8545"], MNEMONIC);
const ownerEthAddress = l1Client.account.address;

// Setup L2 using Aztec's local network and one of its initial accounts
console.log("Setting up L2...\n");
const node = createAztecNodeClient("http://localhost:8080");
const aztecWallet = await EmbeddedWallet.create(node);
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

// docs:start:deploy_l1_contracts
console.log("Deploying L1 contracts...\n");

const { address: nftAddress } = await deployL1Contract(
  l1Client,
  SimpleNFT.abi,
  SimpleNFT.bytecode.object as `0x${string}`,
);

const { address: portalAddress } = await deployL1Contract(
  l1Client,
  NFTPortal.abi,
  NFTPortal.bytecode.object as `0x${string}`,
);

console.log(`SimpleNFT: ${nftAddress}`);
console.log(`NFTPortal: ${portalAddress}\n`);
// docs:end:deploy_l1_contracts

// docs:start:deploy_l2_contracts
console.log("Deploying L2 contracts...\n");

const { contract: l2Nft } = await NFTPunkContract.deploy(
  aztecWallet,
  account.address,
).send({
  from: account.address,
});

const { contract: l2Bridge } = await NFTBridgeContract.deploy(
  aztecWallet,
  l2Nft.address,
).send({ from: account.address });

console.log(`L2 NFT: ${l2Nft.address.toString()}`);
console.log(`L2 Bridge: ${l2Bridge.address.toString()}\n`);
// docs:end:deploy_l2_contracts

// docs:start:initialize_portal
console.log("Initializing portal...");

// Initialize the portal contract
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const initHash = await l1Client.writeContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: NFTPortal.abi,
  functionName: "initialize",
  args: [registryAddress, nftAddress.toString(), l2Bridge.address.toString()],
});
await l1Client.waitForTransactionReceipt({ hash: initHash });

console.log("Portal initialized\n");
// docs:end:initialize_portal

// docs:start:initialize_l2_bridge
console.log("Setting up L2 bridge...");

await l2Bridge.methods
  .set_portal(EthAddress.fromString(portalAddress.toString()))
  .send({ from: account.address });

await l2Nft.methods
  .set_minter(l2Bridge.address)
  .send({ from: account.address });

console.log("Bridge configured\n");
// docs:end:initialize_l2_bridge

// docs:start:mint_nft_l1
console.log("Minting NFT on L1...");

// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const mintHash = await l1Client.writeContract({
  address: nftAddress.toString() as `0x${string}`,
  abi: SimpleNFT.abi,
  functionName: "mint",
  args: [ownerEthAddress],
});
await l1Client.waitForTransactionReceipt({ hash: mintHash });

// no need to parse logs, this will be tokenId 0 since it's a fresh contract
const tokenId = 0n;

console.log(`Minted tokenId: ${tokenId}\n`);
// docs:end:mint_nft_l1

// docs:start:deposit_to_aztec
console.log("Depositing NFT to Aztec...");

const secret = Fr.random();
const secretHash = await computeSecretHash(secret);

// Approve portal to transfer the NFT
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const approveHash = await l1Client.writeContract({
  address: nftAddress.toString() as `0x${string}`,
  abi: SimpleNFT.abi,
  functionName: "approve",
  args: [portalAddress.toString(), tokenId],
});
await l1Client.waitForTransactionReceipt({ hash: approveHash });

// Deposit to Aztec
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const depositHash = await l1Client.writeContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: NFTPortal.abi,
  functionName: "depositToAztec",
  args: [
    tokenId,
    pad(secretHash.toString() as `0x${string}`, { dir: "left", size: 32 }),
  ],
});
const depositReceipt = await l1Client.waitForTransactionReceipt({
  hash: depositHash,
});
// docs:end:deposit_to_aztec

// docs:start:get_message_leaf_index
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

// Find and decode the MessageSent event from the Inbox contract
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
      // Not a decodable event from this ABI
      return null;
    }
  })
  .filter(
    (item): item is { log: any; decoded: any } =>
      item !== null && (item.decoded as any).eventName === "MessageSent",
  );

const messageLeafIndex = new Fr(messageSentLogs[0].decoded.args.index);
// docs:end:get_message_leaf_index

// docs:start:mine_blocks
async function mine2Blocks(
  aztecWallet: EmbeddedWallet,
  accountAddress: AztecAddress,
) {
  await NFTPunkContract.deploy(aztecWallet, accountAddress).send({
    from: accountAddress,
  });
  await NFTPunkContract.deploy(aztecWallet, accountAddress).send({
    from: accountAddress,
  });
}
// docs:end:mine_blocks

// docs:start:claim_on_l2
// Mine blocks
await mine2Blocks(aztecWallet, account.address);

// Check notes before claiming (should be 0)
console.log("Checking notes before claim...");
const { result: notesBefore } = await l2Nft.methods
  .notes_of(account.address)
  .simulate({ from: account.address });
console.log(`   Notes count: ${notesBefore}`);

console.log("Claiming NFT on L2...");
await l2Bridge.methods
  .claim(account.address, new Fr(Number(tokenId)), secret, messageLeafIndex)
  .send({ from: account.address });
console.log("NFT claimed on L2\n");

// Check notes after claiming (should be 1)
console.log("Checking notes after claim...");
const { result: notesAfterClaim } = await l2Nft.methods
  .notes_of(account.address)
  .simulate({ from: account.address });
console.log(`   Notes count: ${notesAfterClaim}\n`);
// docs:end:claim_on_l2

// docs:start:exit_from_l2
// L2 -> L1 flow
console.log("Exiting NFT from L2...");
// Mine blocks, not necessary on devnet, but must wait for 2 blocks
await mine2Blocks(aztecWallet, account.address);

const recipientEthAddress = EthAddress.fromString(ownerEthAddress);

const { receipt: exitReceipt } = await l2Bridge.methods
  .exit(new Fr(Number(tokenId)), recipientEthAddress)
  .send({ from: account.address });

console.log(`Exit message sent (block: ${exitReceipt.blockNumber})\n`);

// Check notes after burning (should be 0 again)
console.log("Checking notes after burn...");
const { result: notesAfterBurn } = await l2Nft.methods
  .notes_of(account.address)
  .simulate({ from: account.address });
console.log(`   Notes count: ${notesAfterBurn}\n`);
// docs:end:exit_from_l2

// docs:start:get_withdrawal_witness
// Compute the message hash directly from known parameters
// This matches what the portal contract expects: Hash.sha256ToField(abi.encodePacked(tokenId, recipient))
const tokenIdBuffer = new Fr(Number(tokenId)).toBuffer();
const recipientBuffer = Buffer.from(
  recipientEthAddress.toString().slice(2),
  "hex",
);
const content = sha256ToField([tokenIdBuffer, recipientBuffer]);

// Get rollup version from the portal contract (it stores it during initialize)
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const version = (await l1Client.readContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: NFTPortal.abi,
  functionName: "rollupVersion",
})) as bigint;

// Compute the L2->L1 message hash
const msgLeaf = computeL2ToL1MessageHash({
  l2Sender: l2Bridge.address,
  l1Recipient: EthAddress.fromString(portalAddress.toString()),
  content,
  rollupVersion: new Fr(version),
  chainId: new Fr(foundry.id),
});

// Wait for the block to be proven before withdrawing
// Waiting for the block to be proven is not necessary on the local network, but it is necessary on devnet
console.log("Waiting for block to be proven...");
console.log(`   Exit block number: ${exitReceipt.blockNumber}`);

let provenBlockNumber = await node.getBlockNumber("proven");
console.log(`   Current proven block: ${provenBlockNumber}`);

while (provenBlockNumber < exitReceipt.blockNumber!) {
  console.log(
    `   Waiting... (proven: ${provenBlockNumber}, needed: ${exitReceipt.blockNumber})`,
  );
  await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
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
console.log(`   Epoch for block ${exitReceipt.blockNumber}: ${epoch}`);

const siblingPathHex = witness!.siblingPath
  .toBufferArray()
  .map((buf: Buffer) => `0x${buf.toString("hex")}` as `0x${string}`);
// docs:end:get_withdrawal_witness

// docs:start:withdraw_on_l1
console.log("Withdrawing NFT on L1...");
// @ts-expect-error - viem type inference doesn't work with JSON-imported ABIs
const withdrawHash = await l1Client.writeContract({
  address: portalAddress.toString() as `0x${string}`,
  abi: NFTPortal.abi,
  functionName: "withdraw",
  args: [
    tokenId,
    BigInt(epoch),
    BigInt(numCheckpointsInEpoch),
    BigInt(witness!.leafIndex),
    siblingPathHex,
  ],
});
await l1Client.waitForTransactionReceipt({ hash: withdrawHash });
console.log("NFT withdrawn to L1\n");
// docs:end:withdraw_on_l1
