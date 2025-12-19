/**
 * Network teardown.
 * Destroys network infrastructure in reverse order of deployment.
 */

import type { NetworkConfig } from "../networks/types.ts";
import type { Executor } from "./executor.ts";

export function teardown(config: NetworkConfig, exec: Executor): void {
  exec.log(`Tearing down network: ${config.name} (namespace: ${config.kubernetes.namespace})`);

  const cluster = config.kubernetes.cluster;
  const namespace = config.kubernetes.namespace;

  // Destroy in reverse order of deployment
  if (config.deployAztecInfra) {
    exec.log("Destroying Aztec infrastructure");
    exec.destroyTerraform("deploy-aztec-infra", cluster, namespace);
  }

  if (config.deployRollupContracts) {
    exec.log("Destroying rollup contracts");
    exec.destroyTerraform("deploy-rollup-contracts", cluster, namespace);
  }

  if (config.deployEthDevnet) {
    exec.log("Destroying ETH devnet");
    exec.destroyTerraform("deploy-eth-devnet", cluster, namespace);
  }

  exec.log("Deleting namespace");
  exec.deleteNamespace(namespace);

  exec.log("Teardown complete");
}
