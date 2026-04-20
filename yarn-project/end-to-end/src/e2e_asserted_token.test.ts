import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import type { Tuple } from '@aztec/foundation/serialize';
import { AssertedTokenContractContract } from '@aztec/noir-contracts.js/AssertedTokenContract';
import type { BlockHash } from '@aztec/stdlib/block';
import { Capsule, type TxHash, type TxReceipt } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { getLogger, setup } from './fixtures/utils.js';
import { generateGrumpkinKeypair } from './tee/grumpkin_schnorr.js';
import { checkAncestorEffectsHints, produceAncestorEffectsHints } from './tee/index.js';
import { TeeSigner } from './tee/signer.js';
import { collectTokenEffects } from './tee/token_operations_collector.js';
import { type MAX_EFFECTS, TEEMetadata } from './tee/types.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

const TIMEOUT = 300_000;

describe('e2e_asserted_token', () => {
  let contract: AssertedTokenContractContract;
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let accounts: AztecAddress[];
  let teardown: () => Promise<void>;
  const logger = getLogger();

  jest.setTimeout(TIMEOUT);

  /** Capsule slot matching ASSERTED_TOKEN_SEED_CAPSULE_SLOT in the Noir contract. */
  const SEED_CAPSULE_SLOT = sha256ToField([Buffer.from('ASSERTED_TOKEN::RANDOMNESS_SEED')]);

  /** Capsule keys matching da.nr capsule keys. */
  const TEE_NOTES_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeNotesCapsuleKey')]);
  const TEE_REQUIRED_NULLIFIERS_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeRequiredNullifiersCapsuleKey')]);
  const TEE_METADATA_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeMetadataCapsuleKey')]);

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
    const { privateKey, publicKey } = await generateGrumpkinKeypair();
    return new TeeSigner(privateKey, publicKey);
  }

  beforeAll(async () => {
    ({ teardown, wallet, accounts, aztecNode } = await setup(2));

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

    const tokenOperation = await collectTokenEffects(
      contract.address,
      await wallet.getSyncedBlockHeader(),
      simulation.offchainEffects,
    );

    const { signatures, requiredNullifiers, teeNotes } = await signer.signTokenOperation(tokenOperation);

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
      new TEEMetadata(signer.publicKey.x, signer.publicKey.y, tokenOperation.anchorBlockHash),
    );

    const mintCall = contract.methods
      .mint(owner, amount)
      .with({ capsules: [randomnessSeedCapsule, ...signatureCapsules] });
    const publishDaCall = contract.methods
      .publish_da()
      .with({ capsules: [teeNotesCapsule, requiredNullifiersCapsule, metadataCapsule] });

    const { receipt: mintReceipt } = await new BatchCall(wallet, [mintCall, publishDaCall]).send({
      from: owner,
    });

    return mintReceipt;
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
      await contract.methods.add_approved_signer(signer.publicKey.x, signer.publicKey.y).send({ from: alice });

      // Mint tokens to Alice.
      const mintReceipt = await mint(signer, mintAmount, alice);
      receipts.push(mintReceipt);

      // Alice transfers to Bob.
      // This succeeds only if Alice's minted note was discovered by the PXE.
      logger.info('Transferring from Alice to Bob');
      const { receipt: transferReceipt } = await contract.methods
        .transfer(alice, bob, transferAmount)
        .with({ capsules: [buildSeedCapsule()] })
        .send({ from: alice });
      receipts.push(transferReceipt);

      // Verify the mint tx using the transfer's block as anchor.
      await verifyAncestorEffects(mintReceipt.txHash, transferReceipt.blockHash!);

      // Bob transfers back to Alice.
      // This succeeds only if Bob's transferred note was discovered by the PXE.
      logger.info('Transferring from Bob to Alice');
      const { receipt: transferBackReceipt } = await contract.methods
        .transfer(bob, alice, transferBackAmount)
        .with({ capsules: [buildSeedCapsule()] })
        .send({ from: bob });
      receipts.push(transferBackReceipt);

      // Verify the first two txs using the last block as anchor.
      for (const receipt of receipts.slice(0, -1)) {
        await verifyAncestorEffects(receipt.txHash, transferBackReceipt.blockHash!);
      }

      logger.info('All operations succeeded: note discovery and ancestor effects verification working correctly');
    },
    TIMEOUT,
  );
});
