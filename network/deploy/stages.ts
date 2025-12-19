/**
 * Deployment stages for network infrastructure.
 */

import type { NetworkConfig } from "../configs/types.ts";
import type { Executor, TerraformVars } from "./executor.ts";

// ============================================================================
// Types
// ============================================================================

export interface L1Config {
  rpcUrls: string[];
  consensusHostUrls: string[];
  consensusHostApiKeys: string[];
  consensusHostApiKeyHeaders: string[];
}

export interface ContractAddresses {
  registryAddress: string;
  slashFactoryAddress: string;
  feeAssetHandlerAddress: string;
}

// ============================================================================
// Stage 1: ETH Devnet
// ============================================================================

export function deployEthDevnet(
  config: NetworkConfig,
  exec: Executor,
  k8sContext: string,
  cluster: string,
  namespace: string,
): L1Config {
  exec.log("Deploying Ethereum devnet");

  const vars: TerraformVars = {
    project: config.gcp.projectId,
    region: config.gcp.region,
    K8S_CLUSTER_CONTEXT: k8sContext,
    RELEASE_PREFIX: namespace,
    NAMESPACE: namespace,
    ETH_DEVNET_VALUES: "eth-devnet.yaml",
    MNEMONIC: config.secrets.labsInfraMnemonic,
    CHAIN_ID: config.ethereum.chainId,
    BLOCK_TIME: config.ethereum.blockTime,
    GAS_LIMIT: config.ethereum.gasLimit,
    PREFUNDED_MNEMONIC_INDICES: computePrefundedIndices(config).join(","),
    RESOURCE_PROFILE: config.kubernetes.resourceProfile,
  };

  exec.applyTerraform("deploy-eth-devnet", vars, cluster, namespace);

  return {
    rpcUrls: [exec.getTerraformOutput("deploy-eth-devnet", "eth_execution_rpc_url")],
    consensusHostUrls: [exec.getTerraformOutput("deploy-eth-devnet", "eth_beacon_api_url")],
    consensusHostApiKeys: [],
    consensusHostApiKeyHeaders: [],
  };
}

// ============================================================================
// Stage 2: Rollup Contracts
// ============================================================================

