import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, waitForProven } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { computeAppNullifierHidingKey, deriveKeys } from '@aztec/aztec.js/keys';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { AnvilTestWatcher, CheatCodes } from '@aztec/aztec/testing';
import { DomainSeparator } from '@aztec/constants';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { poseidon2Hash, poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { retryUntil } from '@aztec/foundation/retry';
import type { Tuple } from '@aztec/foundation/serialize';
import {
  MockPredicateAbi,
  MockPredicateBytecode,
  MockVerifierAbi,
  MockVerifierBytecode,
  TEEPortalAbi,
  TEEPortalBytecode,
  TestERC20Abi,
  TestERC20Bytecode,
} from '@aztec/l1-artifacts';
import { AssertedTokenContractContract } from '@aztec/noir-contracts.js/AssertedTokenContract';
import { CompleteAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { computeL2ToL1MessageHash, computeSecretHash, siloNullifier } from '@aztec/stdlib/hash';
import { computeL2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import type { NullifierMembershipWitness } from '@aztec/stdlib/trees';
import { type BlockHeader, Capsule, ExecutionPayload, type TxHash, type TxReceipt } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type Hex, decodeEventLog, getContract } from 'viem';

import { getLogger, setup } from './fixtures/utils.js';
import { computeStealthRecipientHash, getWithdrawContentHash } from './tee/oxide/content_hash.js';
import { produceAncestorEffectsHints } from './tee/produce_ancestor_effects_hints.js';
import { type BridgeContext, type SignTokenOperationOutput, TeeSigner, type TokenOperation } from './tee/signer.js';
import { type SpendMetadata, buildTokenOperation, collectTokenEffects } from './tee/token_operations_collector.js';
import { type MAX_EFFECTS, type MAX_EXITS, TEEMetadata } from './tee/types.js';
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
  let cheatCodes: CheatCodes;
  let watcher: AnvilTestWatcher;
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
  const TEE_EXIT_MESSAGE_HASHES_DA_CAPSULE_KEY = sha256ToField([Buffer.from('oxideTeeExitMessageHashesCapsuleKey')]);
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

  function buildTeeExitMessageHashesCapsule(exitMessageHashes: Tuple<Fr, typeof MAX_EXITS>): Capsule {
    return new Capsule(contract.address, TEE_EXIT_MESSAGE_HASHES_DA_CAPSULE_KEY, exitMessageHashes);
  }

  function createTeeSigner(bridgeContext: BridgeContext) {
    return TeeSigner.random(bridgeContext);
  }

  beforeAll(async () => {
    ({ teardown, wallet, accounts, initialFundedAccounts, aztecNode, deployL1ContractsValues, cheatCodes, watcher } =
      await setup(2, { startProverNode: true }));
    // The anvil test watcher auto-marks blocks as proven on the rollup contract, which advances
    // the proven tip but does NOT submit a real epoch proof. Since the outbox root is only written
    // when an actual epoch proof lands, we disable the watcher's fake proving so the real prover
    // node (enabled by startProverNode) drives the outbox updates.
    watcher.setIsMarkingAsProven(false);
    // Establish a clean baseline: advance past the current epoch and mark everything built so far
    // (account deployment etc.) as proven via cheat code. This prevents the real prover from trying
    // to re-prove pre-test blocks whose txs may have been evicted from the main node's mempool,
    // and confines real proving to epochs that contain the test's own withdraw block.
    await cheatCodes.rollup.advanceToNextEpoch();
    await cheatCodes.rollup.markAsProven();
  }, TIMEOUT);

  afterAll(() => teardown());

  async function claim(
    signer: TeeSigner,
    amount: bigint,
    owner: AztecAddress,
    sharedSecret: Fr,
    messageLeafIndex: bigint,
    messageKey: Fr,
  ): Promise<TxReceipt> {
    const randomnessSeedCapsule = buildSeedCapsule();

    logger.info(`Claiming ${amount} for ${owner} with messageLeafIndex=${messageLeafIndex}`);
    const simulation = await contract.methods
      .claim(owner, amount, sharedSecret, new Fr(messageLeafIndex))
      .with({ capsules: [randomnessSeedCapsule] })
      .simulate({ from: owner });

    const collected = collectTokenEffects(contract.address, simulation.offchainEffects);
    const anchorBlockHeader = await wallet.getSyncedBlockHeader();
    const anchorBlockHash = await anchorBlockHeader.hash();
    const depositWitness = await aztecNode.getL1ToL2MessageMembershipWitness(anchorBlockHash, messageKey);
    if (!depositWitness) {
      throw new Error(`No L1->L2 membership witness found for deposit message ${messageKey}`);
    }
    const [witnessLeafIndex, siblingPath] = depositWitness;
    if (witnessLeafIndex !== messageLeafIndex) {
      throw new Error(`Deposit witness leaf index ${witnessLeafIndex} does not match event index ${messageLeafIndex}`);
    }

    const tokenOperation = await buildTokenOperation(aztecNode, anchorBlockHeader, collected, [], {
      deposits: [
        {
          recipient: owner,
          amount,
          sharedSecret,
          messageLeafIndex,
          siblingPath: siblingPath.toTuple(),
        },
      ],
      exits: [],
    });

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

    const claimCall = contract.methods
      .claim(owner, amount, sharedSecret, new Fr(messageLeafIndex))
      .with({ capsules: [randomnessSeedCapsule, ...signatureCapsules] });
    const publishDaCall = contract.methods
      .publish_da()
      .with({ capsules: [teeNotesCapsule, requiredNullifiersCapsule, metadataCapsule, exitMessageHashesCapsule] });

    const { receipt } = await new BatchCall(wallet, [claimCall, publishDaCall]).send({ from: owner });
    recordCreatedNotes(receipt.txHash, tokenOperation.createdNotes);
    return receipt;
  }

  async function withdraw(
    signer: TeeSigner,
    from: AztecAddress,
    l1Recipient: EthAddress,
    amount: bigint,
  ): Promise<{ receipt: TxReceipt; operation: TokenOperation; initiation: SignTokenOperationOutput }> {
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
      await wallet.getSyncedBlockHeader(),
      collected,
      spendMetadata,
      {
        deposits: [],
        exits: [{ l1Recipient, amount }],
      },
    );

    const initiation = await signer.signTokenOperation(tokenOperation, false);

    const signatureCapsules = await Promise.all(
      tokenOperation.createdNotes.map(async (note, i) => {
        const slot = await poseidon2Hash([NOTE_SIGNATURE_CAPSULE_SLOT, note.randomness]);
        const sig = initiation.signatures[i];
        return new Capsule(contract.address, slot, [sig.sLo, sig.sHi, sig.eLo, sig.eHi]);
      }),
    );

    const teeNotesCapsule = buildTeeNotesCapsule(initiation.teeNotes);
    const requiredNullifiersCapsule = buildTeeRequiredNullifiersCapsule(initiation.requiredNullifiers);
    const metadataCapsule = buildTeeMetadataCapsule(
      new TEEMetadata(signer.publicKey.x, signer.publicKey.y, await tokenOperation.anchorBlockHeader.hash()),
    );
    const exitMessageHashesCapsule = buildTeeExitMessageHashesCapsule(initiation.exitMessageHashes);

    const withdrawCall = contract.methods
      .withdraw(from, l1Recipient, amount)
      .with({ capsules: [randomnessSeedCapsule, ...signatureCapsules] });
    const publishDaCall = contract.methods
      .publish_da()
      .with({ capsules: [teeNotesCapsule, requiredNullifiersCapsule, metadataCapsule, exitMessageHashesCapsule] });

    const { receipt } = await new BatchCall(wallet, [withdrawCall, publishDaCall]).send({ from });
    recordCreatedNotes(receipt.txHash, tokenOperation.createdNotes);
    return { receipt, operation: tokenOperation, initiation };
  }

  async function prepareFrozenNotesWithdrawal(
    from: AztecAddress,
    l1Recipient: EthAddress,
    amount: bigint,
    anchorBlockHeader: BlockHeader,
  ): Promise<{ operation: TokenOperation; lowNullifierMembershipWitnesses: NullifierMembershipWitness[] }> {
    const randomnessSeedCapsule = buildSeedCapsule();

    logger.info(`Preparing frozen-notes withdrawal spend of ${amount} from ${from} to L1 ${l1Recipient}`);
    const simulation = await contract.methods
      .withdraw(from, l1Recipient, amount)
      .with({ capsules: [randomnessSeedCapsule] })
      .simulate({ from });

    const collected = collectTokenEffects(contract.address, simulation.offchainEffects);
    const spendMetadata = await Promise.all(
      collected.nullifiedNotes.map(nullified => buildSpendMetadataFor(nullified.owner, nullified.randomness)),
    );
    const sourceNullifiers = await Promise.all(
      collected.nullifiedNotes.map(async (note, i) => {
        const metadata = spendMetadata[i]!;
        const appNullifierHidingKey = await computeAppNullifierHidingKey(
          metadata.masterNullifierSecretKey,
          contract.address,
        );
        const innerNullifier = await poseidon2HashWithSeparator(
          [note.provenNoteHash, appNullifierHidingKey],
          DomainSeparator.NOTE_NULLIFIER,
        );
        return await siloNullifier(contract.address, innerNullifier);
      }),
    );
    const anchorBlockHash = await anchorBlockHeader.hash();
    const lowNullifierMembershipWitnesses = await Promise.all(
      sourceNullifiers.map(async nullifier => {
        const witness = await aztecNode.getLowNullifierMembershipWitness(anchorBlockHash, nullifier);
        if (!witness) {
          throw new Error(`Missing low-nullifier witness for frozen note nullifier ${nullifier}`);
        }
        return witness;
      }),
    );

    const operation = await buildTokenOperation(
      aztecNode,
      anchorBlockHeader,
      { nullifiedNotes: collected.nullifiedNotes, createdNotes: [] },
      spendMetadata,
    );
    return { operation, lowNullifierMembershipWitnesses };
  }

  async function transfer(signer: TeeSigner, from: AztecAddress, to: AztecAddress, amount: bigint): Promise<TxReceipt> {
    const randomnessSeedCapsule = buildSeedCapsule();

    logger.info(`Transferring ${amount} from ${from} to ${to}`);
    const simulation = await contract.methods
      .transfer(from, to, amount)
      .with({ capsules: [randomnessSeedCapsule] })
      .simulate({ from });

    const collected = collectTokenEffects(contract.address, simulation.offchainEffects);

    const spendMetadata = await Promise.all(
      collected.nullifiedNotes.map(nullified => buildSpendMetadataFor(nullified.owner, nullified.randomness)),
    );

    const tokenOperation = await buildTokenOperation(
      aztecNode,
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

    const { receipt } = await new BatchCall(wallet, [transferCall, publishDaCall]).send({ from });
    recordCreatedNotes(receipt.txHash, tokenOperation.createdNotes);
    return receipt;
  }

  async function balanceOf(owner: AztecAddress): Promise<bigint> {
    return (await contract.methods.balance_of_private(owner).simulate({ from: owner })).result;
  }

  async function advanceL2Block(owner: AztecAddress): Promise<void> {
    const blockNumber = await aztecNode.getBlockNumber();
    await wallet.sendTx(ExecutionPayload.empty(), { from: owner });
    await retryUntil(async () => (await aztecNode.getBlockNumber()) > blockNumber, 'archive block', 60, 1);
  }

  async function resolveArchiveForCheckpoint(rollup: RollupContract, checkpointNumber: CheckpointNumber) {
    return await retryUntil(
      async () => {
        const root = await rollup.archiveAt(checkpointNumber);
        if (root.equals(Fr.ZERO)) {
          return undefined;
        }
        const checkpointEndBlock = await aztecNode.getBlockByArchive(root);
        if (!checkpointEndBlock) {
          return undefined;
        }
        const witnessReferenceBlock = await aztecNode.getBlock(BlockNumber(checkpointEndBlock.number + 1));
        if (!witnessReferenceBlock?.header.lastArchive.root.equals(root)) {
          return undefined;
        }
        return { checkpointNumber, root, checkpointEndBlock, witnessReferenceBlock };
      },
      'archive checkpoint',
      60,
      1,
    );
  }

  async function makeInboxMessageConsumable(owner: AztecAddress, messageKey: Fr) {
    // Mirror `CrossChainTestHarness.makeMessageConsumable`: first wait for the archiver
    // to index the inbox message, then push two public L2 txs so the subtree containing
    // the message is included in a block and the tree advances once more. A sentinel
    // `add_approved_signer_unchecked` is used as the no-op public tx since
    // `AssertedTokenContract` has no public mint.
    await retryUntil(() => aztecNode.isL1ToL2MessageSynced(messageKey), 'inbox message sync', 60, 1);
    const dummy = new Fr(1n);
    await contract.methods.add_approved_signer_unchecked(dummy, dummy).send({ from: owner });
    await contract.methods.add_approved_signer_unchecked(dummy, dummy).send({ from: owner });
  }

  const BridgeExitScenario = {
    NormalWithdraw: 'normal-withdraw',
    FrozenWithdraw: 'frozen-withdraw',
    FrozenNotes: 'frozen-notes',
  } as const;

  type BridgeExitScenario = (typeof BridgeExitScenario)[keyof typeof BridgeExitScenario];

  type BridgeExitCase = {
    name: string;
    scenario: BridgeExitScenario;
  };

  const bridgeExitCases: BridgeExitCase[] = [
    {
      name: 'L1 Alice deposits to L2 Alice, transfers to L2 Bob, then Bob withdraws to L1 Bob',
      scenario: BridgeExitScenario.NormalWithdraw,
    },
    {
      name: 'L1 Alice deposits to L2 Alice, transfers to L2 Bob, then Bob claims after freeze',
      scenario: BridgeExitScenario.FrozenWithdraw,
    },
    {
      name: 'L1 Alice deposits to L2 Alice, transfers to L2 Bob, then Bob withdraws frozen notes after freeze',
      scenario: BridgeExitScenario.FrozenNotes,
    },
  ];

  it.each(bridgeExitCases)(
    '$name',
    async ({ scenario }) => {
      noteCreationTxHash.clear();
      const [alice, bob] = accounts;
      const l1Client = deployL1ContractsValues.l1Client;
      const { rollupVersion } = deployL1ContractsValues;
      const { inboxAddress, outboxAddress, registryAddress, rollupAddress } =
        deployL1ContractsValues.l1ContractAddresses;
      const l1ChainId = BigInt(l1Client.chain.id);
      // Anvil's default account funds the L1 deposit. Bob's L1 payout goes to a distinct
      // address so the end-state ERC20 balance check attributes the withdraw to Bob.
      const bobL1Recipient = EthAddress.fromString('0x' + '0'.repeat(39) + '2');

      logger.info('Deploying L1 contracts (TestERC20, MockPredicate, TEEPortal)');
      const { address: tokenAddress } = await deployL1Contract(l1Client, TestERC20Abi, TestERC20Bytecode, [
        'Test',
        'TST',
        l1Client.account.address,
      ]);
      const { address: predicateAddress } = await deployL1Contract(l1Client, MockPredicateAbi, MockPredicateBytecode, [
        true,
      ]);
      const { address: forcedExitVerifierAddress } = await deployL1Contract(
        l1Client,
        MockVerifierAbi,
        MockVerifierBytecode,
      );
      const { address: portalAddress } = await deployL1Contract(l1Client, TEEPortalAbi, TEEPortalBytecode, [
        l1Client.account.address,
        predicateAddress.toString(),
        tokenAddress.toString(),
        inboxAddress.toString(),
        outboxAddress.toString(),
        rollupAddress.toString(),
        registryAddress.toString(),
        forcedExitVerifierAddress.toString(),
        BigInt(rollupVersion),
        RATE,
        GLOBAL_LIMIT,
        TX_LIMIT,
      ]);
      logger.info(`Deployed token=${tokenAddress} predicate=${predicateAddress} portal=${portalAddress}`);

      const portal = getContract({ address: portalAddress.toString(), abi: TEEPortalAbi, client: l1Client });
      const token = getContract({ address: tokenAddress.toString(), abi: TestERC20Abi, client: l1Client });

      logger.info('Deploying L2 AssertedTokenContract bound to the L1 portal');
      ({ contract } = await AssertedTokenContractContract.deploy(wallet, portalAddress).send({ from: alice }));
      logger.info(`AssertedTokenContract deployed at ${contract.address}`);

      logger.info('Initializing portal with the L2 bridge address');
      const bridgeBytes32 = contract.address.toField().toBuffer();
      await l1Client.waitForTransactionReceipt({
        hash: await portal.write.initialize([`0x${bridgeBytes32.toString('hex')}` as Hex]),
      });

      // Bound into the TEE signer at construction so deposits/exits resolve their bridge
      // identity from the signer rather than per-operation input. constantSecret is Fr.ZERO
      // for the oxide bridge (L1 emits claim messages with a pre-hashed recipient slot).
      const bridgeContext: BridgeContext = {
        l1Portal: EthAddress.fromString(portalAddress.toString()),
        l1ChainId,
        l2Bridge: contract.address,
        rollupVersion: BigInt(rollupVersion),
        constantSecret: Fr.ZERO,
        constantSecretHash: await computeSecretHash(Fr.ZERO),
      };

      const signer = await createTeeSigner(bridgeContext);

      // Register TEE on L1. This stores the binding (secp <-> grumpkin) and emits an L1 -> L2
      // message whose consumption on L2 populates `approved_signers`. The L2 map entry must
      // flow from L1 registry state, never from arbitrary public writes.
      logger.info('Registering TEE on L1 portal');
      const addTeeReceipt = await l1Client.waitForTransactionReceipt({
        hash: await portal.write.addTee([
          signer.ethAddress.toString() as Hex,
          `0x${signer.publicKey.x.toBuffer().toString('hex')}` as Hex,
          `0x${signer.publicKey.y.toBuffer().toString('hex')}` as Hex,
        ]),
      });

      let registrationMessageKey: Fr | undefined;
      let registrationLeafIndex: bigint | undefined;
      for (const log of addTeeReceipt.logs) {
        if (log.address.toLowerCase() !== portalAddress.toString().toLowerCase()) {
          continue;
        }
        try {
          const decoded = decodeEventLog({ abi: TEEPortalAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === 'TeeAdded') {
            const args = decoded.args as { tee: Hex; grumpkinX: Hex; grumpkinY: Hex; key: Hex; index: bigint };
            registrationMessageKey = Fr.fromHexString(args.key);
            registrationLeafIndex = args.index;
            break;
          }
        } catch {
          // Not a TEEPortal event we care about.
        }
      }
      if (registrationMessageKey === undefined || registrationLeafIndex === undefined) {
        throw new Error('Could not locate TeeAdded event in L1 receipt');
      }
      logger.info(`TeeAdded emitted leafIndex=${registrationLeafIndex} key=${registrationMessageKey}`);

      logger.info('Advancing L2 so the registration message is indexed and consumable');
      await makeInboxMessageConsumable(alice, registrationMessageKey);

      logger.info('Consuming registration message on L2');
      await contract.methods
        .consume_signer_registration(
          signer.ethAddress,
          signer.publicKey.x,
          signer.publicKey.y,
          new Fr(registrationLeafIndex),
        )
        .send({ from: alice });

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

      const claimReceipt = await claim(signer, DEPOSIT_AMOUNT, alice, sharedSecret, messageLeafIndex, messageKey);
      expect(await balanceOf(alice)).toBe(DEPOSIT_AMOUNT);

      const portalBalanceAfterDeposit = (await token.read.balanceOf([portalAddress.toString()])) as bigint;
      expect(portalBalanceAfterDeposit).toBe(DEPOSIT_AMOUNT);

      // L2 Alice -> L2 Bob. Same TEE attestation flow as withdraw but with no L1 exits.
      const transferReceipt = await transfer(signer, alice, bob, DEPOSIT_AMOUNT);
      expect(await balanceOf(alice)).toBe(0n);
      expect(await balanceOf(bob)).toBe(DEPOSIT_AMOUNT);

      if (scenario === BridgeExitScenario.FrozenNotes) {
        const rollup = new RollupContract(l1Client, rollupAddress.toString());
        const transferBlock = await aztecNode.getBlock(transferReceipt.blockNumber!);
        if (!transferBlock) {
          throw new Error(`Could not fetch transfer block ${transferReceipt.blockNumber}`);
        }
        const transferEpoch = await rollup.getEpochNumberForCheckpoint(transferBlock.checkpointNumber);
        logger.info('Advancing L1 to next epoch and waiting for transfer tx to be proven');
        await cheatCodes.rollup.advanceToEpoch(EpochNumber(transferEpoch + 1));
        await waitForProven(aztecNode, transferReceipt, { provenTimeout: 500 });

        logger.info('Freezing TEEPortal before Bob sends a normal L2 withdrawal');
        await l1Client.waitForTransactionReceipt({ hash: await portal.write.freeze() });
        const freezeCheckpointNumber = CheckpointNumber.fromBigInt(
          (await portal.read.$freezeCheckpointNumber()) as bigint,
        );
        const frozenArchiveRoot = Fr.fromHexString((await portal.read.$freezeArchive()) as Hex);

        logger.info('Advancing L2 once so the frozen archive root is available for witness generation');
        await advanceL2Block(alice);

        const archive = await resolveArchiveForCheckpoint(rollup, freezeCheckpointNumber);
        if (!archive.root.equals(frozenArchiveRoot)) {
          throw new Error(`Frozen archive ${frozenArchiveRoot} does not match resolved archive ${archive.root}`);
        }

        const { operation: frozenNotesOperation, lowNullifierMembershipWitnesses } = await prepareFrozenNotesWithdrawal(
          bob,
          bobL1Recipient,
          DEPOSIT_AMOUNT,
          archive.checkpointEndBlock.header,
        );
        const archiveAnchorBlockHash = await archive.witnessReferenceBlock.hash();
        const operationAnchorBlockHash = await frozenNotesOperation.anchorBlockHeader.hash();
        const anchorBlockHashMembershipWitness = await aztecNode.getBlockHashMembershipWitness(
          archiveAnchorBlockHash,
          operationAnchorBlockHash,
        );
        if (!anchorBlockHashMembershipWitness) {
          throw new Error(`Operation anchor block ${operationAnchorBlockHash} is not in archive ${archive.root}`);
        }

        const finalization = await signer.signForcedExitFinalization({
          operation: frozenNotesOperation,
          archiveRoot: archive.root,
          amount: DEPOSIT_AMOUNT,
          recipient: bobL1Recipient,
          anchorBlockHashMembershipWitness,
          lowNullifierMembershipWitnesses,
        });

        const bobL1BalanceBefore = (await token.read.balanceOf([bobL1Recipient.toString()])) as bigint;

        logger.info('Claiming frozen notes on L1 via TEEPortal.withdrawFrozenNotes');
        await l1Client.waitForTransactionReceipt({
          hash: await portal.write.withdrawFrozenNotes([
            bobL1Recipient.toString() as Hex,
            DEPOSIT_AMOUNT,
            finalization.nullifiers.map(nullifier => `0x${nullifier.toString('hex')}` as Hex),
            '0x',
            `0x${finalization.signature.toString('hex')}` as Hex,
          ]),
        });

        const bobL1BalanceAfter = (await token.read.balanceOf([bobL1Recipient.toString()])) as bigint;
        expect(bobL1BalanceAfter - bobL1BalanceBefore).toBe(DEPOSIT_AMOUNT);

        const portalBalanceAfterWithdraw = (await token.read.balanceOf([portalAddress.toString()])) as bigint;
        expect(portalBalanceAfterWithdraw).toBe(0n);

        logger.info(
          `Bridge frozen-notes withdrawal succeeded: deposit=${DEPOSIT_AMOUNT} claim=${claimReceipt.txHash} transfer=${transferReceipt.txHash}`,
        );
        return;
      }

      const {
        receipt: withdrawReceipt,
        operation: withdrawOperation,
        initiation: withdrawInitiation,
      } = await withdraw(signer, bob, bobL1Recipient, DEPOSIT_AMOUNT);
      expect(await balanceOf(bob)).toBe(0n);

      // Reconstruct the L2->L1 message hash so we can look up the membership witness.
      const expectedContent = getWithdrawContentHash(bobL1Recipient, DEPOSIT_AMOUNT);
      const expectedMessageHash = computeL2ToL1MessageHash({
        l2Sender: contract.address,
        l1Recipient: EthAddress.fromString(portalAddress.toString()),
        content: expectedContent,
        rollupVersion: new Fr(BigInt(rollupVersion)),
        chainId: new Fr(l1ChainId),
      });

      // Outbox root is populated on epoch-proof submission, so we advance L1 time to the
      // next epoch via cheat codes and wait for the proof to land before computing the
      // membership witness. Mirrors CrossChainMessagingTest.advanceToEpochProven.
      logger.info('Advancing L1 to next epoch and waiting for withdraw tx to be proven');
      const rollup = new RollupContract(l1Client, rollupAddress.toString());
      const withdrawBlock = await aztecNode.getBlock(withdrawReceipt.blockNumber!);
      if (!withdrawBlock) {
        throw new Error(`Could not fetch withdraw block ${withdrawReceipt.blockNumber}`);
      }
      const withdrawEpoch = await rollup.getEpochNumberForCheckpoint(withdrawBlock.checkpointNumber);
      await cheatCodes.rollup.advanceToEpoch(EpochNumber(withdrawEpoch + 1));
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

      const isFrozenWithdraw = scenario === BridgeExitScenario.FrozenWithdraw;
      let finalizationCheckpointNumber = withdrawBlock.checkpointNumber;
      let frozenArchiveRoot: Fr | undefined;
      if (isFrozenWithdraw) {
        logger.info('Freezing TEEPortal before claiming the proven withdrawal on L1');
        await l1Client.waitForTransactionReceipt({ hash: await portal.write.freeze() });
        finalizationCheckpointNumber = CheckpointNumber.fromBigInt(
          (await portal.read.$freezeCheckpointNumber()) as bigint,
        );
        frozenArchiveRoot = Fr.fromHexString((await portal.read.$freezeArchive()) as Hex);
      }

      logger.info('Advancing L2 once so the checkpoint archive root is available for witness generation');
      await advanceL2Block(alice);

      // The TEE finalization signs the archive root that L1 will read from
      // Rollup.archiveAt(checkpointNumber). For the frozen path this must be the
      // checkpoint captured by TEEPortal.freeze, because withdrawPendingMessage verifies
      // the same finalization signature against $freezeArchive.
      const archive = await resolveArchiveForCheckpoint(rollup, finalizationCheckpointNumber);
      if (frozenArchiveRoot && !archive.root.equals(frozenArchiveRoot)) {
        throw new Error(`Frozen archive ${frozenArchiveRoot} does not match resolved archive ${archive.root}`);
      }
      const archiveAnchorBlockHash = await archive.witnessReferenceBlock.hash();
      const archiveRoot = archive.root;
      const operationAnchorBlockHash = await withdrawOperation.anchorBlockHeader.hash();
      const anchorBlockHashMembershipWitness = await aztecNode.getBlockHashMembershipWitness(
        archiveAnchorBlockHash,
        operationAnchorBlockHash,
      );
      if (!anchorBlockHashMembershipWitness) {
        throw new Error(`Operation anchor block ${operationAnchorBlockHash} is not in archive ${archiveRoot}`);
      }
      const { effects: initiationEffects, hints: initiationHints } = await produceAncestorEffectsHints(
        aztecNode,
        withdrawReceipt.txHash,
        archiveAnchorBlockHash,
      );
      const finalizationInput = {
        archiveRoot,
        creationEffects: initiationEffects,
        hints: initiationHints,
        signature: withdrawInitiation.exitSignatures[0],
        exit: { l1Recipient: bobL1Recipient, amount: DEPOSIT_AMOUNT },
        anchorBlockHashMembershipWitness,
      };
      const finalization = isFrozenWithdraw
        ? await signer.signFrozenExitFinalization(finalizationInput)
        : await signer.signExitFinalization(finalizationInput);
      expect(finalization.messageHash.equals(expectedMessageHash.toBuffer())).toBe(true);

      const bobL1BalanceBefore = (await token.read.balanceOf([bobL1Recipient.toString()])) as bigint;

      if (isFrozenWithdraw) {
        logger.info('Claiming frozen proven withdrawal on L1 via TEEPortal.withdrawPendingMessage');
        await l1Client.waitForTransactionReceipt({
          hash: await portal.write.withdrawPendingMessage([
            bobL1Recipient.toString() as Hex,
            DEPOSIT_AMOUNT,
            epochNumber,
            leafIndex,
            siblingPath,
            siblingPath,
            `0x${finalization.initiationDigest.toString('hex')}` as Hex,
            `0x${finalization.signature.toString('hex')}` as Hex,
          ]),
        });
      } else {
        logger.info('Claiming on L1 via TEEPortal.withdraw');
        await l1Client.waitForTransactionReceipt({
          hash: await portal.write.withdraw([
            bobL1Recipient.toString() as Hex,
            DEPOSIT_AMOUNT,
            epochNumber,
            leafIndex,
            siblingPath,
            BigInt(archive.checkpointNumber),
            `0x${finalization.initiationDigest.toString('hex')}` as Hex,
            `0x${finalization.signature.toString('hex')}` as Hex,
          ]),
        });
      }

      const bobL1BalanceAfter = (await token.read.balanceOf([bobL1Recipient.toString()])) as bigint;
      expect(bobL1BalanceAfter - bobL1BalanceBefore).toBe(DEPOSIT_AMOUNT);

      const portalBalanceAfterWithdraw = (await token.read.balanceOf([portalAddress.toString()])) as bigint;
      expect(portalBalanceAfterWithdraw).toBe(0n);

      logger.info(
        `Bridge round-trip succeeded: deposit=${DEPOSIT_AMOUNT} claim=${claimReceipt.txHash} transfer=${transferReceipt.txHash} withdraw=${withdrawReceipt.txHash}`,
      );
    },
    TIMEOUT,
  );
});
