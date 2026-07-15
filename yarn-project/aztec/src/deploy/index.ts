/**
 * A minimal, declarative deployment framework for Aztec.
 *
 * Describe the accounts you send from and a graph of steps — contracts that must end up on-chain
 * (deterministic addresses, interdependencies via `initializerArgs`) and the txs to send — plus how
 * fees are paid; then {@link runDeployment} resolves, takes an on-chain inventory, funds, and
 * executes only what's missing in dependency order — idempotently and resumably. The framework
 * never reads the environment; callers pipe in secrets and config.
 *
 * Node-only: pulls in the PXE-backed `EmbeddedWallet`, `@aztec/noir-contracts.js`, and (for the
 * `fee-juice` policy) L1 bridging — none browser-safe. Lives under the `@aztec/aztec/deploy` subpath
 * so it stays out of any browser bundle.
 */
export { runDeployment } from './runner.js';
export { consoleReporter } from './reporter.js';
export type {
  DeployReporter,
  DeployPlan,
  DeployPlanAccount,
  DeployPlanStep,
  AccountFunding,
  DeploySummary,
  DeployUnitInfo,
  DeployUnitResult,
  DeployUnitKind,
  BridgeEvent,
} from './reporter.js';
export type {
  DeploymentSpec,
  AccountSpec,
  ContractStep,
  ActionStep,
  StepSpec,
  Steps,
  ContractClass,
  FeePolicy,
  Resolver,
  Ctx,
} from './types.js';
