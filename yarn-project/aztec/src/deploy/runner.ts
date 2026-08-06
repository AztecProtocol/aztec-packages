/**
 * The deployment engine: turns a declarative {@link DeploymentSpec} into one dependency graph of
 * steps (contracts + actions), runs only what's missing, and is safe to re-run.
 *
 *   resolve accounts → resolve deterministic addresses → inventory → plan → fund → execute → output
 *
 * Each phase is a method on {@link DeploymentRun}, which holds the state the phases share;
 * {@link runDeployment} strings them together in the order above.
 *
 * - Deterministic contracts (addresses are a pure function of class/deployer/salt/args) resolve
 *   UPFRONT, so the plan knows their addresses before anything is sent.
 * - Deferred contracts (args read runtime state) resolve at INVENTORY TIME when the state their
 *   args read already exists (the re-run case, which is what makes re-runs no-ops), and otherwise
 *   AT EXECUTION TIME, once their `dependsOn` has run.
 * - Steps execute in topological layers over the single graph, so an action can precede a contract
 *   it sets up. Within a layer, contract publishes are individual txs and same-account actions batch
 *   into ≤{@link APP_MAX_CALLS}-call BatchCalls. The one-time fee-juice claim per account is
 *   consumed + mined by that account's first tx before the rest fan out.
 * - Fund steps provision arbitrary addresses (contracts or accounts that never send) with bridged
 *   Fee Juice: bridge at execution time, then an L2 claim tx from the step's `from` account. Their
 *   claims persist between bridge and claim, so a crashed run resumes instead of re-bridging.
 */
import type { ContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, type ContractBase, DeployMethod } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { FeeJuiceContract } from '@aztec/aztec.js/protocol';
import { APP_MAX_CALLS } from '@aztec/entrypoints/encoding';
import { chunk, compactArray } from '@aztec/foundation/collection';
import { getPXEConfig } from '@aztec/pxe/server';
import { getContractClassFromArtifact, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveKeys, deriveMasterMessageSigningSecretKey } from '@aztec/stdlib/keys';
import type { TxReceipt } from '@aztec/stdlib/tx';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { join } from 'node:path';

import {
  type FeeSession,
  type SendFee,
  accountFunding,
  defaultFeePolicy,
  obtainFeeJuiceClaim,
  prepareFeeSession,
  publicFeeJuiceBalance,
} from './fees.js';
import { scheduleLayers, topologicalLayers } from './graph.js';
import {
  type DeployPlan,
  type DeployReporter,
  type DeploySummary,
  type DeployUnitKind,
  consoleReporter,
} from './reporter.js';
import { type DeployState, loadState, saveState } from './state.js';
import type {
  ActionStep,
  ContractStep,
  Ctx,
  DeploymentSpec,
  FeePolicy,
  FundStep,
  Resolver,
  StepSpec,
  Steps,
} from './types.js';

/** A step's idempotency gate (transitively) depends on itself. */
class GateCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateCycleError';
  }
}

function getOrThrow<Value>(map: Map<string, Value>, alias: string, kind: string): Value {
  const value = map.get(alias);
  if (value === undefined) {
    throw new Error(`Unknown ${kind} "${alias}".`);
  }
  return value;
}

function isDeferred<C>(step: ContractStep<C>): boolean {
  return step.deferredInitializerArgs != null;
}

/**
 * The contract aliases a pure resolver callback looks up, extracted by dry-running it against a
 * resolver that records each `contract(alias)` lookup instead of resolving it. The callback's return
 * value is discarded and the ZERO addresses never leave this function — which is what requires such
 * callbacks to be pure: they run here with fake addresses and again later with real ones.
 */
function referencedContracts(run: (resolve: Resolver) => unknown): string[] {
  const references = new Set<string>();
  run({
    account: () => AztecAddress.ZERO,
    contract: alias => {
      references.add(alias);
      return AztecAddress.ZERO;
    },
  });
  return [...references];
}

/** One tx to send: a single contract publish, or a batch of same-account actions. */
interface ExecutionUnit {
  label: string;
  kind: DeployUnitKind;
  account: AztecAddress;
  send: (fee: SendFee) => Promise<unknown>;
}

/**
 * Runs a {@link DeploymentSpec}: resolves accounts and deterministic addresses, inventories what's
 * already on-chain, reports the plan, funds the working accounts, and executes the missing steps in
 * dependency layers. Idempotent — a re-run sends nothing when everything is already in place.
 */
