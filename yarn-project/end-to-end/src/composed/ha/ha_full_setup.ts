/**
 * Shared setup for the docker-compose HA full suite.
 *
 * Stands up the complete HA cluster used by `e2e_ha_full.parallel.test.ts` and
 * `e2e_ha_distribute_work.test.ts`: a bootstrap RPC/P2P node plus NODE_COUNT in-proc
 * `AztecNodeService` HA peers that share one PostgreSQL slashing-protection DB and a Web3Signer keystore.
 * Requires the docker-compose HA suite (run_test.sh ha): live Postgres (DATABASE_URL) and Web3Signer
 * sidecar.
 *
 * The suite is split across two files because the "distribute work" test kills nodes as it runs, leaving
 * the cluster unusable; giving it its own file (its own cluster) removes the previous "must run last"
 * ordering contract without changing what any test asserts.
 */
import { type AztecNodeConfig, AztecNodeService, createAztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { GovernanceProposerContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { SecretValue } from '@aztec/foundation/config';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { retryUntil } from '@aztec/foundation/retry';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TopicType } from '@aztec/stdlib/p2p';
import { TxHash, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';

import getPort, { portNumbers } from 'get-port';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import {
  type HADatabaseConfig,
  cleanupHADatabase,
  createHADatabaseConfig,
  createInitialValidatorsFromPrivateKeys,
  getAddressesFromPrivateKeys,
  setupHADatabase,
} from '../../fixtures/ha_setup.js';
import { getPrivateKeyFromIndex, setup } from '../../fixtures/utils.js';
import {
  createWeb3SignerKeystore,
  getWeb3SignerTestKeystoreDir,
  getWeb3SignerUrl,
  refreshWeb3Signer,
} from '../../fixtures/web3signer.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';

export const NODE_COUNT = 5;
export const VALIDATOR_COUNT = 4;
export const COMMITTEE_SIZE = 4;

// Allocate p2p listen ports from above the OS ephemeral range (Linux default tops out at 60999) so they
// never collide with an ephemeral socket the OS may already have handed out -- e.g. the in-process prover
// node (which listens on p2pPort 0) or any outbound connection. The previous fixed 4040x ports sat inside
// the ephemeral range, so an ephemeral socket occasionally held a node's port at bind time, surfacing as
// libp2p ERR_NO_VALID_ADDRESSES and aborting beforeAll. get-port also locks each returned port briefly, so
// concurrent calls within this process never hand back the same one.
const getFreeP2PPort = () => getPort({ port: portNumbers(61000, 65535) });

export async function registerTestContract(wallet: TestWallet): Promise<TestContract> {
  const instance = await getContractInstanceFromInstantiationParams(TestContract.artifact, {
    constructorArgs: [],
    constructorArtifact: undefined,
    salt: Fr.ZERO,
    publicKeys: undefined,
    deployer: undefined,
  });
  await wallet.registerContract(instance, TestContract.artifact);
  return TestContract.at(instance.address, wallet);
}

export async function submitTriggerTx(
  wallet: TestWallet,
  testContract: TestContract,
  from: AztecAddress,
): Promise<TxHash> {
  const tx = await proveInteraction(wallet, testContract.methods.emit_nullifier(Fr.random()), { from });
  return await tx.send({ wait: NO_WAIT });
}

export async function waitForTriggerTx(node: AztecNode, txHash: TxHash): Promise<TxReceipt> {
  const receipt = await waitForTx(node, txHash, { waitForStatus: TxStatus.CHECKPOINTED });
  if (!receipt.blockNumber) {
    throw new Error('Trigger tx was checkpointed without a block number');
  }
  return receipt;
}

/**
 * Owns the full HA cluster lifecycle and the shared helpers the two HA test files drive it with. Each
 * test file constructs one instance and calls {@link setup} in `beforeAll` / {@link teardown} in
 * `afterAll`; state fields are populated by {@link setup} and read directly by the tests.
 */
export class HaFullTestContext {
  logger!: Logger;
  wallet!: TestWallet;
  ownerAddress!: AztecAddress;
  testContract!: TestContract;
  aztecNode!: AztecNode;
  config!: AztecNodeConfig;
  accounts!: AztecAddress[];
  dateProvider!: TestDateProvider;
  genesis: GenesisData | undefined;

  haNodePools!: Pool[]; // Database pools for HA nodes (for cleanup)
  haNodeServices!: AztecNodeService[]; // All N HA peer nodes
  haKeystoreDirs!: string[];
  mainPool!: Pool;
  databaseConfig!: HADatabaseConfig;
  attesterPrivateKeys!: `0x${string}`[];
  attesterAddresses!: string[];
  publisherPrivateKeys!: `0x${string}`[];
  publisherAddresses!: string[];
  web3SignerUrl!: string;
  deployL1ContractsValues!: DeployAztecL1ContractsReturnType;
  governanceProposer!: GovernanceProposerContract;
  /** Per-node initial keystore JSON (all 4 attesters, node's own publisher) for restore after reload test */
  initialKeystoreJsons!: string[];

  private teardownBootstrap: () => Promise<void> = async () => {};
  private haSequencersStarted = false;
  private readonly stoppedHANodeIndexes = new Set<number>();

  getSignatureContext = () => ({
    chainId: this.config.l1ChainId,
    rollupAddress: this.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
  });

  startHASequencers = async () => {
    if (this.haSequencersStarted) {
      return;
    }

    await Promise.all(
      this.haNodeServices.map(async (service, i) => {
        this.logger.info(`Starting HA peer node ${i} sequencer`);
        await service.getSequencer()?.start();
      }),
    );
    this.haSequencersStarted = true;
    this.logger.info('All HA peer sequencers started');
  };

  sendTriggerTx = async (): Promise<TxReceipt> => {
    await this.startHASequencers();
    const txHash = await submitTriggerTx(this.wallet, this.testContract, this.ownerAddress);
    return await waitForTriggerTx(this.aztecNode, txHash);
  };

  stopHANode = async (nodeIndex: number) => {
    if (this.stoppedHANodeIndexes.has(nodeIndex)) {
      return;
    }

    this.logger.info(`Stopping HA peer node ${nodeIndex}`);
    await this.haNodeServices[nodeIndex].stop();
    this.stoppedHANodeIndexes.add(nodeIndex);
  };

  async setup(): Promise<void> {
    // Check required environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable must be set for HA tests');
    }

    this.web3SignerUrl = getWeb3SignerUrl();
    if (!this.web3SignerUrl) {
      throw new Error('WEB3_SIGNER_URL environment variable must be set for HA tests');
    }

    // Setup database configuration
    this.databaseConfig = createHADatabaseConfig('ha-full-test');

    // Connect to database (migrations already run by docker-compose entrypoint)
    this.mainPool = setupHADatabase(this.databaseConfig.databaseUrl.getValue()!);

    this.attesterPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i)!.toString('hex')}` as `0x${string}`,
    );

    this.publisherPrivateKeys = Array.from(
      { length: NODE_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i + VALIDATOR_COUNT)!.toString('hex')}` as `0x${string}`,
    );

    const web3SignerDir = getWeb3SignerTestKeystoreDir();
    const allKeys = [...this.attesterPrivateKeys, ...this.publisherPrivateKeys];
    for (const key of allKeys) {
      await createWeb3SignerKeystore(web3SignerDir, key);
    }

    this.attesterAddresses = getAddressesFromPrivateKeys(this.attesterPrivateKeys);

    this.publisherAddresses = getAddressesFromPrivateKeys(this.publisherPrivateKeys);

    // Refresh Web3Signer to load all the keys (attesters + publishers)
    await refreshWeb3Signer(this.web3SignerUrl, ...this.attesterAddresses, ...this.publisherAddresses);

    // Create database pools for HA nodes
    this.haNodePools = Array.from(
      { length: NODE_COUNT },
      () => new Pool({ connectionString: this.databaseConfig.databaseUrl.getValue()! }),
    );

    const initialValidators = createInitialValidatorsFromPrivateKeys(this.attesterPrivateKeys);

    const bootstrapP2PPort = await getFreeP2PPort();

    ({
      teardown: this.teardownBootstrap,
      logger: this.logger,
      wallet: this.wallet,
      aztecNode: this.aztecNode,
      config: this.config,
      accounts: this.accounts,
      dateProvider: this.dateProvider,
      deployL1ContractsValues: this.deployL1ContractsValues,
      genesis: this.genesis,
    } = await setup(
      // A single default initializerless account, created/funded/registered by setup with no on-chain
      // deploy tx -- the bootstrap node can't build blocks (disableValidator), so the owner must be usable
      // without one.
      1,
      {
        ...PIPELINING_SETUP_OPTS,
        automineL1Setup: true,
        initialValidators,
        sequencerPublisherPrivateKeys: [new SecretValue(this.publisherPrivateKeys[0])],
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        // The full HA docker/Web3Signer stack can still be joining and syncing after the shared
        // 12s pipelining preset's 2.5s start window has closed. Keep real sequencing, but give
        // HA validators enough time to pass the enforced build-start gate in CI.
        aztecSlotDuration: 16,
        // This suite validates HA coordination on tx-bearing checkpoints. Requiring one tx avoids a startup empty
        // checkpoint from occupying the shared HA publisher while the trigger tx is still being prepared.
        minTxsPerBlock: 1,
        archiverPollingIntervalMS: 200,
        sequencerPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        startProverNode: true,
        // The bootstrap node is only an RPC/P2P anchor. HA validators are the first block producers in this suite.
        disableValidator: true,
        // Enable P2P for transaction gossip
        p2pEnabled: true,
        // Bind the bootstrap node above the ephemeral range too (see getFreeP2PPort), so it can't lose
        // its port to an ephemeral socket and abort the whole suite before any HA node is created. Set
        // the broadcast port explicitly to the same value: discv5 otherwise defaults p2pBroadcastPort to
        // p2pPort by mutating this config object in place, and that mutated value would then leak into the
        // HA nodes' configs below (built by spreading `config`), making them advertise the wrong port.
        p2pPort: bootstrapP2PPort,
        p2pBroadcastPort: bootstrapP2PPort,
        // Enable slashing for testing governance + slashing vote coordination
        slasherEnabled: true,
        slashingRoundSizeInEpochs: 1, // 32 slots (1 epoch)
        slashingQuorum: 17, // >50% of 32 slots for tally quorum,
      },
      { syncChainTip: 'proven' },
    ));

    this.ownerAddress = this.accounts[0];
    this.testContract = await registerTestContract(this.wallet);

    if (!this.dateProvider) {
      throw new Error('dateProvider must be provided by setup for HA tests');
    }

    this.logger.info(
      'Bootstrap node setup complete; funded initializerless account and test contract registered locally',
    );

    // Get bootstrap node's P2P ENR for HA nodes to connect to
    const bootstrapNodeEnr = await this.aztecNode.getEncodedEnr();
    if (!bootstrapNodeEnr) {
      throw new Error('Failed to get bootstrap node ENR - P2P may not be enabled');
    }
    this.logger.info(`Bootstrap node ENR: ${bootstrapNodeEnr}`);

    // L1 contract wrappers for querying votes
    this.governanceProposer = new GovernanceProposerContract(
      this.deployL1ContractsValues.l1Client,
      this.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString(),
    );
    this.logger.info('L1 contract wrappers initialized');

    this.haNodeServices = [];
    this.haKeystoreDirs = [];
    this.logger.info(`Starting ${NODE_COUNT} HA peer nodes...`);

    // Per-node keystore: all attesters but only this node's publisher to avoid nonce conflicts.
    // When keyStoreDirectory is set the node loads validators/publishers from file only, so we omit them from config.
    this.initialKeystoreJsons = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const nodeId = `${this.databaseConfig.nodeId}-${i + 1}`;
      this.logger.info(`Starting HA peer node ${i} with nodeId: ${nodeId}`);

      const keystoreContent = {
        schemaVersion: 1,
        validators: [
          {
            attester: this.attesterAddresses,
            feeRecipient: AztecAddress.ZERO.toString(),
            coinbase: EthAddress.fromString(this.attesterAddresses[0]).toChecksumString(),
            remoteSigner: this.web3SignerUrl,
            publisher: [this.publisherAddresses[i]],
          },
        ],
      };
      const keystoreJson = JSON.stringify(keystoreContent, null, 2);
      this.initialKeystoreJsons.push(keystoreJson);

      const keystoreDir = await mkdtemp(join(tmpdir(), `ha-keystore-${i}-`));
      this.haKeystoreDirs.push(keystoreDir);
      await writeFile(join(keystoreDir, 'keystore.json'), keystoreJson);

      const dataDirectory = this.config.dataDirectory ? `${this.config.dataDirectory}-${i}` : undefined;

      const nodeP2PPort = await getFreeP2PPort();
      const nodeConfig: AztecNodeConfig = {
        ...this.config,
        nodeId,
        keyStoreDirectory: keystoreDir,
        // Ensure txs are included in proposals to test full signing path
        publishTxsWithProposals: true,
        dataDirectory,
        databaseUrl: this.databaseConfig.databaseUrl,
        pollingIntervalMs: this.databaseConfig.pollingIntervalMs,
        signingTimeoutMs: this.databaseConfig.signingTimeoutMs,
        maxStuckDutiesAgeMs: this.databaseConfig.maxStuckDutiesAgeMs,
        haSigningEnabled: true,
        disableValidator: false,
        // Enable P2P for transaction and block gossip
        p2pEnabled: true,
        // Each HA node gets its own free port above the ephemeral range. Override the broadcast port too:
        // `...config` carries the bootstrap node's broadcast port (discv5 sets it in place), which would
        // otherwise make every HA node advertise the bootstrap's port instead of its own.
        p2pPort: nodeP2PPort,
        p2pBroadcastPort: nodeP2PPort,
        // Connect to bootstrap node for tx gossip
        bootstrapNodes: [bootstrapNodeEnr],
        web3SignerUrl: this.web3SignerUrl,
      };

      const nodeService = await withLoggerBindings({ actor: `HA-${i}` }, async () => {
        return await createAztecNodeService(
          nodeConfig,
          { dateProvider: this.dateProvider },
          { genesis: this.genesis, dontStartSequencer: true },
        );
      });

      this.haNodeServices.push(nodeService);
      this.logger.info(`HA peer node ${i} started successfully`);
    }

    this.logger.info(`All ${NODE_COUNT} HA peer nodes started and coordinating via PostgreSQL database`);
    this.logger.info('Waiting for HA peer nodes to join the tx gossip mesh');
    await retryUntil(
      async () => {
        const meshStates = await Promise.all(
          this.haNodeServices.map(async (service, nodeIndex) => {
            const p2p = service.getP2P();
            const [peers, txMeshPeerCount] = await Promise.all([
              p2p.getPeers(),
              p2p.getGossipMeshPeerCount(TopicType.tx),
            ]);

            return { nodeIndex, peerCount: peers.length, txMeshPeerCount };
          }),
        );

        this.logger.debug('HA tx gossip mesh status', { meshStates });
        return meshStates.every(({ peerCount, txMeshPeerCount }) => peerCount > 0 && txMeshPeerCount > 0)
          ? true
          : undefined;
      },
      'HA tx gossip mesh readiness',
      60,
      1,
    );

    // The owner is an initializerless account, so it needs no deployment tx -- it was funded at genesis
    // and registered during setup, and is ready to transact as soon as the HA nodes start building blocks.
    this.logger.info(`Test account ready at ${this.ownerAddress}`);
  }

  async teardown(): Promise<void> {
    // Stop all sequencers before tearing down the nodes: a sequencer stop awaits its in-flight
    // iteration, which can spend tens of seconds finishing a vote or checkpoint publish on L1.
    // Stops must be awaited fully — jest runs without forceExit, so a node abandoned mid-stop
    // outlives the test environment and keeps the worker process alive until the CI job timeout.
    // The dateProvider reset must wait until nodes are stopped: it rewinds the shared clock from
    // chain time to wall time (minutes apart after the automine deploy burst), and any publisher
    // deadline armed against the rewound clock would block shutdown until wall time catches up.
    if (this.haNodeServices) {
      await Promise.allSettled(
        this.haNodeServices.map(async (service, i) => {
          try {
            await service.getSequencer()?.stop();
          } catch (error) {
            this.logger.error(`Failed to stop sequencer of HA peer node ${i}: ${error}`);
          }
        }),
      );
      await Promise.allSettled(
        this.haNodeServices.map((_, i) =>
          this.stopHANode(i).catch(error => {
            this.logger.error(`Failed to stop HA peer node ${i}: ${error}`);
          }),
        ),
      );
    }

    this.dateProvider?.reset();

    // Cleanup HA keystore temp directories
    if (this.haKeystoreDirs) {
      for (let i = 0; i < this.haKeystoreDirs.length; i++) {
        try {
          await rm(this.haKeystoreDirs[i], { recursive: true });
        } catch (error) {
          this.logger.error(`Failed to remove HA keystore dir ${i}: ${error}`);
        }
      }
    }

    // Cleanup HA resources (database pools, etc.)
    if (this.haNodePools) {
      for (const pool of this.haNodePools) {
        try {
          await pool.end();
        } catch (error) {
          this.logger.error(`Failed to close HA node pool: ${error}`);
        }
      }
    }
    await cleanupHADatabase(this.mainPool, this.logger);
    await this.mainPool.end();

    // Cleanup bootstrap node and test infrastructure (this cleans up the shared data directory)
    await this.teardownBootstrap();
  }

  /** Clean up database state between tests. */
  async resetDutiesTable(): Promise<void> {
    try {
      await this.mainPool.query('DELETE FROM validator_duties');
    } catch (error) {
      // Ignore cleanup errors (table might not exist on first run failure)
      this.logger?.warn(`Failed to clean up validator_duties: ${error}`);
    }
  }
}
