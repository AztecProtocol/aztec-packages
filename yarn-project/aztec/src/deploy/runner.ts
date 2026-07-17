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
 * - Deferred contracts (args read runtime state) resolve AT EXECUTION TIME, once their `dependsOn`
 *   has run.
 * - Steps execute in topological layers over the single graph, so an action can precede a contract
 *   it sets up. Within a layer, contract publishes are individual txs and same-account actions batch
 *   into ≤5-call BatchCalls. The one-time fee-juice claim per account is consumed + mined by that
 *   account's first tx before the rest fan out.
 */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, type ContractBase, DeployMethod } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { getPXEConfig } from '@aztec/pxe/server';
import { getContractClassFromArtifact, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveKeys, deriveMasterMessageSigningSecretKey } from '@aztec/stdlib/keys';
import type { TxReceipt } from '@aztec/stdlib/tx';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { join } from 'node:path';

import { type FeeSession, type SendFee, accountFunding, defaultFeePolicy, prepareFeeSession } from './fees.js';
import { scheduleLayers, topologicalLayers } from './graph.js';
import {
  type DeployPlan,
  type DeployReporter,
  type DeploySummary,
  type DeployUnitKind,
  consoleReporter,
} from './reporter.js';
import { type DeployState, loadState, saveState } from './state.js';
import type { ActionStep, ContractStep, Ctx, DeploymentSpec, FeePolicy, Resolver, StepSpec, Steps } from './types.js';

/** Max calls batched into a single execution payload for one account (protocol limit). */
const MAX_CALLS_PER_BATCH = 5;