export async function runDeployment<C extends Steps>(spec: DeploymentSpec<C>): Promise<void> {
  const run = await DeploymentRun.create(spec);
  await run.resolveDeterministicContracts();
  await run.takeInventory();
  const plan = await run.reportPlan();
  if (run.hasNothingToDo()) {
    run.reportNothingToDo();
    await run.writeOutputs();
    return;
  }
  const feeSession = await run.prepareFees(plan);
  await run.executeLayers(feeSession);
  await run.writeOutputs();
  run.reportSummary();
}

/**
 * One deployment run: the state shared across phases, with one method per phase. Build with
 * {@link DeploymentRun.create}, then call the phase methods in the order {@link runDeployment}
 * does — each phase reads state the earlier ones populated.
 */
class DeploymentRun<C extends Steps> {
  private readonly local: boolean;
  private readonly label: string;
  private readonly reporter: DeployReporter;
  private readonly stateDirectory: string;
  private readonly state: DeployState;
  private readonly defaultSalt: Fr;
  private readonly globalPolicy: FeePolicy;

  // The steps map partitioned by kind once, so lookups are typed without casts.
  private readonly steps: Map<string, StepSpec<C>>;
  private readonly contractSteps = new Map<string, ContractStep<C>>();
  private readonly actionSteps = new Map<string, ActionStep<C>>();
  private readonly fundSteps = new Map<string, FundStep>();
  /** Contract→contract address deps, auto-derived from deterministic `initializerArgs`. */
  private readonly contractRefs: Map<string, string[]>;

  // Populated as accounts resolve, contracts resolve (upfront, at inventory, or deferred at
  // execution), and txs land.
  private readonly accountAddresses = new Map<string, AztecAddress>();
  private readonly policyByAddress = new Map<string, FeePolicy>();
  private readonly contractAddresses = new Map<string, AztecAddress>();
  private readonly contractInstances = new Map<string, ContractBase>();
  private readonly deployMethods = new Map<string, DeployMethod<ContractBase>>();
  private readonly classIds = new Map<string, Fr>();
  private readonly publishedThisRun = new Set<string>();
  private readonly classesPublishedThisRun = new Set<string>();
  private readonly publishedCache = new Map<string, Promise<boolean>>();
  private readonly gateCache = new Map<string, Promise<boolean>>();
  private readonly gateInProgress = new Set<string>();
  private readonly fundGateCache = new Map<string, Promise<boolean>>();

  // Populated by the resolve / inventory / plan phases.
  private resolveOrder: string[] = [];
  private readonly actionsToRun = new Set<string>();
  private readonly fundsToRun = new Set<string>();
  private execAliases: string[] = [];
  private layers: string[][] = [];

  private readonly resolver: Resolver;
  private readonly ctx: Ctx<C>;

  private constructor(
    private readonly spec: DeploymentSpec<C>,
    private readonly node: AztecNode,
    private readonly wallet: EmbeddedWallet,
  ) {
    this.local = spec.local ?? false;
    this.label = spec.label ?? (this.local ? 'local' : 'network');
    this.reporter = spec.reporter ?? consoleReporter();
    this.stateDirectory = spec.stateDir ?? join(process.cwd(), '.deploy-state');
    this.state = loadState(this.stateDirectory);
    this.defaultSalt = spec.salt ?? new Fr(0);
    this.globalPolicy = spec.fees ?? defaultFeePolicy(this.local);

    this.steps = new Map(Object.entries(spec.steps) as [string, StepSpec<C>][]);
    for (const [alias, step] of this.steps) {
      if (step.kind === 'contract') {
        this.contractSteps.set(alias, step);
      } else if (step.kind === 'action') {
        this.actionSteps.set(alias, step);
      } else {
        this.fundSteps.set(alias, step);
      }
    }
    this.contractRefs = this.recordContractRefs();

    this.resolver = {
      account: alias => getOrThrow(this.accountAddresses, alias, 'account'),
      contract: alias => getOrThrow(this.contractAddresses, alias, 'contract'),
    };
    this.ctx = {
      ...this.resolver,
      instance: ((alias: string) =>
        getOrThrow(this.contractInstances, alias, 'contract instance')) as Ctx<C>['instance'],
      done: id => this.done(id),
      ran: id => this.ran(id),
      wallet,
      node,
    };
  }

  /** Validates the spec, connects the node + ephemeral wallet, then resolves accounts and class ids. */
  public static async create<C extends Steps>(spec: DeploymentSpec<C>): Promise<DeploymentRun<C>> {
    DeploymentRun.validateSpec(spec);
    const node = spec.node ?? createAztecNodeClient(spec.nodeUrl!);
    const wallet = await EmbeddedWallet.create(node, {
      ephemeral: true,
      pxeConfig: { ...getPXEConfig(), proverEnabled: !(spec.local ?? false) },
    });
    const run = new DeploymentRun(spec, node, wallet);
    await run.resolveAccounts();
    await run.computeClassIds();
    return run;
  }

