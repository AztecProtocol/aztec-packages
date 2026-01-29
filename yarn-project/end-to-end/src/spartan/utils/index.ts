// Re-export all utilities from individual modules
// Note: Internal helpers (helm commands, etc.) are not re-exported to maintain the original public API

// Config
export { type TestConfig, setupEnvironment } from './config.js';

// Scripts
export { getGitProjectRoot, getAztecBin, runAztecBin, runProjectScript } from './scripts.js';

// K8s operations
export {
  startPortForward,
  getExternalIP,
  startPortForwardForPrometeheus,
  startPortForwardForRPC,
  startPortForwardForEthereum,
  deleteResourceByName,
  deleteResourceByLabel,
  waitForResourceByLabel,
  waitForResourceByName,
  waitForResourcesByName,
  getChartDir,
  type ServiceEndpoint,
  getServiceEndpoint,
  getRPCEndpoint,
  getEthereumEndpoint,
} from './k8s.js';

// Chaos Mesh
export {
  uninstallChaosMesh,
  installChaosMeshChart,
  applyProverFailure,
  applyValidatorFailure,
  applyProverKill,
  applyProverBrokerKill,
  applyBootNodeFailure,
  applyValidatorKill,
  applyNetworkShaping,
} from './chaos.js';

// Bot management
export { restartBot, installTransferBot, uninstallTransferBot } from './bot.js';

// Node operations (sequencers, validators, pods)
export {
  awaitCheckpointNumber,
  getSequencers,
  updateSequencersConfig,
  getSequencersConfig,
  withSequencersAdmin,
  setValidatorTxDrop,
  restartValidators,
  enableValidatorDynamicBootNode,
  rollAztecPods,
} from './nodes.js';

// Client utilities
export { getPublicViemClient, getL1DeploymentAddresses, getNodeClient } from './clients.js';

// Health checks
export { ChainHealth, type ChainHealthSnapshot } from './health.js';