export function deployRollupContracts(
  config: NetworkConfig,
  exec: Executor,
  k8sContext: string,
  cluster: string,
  namespace: string,
  l1RpcUrls: string[],
  dockerImage: string,
): ContractAddresses {
  exec.log("Deploying rollup contracts");

  // Compute validator addresses
  const totalValidatorKeys = config.validators.replicas * config.validators.validatorsPerNode;
  const validatorAddresses = Array.from({ length: totalValidatorKeys }, (_, i) =>
    exec.computeAddress(config.secrets.labsInfraMnemonic, config.validators.mnemonicStartIndex + i),
  );

  const deploymentPrivateKey =
    config.secrets.rollupDeploymentPrivateKey ??
    exec.computePrivateKey(config.secrets.labsInfraMnemonic, 0);

  const vars: TerraformVars = {
    K8S_CLUSTER_CONTEXT: k8sContext,
    NAMESPACE: namespace,
    AZTEC_DOCKER_IMAGE: dockerImage,
    L1_RPC_URLS: l1RpcUrls.join(","),
    PRIVATE_KEY: deploymentPrivateKey,
    L1_CHAIN_ID: config.ethereum.chainId,
    VALIDATORS: validatorAddresses.join(","),
    SPONSORED_FPC: config.sponsoredFpc,
    TEST_ACCOUNTS: config.testAccounts,
    REAL_VERIFIER: config.realVerifier,
    AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET: config.rollup.lagInEpochsForValidatorSet,
    AZTEC_LAG_IN_EPOCHS_FOR_RANDAO: config.rollup.lagInEpochsForRandao,
    AZTEC_SLOT_DURATION: config.rollup.aztecSlotDuration,
    AZTEC_EPOCH_DURATION: config.rollup.aztecEpochDuration,
    AZTEC_TARGET_COMMITTEE_SIZE: config.rollup.targetCommitteeSize,
    AZTEC_PROOF_SUBMISSION_EPOCHS: config.rollup.aztecProofSubmissionEpochs,
    AZTEC_ACTIVATION_THRESHOLD: config.gse.activationThreshold.toString(),
    AZTEC_EJECTION_THRESHOLD: config.gse.ejectionThreshold.toString(),
    AZTEC_LOCAL_EJECTION_THRESHOLD: config.rollup.localEjectionThreshold.toString(),
    AZTEC_SLASHING_QUORUM: config.rollup.slashingQuorum,
    AZTEC_SLASHING_ROUND_SIZE: config.rollup.slashingRoundSize,
    AZTEC_SLASHING_LIFETIME_IN_ROUNDS: config.rollup.slashingLifetimeInRounds,
    AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS: config.rollup.slashingExecutionDelayInRounds,
    AZTEC_SLASHING_VETOER: config.rollup.slashingVetoer ?? null,
    AZTEC_SLASHING_OFFSET_IN_ROUNDS: config.rollup.slashingOffsetInRounds,
    AZTEC_SLASH_AMOUNT_SMALL: config.rollup.slashAmounts.small.toString(),
    AZTEC_SLASH_AMOUNT_MEDIUM: config.rollup.slashAmounts.medium.toString(),
    AZTEC_SLASH_AMOUNT_LARGE: config.rollup.slashAmounts.large.toString(),
    AZTEC_SLASHER_FLAVOR: config.rollup.slasherFlavor,
    AZTEC_GOVERNANCE_PROPOSER_QUORUM: config.governanceProposer.quorum,
    AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE: config.governanceProposer.roundSize,
    AZTEC_MANA_TARGET: config.rollup.manaTarget,
    AZTEC_PROVING_COST_PER_MANA: config.rollup.provingCostPerMana,
    AZTEC_EXIT_DELAY_SECONDS: config.rollup.exitDelaySeconds,
    ETHERSCAN_API_KEY: config.secrets.etherscanApiKey ?? null,
    NETWORK: config.name,
    JOB_NAME: "deploy-rollup-contracts",
    JOB_BACKOFF_LIMIT: 3,
    JOB_TTL_SECONDS_AFTER_FINISHED: 3600,
  };

  exec.applyTerraform("deploy-rollup-contracts", vars, cluster, namespace);

  // Log any failed pods
  const jobName = exec.getTerraformOutput("deploy-rollup-contracts", "job_name");
  for (const log of exec.getFailedPodLogs(namespace, jobName)) {
    exec.log(log);
  }

  return {
    registryAddress: exec.getTerraformOutput("deploy-rollup-contracts", "registry_address"),
    slashFactoryAddress: exec.getTerraformOutput("deploy-rollup-contracts", "slash_factory_address"),
    feeAssetHandlerAddress: exec.getTerraformOutput("deploy-rollup-contracts", "fee_asset_handler_address"),
  };
}

// ============================================================================
// Stage 3: Aztec Infrastructure
// ============================================================================