  /** Static spec validation — everything that can be rejected before touching the network. */
  private static validateSpec<C extends Steps>(spec: DeploymentSpec<C>): void {
    if (!spec.node && !spec.nodeUrl) {
      throw new Error('runDeployment requires either `node` or `nodeUrl` on the spec.');
    }
    const steps = Object.entries(spec.steps) as [string, StepSpec<C>][];
    const aliases = new Set(steps.map(([alias]) => alias));
    for (const [alias, step] of steps) {
      for (const dependency of step.dependsOn ?? []) {
        if (!aliases.has(dependency)) {
          throw new Error(`Unknown step "${dependency}" in dependsOn of "${alias}".`);
        }
      }
      if (step.kind === 'fund' && step.amount <= 0n) {
        throw new Error(`Fund step "${alias}" must bridge a positive amount.`);
      }
      if (step.kind !== 'contract') {
        continue;
      }
      if (step.initializerArgs && step.deferredInitializerArgs) {
        throw new Error(`Contract "${alias}" declares both initializerArgs and deferredInitializerArgs — pick one.`);
      }
      if (!isDeferred(step)) {
        continue;
      }
      if (step.mode === 'register') {
        throw new Error(`Contract "${alias}" is register-mode with deferred args — registration has no tx to defer.`);
      }
      if (step.dependsOn == null) {
        throw new Error(
          `Contract "${alias}" has deferred args but no dependsOn. Declare the steps whose effects the args read,` +
            ` or an explicit empty array if they only read pre-existing state.`,
        );
      }
    }
  }

  /** Resolves every deterministic contract upfront, layer by layer in constructor-arg dependency order. */
  public async resolveDeterministicContracts(): Promise<void> {
    const deterministicAliases = [...this.contractSteps]
      .filter(([, step]) => !isDeferred(step))
      .map(([alias]) => alias);
    const layers = topologicalLayers(deterministicAliases, this.contractRefs);
    this.resolveOrder = layers.flat();
    for (const layer of layers) {
      await Promise.all(
        layer.map(alias => {
          const step = getOrThrow(this.contractSteps, alias, 'contract');
          return this.resolveContract(alias, step, step.initializerArgs?.(this.resolver) ?? []);
        }),
      );
    }
  }

  /** Inventory: which steps still need doing? */
  public async takeInventory(): Promise<void> {
    // Deterministic publishes missing on-chain. The checks are independent node reads, so they run
    // concurrently.
    const missing = await Promise.all(
      this.resolveOrder.map(async alias => {
        const step = getOrThrow(this.contractSteps, alias, 'contract');
        return step.mode === 'publish' && !(await this.isPublished(alias)) ? alias : undefined;
      }),
    );
    for (const alias of compactArray(missing)) {
      this.publishedThisRun.add(alias);
    }

    // Deferred contracts: try to resolve now — on a re-run the state their args read is already
    // on-chain, so the address derives and publication is checked like any other contract (which is
    // what makes re-runs no-ops). When the args can't resolve yet, the contract publishes this run
    // and re-resolves at execution time, after its `dependsOn` has run. Runs before the action
    // gates, so `ran`/`done` on a deferred contract answer correctly inside them.
    for (const [alias, step] of this.contractSteps) {
      if (isDeferred(step) && !(await this.tryResolveDeferred(alias, step))) {
        this.publishedThisRun.add(alias);
      }
    }

    // Fund gates: recipients whose public Fee Juice balance is below the step's threshold. Runs
    // before the action gates so `ctx.done`/`ctx.ran` on a fund step answer correctly inside them.
    for (const alias of this.fundSteps.keys()) {
      if (!(await this.fundGate(alias))) {
        this.fundsToRun.add(alias);
      }
    }

    // Action gates. Sequential on purpose: evaluating them concurrently would turn the cyclic-gate
    // detection (gateInProgress) into a silent deadlock of promises awaiting each other.
    for (const alias of this.actionSteps.keys()) {
      if (!(await this.actionGate(alias))) {
        this.actionsToRun.add(alias);
      }
    }

    this.execAliases = [
      ...[...this.contractSteps.keys()].filter(alias => this.publishedThisRun.has(alias)),
      ...[...this.fundSteps.keys()].filter(alias => this.fundsToRun.has(alias)),
      ...[...this.actionSteps.keys()].filter(alias => this.actionsToRun.has(alias)),
    ];
  }

