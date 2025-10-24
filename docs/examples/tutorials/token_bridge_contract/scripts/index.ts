// @ts-nocheck

// docs:start:setup
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, pad, getAbiItem, toEventHash } from 'viem';
import { foundry } from 'viem/chains';
import { EthAddress, createAztecNodeClient, computeSecretHash, Fr, type AztecNode } from '@aztec/aztec.js';
import { computeL2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import { sha256ToField } from '@aztec/foundation/crypto';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import { TestWallet } from '@aztec/test-wallet/server';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import SimpleNFT from '../artifacts/contracts/SimpleNFT.sol/SimpleNFT.json';
import NFTPortal from '../artifacts/contracts/NFTPortal.sol/NFTPortal.json';
import { NFTPunkContract } from '../contracts/aztec/artifacts/NFTPunk.js';
import { NFTBridgeContract } from '../contracts/aztec/artifacts/NFTBridge.js';

    // Setup L1 clients using anvil's 1st account which should have a ton of ETH already
    const l1Account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const publicClient = createPublicClient({
        chain: foundry,
        transport: http('http://localhost:8545'),
    });
    const ethWallet = createWalletClient({
        account: l1Account,
        chain: foundry,
        transport: http('http://localhost:8545'),
    });

    // Setup L2 using Aztec's sandbox and one of its initial accounts
    console.log('🔮 Setting up L2...\n');
    const node = createAztecNodeClient("http://localhost:8080");
    const aztecWallet = await TestWallet.create(node);
    const [accData] = await getInitialTestAccountsData();
    const account = await aztecWallet.createSchnorrAccount(accData.secret, accData.salt);
    console.log(`✅ Account: ${account.address.toString()}\n`);

    // Get node info
    const nodeInfo = await node.getNodeInfo();
    const registryAddress = nodeInfo.l1ContractAddresses.registryAddress.toString();
    const inboxAddress = nodeInfo.l1ContractAddresses.inboxAddress.toString();
    // docs:end:setup

    // docs:start:deploy_l1_contracts
    console.log('📦 Deploying L1 contracts...\n');

    const nftDeploymentHash = await ethWallet.deployContract({
        abi: SimpleNFT.abi,
        bytecode: SimpleNFT.bytecode as `0x${string}`,
    });
    const nftReceipt = await publicClient.waitForTransactionReceipt({ hash: nftDeploymentHash });
    const nftAddress = nftReceipt.contractAddress!;

    const portalDeploymentHash = await ethWallet.deployContract({
        abi: NFTPortal.abi,
        bytecode: NFTPortal.bytecode as `0x${string}`,
    });
    const portalReceipt = await publicClient.waitForTransactionReceipt({ hash: portalDeploymentHash });
    const portalAddress = portalReceipt.contractAddress!;

    console.log(`✅ SimpleNFT: ${nftAddress}`);
    console.log(`✅ NFTPortal: ${portalAddress}\n`);
    // docs:end:deploy_l1_contracts

    // docs:start:deploy_l2_contracts
    console.log('📦 Deploying L2 contracts...\n');

    const l2Nft = await NFTPunkContract.deploy(aztecWallet, account.address)
        .send({ from: account.address })
        .deployed();

    const l2Bridge = await NFTBridgeContract.deploy(aztecWallet, l2Nft.address)
        .send({ from: account.address })
        .deployed();

    console.log(`✅ L2 NFT: ${l2Nft.address.toString()}`);
    console.log(`✅ L2 Bridge: ${l2Bridge.address.toString()}\n`);
    // docs:end:deploy_l2_contracts

    // docs:start:initialize_portal
    console.log('🔧 Initializing portal...');

    const hash = await ethWallet.writeContract({
        address: portalAddress as `0x${string}`,
        abi: NFTPortal.abi,
        functionName: 'initialize',
        args: [
            registryAddress as `0x${string}`,
            nftAddress as `0x${string}`,
            l2Bridge.address.toString() as `0x${string}`
        ],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    console.log('✅ Portal initialized\n');
    // docs:end:initialize_portal

    // docs:start:initialize_l2_bridge
    console.log('🔧 Setting up L2 bridge...');

    await l2Bridge.methods.set_portal(EthAddress.fromString(portalAddress))
        .send({ from: account.address })
        .wait();

    await l2Nft.methods.set_minter(l2Bridge.address)
        .send({ from: account.address })
        .wait();

    console.log('✅ Bridge configured\n');
    // docs:end:initialize_l2_bridge

    // docs:start:mint_nft_l1
    console.log('🎨 Minting NFT on L1...');

    const mintHash = await ethWallet.writeContract({
        address: nftAddress as `0x${string}`,
        abi: SimpleNFT.abi,
        functionName: 'mint',
        args: [l1Account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    // no need to parse logs, this will be tokenId 0 since it's a fresh contract
    const tokenId = 0n;

    console.log(`✅ Minted tokenId: ${tokenId}\n`);
    // docs:end:mint_nft_l1

    // docs:start:deposit_to_aztec
    console.log('🌉 Depositing NFT to Aztec...');

    const secret = Fr.random();
    const secretHash = await computeSecretHash(secret);

    const approveHash = await ethWallet.writeContract({
        address: nftAddress as `0x${string}`,
        abi: SimpleNFT.abi,
        functionName: 'approve',
        args: [portalAddress as `0x${string}`, tokenId],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    const depositHash = await ethWallet.writeContract({
        address: portalAddress as `0x${string}`,
        abi: NFTPortal.abi,
        functionName: 'depositToAztec',
        args: [tokenId, pad(secretHash.toString() as `0x${string}`, { dir: 'left', size: 32 })],
    });
    const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
    // docs:end:deposit_to_aztec

    // docs:start:get_message_leaf_index
    const INBOX_ABI = [{
        type: 'event',
        name: 'MessageSent',
        inputs: [
            { name: 'l2BlockNumber', type: 'uint256', indexed: true },
            { name: 'index', type: 'uint256', indexed: false },
            { name: 'hash', type: 'bytes32', indexed: true },
            { name: 'rollingHash', type: 'bytes16', indexed: false }
        ]
    }] as const;
    const messageSentTopic = toEventHash(INBOX_ABI[0]);
    const messageSentLog = depositReceipt.logs!.find(
        (log: any) => log.address.toLowerCase() === inboxAddress.toLowerCase() &&
               log.topics[0] === messageSentTopic
    );

    const indexHex = messageSentLog!.data!.slice(0, 66);
    const messageLeafIndex = new Fr(BigInt(indexHex));
    // docs:end:get_message_leaf_index


    // docs:start:mine_blocks
    async function mine2Blocks(aztecWallet: TestWallet, accountAddress: any) {
        await NFTPunkContract.deploy(aztecWallet, accountAddress)
            .send({ from: accountAddress, contractAddressSalt: Fr.random() })
            .deployed();
        await NFTPunkContract.deploy(aztecWallet, accountAddress)
            .send({ from: accountAddress, contractAddressSalt: Fr.random() })
            .deployed();
    }
    // docs:end:mine_blocks

    // docs:start:claim_on_l2
    // Mine blocks
    await mine2Blocks(aztecWallet, account.address);

    // Check notes before claiming (should be 0)
    console.log('📝 Checking notes before claim...');
    const notesBefore = await l2Nft.methods.notes_of(account.address).simulate({ from: account.address });
    console.log(`   Notes count: ${notesBefore}`);

    console.log('🎯 Claiming NFT on L2...');
    await l2Bridge.methods.claim(
        account.address,
        new Fr(Number(tokenId)),
        secret,
        messageLeafIndex
    )
        .send({ from: account.address })
        .wait();
    console.log('✅ NFT claimed on L2\n');

    // Check notes after claiming (should be 1)
    console.log('📝 Checking notes after claim...');
    const notesAfterClaim = await l2Nft.methods.notes_of(account.address).simulate({ from: account.address });
    console.log(`   Notes count: ${notesAfterClaim}\n`);
    // docs:end:claim_on_l2

    // docs:start:exit_from_l2
    // L2 → L1 flow
    console.log('🚪 Exiting NFT from L2...');
    // Mine blocks
    await mine2Blocks(aztecWallet, account.address);

    const recipientEthAddress = EthAddress.fromString(l1Account.address);

    const exitReceipt = await l2Bridge.methods.exit(
        new Fr(Number(tokenId)),
        recipientEthAddress
    )
        .send({ from: account.address })
        .wait();

    console.log(`✅ Exit message sent (block: ${exitReceipt.blockNumber})\n`);

    // Check notes after burning (should be 0 again)
    console.log('📝 Checking notes after burn...');
    const notesAfterBurn = await l2Nft.methods.notes_of(account.address).simulate({ from: account.address });
    console.log(`   Notes count: ${notesAfterBurn}\n`);
    // docs:end:exit_from_l2

    // docs:start:get_withdrawal_witness
    // Compute the message hash directly from known parameters
    // This matches what the portal contract expects: Hash.sha256ToField(abi.encodePacked(tokenId, recipient))
    const tokenIdBuffer = new Fr(Number(tokenId)).toBuffer();
    const recipientBuffer = Buffer.from(recipientEthAddress.toString().slice(2), 'hex');
    const content = sha256ToField([Buffer.concat([tokenIdBuffer, recipientBuffer])]);

    // Get rollup version from the portal contract (it stores it during initialize)
    const version = await publicClient.readContract({
        address: portalAddress as `0x${string}`,
        abi: NFTPortal.abi,
        functionName: 'rollupVersion'
    });

    // Compute the L2→L1 message hash
    const msgLeaf = computeL2ToL1MessageHash({
        l2Sender: l2Bridge.address,
        l1Recipient: EthAddress.fromString(portalAddress),
        content,
        rollupVersion: new Fr(version),
        chainId: new Fr(foundry.id),
    });

    // Compute the membership witness using the message hash
    const witness = await computeL2ToL1MembershipWitness(node, exitReceipt.blockNumber!, msgLeaf);
    const siblingPathHex = witness!.siblingPath.toBufferArray().map((buf: Buffer) =>
        `0x${buf.toString('hex')}` as `0x${string}`
    );
    // docs:end:get_withdrawal_witness

    // docs:start:withdraw_on_l1
    console.log('💰 Withdrawing NFT on L1...');
    const withdrawHash = await ethWallet.writeContract({
        address: portalAddress as `0x${string}`,
        abi: NFTPortal.abi,
        functionName: 'withdraw',
        args: [
            tokenId,
            BigInt(exitReceipt.blockNumber!),
            BigInt(witness!.leafIndex),
            siblingPathHex,
        ],
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    console.log('✅ NFT withdrawn to L1\n');
    // docs:end:withdraw_on_l1