export function deployAztecInfra(
  config: NetworkConfig,
  exec: Executor,
  k8sContext: string,
  cluster: string,
  namespace: string,
  l1: L1Config,
  contracts: ContractAddresses,
  dockerImage: string,
): void {
  exec.log("Deploying Aztec infrastructure");

  const isKind = cluster === "kind";

  const vars: TerraformVars = {
    K8S_CLUSTER_CONTEXT: k8sContext,
    RELEASE_PREFIX: namespace,
    NAMESPACE: namespace,
    GCP_PROJECT_ID: config.gcp.projectId,
    GCP_REGION: config.gcp.region,
    R2_ACCESS_KEY_ID: config.secrets.r2AccessKeyId ?? "",
    R2_SECRET_ACCESS_KEY: config.secrets.r2SecretAccessKey ?? "",
    P2P_BOOTSTRAP_RESOURCE_PROFILE: config.bootnode.resourceProfile ?? config.kubernetes.resourceProfile,
    VALIDATOR_RESOURCE_PROFILE: config.validators.resourceProfile ?? config.kubernetes.resourceProfile,
    PROVER_RESOURCE_PROFILE: config.provers.resourceProfile ?? config.kubernetes.resourceProfile,
    RPC_RESOURCE_PROFILE: config.rpc.resourceProfile ?? config.kubernetes.resourceProfile,
    FULL_NODE_RESOURCE_PROFILE: config.fullNodes.resourceProfile ?? config.kubernetes.resourceProfile,
    AZTEC_DOCKER_IMAGE: dockerImage,
    SPONSORED_FPC: config.sponsoredFpc,
    TEST_ACCOUNTS: config.testAccounts,
    L1_CHAIN_ID: config.ethereum.chainId,
    L1_RPC_URLS: l1.rpcUrls,
    L1_CONSENSUS_HOST_URLS: l1.consensusHostUrls,
    L1_CONSENSUS_HOST_API_KEYS: l1.consensusHostApiKeys.length > 0 ? l1.consensusHostApiKeys : null,
    L1_CONSENSUS_HOST_API_KEY_HEADERS: l1.consensusHostApiKeyHeaders.length > 0 ? l1.consensusHostApiKeyHeaders : null,
    REGISTRY_CONTRACT_ADDRESS: contracts.registryAddress,
    SLASH_FACTORY_CONTRACT_ADDRESS: contracts.slashFactoryAddress,
    FEE_ASSET_HANDLER_CONTRACT_ADDRESS: contracts.feeAssetHandlerAddress,
    VALIDATOR_MNEMONIC: config.secrets.labsInfraMnemonic,
    VALIDATOR_MNEMONIC_START_INDEX: config.validators.mnemonicStartIndex,
    VALIDATORS_PER_NODE: config.validators.validatorsPerNode,
    VALIDATOR_REPLICAS: config.validators.replicas,
    VALIDATOR_PUBLISHERS_PER_VALIDATOR_KEY: config.validators.publishersPerValidatorKey,
    SEQ_MIN_TX_PER_BLOCK: config.sequencer.minTxPerBlock,
    SEQ_MAX_TX_PER_BLOCK: config.sequencer.maxTxPerBlock,
    PROVER_MNEMONIC: config.secrets.labsInfraMnemonic,
    PROVER_PUBLISHER_MNEMONIC_START_INDEX: config.provers.mnemonicStartIndex,
    PROVER_PUBLISHERS_PER_PROVER: config.provers.publishersPerProver,
    SENTINEL_ENABLED: config.sentinel.enabled,
    SLASH_MIN_PENALTY_PERCENTAGE: config.sentinel.minPenaltyPercentage ?? null,
    SLASH_MAX_PENALTY_PERCENTAGE: config.sentinel.maxPenaltyPercentage ?? null,
    SLASH_INACTIVITY_TARGET_PERCENTAGE: config.sentinel.inactivityTargetPercentage ?? null,
    SLASH_INACTIVITY_PENALTY: config.sentinel.inactivityPenalty?.toString() ?? null,
    SLASH_PRUNE_PENALTY: config.sentinel.prunePenalty?.toString() ?? null,
    SLASH_DATA_WITHHOLDING_PENALTY: config.sentinel.dataWithholdingPenalty?.toString() ?? null,
    SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY: config.sentinel.proposeInvalidAttestationsPenalty?.toString() ?? null,
    SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY: config.sentinel.attestDescendantOfInvalidPenalty?.toString() ?? null,
    SLASH_UNKNOWN_PENALTY: config.sentinel.unknownPenalty?.toString() ?? null,
    SLASH_INVALID_BLOCK_PENALTY: config.sentinel.invalidBlockPenalty?.toString() ?? null,
    SLASH_OFFENSE_EXPIRATION_ROUNDS: config.sentinel.offenseExpirationRounds ?? null,
    SLASH_MAX_PAYLOAD_SIZE: config.sentinel.maxPayloadSize ?? null,
    OTEL_COLLECTOR_ENDPOINT: config.secrets.otelCollectorEndpoint ?? "",
    DEPLOY_INTERNAL_BOOTNODE: config.bootnode.deployInternal,
    PROVER_REAL_PROOFS: config.provers.realProofs,
    TRANSACTIONS_DISABLED: config.transactionsDisabled ?? null,
    NETWORK: config.name,
    STORE_SNAPSHOT_URL: config.storeSnapshotUrl ?? null,
    BOT_RESOURCE_PROFILE: config.bots.resourceProfile ?? config.kubernetes.resourceProfile,
    BOT_MNEMONIC: config.secrets.labsInfraMnemonic,
    BOT_TRANSFERS_MNEMONIC_START_INDEX: config.bots.transfersMnemonicStartIndex,
    BOT_TRANSFERS_REPLICAS: config.bots.transfersReplicas,
    BOT_TRANSFERS_TX_INTERVAL_SECONDS: config.bots.transfersTxIntervalSeconds,
    BOT_TRANSFERS_FOLLOW_CHAIN: config.bots.transfersFollowChain,
    BOT_SWAPS_MNEMONIC_START_INDEX: config.bots.swapsMnemonicStartIndex,
    BOT_SWAPS_REPLICAS: config.bots.swapsReplicas,
    BOT_SWAPS_TX_INTERVAL_SECONDS: config.bots.swapsTxIntervalSeconds,
    BOT_SWAPS_FOLLOW_CHAIN: config.bots.swapsFollowChain,
    BOT_TRANSFERS_L2_PRIVATE_KEY: config.bots.transfersL2PrivateKey,
    BOT_SWAPS_L2_PRIVATE_KEY: config.bots.swapsL2PrivateKey,
    PROVER_AGENTS_PER_PROVER: config.provers.agentsPerProver,
    PROVER_AGENT_POLL_INTERVAL_MS: config.provers.agentPollIntervalMs,
    RPC_INGRESS_ENABLED: config.rpc.ingressEnabled,
    RPC_INGRESS_HOST: config.rpc.ingressHost ?? "",
    RPC_INGRESS_STATIC_IP_NAME: config.rpc.ingressStaticIpName ?? "",
    RPC_INGRESS_SSL_CERT_NAME: config.rpc.ingressSslCertName ?? "",
    RPC_REPLICAS: config.rpc.replicas,
    FISHERMAN_MODE: config.fisherman.mode,
    FISHERMAN_MNEMONIC: config.secrets.labsInfraMnemonic,
    FISHERMAN_MNEMONIC_START_INDEX: config.fisherman.mnemonicStartIndex,
    FULL_NODE_REPLICAS: config.fullNodes.replicas,
    PROVER_FAILED_PROOF_STORE: config.provers.failedProofStore ?? "",
    DEPLOY_ARCHIVAL_NODE: config.deployArchivalNode ?? false,
    PROVER_REPLICAS: config.provers.replicas,
    P2P_MAX_TX_POOL_SIZE: config.p2p.maxTxPoolSize,
    PROVER_TEST_DELAY_TYPE: config.provers.testDelayType ?? "fixed",
    PROVER_TEST_VERIFICATION_DELAY_MS: config.provers.testVerificationDelayMs ?? 10,
    PROVER_NODE_DISABLE_PROOF_PUBLISH: config.provers.disableProofPublish ?? false,
    P2P_TX_POOL_DELETE_TXS_AFTER_REORG: config.p2p.txPoolDeleteTxsAfterReorg,
    BLOB_ALLOW_EMPTY_SOURCES: config.blobAllowEmptySources ?? false,
    DEBUG_P2P_INSTRUMENT_MESSAGES: config.p2p.debugInstrumentMessages,
    PROVER_AGENT_INCLUDE_METRICS: config.provers.includeMetrics ?? null,
    FULL_NODE_INCLUDE_METRICS: config.fullNodes.includeMetrics ?? null,
    LOG_LEVEL: config.logLevel,
    FISHERMAN_LOG_LEVEL: config.fisherman.logLevel ?? config.logLevel,
    WS_NUM_HISTORIC_BLOCKS: config.wsNumHistoricBlocks ?? null,
    P2P_PUBLIC_IP: !isKind,
    P2P_NODEPORT_ENABLED: isKind,
    PROVER_AGENT_PROOF_TYPES: config.provers.proofTypes ?? [],
    DEBUG_FORCE_TX_PROOF_VERIFICATION: false,
  };

  exec.applyTerraform("deploy-aztec-infra", vars, cluster, namespace);
}

// ============================================================================
// Helpers
// ============================================================================

function computePrefundedIndices(config: NetworkConfig): number[] {
  const baseIndices = Array.from({ length: 49 }, (_, i) => i);
  baseIndices.push(1000);

  const totalValidatorKeys = config.validators.replicas * config.validators.validatorsPerNode;
  const totalValidatorPublishers = totalValidatorKeys * config.validators.publishersPerValidatorKey;
  const validatorPublisherIndices = Array.from(
    { length: totalValidatorPublishers },
    (_, i) => config.validators.publisherMnemonicStartIndex + i,
  );

  const totalProverPublishers = config.provers.replicas * config.provers.publishersPerProver;
  const proverPublisherIndices = Array.from(
    { length: totalProverPublishers },
    (_, i) => config.provers.mnemonicStartIndex + i,
  );

  return [...baseIndices, ...validatorPublisherIndices, ...proverPublisherIndices];
}