  /**
   * Builds the plan — account funding postures, per-step statuses, and the execution layers — and
   * reports it (the default reporter renders it to stderr). The fund phase consumes its accounts.
   */
  public async reportPlan(): Promise<DeployPlan> {
    const accountUsedBy = new Set<string>();
    for (const alias of this.execAliases) {
      const step = getOrThrow(this.steps, alias, 'step');
      const address = step.kind === 'contract' ? step.deployer(this.resolver) : step.from(this.resolver);
      accountUsedBy.add(address.toString());
    }
    const stepStatus = (alias: string, step: StepSpec<C>): DeployPlan['steps'][number]['status'] => {
      if (step.kind === 'action') {
        return this.actionsToRun.has(alias) ? 'to run' : 'done';
      }
      if (step.kind === 'fund') {
        return this.fundsToRun.has(alias) ? 'to fund' : 'funded';
      }
      if (step.mode === 'register') {
        return 'registered';
      }
      return this.publishedThisRun.has(alias) ? 'to publish' : 'published';
    };
    this.layers = this.buildLayers();
    const plan: DeployPlan = {
      label: this.label,
      accounts: await Promise.all(
        Object.keys(this.spec.accounts).map(async alias => {
          const address = getOrThrow(this.accountAddresses, alias, 'account');
          const policy = getOrThrow(this.policyByAddress, address.toString(), 'policy');
          return {
            alias,
            address,
            funding: await accountFunding(policy, this.wallet, address, accountUsedBy.has(address.toString())),
          };
        }),
      ),
      steps: [...this.steps].map(([id, step]) => ({
        id,
        kind: step.kind,
        status: stepStatus(id, step),
        dependsOn: [...(this.contractRefs.get(id) ?? []), ...(step.dependsOn ?? [])],
      })),
      layers: this.layers,
    };
    this.reporter.onPlan?.(plan);
    return plan;
  }

  public hasNothingToDo(): boolean {
    return this.execAliases.length === 0;
  }

  public reportNothingToDo(): void {
    this.reporter.onNothingToDo?.(this.label);
  }

  /**
   * Fund phase: prepares each working account's fee session per its resolved policy + funding
   * (bridging Fee Juice when needed). The session owns all claim state — see
   * {@link FeeSession.hasPendingClaim}.
   */
  public prepareFees(plan: DeployPlan): Promise<FeeSession> {
    return prepareFeeSession({
      local: this.local,
      node: this.node,
      nodeUrl: this.spec.nodeUrl,
      wallet: this.wallet,
      state: this.state,
      persist: () => this.persist(),
      reporter: this.reporter,
      accounts: plan.accounts
        .filter(a => a.funding.kind !== 'idle')
        .map(a => ({
          address: a.address,
          policy: getOrThrow(this.policyByAddress, a.address.toString(), 'policy'),
          funding: a.funding,
        })),
    });
  }

  /** Executes the layers in order: publishes as individual txs, same-account actions batched. */
  public async executeLayers(feeSession: FeeSession): Promise<void> {
    for (const layer of this.layers) {
      await this.runLayer(
        [...this.publishUnits(layer), ...this.fundUnits(layer), ...this.actionUnits(layer)],
        feeSession,
      );
    }
  }

  /** Persists resolved addresses and runs the spec's `output` hook against the final ctx. */
  public async writeOutputs(): Promise<void> {
    for (const [alias, address] of this.contractAddresses) {
      this.state.addresses[alias] = address.toString();
    }
    this.persist();
    await this.spec.output?.(this.ctx);
  }

  public reportSummary(): void {
    const summary: DeploySummary = {
      label: this.label,
      contracts: [...this.contractAddresses].map(([alias, address]) => ({
        alias,
        address,
        status: getOrThrow(this.contractSteps, alias, 'contract').mode === 'register' ? 'registered' : 'published',
      })),
      accounts: [...this.accountAddresses].map(([alias, address]) => ({ alias, address })),
    };
    this.reporter.onComplete?.(summary);
  }

  /** Accounts are initializerless (no deploy tx). Per-account salt + fee policy override the spec. */
  private async resolveAccounts(): Promise<void> {
    await Promise.all(
      Object.entries(this.spec.accounts).map(async ([alias, account]) => {
        const derived = await this.wallet.createSchnorrInitializerlessAccount(
          account.secret,
          account.salt ?? this.defaultSalt,
          deriveMasterMessageSigningSecretKey(account.secret),
        );
        this.accountAddresses.set(alias, derived.address);
        this.policyByAddress.set(derived.address.toString(), account.fees ?? this.globalPolicy);
      }),
    );
  }

