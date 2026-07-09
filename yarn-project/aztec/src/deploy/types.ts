/**
 * Declarative deployment spec — the "what", not the "how".
 *
 * A {@link DeploymentSpec} is one graph of {@link StepSpec | steps} — each either a `contract`
 * (published on-chain, or registered privately in the PXE) or an `action` (a tx) — sent from named
 * {@link AccountSpec | accounts}. {@link runDeployment} resolves deterministic addresses upfront,
 * inventories what's on-chain, funds the accounts, and executes only what's missing in dependency
 * order — idempotently and resumably. The framework never reads the environment; callers pipe in
 * secrets/config.
 *
 * Generic over the steps map, so `ctx.instance("alias")` is typed as the exact contract that
 * alias's class produces — no casts.
 */
import type { ContractArtifact } from '@aztec/aztec.js/abi';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractBase, ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import type { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { DeployReporter } from './reporter.js';

/**
 * How a step's txs are paid.
 * - `sponsored`: a SponsoredFPC pays (the local-network default).
 * - `fee-juice`: the account pays from its own Fee Juice; if below `threshold` with work to do,
 *   bridge `fundAmount` from L1 and claim it on the first paying tx. `l1FunderKey`/`l1RpcUrl`/
 *   `l1ChainId` are caller-supplied; omit `l1FunderKey` for the faucet + ephemeral key. On a
 *   non-local network `l1RpcUrl` and `l1ChainId` are required (there are no hardcoded defaults);
 *   on local they default to anvil (`127.0.0.1:8545`, chain `31337`).
 */
export type FeePolicy =
  | { kind: 'sponsored' }
  | {
      kind: 'fee-juice';
      threshold: bigint;
      fundAmount: bigint;
      l1FunderKey?: `0x${string}`;
      l1RpcUrl?: string;
      l1ChainId?: number;
    };

/** An account the deployment sends from: a v0 initializerless Schnorr account (no deploy tx). */
export interface AccountSpec {
  /** The account secret, piped in by the caller (env/vault/generated) — never read by the framework. */
  secret: Fr;
  /** Fee policy for this account's txs, overriding {@link DeploymentSpec.fees}. */
  fees?: FeePolicy;
  /** Salt for this account's derivation, overriding {@link DeploymentSpec.salt}. */
  salt?: Fr;
}

/** Resolve addresses of accounts / contracts (for initializer args, action targets, the deployer). */
export interface Resolver {
  account(alias: string): AztecAddress;
  contract(alias: string): AztecAddress;
}

/**
 * A generated contract class (e.g. `TokenContract`): the single source of both the artifact and a
 * typed `.at`. Carries the instance type `T`, surfaced by {@link Ctx.instance}.
 */
export interface ContractClass<T extends ContractBase = ContractBase> {
  artifact: ContractArtifact;
  at(address: AztecAddress, wallet: Wallet): T;
}

/**
 * A step that puts a contract on-chain (or in the PXE):
 * - `publish`  → register the class + deploy the instance + run its initializer (a tx).
 * - `register` → private; only derive the deterministic address and register it in the PXE (no tx).
 *
 * The address is deterministic in (class id, deployer, salt, initializer + its args). Provide args
 * via {@link initializerArgs} (deterministic — addresses/static, resolved UPFRONT) or
 * {@link deferredInitializerArgs} (may read runtime state — resolved AT EXECUTION TIME). At most one.
 */
export interface ContractStep<C = Steps, T extends ContractBase = ContractBase> {
  kind: 'contract';
  /** The generated contract class — provides the artifact and the typed `.at`. */
  contract: ContractClass<T>;
  /** Account that salts + sends the deploy, e.g. `(r) => r.account("admin")`. */
  deployer: (resolve: Resolver) => AztecAddress;
  mode: 'publish' | 'register';
  /** Per-contract salt, overriding {@link DeploymentSpec.salt}. */
  salt?: Fr;
  /**
   * For contracts that own private notes (e.g. an FPC): the contract's key secret. The framework
   * derives the deploy `publicKeys` from it (so the address depends on it) and registers it in the
   * PXE with it so its notes decrypt. Omit for ordinary contracts (default keys).
   */
  secret?: Fr;
  /** Name of a non-default `#[initializer]` to call. Defaults to the contract's constructor. */
  initializer?: string;
  /**
   * Deterministic initializer args — a pure function of resolved addresses + static config. Its
   * contract→contract dependencies are auto-derived and the address is resolved UPFRONT. Mutually
   * exclusive with {@link deferredInitializerArgs}.
   */
  initializerArgs?: (resolve: Resolver) => unknown[];
  /**
   * Runtime initializer args — may read live state (e.g. `ctx.instance(x).methods.f().simulate()`).
   * The address can only be derived once {@link dependsOn} has run, so it's resolved AT EXECUTION
   * TIME, not upfront. Mutually exclusive with {@link initializerArgs}.
   */
  deferredInitializerArgs?: (ctx: Ctx<C>) => unknown[] | Promise<unknown[]>;
  /** Steps that must complete first. Auto-derived from {@link initializerArgs}; required for deferred. */
  dependsOn?: string[];
}

/** A step that sends a tx once its dependencies exist. */
export interface ActionStep<C = Steps> {
  kind: 'action';
  /** Account that sends (and pays for) this tx, e.g. `(r) => r.account("admin")`. */
  from: (resolve: Resolver) => AztecAddress;
  /**
   * Builds the interaction to send. May be async (e.g. to read state first). The EmbeddedWallet
   * creates required authwits at send time, so the interaction usually needs no `.with(...)`.
   */
  call: (ctx: Ctx<C>) => ContractFunctionInteraction | Promise<ContractFunctionInteraction>;
  /** Idempotency gate: if it resolves true, the action is skipped this run. */
  done: (ctx: Ctx<C>) => Promise<boolean>;
  /** Steps that must complete first (contracts it calls, actions it follows). */
  dependsOn?: string[];
}

export type StepSpec<C = Steps> = ContractStep<C> | ActionStep<C>;
/**
 * A steps map: alias → step. The element generic is `any` so the alias isn't self-referential
 * (`Steps → StepSpec<Steps> → …`); a concrete spec's `C` is inferred at the {@link runDeployment}
 * call site, which is what types `ctx.instance`.
 */

export type Steps = Record<string, StepSpec<any>>;

/** The concrete contract type a contract step produces (else the base type). */
export type InstanceOf<S> = S extends { contract: ContractClass<infer T> } ? T : ContractBase;
/** The aliases of the contract steps in C — so `ctx.instance` only accepts those. */
export type ContractAlias<C> = {
  [K in keyof C]: C[K] extends { kind: 'contract' } ? K : never;
}[keyof C] &
  string;

/** Everything a step needs at build/idempotency time: typed resolution + bound instances + handles. */
export interface Ctx<C = Steps> extends Resolver {
  /** The contract bound to the wallet, typed from the step's class. */
  instance<K extends ContractAlias<C>>(alias: K): InstanceOf<C[K]>;
  /**
   * Whether step `id` is already satisfied this run — it will NOT do work. Mode-aware: an action
   * whose `done` gate passed, a published contract that's on-chain, or a registered (private)
   * contract that's in the wallet. Can be true without {@link ran} (e.g. a published contract a
   * prior run left on-chain). Lets a step defer to another's gate: `done: (ctx) => ctx.done("amm")`.
   */
  done(id: string): Promise<boolean>;
  /**
   * Whether step `id` did work *this run*: an action that sent its tx, a contract published this
   * run (absent before), or a contract (re)registered this run. Use for "do B because A happened
   * this run", e.g. a mint gated on a fresh token: `done: (ctx) => !ctx.ran("goCoin")`.
   */
  ran(id: string): Promise<boolean>;
  wallet: EmbeddedWallet;
  node: AztecNode;
}

export interface DeploymentSpec<C extends Steps = Steps> {
  /** Aztec node JSON-RPC URL. Ignored when {@link node} is provided; one of the two is required. */
  nodeUrl?: string;
  /**
   * An already-connected node to deploy against — e.g. an in-process `AztecNodeService` from a test
   * fixture. Takes precedence over {@link nodeUrl}. Note the `fee-juice` warp path (local bridging)
   * still resolves a node debug URL from `AZTEC_NODE_URL`/localhost, so pass {@link nodeUrl} too if
   * you bridge against an in-process node.
   */
  node?: AztecNode;
  /**
   * Whether the target is a local (anvil) network. Local uses the deterministic sandbox defaults:
   * sponsored fees, no real proofs, warp-based L1→L2 message advancement, and anvil's dev funder.
   * Everything else (default) uses fee-juice, real proofs, and polling; L1 details for bridging must
   * be supplied on the fee-juice {@link FeePolicy}.
   */
  local?: boolean;
  /** Human label for logs + reporter; defaults to `local`/`network` based on {@link local}. */
  label?: string;
  /** Default salt for account + contract derivation; each can override. Defaults to Fr(0). */
  salt?: Fr;
  /** Directory for the resume-state file. Defaults to `<cwd>/.deploy-state`. */
  stateDir?: string;
  accounts: Record<string, AccountSpec>;
  steps: C;
  /** Default fee policy; per-account {@link AccountSpec.fees} overrides it. Defaults per {@link local}. */
  fees?: FeePolicy;
  /** Where lifecycle events go. Defaults to {@link consoleReporter} (stderr). `{}` silences them. */
  reporter?: DeployReporter;
  /** Hook to write app artifacts (e.g. a frontend manifest) from resolved state; runs after execution. */
  output?: (ctx: Ctx<C>) => void | Promise<void>;
}

/** A bridge claim, persisted to resume a top-up that bridged on L1 but didn't claim on L2. */
export interface StoredClaim {
  claimAmount: string;
  claimSecret: string;
  messageLeafIndex: string;
}
