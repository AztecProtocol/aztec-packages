/**
 * The deployment engine: turns a declarative {@link DeploymentSpec} into one dependency graph of
 * steps (contracts + actions), runs only what's missing, and is safe to re-run.
 *
 *   resolve accounts → resolve deterministic addresses → inventory → plan → fund → execute → output
 *
 * - Deterministic contracts (addresses are a pure function of class/deployer/salt/args) resolve
 *   UPFRONT, so the plan knows their addresses before anything is sent.
 * - Deferred contracts (args read runtime state) resolve AT EXECUTION TIME, once their `dependsOn`
 *   has run.
 * - Steps execute in topological waves over the single graph, so an action can precede a contract
 *   it sets up. Within a wave, contract publishes are individual txs and same-account actions batch
 *   into ≤5-call BatchCalls. The one-time fee-juice claim per account is consumed + mined by that
 *   account's first tx before the rest fan out.
 */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, type ContractBase, DeployMethod } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getPXEConfig } from '@aztec/pxe/server';
import { getContractClassFromArtifact, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveKeys, deriveMasterMessageSigningSecretKey } from '@aztec/stdlib/keys';
import type { TxReceipt } from '@aztec/stdlib/tx';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { join } from 'node:path';

import { type SendFee, accountFunding, defaultFeePolicy, prepareFeeSession } from './fees.js';
import { scheduleLayers, topologicalLayers } from './graph.js';
import { type DeployPlan, type DeploySummary, type DeployUnitKind, consoleReporter } from './reporter.js';
import { loadState, saveState } from './state.js';
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

/** One tx to send: a single contract publish, or a batch of same-account actions. */
interface ExecutionUnit {
  label: string;
  kind: DeployUnitKind;
  account: AztecAddress;
  send: (fee: SendFee) => Promise<unknown>;
}