  /**
   * Class ids come from the ARTIFACT (not the instance/args), so they're known upfront for every
   * contract — deferred ones included. This lets class-publish ordering cover all same-class
   * contracts, so exactly one publishes the class and the rest are ordered after it (no race).
   * Steps sharing a generated contract class share the artifact object, so the id is computed once
   * per artifact identity — hashing it is CPU-heavy.
   */
  private async computeClassIds(): Promise<void> {
    const idByArtifact = new Map<ContractArtifact, Promise<Fr>>();
    await Promise.all(
      [...this.contractSteps].map(async ([alias, step]) => {
        if (step.mode !== 'publish') {
          return;
        }
        let id = idByArtifact.get(step.contract.artifact);
        if (!id) {
          id = getContractClassFromArtifact(step.contract.artifact).then(contractClass => contractClass.id);
          idByArtifact.set(step.contract.artifact, id);
        }
        this.classIds.set(alias, await id);
      }),
    );
  }

  /** Contract→contract address deps, auto-derived from each deterministic `initializerArgs`. */
  private recordContractRefs(): Map<string, string[]> {
    const contractRefs = new Map<string, string[]>();
    for (const [alias, step] of this.contractSteps) {
      contractRefs.set(alias, step.initializerArgs ? referencedContracts(step.initializerArgs) : []);
    }
    return contractRefs;
  }

  /**
   * Publishes/registers a contract from already-computed initializer args (used upfront for
   * deterministic contracts, and at inventory or execution time for deferred ones). Both modes
   * derive the address from the full instantiation params — deployer and secret-derived public
   * keys included — so a registered contract lands on the same address publishing it would.
   */
  private async resolveContract(alias: string, step: ContractStep<C>, args: unknown[]): Promise<void> {
    this.publishedCache.delete(alias); // re-resolution may change the address
    const salt = step.salt ?? this.defaultSalt;
    const deployer = step.deployer(this.resolver);
    const publicKeys = step.secret ? (await deriveKeys(step.secret)).publicKeys : undefined;
    if (step.mode === 'publish') {
      const deployMethod = DeployMethod.create<ContractBase>(
        this.wallet,
        {
          artifact: step.contract.artifact,
          postDeployCtor: (instance, boundWallet) => step.contract.at(instance.address, boundWallet),
          args,
          ...(step.initializer ? { constructorNameOrArtifact: step.initializer } : {}),
        },
        { deployer, salt, ...(publicKeys ? { publicKeys } : {}) },
      );
      const instance = await deployMethod.getInstance();
      this.contractAddresses.set(alias, instance.address);
      this.contractInstances.set(alias, step.contract.at(instance.address, this.wallet));
      this.deployMethods.set(alias, deployMethod);
      await this.wallet.registerContract(instance, step.contract.artifact, step.secret);
    } else {
      const instance = await getContractInstanceFromInstantiationParams(step.contract.artifact, {
        salt,
        deployer,
        ...(publicKeys ? { publicKeys } : {}),
        ...(args.length ? { constructorArgs: args } : {}),
        ...(step.initializer ? { constructorArtifact: step.initializer } : {}),
      });
      this.contractAddresses.set(alias, instance.address);
      this.contractInstances.set(alias, step.contract.at(instance.address, this.wallet));
      await this.wallet.registerContract(instance, step.contract.artifact, step.secret);
    }
  }

  /**
   * Attempts to resolve a deferred contract from current on-chain state, and reports whether there
   * is no work left for it this run — the args resolved AND the instance is already published.
   * Attempted only once every step it declares is in place, actions included: its args read their
   * effects, so resolving earlier would derive the address from state that does not exist yet.
   */
  private async tryResolveDeferred(alias: string, step: ContractStep<C>): Promise<boolean> {
    if (!(await this.dependenciesReady(alias, { contractsOnly: false }))) {
      return false;
    }
    await this.runRecorded(alias, `Deferred initializer args for contract "${alias}"`, async ctx =>
      this.resolveContract(alias, step, await step.deferredInitializerArgs!(ctx)),
    );
    return this.isPublished(alias);
  }

