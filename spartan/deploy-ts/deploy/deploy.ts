/**
 * Network deployment orchestration.
 */

import type { NetworkConfig, SecretsConfig, EthereumConfig } from "../configs/types.ts";
import type { Executor } from "./executor.ts";
import { deployEthDevnet, deployRollupContracts, deployAztecInfra } from "./stages.ts";
import type { L1Config, ResolvedSecrets } from "./stages.ts";

/** Resolve all secrets in the config */
function resolveSecrets(secrets: SecretsConfig, exec: Executor, network: string): ResolvedSecrets {
  return {
    labsInfraMnemonic: exec.resolveSecret(secrets.labsInfraMnemonic, `${network}-mnemonic`),
    rollupDeploymentPrivateKey: secrets.rollupDeploymentPrivateKey
      ? exec.resolveSecret(secrets.rollupDeploymentPrivateKey, `${network}-deployer-key`)
      : undefined,
    otelCollectorEndpoint: secrets.otelCollectorEndpoint
      ? exec.resolveSecret(secrets.otelCollectorEndpoint, `${network}-otel-endpoint`)
      : undefined,
    etherscanApiKey: secrets.etherscanApiKey
      ? exec.resolveSecret(secrets.etherscanApiKey, `etherscan-api-key`)
      : undefined,
    r2AccessKeyId: secrets.r2AccessKeyId
      ? exec.resolveSecret(secrets.r2AccessKeyId, `r2-access-key-id`)
      : undefined,
    r2SecretAccessKey: secrets.r2SecretAccessKey
      ? exec.resolveSecret(secrets.r2SecretAccessKey, `r2-secret-access-key`)
      : undefined,
  };
}

/** Resolve L1 config from ethereum config */
function resolveL1Config(ethereum: EthereumConfig, exec: Executor, network: string): L1Config {
  return {
    rpcUrls: exec.resolveSecret(ethereum.rpcUrls, `${network}-l1-rpc-urls`),
    consensusHostUrls: exec.resolveSecret(ethereum.consensusHostUrls, `${network}-l1-consensus-urls`),
    consensusHostApiKeys: exec.resolveSecret(ethereum.consensusHostApiKeys, `${network}-l1-consensus-api-keys`),
    consensusHostApiKeyHeaders: exec.resolveSecret(ethereum.consensusHostApiKeyHeaders, `${network}-l1-consensus-api-key-headers`),
  };
}

export function deploy(config: NetworkConfig, exec: Executor, dockerImage: string): void {
  exec.log(`Deploying network: ${config.name}`);

  const cluster = config.kubernetes.cluster;
  const namespace = config.kubernetes.namespace;
  const k8sContext = exec.getKubernetesContext();

  // Resolve all secrets upfront
  const resolvedSecrets = resolveSecrets(config.secrets, exec, config.name);

  exec.ensureNamespace(namespace);

  // Stage 1: ETH Devnet (or use provided L1)
  const l1 = config.deployEthDevnet
    ? deployEthDevnet(config, exec, k8sContext, cluster, namespace, resolvedSecrets)
    : resolveL1Config(config.ethereum, exec, config.name);

  // Stage 2: Rollup Contracts
  const contracts = config.deployRollupContracts
    ? deployRollupContracts(config, exec, k8sContext, cluster, namespace, l1.rpcUrls, dockerImage, resolvedSecrets)
    : { registryAddress: "", slashFactoryAddress: "", feeAssetHandlerAddress: "" };

  // Stage 3: Aztec Infrastructure
  if (config.deployAztecInfra) {
    deployAztecInfra(config, exec, k8sContext, cluster, namespace, l1, contracts, dockerImage, resolvedSecrets);
  }

  exec.log("Deployment complete");
}
