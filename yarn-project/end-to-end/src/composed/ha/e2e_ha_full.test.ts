/**
 * High-Availability Full E2E Test
 *
 * Tests a complete HA setup with multiple nodes coordinating via PostgreSQL
 * and Web3Signer for remote signing. Verifies that blocks are produced,
 * attestations are signed, and no double-signing occurs.
 */
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { waitForProven } from '@aztec/aztec.js/contracts';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { GovernanceProposerContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { retryUntil } from '@aztec/foundation/retry';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { type AttestationInfo, getAttestationInfoFromPublishedCheckpoint } from '@aztec/stdlib/block';
import type { TestWallet } from '@aztec/test-wallet/server';
import { type DutyRow, DutyStatus } from '@aztec/validator-ha-signer/types';

import { jest } from '@jest/globals';
import { Pool } from 'pg';

import {
  type HADatabaseConfig,
  cleanupHADatabase,
  createHADatabaseConfig,
  createInitialValidatorsFromPrivateKeys,
  getAddressesFromPrivateKeys,
  getValidatorDuties,
  setupHADatabase,
  verifyNoDuplicateAttestations,
} from '../../fixtures/ha_setup.js';
import { getPrivateKeyFromIndex, setup } from '../../fixtures/utils.js';
import {
  createWeb3SignerKeystore,
  getWeb3SignerTestKeystoreDir,
  getWeb3SignerUrl,
  refreshWeb3Signer,
} from '../../fixtures/web3signer.js';

const NODE_COUNT = 5;
const VALIDATOR_COUNT = 4;
const COMMITTEE_SIZE = 4;

describe('HA Full Setup', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let logger: Logger;
  let wallet: TestWallet;
  let ownerAddress: AztecAddress;
  let aztecNode: AztecNode;
  let config: AztecNodeConfig;
  let teardown: () => Promise<void>;
  let initialFundedAccounts: any[];
  let dateProvider: TestDateProvider | undefined;
  let prefilledPublicData: any[] | undefined;

  // HA specific resources
  let haNodePools: Pool[]; // Database pools for HA nodes (for cleanup)
  let haNodeServices: AztecNodeService[]; // All N HA peer nodes
  let mainPool: Pool;
  let databaseConfig: HADatabaseConfig;
  let attesterPrivateKeys: `0x${string}`[];
  let attesterAddresses: string[];
  let publisherPrivateKeys: `0x${string}`[];
  let publisherAddresses: string[];
  let web3SignerUrl: string;
  let deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  let governanceProposer: GovernanceProposerContract;

  beforeAll(async () => {
    // Check required environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable must be set for HA tests');
    }

    web3SignerUrl = getWeb3SignerUrl();
    if (!web3SignerUrl) {
      throw new Error('WEB3_SIGNER_URL environment variable must be set for HA tests');
    }

    // Setup database configuration
    databaseConfig = createHADatabaseConfig('ha-full-test');

    // Connect to database (migrations already run by docker-compose entrypoint)
    mainPool = setupHADatabase(databaseConfig.databaseUrl);

    attesterPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i)!.toString('hex')}` as `0x${string}`,
    );

    publisherPrivateKeys = Array.from(
      { length: NODE_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i + VALIDATOR_COUNT)!.toString('hex')}` as `0x${string}`,
    );

    const web3SignerDir = getWeb3SignerTestKeystoreDir();
    const allKeys = [...attesterPrivateKeys, ...publisherPrivateKeys];
    for (const key of allKeys) {
      await createWeb3SignerKeystore(web3SignerDir, key);
    }

    attesterAddresses = getAddressesFromPrivateKeys(attesterPrivateKeys);

    publisherAddresses = getAddressesFromPrivateKeys(publisherPrivateKeys);

    // Refresh Web3Signer to load all the keys (attesters + publishers)
    await refreshWeb3Signer(web3SignerUrl, ...attesterAddresses, ...publisherAddresses);

    // Create database pools for HA nodes
    haNodePools = Array.from({ length: NODE_COUNT }, () => new Pool({ connectionString: databaseConfig.databaseUrl }));

    const initialValidators = createInitialValidatorsFromPrivateKeys(attesterPrivateKeys);

    ({
      teardown,
      logger,
      wallet,
      aztecNode,
      config,
      initialFundedAccounts,
      dateProvider,
      deployL1ContractsValues,
      prefilledPublicData,
    } = await setup(1, {
      initialValidators,
      publisherPrivateKeys: [new SecretValue(publisherPrivateKeys[0])],
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      minTxsPerBlock: 1,
      archiverPollingIntervalMS: 200,
      sequencerPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      startProverNode: true,
      // Disable validation on this node
      disableValidator: true,
      skipAccountDeployment: true,
      // Enable P2P for transaction gossip
      p2pEnabled: true,
      // Enable slashing for testing governance + slashing vote coordination
      slasherFlavor: 'tally',
      slashingRoundSizeInEpochs: 1, // 32 slots (1 epoch)
      slashingQuorum: 17, // >50% of 32 slots for tally quorum
      // Prover node will use publisherPrivateKeys directly, not Web3Signer
      proverNodeConfig: {
        web3SignerUrl: undefined,
        publisherAddresses: undefined,
      },
    }));

    logger.info(`Bootstrap node setup complete (validation disabled)`);

    // Get bootstrap node's P2P ENR for HA nodes to connect to
    const bootstrapNodeEnr = await aztecNode.getEncodedEnr();
    if (!bootstrapNodeEnr) {
      throw new Error('Failed to get bootstrap node ENR - P2P may not be enabled');
    }
    logger.info(`Bootstrap node ENR: ${bootstrapNodeEnr}`);

    // L1 contract wrappers for querying votes
    governanceProposer = new GovernanceProposerContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString(),
    );
    logger.info('L1 contract wrappers initialized');

    haNodeServices = [];
    logger.info(`Starting ${NODE_COUNT} HA peer nodes...`);

    for (let i = 0; i < NODE_COUNT; i++) {
      const nodeId = `${databaseConfig.nodeId}-${i + 1}`;
      logger.info(`Starting HA peer node ${i} with nodeId: ${nodeId}`);

      const dataDirectory = config.dataDirectory ? `${config.dataDirectory}-${i}` : undefined;

      const nodeConfig: AztecNodeConfig = {
        ...config,
        nodeId,
        // Ensure txs are included in proposals to test full signing path
        publishTxsWithProposals: true,
        dataDirectory,
        databaseUrl: databaseConfig.databaseUrl,
        pollingIntervalMs: databaseConfig.pollingIntervalMs,
        signingTimeoutMs: databaseConfig.signingTimeoutMs,
        maxStuckDutiesAgeMs: databaseConfig.maxStuckDutiesAgeMs,
        haSigningEnabled: true,
        disableValidator: false,
        // Enable P2P for transaction and block gossip
        p2pEnabled: true,
        p2pPort: (config.p2pPort ?? 40400) + i + 1,
        // Connect to bootstrap node for tx gossip
        bootstrapNodes: [bootstrapNodeEnr],
        web3SignerUrl,
        validatorAddresses: attesterAddresses.map(addr => EthAddress.fromString(addr)),
        publisherAddresses: publisherAddresses.map(addr => EthAddress.fromString(addr)),
        validatorPrivateKeys: new SecretValue(attesterPrivateKeys),
        // Each node has a unique publisher key
        publisherPrivateKeys: [new SecretValue(publisherPrivateKeys[i])],
      };

      const nodeService = await withLoggerBindings({ actor: `HA-${i}` }, async () => {
        return await AztecNodeService.createAndSync(nodeConfig, { dateProvider }, { prefilledPublicData });
      });

      haNodeServices.push(nodeService);
      logger.info(`HA peer node ${i} started successfully`);
    }

    logger.info(`All ${NODE_COUNT} HA peer nodes started and coordinating via PostgreSQL database`);

    // Now deploy the account - blocks can be built by the HA nodes
    logger.info('Deploying test account now that validators are running');
    const accountData = initialFundedAccounts[0];
    const accountManager = await wallet.createSchnorrAccount(
      accountData.secret,
      accountData.salt,
      accountData.signingKey,
    );
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod.send({ from: AztecAddress.ZERO });
    ownerAddress = accountManager.address;
    logger.info(`Test account deployed at ${ownerAddress}`);
  });

  afterAll(async () => {
    // Cleanup all HA peer nodes
    if (haNodeServices) {
      for (let i = 0; i < haNodeServices.length; i++) {
        try {
          logger.info(`Stopping HA peer node ${i}`);
          await haNodeServices[i].stop();
        } catch (error) {
          logger.error(`Failed to stop HA peer node ${i}: ${error}`);
        }
      }
    }

    // Cleanup HA resources (database pools, etc.)
    if (haNodePools) {
      for (const pool of haNodePools) {
        try {
          await pool.end();
        } catch (error) {
          logger.error(`Failed to close HA node pool: ${error}`);
        }
      }
    }
    await cleanupHADatabase(mainPool, logger);
    await mainPool.end();

    // Cleanup bootstrap node and test infrastructure (this cleans up the shared data directory)
    await teardown();
  });

  afterEach(async () => {
    // Clean up database state between tests
    await mainPool.query('DELETE FROM validator_duties');
  });

  it('should produce blocks with HA coordination and attestations', async () => {
    logger.info('Testing full HA setup: block production, attestations, and coordination');

    // Deploy a contract to trigger block building
    const deployer = new ContractDeployer(StatefulTestContractArtifact, wallet);
    const sender = ownerAddress;

    logger.info(`Deploying contract from ${sender}`);
    const receipt = await deployer.deploy(ownerAddress, sender, 1).send({
      from: ownerAddress,
      contractAddressSalt: new Fr(BigInt(1)),
      skipClassPublication: true,
      skipInstancePublication: true,
      wait: { returnReceipt: true },
    });

    await waitForProven(aztecNode, receipt, {
      provenTimeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
    });

    expect(receipt.blockNumber).toBeDefined();
    logger.info(`Contract deployed in block ${receipt.blockNumber}`);

    // Get the block with attestations
    const [block] = await aztecNode.getCheckpointedBlocks(receipt.blockNumber!, 1);
    if (!block) {
      throw new Error(`Block ${receipt.blockNumber} not found`);
    }

    // Verify txs were included in the block (tests full signing path)
    expect(block.block.body.txEffects.length).toBeGreaterThan(0);
    logger.info(`Block contains ${block.block.body.txEffects.length} transaction(s)`);

    // get attestations from checkpoint
    const [checkpoint] = await aztecNode.getCheckpoints(block.checkpointNumber, 1);
    const attestations = checkpoint.attestations.filter(a => !a.signature.isEmpty());

    // Should have enough attestations for quorum
    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;
    expect(attestations.length).toBeGreaterThanOrEqual(quorum);
    logger.info(`Found ${attestations.length} attestations (quorum: ${quorum})`);

    // Verify signatures are valid (signed by Web3Signer)
    for (const attestation of attestations) {
      expect(attestation.signature.isEmpty()).toBe(false);
      expect(attestation.signature.r).toBeDefined();
      expect(attestation.signature.s).toBeDefined();
      expect(attestation.signature.v).toBeDefined();
    }
    logger.info(`Verified ${attestations.length} signatures from Web3Signer`);

    // Query database to verify HA coordination
    const slotNumber = BigInt(block.block.header.globalVariables.slotNumber);
    logger.info(`Querying duties for slot ${slotNumber} (block ${receipt.blockNumber})`);
    const allDuties = await getValidatorDuties(mainPool, slotNumber);
    expect(allDuties.length).toBeGreaterThan(0);
    logger.info(`Found ${allDuties.length} total duties in database`);

    // Check block proposal duty
    const blockProposalDuties = allDuties.filter(d => d.dutyType === 'BLOCK_PROPOSAL');
    expect(blockProposalDuties.length).toBe(1); // Only one node should propose
    expect(blockProposalDuties[0].completedAt).toBeDefined();
    logger.info(`Block proposed by node ${blockProposalDuties[0].nodeId}`);

    // Check that checkpoint proposal duty was also recorded (separate from block proposal)
    const checkpointProposalDuties = allDuties.filter(d => d.dutyType === 'CHECKPOINT_PROPOSAL');
    expect(checkpointProposalDuties.length).toBe(1);
    logger.info(`Found ${checkpointProposalDuties.length} checkpoint proposal duty`);

    // Check attestation duties
    const attestationDuties = allDuties.filter(d => d.dutyType === 'ATTESTATION');
    expect(attestationDuties.length).toBe(attestations.length);
    logger.info(`Found ${attestationDuties.length} attestation duties`);

    // Verify no duplicate attestations per validator (HA protection ensures 1 per validator address)
    const dutiesByValidator = verifyNoDuplicateAttestations(attestationDuties, logger);

    // Verify we got attestations from multiple validators
    expect(dutiesByValidator.size).toBeGreaterThanOrEqual(quorum);
    logger.info(`${dutiesByValidator.size} unique validators attested (quorum: ${quorum})`);

    // P2P LAYER CHECK: Verify only one attestation per validator was sent over P2P
    const p2pNode = haNodeServices[0];
    const p2p = p2pNode.getP2P();
    const slot = SlotNumber(Number(slotNumber));

    // Get all attestations from P2P pool for this slot (before deduplication)
    const p2pAttestations = await p2p.getCheckpointAttestationsForSlot(slot);
    const p2pAttestationsWithSignatures = p2pAttestations.filter(a => !a.signature.isEmpty());

    // Extract validator addresses from P2P attestations using getSender()
    expect(p2pAttestationsWithSignatures.length).toBe(attestations.length);
    const p2pValidatorAddresses = new Map<string, number>();
    for (const attestation of p2pAttestationsWithSignatures) {
      const sender = attestation.getSender();
      if (sender) {
        const addr = sender.toString();
        p2pValidatorAddresses.set(addr, (p2pValidatorAddresses.get(addr) || 0) + 1);
      }
    }

    // Verify no validator sent multiple attestations over P2P
    // Each validator should have sent exactly one attestation
    for (const [_, count] of p2pValidatorAddresses.entries()) {
      expect(count).toBe(1);
    }
  });

  it('should distribute work across multiple HA nodes', async () => {
    logger.info('Testing HA resilience by killing nodes after they produce blocks');

    // We'll produce NODE_COUNT blocks (5 total with NODE_COUNT=5)
    // Each node produces exactly 1 block, and we kill it after it produces
    // The last remaining node will produce the final block
    const blockCount = NODE_COUNT;
    const receipts = [];
    const killedNodes: number[] = []; // Track indices of killed nodes
    const blockProducers = new Map<number, string>(); // Map block index to node ID
    let previousBlockNumber: number | undefined;

    const nodeIds: string[] = [];
    for (const service of haNodeServices) {
      nodeIds.push((await service.getConfig()).nodeId);
    }

    for (let i = 0; i < blockCount; i++) {
      logger.info(`\n=== Producing block ${i + 1}/${blockCount} ===`);
      logger.info(`Active nodes: ${haNodeServices.length - killedNodes.length}/${NODE_COUNT}`);

      const deployer = new ContractDeployer(StatefulTestContractArtifact, wallet);
      const receipt = await deployer.deploy(ownerAddress, ownerAddress, i + 100).send({
        from: ownerAddress,
        contractAddressSalt: new Fr(BigInt(i + 100)),
        skipClassPublication: true,
        skipInstancePublication: true,
        wait: { returnReceipt: true },
      });

      expect(receipt.blockNumber).toBeDefined();

      // Verify this transaction is in a different block than the previous one
      if (previousBlockNumber !== undefined) {
        expect(receipt.blockNumber).toBeGreaterThan(previousBlockNumber);
      }

      previousBlockNumber = receipt.blockNumber;
      receipts.push(receipt);

      // Find which node produced this block
      const [block] = await aztecNode.getCheckpointedBlocks(receipt.blockNumber!, 1);
      if (!block) {
        throw new Error(`Block ${receipt.blockNumber} not found`);
      }
      const slotNumber = BigInt(block.block.header.globalVariables.slotNumber);
      const duties = await getValidatorDuties(mainPool, slotNumber);
      const blockProposalDuty = duties.find(d => d.dutyType === 'BLOCK_PROPOSAL');

      if (!blockProposalDuty) {
        throw new Error(`No block proposal duty found for slot ${slotNumber}`);
      }

      blockProducers.set(i, blockProposalDuty.nodeId);
      logger.info(`Block ${receipt.blockNumber} produced by node ${blockProposalDuty.nodeId}`);

      // Kill the node that produced this block, unless it's the last block
      if (i < blockCount - 1) {
        const producerNodeId = blockProposalDuty.nodeId;
        const nodeIndexToKill = nodeIds.findIndex(nodeId => nodeId === producerNodeId);

        if (nodeIndexToKill === -1) {
          throw new Error(`Could not find active node with ID ${producerNodeId}`);
        }

        logger.info(`Killing node ${producerNodeId} that produced this block`);
        await haNodeServices[nodeIndexToKill].stop();
        killedNodes.push(nodeIndexToKill);
      } else {
        logger.info(`Last block produced.`);
      }

      logger.info(`Block ${i + 1}/${blockCount} completed. Killed nodes: ${killedNodes.length}/${NODE_COUNT}`);
    }

    // Verify we got the expected number of distinct blocks
    const blockNumbers = receipts.map(r => r.blockNumber!).sort((a, b) => a - b);
    const uniqueBlockNumbers = new Set(blockNumbers);
    expect(uniqueBlockNumbers.size).toBe(blockCount);
    logger.info(`Created ${uniqueBlockNumbers.size} distinct blocks: ${Array.from(uniqueBlockNumbers).join(', ')}`);

    // Verify each node produced at least 1 block
    const nodeBlockCounts = new Map<string, number>();
    for (const nodeId of blockProducers.values()) {
      const count = nodeBlockCounts.get(nodeId) || 0;
      nodeBlockCounts.set(nodeId, count + 1);
    }

    logger.info(`Block production by node: ${JSON.stringify(Array.from(nodeBlockCounts.entries()))}`);

    // Verify: each node should have produced at least 1 block
    // (there may be empty blocks produced during node transitions)
    for (const [nodeId, count] of nodeBlockCounts.entries()) {
      expect(count).toBeGreaterThanOrEqual(1);
      logger.info(`Node ${nodeId} produced ${count} block(s) as expected`);
    }

    // Verify all nodes participated (NODE_COUNT nodes total)
    expect(nodeBlockCounts.size).toBe(NODE_COUNT);
    logger.info(`All ${NODE_COUNT} nodes participated in block production`);

    // Verify no double-signing occurred across all blocks
    const quorum = Math.floor((COMMITTEE_SIZE * 2) / 3) + 1;
    for (const receipt of receipts) {
      const [block] = await aztecNode.getCheckpointedBlocks(receipt.blockNumber!, 1);
      if (!block) {
        throw new Error(`Block ${receipt.blockNumber} not found`);
      }
      const slotNumber = BigInt(block.block.header.globalVariables.slotNumber);

      // PRIMARY CHECK: Database records show all attestation duties attempted/completed
      const duties = await getValidatorDuties(mainPool, slotNumber);
      const attestationDuties = duties.filter(d => d.dutyType === 'ATTESTATION');

      // Verify no duplicate attestation duties per validator (HA protection ensures 1 per validator)
      const dutiesByValidator = verifyNoDuplicateAttestations(attestationDuties, logger);
      expect(dutiesByValidator.size).toBeGreaterThanOrEqual(quorum);
      logger.info(
        `Block ${receipt.blockNumber}: Database shows ${dutiesByValidator.size} unique validators attested (quorum: ${quorum}), no double-signing detected in DB`,
      );

      // P2P LAYER CHECK: Verify only one attestation per validator was sent over P2P
      // Find first active node for P2P check
      let p2pNodeIndex = 0;
      for (let idx = 0; idx < haNodeServices.length; idx++) {
        if (!killedNodes.includes(idx)) {
          p2pNodeIndex = idx;
          break;
        }
      }

      const p2pNode = haNodeServices[p2pNodeIndex];
      const p2p = p2pNode.getP2P();
      const slot = SlotNumber(Number(slotNumber));

      // Get all attestations from P2P pool for this slot (before deduplication)
      const p2pAttestations = await p2p.getCheckpointAttestationsForSlot(slot);
      const p2pAttestationsWithSignatures = p2pAttestations.filter(a => !a.signature.isEmpty());
      expect(p2pAttestationsWithSignatures.length).toBeGreaterThan(0);

      // Extract validator addresses from P2P attestations using getSender()
      const p2pValidatorAddresses = new Map<string, number>();
      for (const attestation of p2pAttestationsWithSignatures) {
        const sender = attestation.getSender();
        if (sender) {
          const addr = sender.toString();
          p2pValidatorAddresses.set(addr, (p2pValidatorAddresses.get(addr) || 0) + 1);
        }
      }

      // Verify no validator sent multiple attestations over P2P
      // Each validator should have sent exactly one attestation
      for (const [_, count] of p2pValidatorAddresses.entries()) {
        expect(count).toBe(1);
      }

      logger.info(
        `Block ${receipt.blockNumber}: P2P layer shows ${p2pValidatorAddresses.size} unique validators sent attestations, no duplicates detected`,
      );

      // SECONDARY CHECK: Verify checkpoint attestations match database records
      const [publishedCheckpoint] = await aztecNode.getCheckpoints(block.checkpointNumber, 1);
      const attestationInfos = getAttestationInfoFromPublishedCheckpoint({
        attestations: publishedCheckpoint.attestations,
        checkpoint: publishedCheckpoint.checkpoint,
      });

      // Filter to only valid attestations with recovered addresses
      const validAttestations = attestationInfos.filter(
        (info: AttestationInfo) => info.status === 'recovered-from-signature' && info.address !== undefined,
      );

      // Verify checkpoint has at least quorum attestations
      const checkpointValidatorAddresses = new Set<string>(validAttestations.map(info => info.address!.toString()));
      expect(checkpointValidatorAddresses.size).toBeGreaterThanOrEqual(quorum);

      // Verify checkpoint attestations match database records (each validator in DB should appear in checkpoint)
      for (const validatorAddress of dutiesByValidator.keys()) {
        expect(checkpointValidatorAddresses.has(validatorAddress)).toBe(true);
      }
    }
  });

  it('should coordinate governance voting across HA nodes', async () => {
    logger.info('Testing real governance voting with HA coordination');

    const mockGovernancePayload = deployL1ContractsValues.l1ContractAddresses.governanceAddress;
    logger.info(`Setting governance payload: ${mockGovernancePayload.toString()}`);

    // Configure all HA nodes to vote for this payload
    for (let i = 0; i < NODE_COUNT; i++) {
      await haNodeServices[i].setConfig({
        governanceProposerPayload: mockGovernancePayload,
      });
    }
    logger.info(`All ${NODE_COUNT} HA nodes configured to vote for governance payload`);

    // Send a transaction to trigger block building which will also trigger voting
    logger.info('Sending transaction to trigger block building...');
    const deployer = new ContractDeployer(StatefulTestContractArtifact, wallet);
    const receipt = await deployer.deploy(ownerAddress, ownerAddress, 42).send({
      from: ownerAddress,
      contractAddressSalt: Fr.random(),
      wait: { returnReceipt: true },
    });
    expect(receipt.blockNumber).toBeDefined();
    logger.info(`Transaction mined in block ${receipt.blockNumber}`);

    // Get the slot of the block that was just built
    const [block] = await aztecNode.getCheckpointedBlocks(receipt.blockNumber!, 1);
    if (!block) {
      throw new Error(`Block ${receipt.blockNumber} not found`);
    }
    const blockSlot = block.block.header.globalVariables.slotNumber;
    logger.info(`Block was built in slot ${blockSlot}`);

    // Compute round for governance voting from the block slot
    const round = await governanceProposer.computeRound(blockSlot);
    logger.info(`Block slot ${blockSlot}, governance round ${round}`);

    // Poll L1 for governance votes
    logger.info('Polling L1 for governance votes...');
    const l1VoteCount = await retryUntil(
      async () => {
        const voteCount = Number(
          await governanceProposer.getPayloadSignals(
            deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
            round,
            mockGovernancePayload.toString(),
          ),
        );
        return voteCount > 0 ? voteCount : undefined;
      },
      'governance votes to appear on L1',
      6, // timeout in seconds (30 attempts * 200ms)
      0.2, // interval in seconds (200ms)
    );
    logger.info(`Found ${l1VoteCount} governance vote(s) on L1 for payload ${mockGovernancePayload.toString()}`);

    // Verify votes were actually sent to L1
    expect(l1VoteCount).toBeGreaterThan(0);
    logger.info(`Verified ${l1VoteCount} governance vote(s) successfully sent to L1`);

    // Get L1 round info to determine which slots have actually landed on L1.
    // We anchor the comparison on L1's lastSignalSlot since:
    // - The DB may have duties for future slots that haven't been published to L1 yet
    // - L1 may have signals from earlier slots in the round before the governance payload was set in the DB
    const roundInfo = await governanceProposer.getRoundInfo(
      deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      round,
    );
    const lastSignalSlot = Number(roundInfo.lastSignalSlot);
    logger.info(
      `L1 round ${round} info: lastSignalSlot=${lastSignalSlot}, l1VoteCount=${l1VoteCount}, payloadWithMostSignals=${roundInfo.payloadWithMostSignals}`,
    );

    // Query governance vote duties only for slots that have actually landed on L1 (up to lastSignalSlot)
    const dbResult = await mainPool.query<DutyRow>(
      `SELECT * FROM validator_duties WHERE slot::numeric <= $1 AND duty_type = 'GOVERNANCE_VOTE' ORDER BY slot, started_at`,
      [lastSignalSlot.toString()],
    );
    const governanceVoteDuties = dbResult.rows;
    logger.info(
      `HA database shows ${governanceVoteDuties.length} governance vote duty(ies) up to slot ${lastSignalSlot}`,
    );

    if (governanceVoteDuties.length > 0) {
      // Verify HA coordination: Only one duty per (slot, validator) should exist
      const dutyKeys = governanceVoteDuties.map(row => `${row.slot}-${row.validator_address}`);
      const uniqueDutyKeys = new Set(dutyKeys);
      expect(uniqueDutyKeys.size).toBe(governanceVoteDuties.length); // No duplicate (slot, validator) pairs

      // All duties should be completed
      for (const duty of governanceVoteDuties) {
        logger.info(
          `  Governance vote duty: slot ${duty.slot}, validator ${duty.validator_address}, node ${duty.node_id}, status ${duty.status}`,
        );
        expect(duty.status).toBe(DutyStatus.SIGNED);
        expect(duty.completed_at).toBeDefined();
      }

      // L1 votes should match the number of unique slots in the DB that have landed on L1
      const uniqueSlots = new Set(governanceVoteDuties.map(row => row.slot));
      logger.info(
        `L1 vote count: ${l1VoteCount}, unique slots in DB with governance votes up to L1 lastSignalSlot: ${uniqueSlots.size} (slots: ${[...uniqueSlots].join(', ')})`,
      );
      expect(l1VoteCount).toBe(uniqueSlots.size);
      logger.info(`Verified L1 votes (${l1VoteCount}) === unique slots with votes (${uniqueSlots.size})`);
    }

    logger.info('Governance voting with HA coordination and L1 verification complete');
  });
});