  /**
   * Whether the steps `alias` declares as dependencies are all in place: a contract published or
   * registered per its mode, a fund step above its threshold, an action already done. With
   * `contractsOnly`, contracts alone — a gate exists to observe whether the actions and funds it
   * follows landed, so it must still run once the contracts it reads are there.
   */
  private async dependenciesReady(alias: string, { contractsOnly }: { contractsOnly: boolean }): Promise<boolean> {
    const step = getOrThrow(this.steps, alias, 'step');
    for (const dependency of [...(this.contractRefs.get(alias) ?? []), ...(step.dependsOn ?? [])]) {
      if (contractsOnly && getOrThrow(this.steps, dependency, 'step').kind !== 'contract') {
        continue;
      }
      if (!(await this.done(dependency))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Runs a user callback against a ctx that records every contract alias it looks up, then requires
   * those to be declared in the step's `dependsOn` — an undeclared read is state nothing checked was
   * in place. The check runs even when the callback throws, so a callback that catches its own
   * errors (the usual shape for a getter that reverts when unset) can't hide one.
   */
  private async runRecorded<T>(alias: string, description: string, run: (ctx: Ctx<C>) => Promise<T>): Promise<T> {
    const references = new Set<string>();
    const ctx: Ctx<C> = {
      ...this.ctx,
      contract: reference => {
        references.add(reference);
        return this.resolver.contract(reference);
      },
      instance: ((reference: string) => {
        references.add(reference);
        return getOrThrow(this.contractInstances, reference, 'contract instance');
      }) as Ctx<C>['instance'],
    };
    let result: T;
    try {
      result = await run(ctx);
    } catch (error) {
      this.assertReferencesDeclared(alias, description, references, error);
      throw error;
    }
    this.assertReferencesDeclared(alias, description, references);
    return result;
  }

  /**
   * Rejects contract aliases the callback read but the step doesn't declare. `cause` carries the
   * error the callback threw, since an undeclared read is the likeliest reason it did.
   */
  private assertReferencesDeclared(alias: string, description: string, references: Set<string>, cause?: unknown): void {
    const step = getOrThrow(this.steps, alias, 'step');
    const declared = new Set([...(this.contractRefs.get(alias) ?? []), ...(step.dependsOn ?? [])]);
    const undeclared = [...references].filter(reference => !declared.has(reference));
    if (undeclared.length > 0) {
      throw new Error(
        `${description} reads ${undeclared.map(reference => `"${reference}"`).join(', ')} but does not declare it in` +
          ` dependsOn. Declare every step it reads, so it only runs once they are in place.`,
        { cause },
      );
    }
  }

  /** Whether the alias's resolved instance is published on-chain. Memoized — one node read per address. */
  private isPublished(alias: string): Promise<boolean> {
    const address = this.contractAddresses.get(alias);
    if (!address) {
      return Promise.resolve(false); // deferred & not yet resolved
    }
    let cached = this.publishedCache.get(alias);
    if (!cached) {
      cached = this.wallet.getContractMetadata(address).then(metadata => metadata.isContractPublished);
      this.publishedCache.set(alias, cached);
    }
    return cached;
  }

  /**
   * A fund step's idempotency gate: whether the recipient's public Fee Juice balance already
   * clears the step's threshold. A recipient this run has yet to put in place holds nothing, so the
   * balance is read only once the contracts its selector references are there. Memoized per run.
   */
  private fundGate(alias: string): Promise<boolean> {
    const step = getOrThrow(this.fundSteps, alias, 'fund step');
    let cached = this.fundGateCache.get(alias);
    if (!cached) {
      cached = (async () => {
        for (const reference of referencedContracts(step.recipient)) {
          if (!(await this.done(reference))) {
            return false;
          }
        }
        const recipient = step.recipient(this.resolver);
        return (await publicFeeJuiceBalance(this.wallet, recipient, step.from(this.resolver))) >= step.threshold;
      })();
      this.fundGateCache.set(alias, cached);
    }
    return cached;
  }

  /**
   * An action's `done` gate, memoized per run. Invoked only once the contracts the action declares
   * are in place: until then the action cannot have run, and the gate would read state that does not
   * exist. Gates may consult other steps via `ctx.done`, so a gate that (transitively) depends on
   * itself throws {@link GateCycleError}.
   */
  private actionGate(alias: string): Promise<boolean> {
    const step = this.actionSteps.get(alias);
    if (!step) {
      throw new Error(`Unknown action "${alias}".`);
    }
    if (this.gateInProgress.has(alias)) {
      return Promise.reject(new GateCycleError(`Cyclic idempotency gate at "${alias}".`));
    }
    const cached = this.gateCache.get(alias);
    if (cached) {
      return cached;
    }
    this.gateInProgress.add(alias);
    const pending = (async () => {
      if (!(await this.dependenciesReady(alias, { contractsOnly: true }))) {
        return false;
      }
      return this.runRecorded(alias, `Idempotency gate for action "${alias}"`, ctx => step.done(ctx));
    })().finally(() => this.gateInProgress.delete(alias));
    this.gateCache.set(alias, pending);
    return pending;
  }

  /** `ctx.done`: whether step `id` is already satisfied this run — mode-aware. */
  private done(id: string): Promise<boolean> {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Unknown step "${id}".`);
    }
    if (step.kind === 'action') {
      return this.actionGate(id);
    }
    if (step.kind === 'fund') {
      return this.fundGate(id);
    }
    if (step.mode === 'register') {
      return Promise.resolve(this.contractAddresses.has(id)); // registered in the PXE
    }
    return this.isPublished(id);
  }

  /** `ctx.ran`: whether step `id` did (or will do) work this run — mode-aware. */
  private async ran(id: string): Promise<boolean> {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Unknown step "${id}".`);
    }
    if (step.kind === 'action') {
      return !(await this.actionGate(id));
    }
    if (step.kind === 'fund') {
      return this.fundsToRun.has(id);
    }
    if (step.mode === 'register') {
      return this.contractAddresses.has(id); // (re)registered this run
    }
    return this.publishedThisRun.has(id);
  }

  /**
   * Builds the execution graph over the steps that run and groups it into layers. Exactly one
   * contract per class publishes it (the first in declaration order); every other same-class
   * contract — deterministic or deferred — is ordered after it.
   */
  private buildLayers(): string[][] {
    const publisherByClass = new Map<string, string>();
    for (const [alias, step] of this.contractSteps) {
      if (step.mode !== 'publish') {
        continue;
      }
      const classId = getOrThrow(this.classIds, alias, 'class id').toString();
      if (!publisherByClass.has(classId)) {
        publisherByClass.set(classId, alias);
      }
    }
    const execDeps = new Map<string, string[]>();
    for (const alias of this.execAliases) {
      const step = getOrThrow(this.steps, alias, 'step');
      // Constructor address refs (contractRefs) do NOT order publishes — addresses are deterministic,
      // so a contract can publish in parallel with the ones it references. Only `dependsOn` (an action
      // it follows / runtime state a deferred contract reads) and shared-class publication order here.
      const deps = new Set<string>(step.dependsOn ?? []);
      if (step.kind === 'contract' && step.mode === 'publish') {
        const classId = this.classIds.get(alias)?.toString();
        const publisher = classId ? publisherByClass.get(classId) : undefined;
        if (publisher && publisher !== alias) {
          deps.add(publisher);
        }
      }
      execDeps.set(alias, [...deps]);
    }
    // Actions float as late as their dependents allow, so same-account actions coalesce into one
    // batched tx; contract publishes stay early (they unblock dependents and aren't batched).
    return scheduleLayers(this.execAliases, execDeps, id => getOrThrow(this.steps, id, 'step').kind === 'action');
  }

  /** A layer's contract publishes — one tx each (deferred contracts resolve their address first). */
  private publishUnits(layer: string[]): ExecutionUnit[] {
    const units: ExecutionUnit[] = [];
    for (const alias of layer.filter(a => this.contractSteps.has(a))) {
      const step = getOrThrow(this.contractSteps, alias, 'contract');
      const account = step.deployer(this.resolver);
      units.push({
        label: `publish ${alias}`,
        kind: 'publish',
        account,
        send: async fee => {
          if (isDeferred(step)) {
            // Re-resolve with post-`dependsOn` state: the inventory attempt either failed or ran
            // before this run's earlier layers landed.
            await this.resolveContract(alias, step, await step.deferredInitializerArgs!(this.ctx));
          }
          const classId = getOrThrow(this.classIds, alias, 'class id');
          const deployMethod = getOrThrow(this.deployMethods, alias, 'deploy method');
          const classKey = classId.toString();
          const alreadyRegistered =
            this.classesPublishedThisRun.has(classKey) ||
            (await this.wallet.getContractClassMetadata(classId)).isContractClassPubliclyRegistered;
          this.classesPublishedThisRun.add(classKey);
          const sent = await deployMethod.send({
            from: account,
            fee,
            wait: { timeout: 120 },
            skipClassPublication: alreadyRegistered,
          });
          this.publishedCache.set(alias, Promise.resolve(true));
          return sent;
        },
      });
    }
    return units;
  }

  /**
   * A layer's fund steps — one unit each: obtain the recipient's claim (resume the persisted one,
   * or bridge from L1 and wait for the message), then send the L2 `FeeJuice.claim` tx from the
   * step's `from` account.
   */
  private fundUnits(layer: string[]): ExecutionUnit[] {
    const units: ExecutionUnit[] = [];
    for (const alias of layer.filter(a => this.fundSteps.has(a))) {
      const step = getOrThrow(this.fundSteps, alias, 'fund step');
      const account = step.from(this.resolver);
      units.push({
        label: `fund ${alias}`,
        kind: 'fund',
        account,
        send: async fee => {
          const recipient = step.recipient(this.resolver);
          const claim = await obtainFeeJuiceClaim({
            local: this.local,
            node: this.node,
            nodeUrl: this.spec.nodeUrl,
            recipient,
            amount: step.amount,
            l1: { l1FunderKey: step.l1FunderKey, l1RpcUrl: step.l1RpcUrl, l1ChainId: step.l1ChainId },
            state: this.state,
            persist: () => this.persist(),
            reporter: this.reporter,
          });
          const sent = await FeeJuiceContract.at(this.wallet)
            .methods.claim(recipient, claim.claimAmount, claim.claimSecret, claim.messageLeafIndex)
            .send({ from: account, fee, wait: { timeout: 120 } });
          claim.onConsumed();
          return sent;
        },
      });
    }
    return units;
  }

  /** A layer's actions, batching independent same-account actions into ≤{@link APP_MAX_CALLS}-call BatchCalls. */
  private actionUnits(layer: string[]): ExecutionUnit[] {
    const actionsByAccount = new Map<string, { account: AztecAddress; aliases: string[] }>();
    for (const alias of layer.filter(a => this.actionSteps.has(a))) {
      const account = getOrThrow(this.actionSteps, alias, 'action').from(this.resolver);
      const group = actionsByAccount.get(account.toString());
      if (group) {
        group.aliases.push(alias);
      } else {
        actionsByAccount.set(account.toString(), { account, aliases: [alias] });
      }
    }
    const units: ExecutionUnit[] = [];
    for (const { account, aliases } of actionsByAccount.values()) {
      for (const batch of chunk(aliases, APP_MAX_CALLS)) {
        units.push({
          label: batch.length === 1 ? `action ${batch[0]}` : `batch [${batch.join(', ')}]`,
          kind: 'action',
          account,
          send: async fee => {
            const interactions = await Promise.all(
              batch.map(alias => getOrThrow(this.actionSteps, alias, 'action').call(this.ctx)),
            );
            const sendOptions = { from: account, fee, wait: { timeout: 120 } };
            return interactions.length === 1
              ? interactions[0].send(sendOptions)
              : new BatchCall(this.wallet, interactions).send(sendOptions);
          },
        });
      }
    }
    return units;
  }

  private async runLayer(units: ExecutionUnit[], feeSession: FeeSession): Promise<void> {
    if (units.length === 0) {
      return;
    }
    // Per-account claim serialization: the first paying tx of each claim-holding account must mine
    // (consuming + spending the claim) before that account's balance-payers fan out. The fee
    // session owns the claim state; consuming the claim flips `hasPendingClaim` for later layers.
    const claimFirst: ExecutionUnit[] = [];
    const rest: ExecutionUnit[] = [];
    const seen = new Set<string>();
    for (const unit of units) {
      const key = unit.account.toString();
      if (feeSession.hasPendingClaim(unit.account) && !seen.has(key)) {
        seen.add(key);
        claimFirst.push(unit);
      } else {
        rest.push(unit);
      }
    }
    for (const unit of claimFirst) {
      await this.runUnit(unit, feeSession);
    }
    // Fund units run sequentially relative to each other: their send closures submit L1 bridge
    // txs, and two bridges signed by the same funder key would race on nonces.
    const fundRest = rest.filter(unit => unit.kind === 'fund');
    const parallelRest = rest.filter(unit => unit.kind !== 'fund');
    await Promise.all([
      Promise.all(parallelRest.map(unit => this.runUnit(unit, feeSession))),
      (async () => {
        for (const unit of fundRest) {
          await this.runUnit(unit, feeSession);
        }
      })(),
    ]);
  }

  private async runUnit(unit: ExecutionUnit, feeSession: FeeSession): Promise<void> {
    const info = { label: unit.label, kind: unit.kind, account: unit.account };
    this.reporter.onUnitStart?.(info);
    const { fee, onConsumed } = feeSession.next(unit.account);
    const startedAt = Date.now();
    let result: unknown;
    try {
      result = await unit.send(fee);
    } catch (error) {
      this.reporter.onUnitError?.(info, error);
      throw error;
    }
    const receipt = (result as { receipt?: TxReceipt } | undefined)?.receipt;
    this.reporter.onUnitSettled?.(info, {
      txHash: receipt?.txHash,
      blockNumber: receipt?.blockNumber != null ? Number(receipt.blockNumber) : undefined,
      feePaid: receipt?.transactionFee,
      status: receipt?.status != null ? String(receipt.status) : undefined,
      durationMs: Date.now() - startedAt,
    });
    onConsumed();
  }

  private persist(): void {
    saveState(this.stateDirectory, this.state);
  }
}