export async function runDeployment<C extends Steps>(spec: DeploymentSpec<C>): Promise<void> {
  const local = spec.local ?? false;
  const label = spec.label ?? (local ? 'local' : 'network');
  const reporter = spec.reporter ?? consoleReporter();
  if (!spec.node && !spec.nodeUrl) {
    throw new Error('runDeployment requires either `node` or `nodeUrl` on the spec.');
  }
  const node = spec.node ?? createAztecNodeClient(spec.nodeUrl!);
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { ...getPXEConfig(), proverEnabled: !local },
  });
  const stateDirectory = spec.stateDir ?? join(process.cwd(), '.deploy-state');
  const state = loadState(stateDirectory);
  const persist = () => saveState(stateDirectory, state);
  const defaultSalt = spec.salt ?? new Fr(0);
  const globalPolicy: FeePolicy = spec.fees ?? defaultFeePolicy(local);

  // ── Accounts (initializerless; no deploy tx). Per-account salt + fee policy override the spec. ─
  const accountAddresses = new Map<string, AztecAddress>();
  const policyByAddress = new Map<string, FeePolicy>();
  for (const [alias, account] of Object.entries(spec.accounts)) {
    const derived = await wallet.createSchnorrInitializerlessAccount(
      account.secret,
      account.salt ?? defaultSalt,
      deriveMasterMessageSigningSecretKey(account.secret),
    );
    accountAddresses.set(alias, derived.address);
    policyByAddress.set(derived.address.toString(), account.fees ?? globalPolicy);
  }

  // ── Maps populated during resolve / execution. ───────────────────────────────────────
  const contractAddresses = new Map<string, AztecAddress>();
  const contractInstances = new Map<string, ContractBase>();
  const deployMethods = new Map<string, DeployMethod<ContractBase>>();
  const classIds = new Map<string, Fr>();
  const publishedThisRun = new Set<string>();
  const classesPublishedThisRun = new Set<string>();

  const resolver: Resolver = {
    account: alias => getOrThrow(accountAddresses, alias, 'account'),
    contract: alias => getOrThrow(contractAddresses, alias, 'contract'),
  };

  // ── Partition steps. ─────────────────────────────────────────────────────────────────
  const stepEntries = Object.entries(spec.steps) as [string, StepSpec<C>][];
  const contractEntries = stepEntries.filter(([, s]) => s.kind === 'contract') as [string, ContractStep<C>][];
  const actionEntries = stepEntries.filter(([, s]) => s.kind === 'action') as [string, ActionStep<C>][];
  const isDeferred = (step: ContractStep<C>): boolean => step.deferredInitializerArgs != null;
  for (const [alias, step] of contractEntries) {
    if (isDeferred(step) && step.mode === 'register') {
      throw new Error(`Contract "${alias}" is register-mode with deferred args — registration has no tx to defer.`);
    }
  }

  // Class ids come from the ARTIFACT (not the instance/args), so they're known upfront for every
  // contract — deferred ones included. This lets class-publish ordering cover all same-class
  // contracts, so exactly one publishes the class and the rest are ordered after it (no race).
  for (const [alias, step] of contractEntries) {
    if (step.mode === 'publish') {
      classIds.set(alias, (await getContractClassFromArtifact(step.contract.artifact)).id);
    }
  }

  // Publishes/registers a contract from already-computed initializer args (used upfront for
  // deterministic contracts, and at execution time for deferred ones).
  async function resolveContract(alias: string, step: ContractStep<C>, args: unknown[]): Promise<void> {
    const salt = step.salt ?? defaultSalt;
    if (step.mode === 'publish') {
      const deployer = step.deployer(resolver);
      const publicKeys = step.secret ? (await deriveKeys(step.secret)).publicKeys : undefined;
      const deployMethod = DeployMethod.create<ContractBase>(
        wallet,
        {
          artifact: step.contract.artifact,
          postDeployCtor: (instance, boundWallet) => step.contract.at(instance.address, boundWallet),
          args,
          ...(step.initializer ? { constructorNameOrArtifact: step.initializer } : {}),
        },
        { deployer, salt, ...(publicKeys ? { publicKeys } : {}) },
      );
      const instance = await deployMethod.getInstance();
      contractAddresses.set(alias, instance.address);
      contractInstances.set(alias, step.contract.at(instance.address, wallet));
      deployMethods.set(alias, deployMethod);
      await wallet.registerContract(instance, step.contract.artifact, step.secret);
    } else {
      const instance = await getContractInstanceFromInstantiationParams(step.contract.artifact, {
        salt,
        ...(args.length ? { constructorArgs: args } : {}),
        ...(step.initializer ? { constructorArtifact: step.initializer } : {}),
      });
      contractAddresses.set(alias, instance.address);
      contractInstances.set(alias, step.contract.at(instance.address, wallet));
      await wallet.registerContract(instance, step.contract.artifact);
    }
  }

  // ── Contract→contract address deps, auto-derived from deterministic `initializerArgs`. ──
  const contractRefs = new Map<string, string[]>();
  for (const [alias, step] of contractEntries) {
    const refs = new Set<string>();
    if (step.initializerArgs) {
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

  // ── Resolve deterministic addresses upfront, in dependency order. ──────────────────────
  const deterministicAliases = contractEntries.filter(([, s]) => !isDeferred(s)).map(([a]) => a);
  const resolveOrder = topologicalLayers(deterministicAliases, contractRefs).flat();
  for (const alias of resolveOrder) {
    const step = spec.steps[alias] as ContractStep<C>;
    await resolveContract(alias, step, step.initializerArgs?.(resolver) ?? []);
  }

  // ── Predicates (ctx.done / ctx.ran), mode-aware. ───────────────────────────────────────
  const isPublished = async (alias: string): Promise<boolean> => {
    const address = contractAddresses.get(alias);
    if (!address) {
      return false; // deferred & not yet resolved
    }
    return (await wallet.getContractMetadata(address)).isContractPublished;
  };

  const gateCache = new Map<string, Promise<boolean>>();
  const gateInProgress = new Set<string>();
  const actionGate = (alias: string): Promise<boolean> => {
    const step = spec.steps[alias];
    if (!step || step.kind !== 'action') {
      throw new Error(`Unknown action "${alias}".`);
    }
    if (gateInProgress.has(alias)) {
      return Promise.reject(new GateCycleError(`Cyclic idempotency gate at "${alias}".`));
    }
    const cached = gateCache.get(alias);
    if (cached) {
      return cached;
    }
    gateInProgress.add(alias);
    const pending = (async () => {
      try {
        return await (step as ActionStep<C>).done(ctx);
      } catch (error) {
        if (error instanceof GateCycleError) {
          throw error;
        }
        return false; // e.g. a target contract isn't published yet ⇒ not done
      }
    })().finally(() => gateInProgress.delete(alias));
    gateCache.set(alias, pending);
    return pending;
  };

  const done = (id: string): Promise<boolean> => {
    const step = spec.steps[id];
    if (!step) {
      throw new Error(`Unknown step "${id}".`);
    }
    if (step.kind === 'action') {
      return actionGate(id);
    }
    if (step.mode === 'register') {
      return Promise.resolve(contractAddresses.has(id)); // registered in the PXE
    }
    return isPublished(id);
  };
  const ran = async (id: string): Promise<boolean> => {
    const step = spec.steps[id];
    if (!step) {
      throw new Error(`Unknown step "${id}".`);
    }
    if (step.kind === 'action') {
      return !(await actionGate(id));
    }
    if (step.mode === 'register') {
      return contractAddresses.has(id); // (re)registered this run
    }
    return publishedThisRun.has(id);
  };

  const ctx: Ctx<C> = {
    ...resolver,
    instance: ((alias: string) => getOrThrow(contractInstances, alias, 'contract instance')) as Ctx<C>['instance'],
    done,
    ran,
    wallet,
    node,
  };

  // ── Inventory: which steps still need doing? ───────────────────────────────────────────
  for (const alias of resolveOrder) {
    const step = spec.steps[alias] as ContractStep<C>;
    if (step.mode === 'publish' && !(await isPublished(alias))) {
      publishedThisRun.add(alias);
    }
  }
  const actionsToRun = new Set<string>();
  for (const [alias] of actionEntries) {
    if (!(await actionGate(alias))) {
      actionsToRun.add(alias);
    }
  }
  const deferredAliases = contractEntries.filter(([, s]) => isDeferred(s)).map(([a]) => a);

  // Steps that execute this run: deterministic publishes that are missing, every deferred contract
  // (resolved + published-if-needed at exec), and actions whose gate didn't pass.
  const execAliases = [
    ...resolveOrder.filter(alias => publishedThisRun.has(alias)),
    ...deferredAliases,
    ...actionEntries.filter(([a]) => actionsToRun.has(a)).map(([a]) => a),
  ];

  // ── Plan (the default reporter renders it to stderr). ──────────────────────────────────
  const accountUsedBy = new Set<string>();
  for (const alias of execAliases) {
    const step = spec.steps[alias];
    const address = step.kind === 'contract' ? step.deployer(resolver) : step.from(resolver);
    accountUsedBy.add(address.toString());
  }
  const stepStatus = (alias: string, step: StepSpec<C>): DeployPlan['steps'][number]['status'] => {
    if (step.kind === 'action') {
      return actionsToRun.has(alias) ? 'to run' : 'done';
    }
    if (step.mode === 'register') {
      return 'registered';
    }
    return publishedThisRun.has(alias) || isDeferred(step) ? 'to publish' : 'published';
  };
  const plan: DeployPlan = {
    label,
    accounts: await Promise.all(
      Object.keys(spec.accounts).map(async alias => {
        const address = getOrThrow(accountAddresses, alias, 'account');
        const policy = getOrThrow(policyByAddress, address.toString(), 'policy');
        return {
          alias,
          address,
          funding: await accountFunding(policy, wallet, address, accountUsedBy.has(address.toString())),
        };
      }),
    ),
    steps: stepEntries.map(([id, step]) => ({
      id,
      kind: step.kind,
      status: stepStatus(id, step),
      dependsOn: [...(contractRefs.get(id) ?? []), ...(step.dependsOn ?? [])],
    })),
    waves: [],
  };

  // Build the execution graph + waves over the steps that run.
  const execSet = new Set(execAliases);
  // Exactly one contract per class publishes it (the first in declaration order); every other
  // same-class contract — deterministic or deferred — is ordered after it via execDeps.
  const publisherByClass = new Map<string, string>();
  for (const [alias, step] of contractEntries) {
    if (step.mode !== 'publish') {
      continue;
    }
    const classId = getOrThrow(classIds, alias, 'class id').toString();
    if (!publisherByClass.has(classId)) {
      publisherByClass.set(classId, alias);
    }
  }
  const execDeps = new Map<string, string[]>();
  for (const alias of execAliases) {
    const step = spec.steps[alias];
    // Constructor address refs (contractRefs) do NOT order publishes — addresses are deterministic,
    // so a contract can publish in parallel with the ones it references. Only `dependsOn` (an action
    // it follows / runtime state a deferred contract reads) and shared-class publication order here.
    const deps = new Set<string>(step.dependsOn ?? []);
    if (step.kind === 'contract' && step.mode === 'publish') {
      const classId = classIds.get(alias)?.toString();
      const publisher = classId ? publisherByClass.get(classId) : undefined;
      if (publisher && publisher !== alias) {
        deps.add(publisher);
      }
    }
    execDeps.set(alias, [...deps]);
  }
  // Actions float as late as their dependents allow, so same-account actions coalesce into one
  // batched tx; contract publishes stay early (they unblock dependents and aren't batched).
  const waves = scheduleLayers(execAliases, execDeps, id => spec.steps[id].kind === 'action');
  plan.waves = waves;
  reporter.onPlan?.(plan);

  if (execSet.size === 0) {
    reporter.onNothingToDo?.(label);
    for (const [alias, address] of contractAddresses) {
      state.addresses[alias] = address.toString();
    }
    persist();
    await spec.output?.(ctx);
    return;
  }

  // ── Fund the working accounts (per their resolved policy + funding). ───────────────────
  const feeSession = await prepareFeeSession({
    local,
    node,
    wallet,
    state,
    persist,
    reporter,
    accounts: plan.accounts
      .filter(a => a.funding.kind !== 'idle')
      .map(a => ({
        address: a.address,
        policy: getOrThrow(policyByAddress, a.address.toString(), 'policy'),
        funding: a.funding,
      })),
  });
  // Accounts whose first paying tx must mine before the rest fan out (one-time bridge claim).
  const accountsWithClaim = new Set(
    plan.accounts.filter(a => a.funding.kind === 'not-funded').map(a => a.address.toString()),
  );

  // ── Execute waves. ─────────────────────────────────────────────────────────────────────
  const runUnit = async (unit: ExecutionUnit) => {
    const info = { label: unit.label, kind: unit.kind, account: unit.account };
    reporter.onUnitStart?.(info);
    const { fee, onConsumed } = feeSession.next(unit.account);
    const startedAt = Date.now();
    let result: unknown;
    try {
      result = await unit.send(fee);
    } catch (error) {
      reporter.onUnitError?.(info, error);
      throw error;
    }
    const receipt = (result as { receipt?: TxReceipt } | undefined)?.receipt;
    reporter.onUnitSettled?.(info, {
      txHash: receipt?.txHash,
      blockNumber: receipt?.blockNumber != null ? Number(receipt.blockNumber) : undefined,
      feePaid: receipt?.transactionFee,
      status: receipt?.status != null ? String(receipt.status) : undefined,
      durationMs: Date.now() - startedAt,
    });
    onConsumed();
  };

  const runWave = async (units: ExecutionUnit[]) => {
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
      if (accountsWithClaim.has(key) && !seen.has(key)) {
        seen.add(key);
        claimFirst.push(unit);
      } else {
        rest.push(unit);
      }
    }
    for (const unit of claimFirst) {
      await runUnit(unit);
      accountsWithClaim.delete(unit.account.toString());
    }
    await Promise.all(rest.map(runUnit));
  };

  for (const wave of waves) {
    const units: ExecutionUnit[] = [];

    // Contract publishes — one tx each (deferred contracts resolve their address first).
    for (const alias of wave.filter(a => spec.steps[a].kind === 'contract')) {
      const step = spec.steps[alias] as ContractStep<C>;
      const account = step.deployer(resolver);
      units.push({
        label: `publish ${alias}`,
        kind: 'publish',
        account,
        send: async fee => {
          if (isDeferred(step)) {
            await resolveContract(alias, step, await step.deferredInitializerArgs!(ctx));
          }
          const classId = getOrThrow(classIds, alias, 'class id');
          const deployMethod = getOrThrow(deployMethods, alias, 'deploy method');
          const classKey = classId.toString();
          const alreadyRegistered =
            classesPublishedThisRun.has(classKey) ||
            (await wallet.getContractClassMetadata(classId)).isContractClassPubliclyRegistered;
          classesPublishedThisRun.add(classKey);
          publishedThisRun.add(alias);
          return deployMethod.send({
            from: account,
            fee,
            wait: { timeout: 120 },
            skipClassPublication: alreadyRegistered,
          });
        },
      });
    }

    // Actions — batch independent same-account actions into ≤5-call BatchCalls.
    const actionsByAccount = new Map<string, { account: AztecAddress; aliases: string[] }>();
    for (const alias of wave.filter(a => spec.steps[a].kind === 'action')) {
      const account = (spec.steps[alias] as ActionStep<C>).from(resolver);
      const group = actionsByAccount.get(account.toString());
      if (group) {
        group.aliases.push(alias);
      } else {
        actionsByAccount.set(account.toString(), { account, aliases: [alias] });
      }
    }
    for (const { account, aliases } of actionsByAccount.values()) {
      for (let start = 0; start < aliases.length; start += MAX_CALLS_PER_BATCH) {
        const batch = aliases.slice(start, start + MAX_CALLS_PER_BATCH);
        units.push({
          label: batch.length === 1 ? `action ${batch[0]}` : `batch [${batch.join(', ')}]`,
          kind: 'action',
          account,
          send: async fee => {
            const interactions = await Promise.all(batch.map(alias => (spec.steps[alias] as ActionStep<C>).call(ctx)));
            const sendOptions = { from: account, fee, wait: { timeout: 120 } };
            return interactions.length === 1
              ? interactions[0].send(sendOptions)
              : new BatchCall(wallet, interactions).send(sendOptions);
          },
        });
      }
    }

    await runWave(units);
  }

  // ── Output. ──────────────────────────────────────────────────────────────────────────
  for (const [alias, address] of contractAddresses) {
    state.addresses[alias] = address.toString();
  }
  persist();
  await spec.output?.(ctx);

  const summary: DeploySummary = {
    label,
    contracts: [...contractAddresses].map(([alias, address]) => ({
      alias,
      address,
      status: (spec.steps[alias] as ContractStep<C>).mode === 'register' ? 'registered' : 'published',
    })),
    accounts: [...accountAddresses].map(([alias, address]) => ({ alias, address })),
  };
  reporter.onComplete?.(summary);
}
