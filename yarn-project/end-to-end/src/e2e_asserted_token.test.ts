import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { deriveKeys } from '@aztec/aztec.js/keys';
import type { AztecNode } from '@aztec/aztec.js/node';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import type { Tuple } from '@aztec/foundation/serialize';
import { AssertedTokenContractContract } from '@aztec/noir-contracts.js/AssertedTokenContract';
import type { BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { Capsule, type TxHash, type TxReceipt } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { getLogger, setup } from './fixtures/utils.js';
import { checkAncestorEffectsHints, produceAncestorEffectsHints } from './tee/index.js';
import { TeeSigner } from './tee/signer.js';
import { type SpendMetadata, buildTokenOperation, collectTokenEffects } from './tee/token_operations_collector.js';
import { type MAX_EFFECTS, type MAX_EXITS, TEEMetadata } from './tee/types.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

const TIMEOUT = 300_000;

describe('e2e_asserted_token', () => {
  let contract: AssertedTokenContractContract;
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let accounts: AztecAddress[];
  let initialFundedAccounts: InitialAccountData[];
  let teardown: () => Promise<void>;
  const logger = getLogger();

  /**
   * Tracks which tx created each note, keyed by note randomness. Populated after each successful
   * mint/transfer so subsequent spends can supply the correct creationTxHash in SpendMetadata.
   */
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

  /** Capsule slot matching ASSERTED_TOKEN_SEED_CAPSULE_SLOT in the Noir contract. */
  const SEED_CAPSULE_SLOT = sha256ToField([Buffer.from('ASSERTED_TOKEN::RANDOMNESS_SEED')]);

  /** Capsule keys matching da.nr capsule keys. */
  const TEE_NOTES_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeNotesCapsuleKey')]);
  const TEE_REQUIRED_NULLIFIERS_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeRequiredNullifiersCapsuleKey')]);
  const TEE_METADATA_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeMetadataCapsuleKey')]);
  const TEE_EXIT_MESSAGE_HASHES_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeExitMessageHashesCapsuleKey')]);

  /** Capsule slot matching ASSERTED_TOKEN_NOTE_SIGNATURE_CAPSULE_SLOT in the Noir contract. */
  const NOTE_SIGNATURE_CAPSULE_SLOT = sha256ToField([Buffer.from('ASSERTED_TOKEN::NOTE_SIGNATURE')]);

  /** Build a transient capsule that provides the randomness seed for insert_with_seed(). */
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

  function buildTeeExitMessageHashesCapsule(exitMessageHashes: Tuple<Fr, typeof MAX_EXITS>): Capsule {
    return new Capsule(contract.address, TEE_EXIT_MESSAGE_HASHES_DA_CAPSULE_KEY, exitMessageHashes);
  }

  /**
   * Smoke-tests the ancestor effects proof system: produces hints for the given tx
   * and verifies them against the anchor block.
   */
  async function verifyAncestorEffects(txHash: TxHash, anchorBlockHash: BlockHash) {
    logger.info(`Verifying ancestor effects for tx ${txHash} against anchor block ${anchorBlockHash}`);
    const { effects, hints } = await produceAncestorEffectsHints(aztecNode, txHash, anchorBlockHash);
    await checkAncestorEffectsHints(effects, hints, anchorBlockHash);
    logger.info(`Ancestor effects verification succeeded for tx ${txHash}`);
  }

  async function createTeeSigner() {
    return TeeSigner.random();
  }

  beforeAll(async () => {
    ({ teardown, wallet, accounts, initialFundedAccounts, aztecNode } = await setup(2));

    ({ contract } = await AssertedTokenContractContract.deploy(wallet, EthAddress.ZERO).send({ from: accounts[0] }));
    logger.info(`AssertedTokenContract deployed at ${contract.address}`);
  }, TIMEOUT);

  afterAll(() => teardown());

  async function mint(signer: TeeSigner, amount: bigint, owner: AztecAddress): Promise<TxReceipt> {
    const randomnessSeedCapsule = buildSeedCapsule();

    logger.info('Minting tokens');
    const simulation = await contract.methods
      .mint(owner, amount)
      .with({ capsules: [randomnessSeedCapsule] })
      .simulate({ from: owner });

    const collected = collectTokenEffects(contract.address, simulation.offchainEffects);
    // Mint has no nullified notes, so no spend metadata is needed.
    const tokenOperation = await buildTokenOperation(
      aztecNode,
      contract.address,
      await wallet.getSyncedBlockHeader(),
      collected,
      [],
    );

    const { signatures, requiredNullifiers, teeNotes, exitMessageHashes } = await signer.signTokenOperation(
      tokenOperation,
      true,
    );

    // Build a signature capsule for each created note, keyed by poseidon2_hash([NOTE_SIGNATURE_SLOT, randomness]).
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
    const exitMessageHashesCapsule = buildTeeExitMessageHashesCapsule(exitMessageHashes);

    const mintCall = contract.methods
      .mint(owner, amount)
      .with({ capsules: [randomnessSeedCapsule, ...signatureCapsules] });
    const publishDaCall = contract.methods
      .publish_da()
      .with({ capsules: [teeNotesCapsule, requiredNullifiersCapsule, metadataCapsule, exitMessageHashesCapsule] });

    const { receipt: mintReceipt } = await new BatchCall(wallet, [mintCall, publishDaCall]).send({
      from: owner,
    });

    recordCreatedNotes(mintReceipt.txHash, tokenOperation.createdNotes);
    return mintReceipt;
  }

  async function transfer(signer: TeeSigner, from: AztecAddress, to: AztecAddress, amount: bigint): Promise<TxReceipt> {
    const randomnessSeedCapsule = buildSeedCapsule();

    logger.info(`Transferring ${amount} from ${from} to ${to}`);
    const simulation = await contract.methods
      .transfer(from, to, amount)
      .with({ capsules: [randomnessSeedCapsule] })
      .simulate({ from });

    const collected = collectTokenEffects(contract.address, simulation.offchainEffects);

    // Build spend metadata for each nullified note (parallel array: same order/length).
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

    const { signatures, requiredNullifiers, teeNotes, exitMessageHashes } = await signer.signTokenOperation(
      tokenOperation,
      false,
    );

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
    const exitMessageHashesCapsule = buildTeeExitMessageHashesCapsule(exitMessageHashes);

    const transferCall = contract.methods
      .transfer(from, to, amount)
      .with({ capsules: [randomnessSeedCapsule, ...signatureCapsules] });
    const publishDaCall = contract.methods
      .publish_da()
      .with({ capsules: [teeNotesCapsule, requiredNullifiersCapsule, metadataCapsule, exitMessageHashesCapsule] });

    const { receipt: transferReceipt } = await new BatchCall(wallet, [transferCall, publishDaCall]).send({ from });

    recordCreatedNotes(transferReceipt.txHash, tokenOperation.createdNotes);
    return transferReceipt;
  }

  async function balanceOf(owner: AztecAddress): Promise<bigint> {
    return (await contract.methods.balance_of_private(owner).simulate({ from: owner })).result;
  }

  async function assertBalance(address: AztecAddress, expectedBalance: bigint) {
    expect(await balanceOf(address)).toBe(expectedBalance);
  }

  it(
    'mints and transfers funds, verifying note discovery',
    async () => {
      const [alice, bob] = accounts;
      const mintAmount = 100n;
      const transferAmount = 40n;
      const transferBackAmount = 10n;

      // Collect receipts for ancestor effects verification.
      const receipts: TxReceipt[] = [];

      // Create and register the signer.
      const signer = await createTeeSigner();
      await contract.methods
        .add_approved_signer_unchecked(signer.publicKey.x, signer.publicKey.y)
        .send({ from: alice });

      // Initial balances: both zero.
      await assertBalance(alice, 0n);
      await assertBalance(bob, 0n);

      // Mint tokens to Alice.
      const mintReceipt = await mint(signer, mintAmount, alice);
      receipts.push(mintReceipt);
      await assertBalance(alice, mintAmount);
      await assertBalance(bob, 0n);

      // Alice transfers to Bob.
      // This succeeds only if Alice's minted note was discovered by the PXE.
      const transferReceipt = await transfer(signer, alice, bob, transferAmount);
      receipts.push(transferReceipt);
      await assertBalance(alice, mintAmount - transferAmount);
      await assertBalance(bob, transferAmount);

      // Verify the mint tx using the transfer's block as anchor.
      await verifyAncestorEffects(mintReceipt.txHash, transferReceipt.blockHash!);

      // Bob transfers back to Alice.
      // This succeeds only if Bob's transferred note was discovered by the PXE.
      const transferBackReceipt = await transfer(signer, bob, alice, transferBackAmount);
      receipts.push(transferBackReceipt);
      await assertBalance(alice, mintAmount - transferAmount + transferBackAmount);
      await assertBalance(bob, transferAmount - transferBackAmount);

      // Verify the first two txs using the last block as anchor.
      for (const receipt of receipts.slice(0, -1)) {
        await verifyAncestorEffects(receipt.txHash, transferBackReceipt.blockHash!);
      }

      logger.info('All operations succeeded: note discovery and ancestor effects verification working correctly');
    },
    TIMEOUT,
  );
});
