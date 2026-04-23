import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, waitForProven } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { deriveKeys } from '@aztec/aztec.js/keys';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { Buffer32 } from '@aztec/foundation/buffer';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { retryUntil } from '@aztec/foundation/retry';
import type { Tuple } from '@aztec/foundation/serialize';
import {
  MockERC20Abi,
  MockERC20Bytecode,
  MockPredicateAbi,
  MockPredicateBytecode,
  TEEPortalAbi,
  TEEPortalBytecode,
  TeeRegistryAbi,
  TeeRegistryBytecode,
} from '@aztec/l1-artifacts';
import { AssertedTokenContractContract } from '@aztec/noir-contracts.js/AssertedTokenContract';
import { CompleteAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import { computeL2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import { Capsule, type TxHash, type TxReceipt } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type Hex, decodeEventLog, getContract } from 'viem';

import { getLogger, setup } from './fixtures/utils.js';
import { generateGrumpkinKeypair } from './tee/grumpkin_schnorr.js';
import { TeeSigner } from './tee/signer.js';
import { computeStealthRecipientHash, getWithdrawContentHash } from './tee/oxide/content_hash.js';
import { buildWithdrawalFinalDigest } from './tee/oxide/digest.js';
import { LocalSigner } from './tee/oxide/local_signer.js';
import { type SpendMetadata, buildTokenOperation, collectTokenEffects } from './tee/token_operations_collector.js';
import { type MAX_EFFECTS, TEEMetadata } from './tee/types.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

const TIMEOUT = 600_000;

// Caps are disabled here; the numbers just need to stay >= the deposit amount.
const RATE = 0n;
const GLOBAL_LIMIT = 10n ** 27n;
const TX_LIMIT = 10n ** 27n;

const DEPOSIT_AMOUNT = 1_000n;

describe('e2e_oxide_bridge', () => {
  let contract: AssertedTokenContractContract;
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let accounts: AztecAddress[];
  let initialFundedAccounts: InitialAccountData[];
  let deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  let teardown: () => Promise<void>;
  const logger = getLogger();

  const noteCreationTxHash = new Map<string, TxHash>();

  async function buildSpendMetadataFor(owner: AztecAddress, randomness: Fr): Promise<SpendMetadata> {
    const entry = initialFundedAccounts.find(a => a.address.equals(owner));
    if (!entry) {
      throw new Error(`No initialFundedAccounts entry for owner ${owner}`);
    }
    const keys = await deriveKeys(entry.secret);

    const accountContract = new SchnorrAccountContract(entry.signingKey);
    const { constructorName, constructorArgs } = (await accountContract.getInitializationFunctionAndArgs()) ?? {
      constructorName: undefined,
      constructorArgs: undefined,
    };
    const artifact = await accountContract.getContractArtifact();
    const instance = await getContractInstanceFromInstantiationParams(artifact, {
      constructorArtifact: constructorName,
      constructorArgs,
      salt: entry.salt,
      publicKeys: keys.publicKeys,
    });
    const ownerAddressPreimage = await CompleteAddress.fromSecretKeyAndInstance(entry.secret, instance);

    const creationTxHash = noteCreationTxHash.get(randomness.toString());
    if (!creationTxHash) {
      throw new Error(`No tracked creation tx hash for note with randomness ${randomness}`);
    }
    return {
      creationTxHash,
      ownerAddressPreimage,
      masterNullifierSecretKey: keys.masterNullifierHidingKey,
    };
  }

  function recordCreatedNotes(txHash: TxHash, createdNotes: ReadonlyArray<{ randomness: Fr }>): void {
    for (const note of createdNotes) {
      noteCreationTxHash.set(note.randomness.toString(), txHash);
    }
  }

  jest.setTimeout(TIMEOUT);

  const SEED_CAPSULE_SLOT = sha256ToField([Buffer.from('ASSERTED_TOKEN::RANDOMNESS_SEED')]);
  const TEE_NOTES_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeNotesCapsuleKey')]);
  const TEE_REQUIRED_NULLIFIERS_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeRequiredNullifiersCapsuleKey')]);
  const TEE_METADATA_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeMetadataCapsuleKey')]);
  const NOTE_SIGNATURE_CAPSULE_SLOT = sha256ToField([Buffer.from('ASSERTED_TOKEN::NOTE_SIGNATURE')]);

  function buildSeedCapsule(): Capsule {
    return new Capsule(contract.address, SEED_CAPSULE_SLOT, [Fr.random()]);
  }

  function buildTeeNotesCapsule(teeNotes: Tuple<Fr, typeof MAX_EFFECTS>): Capsule {
    return new Capsule(contract.address, TEE_NOTES_DA_CAPSULE_KEY, teeNotes);
  }

  function buildTeeRequiredNullifiersCapsule(requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>): Capsule {
    return new Capsule(contract.address, TEE_REQUIRED_NULLIFIERS_DA_CAPSULE_KEY, requiredNullifiers);
  }

  function buildTeeMetadataCapsule(metadata: TEEMetadata): Capsule {
    return new Capsule(contract.address, TEE_METADATA_DA_CAPSULE_KEY, metadata.toFields());
  }

  async function createTeeSigner() {
    const { privateKey, publicKey } = await generateGrumpkinKeypair();
    return new TeeSigner(privateKey, publicKey);
  }

  beforeAll(async () => {
    ({ teardown, wallet, accounts, initialFundedAccounts, aztecNode, deployL1ContractsValues } = await setup(2));
  }, TIMEOUT);

  afterAll(() => teardown());

  async function claim(
    signer: TeeSigner,
    amount: bigint,
    owner: AztecAddress,
    sharedSecret: Fr,
    messageLeafIndex: bigint,
  ): Promise<TxReceipt> {
    const randomnessSeedCapsule = buildSeedCapsule();

    logger.info(`Claiming ${amount} for ${owner} with messageLeafIndex=${messageLeafIndex}`);
    const simulation = await contract.methods
      .claim(owner, amount, sharedSecret, new Fr(messageLeafIndex))
      .with({ capsules: [randomnessSeedCapsule] })
      .simulate({ from: owner });

    const collected = collectTokenEffects(contract.address, simulation.offchainEffects);
    // Claim has no nullified notes (like mint).
    const tokenOperation = await buildTokenOperation(
      aztecNode,
      contract.address,
      await wallet.getSyncedBlockHeader(),
      collected,
      [],
    );

    const { signatures, requiredNullifiers, teeNotes } = await signer.signTokenOperation(tokenOperation, true);

    const signatureCapsules = await Promise.all(
      tokenOperation.createdNotes.map(async (note, i) => {
        const slot = await poseidon2Hash([NOTE_SIGNATURE_CAPSULE_SLOT, note.randomness]);
        const sig = signatures[i];
        return new Capsule(contract.address, slot, [sig.sLo, sig.sHi, sig.eLo, sig.eHi]);
      }),
    );

    const teeNotesCapsule = buildTeeNotesCapsule(teeNotes);
    const requiredNullifiersCapsule = buildTeeRequiredNullifiersCapsule(requiredNullifiers);
    const metadataCapsule = buildTeeMetadataCapsule(
      new TEEMetadata(signer.publicKey.x, signer.publicKey.y, await tokenOperation.anchorBlockHeader.hash()),
    );

    const claimCall = contract.methods
      .claim(owner, amount, sharedSecret, new Fr(messageLeafIndex))
      .with({ capsules: [randomnessSeedCapsule, ...signatureCapsules] });
    const publishDaCall = contract.methods
      .publish_da()
      .with({ capsules: [teeNotesCapsule, requiredNullifiersCapsule, metadataCapsule] });

    const { receipt } = await new BatchCall(wallet, [claimCall, publishDaCall]).send({ from: owner });
    recordCreatedNotes(receipt.txHash, tokenOperation.createdNotes);
    return receipt;
  }

  async function withdraw(
    signer: TeeSigner,
    from: AztecAddress,
    l1Recipient: EthAddress,
    amount: bigint,
  ): Promise<TxReceipt> {
    const randomnessSeedCapsule = buildSeedCapsule();

    logger.info(`Withdrawing ${amount} from ${from} to L1 ${l1Recipient}`);
    const simulation = await contract.methods
      .withdraw(from, l1Recipient, amount)
      .with({ capsules: [randomnessSeedCapsule] })
      .simulate({ from });

    const collected = collectTokenEffects(contract.address, simulation.offchainEffects);

    const spendMetadata = await Promise.all(
      collected.nullifiedNotes.map(nullified => buildSpendMetadataFor(nullified.owner, nullified.randomness)),
    );

    const tokenOperation = await buildTokenOperation(
      aztecNode,
      contract.address,
      await wallet.getSyncedBlockHeader(),
      collected,
      spendMetadata,
    );

    const { signatures, requiredNullifiers, teeNotes } = await signer.signTokenOperation(tokenOperation, false);

    const signatureCapsules = await Promise.all(
      tokenOperation.createdNotes.map(async (note, i) => {
        const slot = await poseidon2Hash([NOTE_SIGNATURE_CAPSULE_SLOT, note.randomness]);
        const sig = signatures[i];
        return new Capsule(contract.address, slot, [sig.sLo, sig.sHi, sig.eLo, sig.eHi]);
      }),
    );

    const teeNotesCapsule = buildTeeNotesCapsule(teeNotes);
    const requiredNullifiersCapsule = buildTeeRequiredNullifiersCapsule(requiredNullifiers);
    const metadataCapsule = buildTeeMetadataCapsule(
      new TEEMetadata(signer.publicKey.x, signer.publicKey.y, await tokenOperation.anchorBlockHeader.hash()),
    );

    const withdrawCall = contract.methods
      .withdraw(from, l1Recipient, amount)
      .with({ capsules: [randomnessSeedCapsule, ...signatureCapsules] });
    const publishDaCall = contract.methods
      .publish_da()
      .with({ capsules: [teeNotesCapsule, requiredNullifiersCapsule, metadataCapsule] });

    const { receipt } = await new BatchCall(wallet, [withdrawCall, publishDaCall]).send({ from });
    recordCreatedNotes(receipt.txHash, tokenOperation.createdNotes);
    return receipt;
  }

  async function balanceOf(owner: AztecAddress): Promise<bigint> {
    return (await contract.methods.balance_of_private(owner).simulate({ from: owner })).result;
  }

  async function makeInboxMessageConsumable(owner: AztecAddress, messageKey: Fr) {
    // Mirror `CrossChainTestHarness.makeMessageConsumable`: first wait for the archiver
    // to index the inbox message, then push two public L2 txs so the subtree containing
    // the message is included in a block and the tree advances once more. A sentinel
    // `add_approved_signer` is used as the no-op public tx since `AssertedTokenContract`
    // has no public mint.
    await retryUntil(() => aztecNode.isL1ToL2MessageSynced(messageKey), 'inbox message sync', 60, 1);
    const dummy = new Fr(1n);
    await contract.methods.add_approved_signer(dummy, dummy).send({ from: owner }).wait();
    await contract.methods.add_approved_signer(dummy, dummy).send({ from: owner }).wait();
  }

  it(
    'deposits on L1, claims on L2, withdraws on L2, and claims on L1',
    async () => {
      const [alice] = accounts;
      const l1Client = deployL1ContractsValues.l1Client;
      const { rollupVersion } = deployL1ContractsValues;
      const { inboxAddress, outboxAddress } = deployL1ContractsValues.l1ContractAddresses;
      const l1ChainId = BigInt(l1Client.chain.id);
      const l1Recipient = EthAddress.fromString(l1Client.account.address);

      logger.info('Deploying L1 contracts (MockERC20, MockPredicate, TeeRegistry, TEEPortal)');
      const { address: tokenAddress } = await deployL1Contract(l1Client, MockERC20Abi, MockERC20Bytecode, []);
      const { address: predicateAddress } = await deployL1Contract(l1Client, MockPredicateAbi, MockPredicateBytecode, [
        true,
      ]);
      const { address: teeRegistryAddress } = await deployL1Contract(l1Client, TeeRegistryAbi, TeeRegistryBytecode, [
        l1Client.account.address,
      ]);
      const { address: portalAddress } = await deployL1Contract(l1Client, TEEPortalAbi, TEEPortalBytecode, [
        l1Client.account.address,
        predicateAddress.toString(),
        tokenAddress.toString(),
        inboxAddress.toString(),
        outboxAddress.toString(),
        teeRegistryAddress.toString(),
        BigInt(rollupVersion),
        RATE,
        GLOBAL_LIMIT,
        TX_LIMIT,
      ]);
      logger.info(
        `Deployed token=${tokenAddress} predicate=${predicateAddress} teeRegistry=${teeRegistryAddress} portal=${portalAddress}`,
      );

      const portal = getContract({ address: portalAddress.toString(), abi: TEEPortalAbi, client: l1Client });
      const token = getContract({ address: tokenAddress.toString(), abi: MockERC20Abi, client: l1Client });
      const teeRegistry = getContract({
        address: teeRegistryAddress.toString(),
        abi: TeeRegistryAbi,
        client: l1Client,
      });

      // Stub TEE: a registered ECDSA puppet that signs the final digest for
      // `TEEPortal.withdraw`. No breakfast/afternoon/evening runs here.
      const stubTeeSigner = new LocalSigner(Buffer32.random());
      await l1Client.waitForTransactionReceipt({
        hash: await teeRegistry.write.addTee([stubTeeSigner.ethAddress.toString() as Hex]),
      });

      logger.info('Deploying L2 AssertedTokenContract bound to the L1 portal');
      ({ contract } = await AssertedTokenContractContract.deploy(wallet, portalAddress).send({ from: alice }));
      logger.info(`AssertedTokenContract deployed at ${contract.address}`);

      const signer = await createTeeSigner();
      await contract.methods.add_approved_signer(signer.publicKey.x, signer.publicKey.y).send({ from: alice }).wait();

      logger.info('Initializing portal with the L2 bridge address');
      const bridgeBytes32 = contract.address.toField().toBuffer();
      await l1Client.waitForTransactionReceipt({
        hash: await portal.write.initialize([`0x${bridgeBytes32.toString('hex')}` as Hex]),
      });

      logger.info('Minting underlying ERC20 and approving portal');
      await l1Client.waitForTransactionReceipt({
        hash: await token.write.mint([l1Client.account.address, DEPOSIT_AMOUNT]),
      });
      await l1Client.waitForTransactionReceipt({
        hash: await token.write.approve([portalAddress.toString(), DEPOSIT_AMOUNT]),
      });

      logger.info('Depositing on L1');
      const sharedSecret = Fr.random();
      const recipientHash = computeStealthRecipientHash(sharedSecret, alice, portalAddress, l1ChainId);
      const depositTxHash = await portal.write.deposit([
        `0x${recipientHash.toBuffer().toString('hex')}` as Hex,
        DEPOSIT_AMOUNT,
        '0x',
      ]);
      const depositReceipt = await l1Client.waitForTransactionReceipt({ hash: depositTxHash });

      // Find the Deposit event to pick up the inbox leaf index and message key.
      let messageLeafIndex: bigint | undefined;
      let messageKey: Fr | undefined;
      for (const log of depositReceipt.logs) {
        if (log.address.toLowerCase() !== portalAddress.toString().toLowerCase()) {
          continue;
        }
        try {
          const decoded = decodeEventLog({ abi: TEEPortalAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === 'Deposit') {
            const args = decoded.args as { index: bigint; key: Hex };
            messageLeafIndex = args.index;
            messageKey = Fr.fromHexString(args.key);
            break;
          }
        } catch {
          // Not a TEEPortal event we care about.
        }
      }
      if (messageLeafIndex === undefined || messageKey === undefined) {
        throw new Error('Could not locate Deposit event in L1 receipt');
      }
      logger.info(`Deposit emitted leafIndex=${messageLeafIndex} key=${messageKey}`);

      logger.info('Waiting for archiver to index the inbox message and advancing L2 by 2 blocks');
      await makeInboxMessageConsumable(alice, messageKey);

      const claimReceipt = await claim(signer, DEPOSIT_AMOUNT, alice, sharedSecret, messageLeafIndex);
      expect(await balanceOf(alice)).toBe(DEPOSIT_AMOUNT);

      const portalBalanceAfterDeposit = (await token.read.balanceOf([portalAddress.toString()])) as bigint;
      expect(portalBalanceAfterDeposit).toBe(DEPOSIT_AMOUNT);

      const withdrawReceipt = await withdraw(signer, alice, l1Recipient, DEPOSIT_AMOUNT);
      expect(await balanceOf(alice)).toBe(0n);

      // Reconstruct the L2->L1 message hash so we can look up the membership witness.
      const expectedContent = getWithdrawContentHash(l1Recipient, DEPOSIT_AMOUNT);
      const expectedMessageHash = await computeL2ToL1MessageHash({
        l2Sender: contract.address,
        l1Recipient: EthAddress.fromString(portalAddress.toString()),
        content: expectedContent,
        rollupVersion: new Fr(BigInt(rollupVersion)),
        chainId: new Fr(l1ChainId),
      });

      logger.info('Waiting for withdraw tx to be proven');
      await waitForProven(aztecNode, withdrawReceipt, { provenTimeout: 500 });

      logger.info('Computing L2->L1 membership witness');
      const witness = await retryUntil(
        () => computeL2ToL1MembershipWitness(aztecNode, expectedMessageHash, withdrawReceipt.txHash),
        'membership witness',
        240,
        2,
      );
      if (!witness) {
        throw new Error('L2 to L1 message not found');
      }
      const epochNumber = BigInt(witness.epochNumber);
      const leafIndex = witness.leafIndex;
      const siblingPath = witness.siblingPath.toFields().map(field => field.toString() as Hex);

      // Stub afternoon attestation: `withdrawalDigest` is a constant 32-byte pattern.
      // `TEEPortal.withdraw` treats it as an opaque replay key and commits to it inside the
      // final digest preimage, so a constant is enough to exercise the L1 guards while
      // Phase 5 is in flight. The real three-phase TEE will replace this with a digest
      // produced by `runAfternoon`.
      const stubL1BlockNumber = (await l1Client.getBlockNumber()) - 1n;
      const stubL1Block = await l1Client.getBlock({ blockNumber: stubL1BlockNumber });
      const stubWithdrawalDigest = Buffer.alloc(32, 1);
      const stubFinalDigest = buildWithdrawalFinalDigest({
        withdrawalDigest: stubWithdrawalDigest,
        l1BlockNumber: stubL1BlockNumber,
        l1BlockHash: Buffer.from(stubL1Block.hash.slice(2), 'hex'),
        messageHash: expectedMessageHash.toBuffer(),
        epochNumber,
        leafIndex,
        config: {
          l2Bridge: contract.address,
          tokenAddress: EthAddress.fromString(tokenAddress.toString()),
          l1Portal: EthAddress.fromString(portalAddress.toString()),
          l1ChainId,
          rollupVersion: BigInt(rollupVersion),
        },
      });
      const stubTeeSignature = stubTeeSigner.sign(stubFinalDigest);

      const l1BalanceBefore = (await token.read.balanceOf([l1Client.account.address])) as bigint;

      logger.info('Claiming on L1 via TEEPortal.withdraw');
      await l1Client.waitForTransactionReceipt({
        hash: await portal.write.withdraw([
          l1Client.account.address,
          DEPOSIT_AMOUNT,
          epochNumber,
          leafIndex,
          siblingPath,
          stubL1BlockNumber,
          `0x${stubWithdrawalDigest.toString('hex')}` as Hex,
          `0x${stubTeeSignature.toString('hex')}` as Hex,
        ]),
      });

      const l1BalanceAfter = (await token.read.balanceOf([l1Client.account.address])) as bigint;
      expect(l1BalanceAfter - l1BalanceBefore).toBe(DEPOSIT_AMOUNT);

      const portalBalanceAfterWithdraw = (await token.read.balanceOf([portalAddress.toString()])) as bigint;
      expect(portalBalanceAfterWithdraw).toBe(0n);

      logger.info(
        `Bridge round-trip succeeded: deposit=${DEPOSIT_AMOUNT} claim=${claimReceipt.txHash} withdraw=${withdrawReceipt.txHash}`,
      );
    },
    TIMEOUT,
  );
});