/** A step's idempotency gate (transitively) depends on itself. */
class GateCycleError extends Error {}

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

  private readonly stepEntries: [string, StepSpec<C>][];
  private readonly contractEntries: [string, ContractStep<C>][];
  private readonly actionEntries: [string, ActionStep<C>][];
  /** Contract→contract address deps, auto-derived from deterministic `initializerArgs`. */
  private readonly contractRefs: Map<string, string[]>;

  // Populated as accounts resolve, contracts resolve (upfront or deferred), and txs land.
  private readonly accountAddresses = new Map<string, AztecAddress>();
  private readonly policyByAddress = new Map<string, FeePolicy>();
  private readonly contractAddresses = new Map<string, AztecAddress>();
  private readonly contractInstances = new Map<string, ContractBase>();
  private readonly deployMethods = new Map<string, DeployMethod<ContractBase>>();
  private readonly classIds = new Map<string, Fr>();
  private readonly publishedThisRun = new Set<string>();
  private readonly classesPublishedThisRun = new Set<string>();
  private readonly gateCache = new Map<string, Promise<boolean>>();
  private readonly gateInProgress = new Set<string>();

  // Populated by the resolve / inventory / plan / fund phases.
  private resolveOrder: string[] = [];
  private readonly actionsToRun = new Set<string>();
  private execAliases: string[] = [];
  private layers: string[][] = [];
  /** Accounts whose first paying tx must mine before the rest fan out (one-time bridge claim). */
  private accountsWithClaim = new Set<string>();

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

    this.stepEntries = Object.entries(spec.steps) as [string, StepSpec<C>][];
    this.contractEntries = this.stepEntries.filter(([, s]) => s.kind === 'contract') as [string, ContractStep<C>][];
    this.actionEntries = this.stepEntries.filter(([, s]) => s.kind === 'action') as [string, ActionStep<C>][];
    for (const [alias, step] of this.contractEntries) {
      if (isDeferred(step) && step.mode === 'register') {
        throw new Error(`Contract "${alias}" is register-mode with deferred args — registration has no tx to defer.`);
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

  /** Connects the node + ephemeral wallet, then resolves accounts and class ids. */
  public static async create<C extends Steps>(spec: DeploymentSpec<C>): Promise<DeploymentRun<C>> {
    if (!spec.node && !spec.nodeUrl) {
      throw new Error('runDeployment requires either `node` or `nodeUrl` on the spec.');
    }
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

  /** Resolves every deterministic contract upfront, in constructor-arg dependency order. */
  public async resolveDeterministicContracts(): Promise<void> {
    const deterministicAliases = this.contractEntries.filter(([, s]) => !isDeferred(s)).map(([a]) => a);
    this.resolveOrder = topologicalLayers(deterministicAliases, this.contractRefs).flat();
    for (const alias of this.resolveOrder) {
      const step = this.spec.steps[alias] as ContractStep<C>;
      await this.resolveContract(alias, step, step.initializerArgs?.(this.resolver) ?? []);
    }
  }

  /** Inventory: which steps still need doing? */
  public async takeInventory(): Promise<void> {
    for (const alias of this.resolveOrder) {
      const step = this.spec.steps[alias] as ContractStep<C>;
      if (step.mode === 'publish' && !(await this.isPublished(alias))) {
        this.publishedThisRun.add(alias);
      }
    }
    for (const [alias] of this.actionEntries) {
      if (!(await this.actionGate(alias))) {
        this.actionsToRun.add(alias);
      }
    }
    const deferredAliases = this.contractEntries.filter(([, s]) => isDeferred(s)).map(([a]) => a);

    // Steps that execute this run: deterministic publishes that are missing, every deferred contract
    // (resolved + published-if-needed at exec), and actions whose gate didn't pass.
    this.execAliases = [
      ...this.resolveOrder.filter(alias => this.publishedThisRun.has(alias)),
      ...deferredAliases,
      ...this.actionEntries.filter(([a]) => this.actionsToRun.has(a)).map(([a]) => a),
    ];
  }

  /**
   * Builds the plan — account funding postures, per-step statuses, and the execution layers — and
   * reports it (the default reporter renders it to stderr). The fund phase consumes its accounts.
   */
  public async reportPlan(): Promise<DeployPlan> {
    const accountUsedBy = new Set<string>();
    for (const alias of this.execAliases) {
      const step = this.spec.steps[alias];
      const address = step.kind === 'contract' ? step.deployer(this.resolver) : step.from(this.resolver);
      accountUsedBy.add(address.toString());
    }
    const stepStatus = (alias: string, step: StepSpec<C>): DeployPlan['steps'][number]['status'] => {
      if (step.kind === 'action') {
        return this.actionsToRun.has(alias) ? 'to run' : 'done';
      }
      if (step.mode === 'register') {
        return 'registered';
      }
      return this.publishedThisRun.has(alias) || isDeferred(step) ? 'to publish' : 'published';
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
      steps: this.stepEntries.map(([id, step]) => ({
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
   * (bridging Fee Juice when needed) and records which accounts hold a one-time bridge claim.
   */
  public async prepareFees(plan: DeployPlan): Promise<FeeSession> {
    const feeSession = await prepareFeeSession({
      local: this.local,
      node: this.node,
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
    this.accountsWithClaim = new Set(
      plan.accounts.filter(a => a.funding.kind === 'not-funded').map(a => a.address.toString()),
    );
    return feeSession;
  }

  /** Executes the layers in order: publishes as individual txs, same-account actions batched. */
  public async executeLayers(feeSession: FeeSession): Promise<void> {
    for (const layer of this.layers) {
      await this.runLayer([...this.publishUnits(layer), ...this.actionUnits(layer)], feeSession);
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
        status: (this.spec.steps[alias] as ContractStep<C>).mode === 'register' ? 'registered' : 'published',
      })),
      accounts: [...this.accountAddresses].map(([alias, address]) => ({ alias, address })),
    };
    this.reporter.onComplete?.(summary);
  }

  /** Accounts are initializerless (no deploy tx). Per-account salt + fee policy override the spec. */
  private async resolveAccounts(): Promise<void> {
    for (const [alias, account] of Object.entries(this.spec.accounts)) {
      const derived = await this.wallet.createSchnorrInitializerlessAccount(
        account.secret,
        account.salt ?? this.defaultSalt,
        deriveMasterMessageSigningSecretKey(account.secret),
      );
      this.accountAddresses.set(alias, derived.address);
      this.policyByAddress.set(derived.address.toString(), account.fees ?? this.globalPolicy);
    }
  }

  /**
   * Class ids come from the ARTIFACT (not the instance/args), so they're known upfront for every
   * contract — deferred ones included. This lets class-publish ordering cover all same-class
   * contracts, so exactly one publishes the class and the rest are ordered after it (no race).
   */
  private async computeClassIds(): Promise<void> {
    for (const [alias, step] of this.contractEntries) {
      if (step.mode === 'publish') {
        this.classIds.set(alias, (await getContractClassFromArtifact(step.contract.artifact)).id);
      }
    }
  }

  /** Contract→contract address deps, auto-derived from each deterministic `initializerArgs`. */
  private recordContractRefs(): Map<string, string[]> {
    const contractRefs = new Map<string, string[]>();
    for (const [alias, step] of this.contractEntries) {
      const refs = new Set<string>();
      if (step.initializerArgs) {
        // Dry-run `initializerArgs` with a resolver that records each `contract(alias)` lookup instead of resolving
        // it. The returned args are discarded — this call only extracts references — and the ZERO addresses never
        // leave this block. This is what requires `initializerArgs` to be pure: it runs here with fake addresses and
        // again later (in resolveDeterministicContracts) with real ones.
        const recording: Resolver = {
          account: () => AztecAddress.ZERO,
          contract: referenced => {
            refs.add(referenced);
            return AztecAddress.ZERO;
          },
        };
        step.initializerArgs(recording);
      }
      contractRefs.set(alias, [...refs]);
    }
    return contractRefs;
  }

  /**
   * Publishes/registers a contract from already-computed initializer args (used upfront for
   * deterministic contracts, and at execution time for deferred ones).
   */
  private async resolveContract(alias: string, step: ContractStep<C>, args: unknown[]): Promise<void> {
    const salt = step.salt ?? this.defaultSalt;
    if (step.mode === 'publish') {
      const deployer = step.deployer(this.resolver);
      const publicKeys = step.secret ? (await deriveKeys(step.secret)).publicKeys : undefined;
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
        ...(args.length ? { constructorArgs: args } : {}),
        ...(step.initializer ? { constructorArtifact: step.initializer } : {}),
      });
      this.contractAddresses.set(alias, instance.address);
      this.contractInstances.set(alias, step.contract.at(instance.address, this.wallet));
      await this.wallet.registerContract(instance, step.contract.artifact);
    }
  }

  private async isPublished(alias: string): Promise<boolean> {
    const address = this.contractAddresses.get(alias);
    if (!address) {
      return false; // deferred & not yet resolved
    }
    return (await this.wallet.getContractMetadata(address)).isContractPublished;
  }

  /**
   * An action's `done` gate, memoized per run. Gates may consult other steps via `ctx.done`, so a
   * gate that (transitively) depends on itself throws {@link GateCycleError}.
   */
  private actionGate(alias: string): Promise<boolean> {
    const step = this.spec.steps[alias];
    if (!step || step.kind !== 'action') {
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
      try {
        return await (step as ActionStep<C>).done(this.ctx);
      } catch (error) {
        if (error instanceof GateCycleError) {
          throw error;
        }
        return false; // e.g. a target contract isn't published yet ⇒ not done
      }
    })().finally(() => this.gateInProgress.delete(alias));
    this.gateCache.set(alias, pending);
    return pending;
  }

  /** `ctx.done`: whether step `id` is already satisfied this run — mode-aware. */
  private done(id: string): Promise<boolean> {
    const step = this.spec.steps[id];
    if (!step) {
      throw new Error(`Unknown step "${id}".`);
    }
    if (step.kind === 'action') {
      return this.actionGate(id);
    }
    if (step.mode === 'register') {
      return Promise.resolve(this.contractAddresses.has(id)); // registered in the PXE
    }
    return this.isPublished(id);
  }

  /** `ctx.ran`: whether step `id` did (or will do) work this run — mode-aware. */
  private async ran(id: string): Promise<boolean> {
    const step = this.spec.steps[id];
    if (!step) {
      throw new Error(`Unknown step "${id}".`);
    }
    if (step.kind === 'action') {
      return !(await this.actionGate(id));
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
    for (const [alias, step] of this.contractEntries) {
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
      const step = this.spec.steps[alias];
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
    return scheduleLayers(this.execAliases, execDeps, id => this.spec.steps[id].kind === 'action');
  }

  /** A layer's contract publishes — one tx each (deferred contracts resolve their address first). */
  private publishUnits(layer: string[]): ExecutionUnit[] {
    const units: ExecutionUnit[] = [];
    for (const alias of layer.filter(a => this.spec.steps[a].kind === 'contract')) {
      const step = this.spec.steps[alias] as ContractStep<C>;
      const account = step.deployer(this.resolver);
      units.push({
        label: `publish ${alias}`,
        kind: 'publish',
        account,
        send: async fee => {
          if (isDeferred(step)) {
            await this.resolveContract(alias, step, await step.deferredInitializerArgs!(this.ctx));
          }
          const classId = getOrThrow(this.classIds, alias, 'class id');
          const deployMethod = getOrThrow(this.deployMethods, alias, 'deploy method');
          const classKey = classId.toString();
          const alreadyRegistered =
            this.classesPublishedThisRun.has(classKey) ||
            (await this.wallet.getContractClassMetadata(classId)).isContractClassPubliclyRegistered;
          this.classesPublishedThisRun.add(classKey);
          this.publishedThisRun.add(alias);
          return deployMethod.send({
            from: account,
            fee,
            wait: { timeout: 120 },
            skipClassPublication: alreadyRegistered,
          });
        },
      });
    }
    return units;
  }

  /** A layer's actions, batching independent same-account actions into ≤5-call BatchCalls. */
  private actionUnits(layer: string[]): ExecutionUnit[] {
    const actionsByAccount = new Map<string, { account: AztecAddress; aliases: string[] }>();
    for (const alias of layer.filter(a => this.spec.steps[a].kind === 'action')) {
      const account = (this.spec.steps[alias] as ActionStep<C>).from(this.resolver);
      const group = actionsByAccount.get(account.toString());
      if (group) {
        group.aliases.push(alias);
      } else {
        actionsByAccount.set(account.toString(), { account, aliases: [alias] });
      }
    }
    const units: ExecutionUnit[] = [];
    for (const { account, aliases } of actionsByAccount.values()) {
      for (let start = 0; start < aliases.length; start += MAX_CALLS_PER_BATCH) {
        const batch = aliases.slice(start, start + MAX_CALLS_PER_BATCH);
        units.push({
          label: batch.length === 1 ? `action ${batch[0]}` : `batch [${batch.join(', ')}]`,
          kind: 'action',
          account,
          send: async fee => {
            const interactions = await Promise.all(
              batch.map(alias => (this.spec.steps[alias] as ActionStep<C>).call(this.ctx)),
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
    // (consuming + spending the claim) before that account's balance-payers fan out.
    const claimFirst: ExecutionUnit[] = [];
    const rest: ExecutionUnit[] = [];
    const seen = new Set<string>();
    for (const unit of units) {
      const key = unit.account.toString();
      if (this.accountsWithClaim.has(key) && !seen.has(key)) {
        seen.add(key);
        claimFirst.push(unit);
      } else {
        rest.push(unit);
      }
    }
    for (const unit of claimFirst) {
      await this.runUnit(unit, feeSession);
      this.accountsWithClaim.delete(unit.account.toString());
    }
    await Promise.all(rest.map(unit => this.runUnit(unit, feeSession)));
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
