/**
 * Network deployment orchestration.
 */

import type { NetworkConfig } from "../networks/types.ts";
import type { Executor } from "./executor.ts";
import { deployEthDevnet, deployRollupContracts, deployAztecInfra } from "./stages.ts";

export function deploy(config: NetworkConfig, exec: Executor, dockerImage: string): void {
  exec.log(`Deploying network: ${config.name}`);

  const cluster = config.kubernetes.cluster;
  const namespace = config.kubernetes.namespace;
  const k8sContext = exec.getKubernetesContext();

  exec.ensureNamespace(namespace);

  // Stage 1: ETH Devnet (or use provided L1)
  const l1 = config.deployEthDevnet
    ? deployEthDevnet(config, exec, k8sContext, cluster, namespace)
    : {
        rpcUrls: config.ethereum.rpcUrls,
        consensusHostUrls: config.ethereum.consensusHostUrls,
        consensusHostApiKeys: config.ethereum.consensusHostApiKeys,
        consensusHostApiKeyHeaders: config.ethereum.consensusHostApiKeyHeaders,
      };

  // Stage 2: Rollup Contracts
  const contracts = config.deployRollupContracts
    ? deployRollupContracts(config, exec, k8sContext, cluster, namespace, l1.rpcUrls, dockerImage)
    : { registryAddress: "", slashFactoryAddress: "", feeAssetHandlerAddress: "" };

  // Stage 3: Aztec Infrastructure
  if (config.deployAztecInfra) {
    deployAztecInfra(config, exec, k8sContext, cluster, namespace, l1, contracts, dockerImage);
  }

  exec.log("Deployment complete");
}
