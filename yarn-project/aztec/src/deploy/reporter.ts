/**
 * Observability for the deploy framework. {@link runDeployment} emits structured lifecycle events
 * to a {@link DeployReporter} instead of writing to the console directly, so callers control where
 * the signal goes: the default ({@link consoleReporter}) renders human-readably to **stderr** —
 * keeping stdout clear for the deploy scripts' `export KEY=VAL` lines, which an orchestrator evals —
 * while e2e, a progress UI, or structured CI logging can inject their own reporter and consume the
 * events as data. Every hook is optional; an empty `{}` is a valid (silent) reporter.
 */
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { TxHash } from '@aztec/stdlib/tx';

import { formatLayers, formatList } from './graph.js';

/** What a unit did: publish a contract, or send an action's tx. */
export type DeployUnitKind = 'publish' | 'action';

export interface DeployUnitInfo {
  /** Human label, e.g. `publish goCoin`, `action mintGoCoin`. */
  label: string;
  kind: DeployUnitKind;
  /** The account that sends and pays for this tx. */
  account: AztecAddress;
}

/** What a unit produced once its tx settled. Fields beyond `durationMs` come from the receipt. */
export interface DeployUnitResult {
  txHash?: TxHash;
  blockNumber?: number;
  feePaid?: bigint;
  status?: string;
  durationMs: number;
}

/** An account's funding posture for this run, as resolved at planning time. */
export type AccountFunding =
  | { kind: 'idle' } // no pending work this run, so funding is moot
  | { kind: 'sponsored' } // a SponsoredFPC pays
  | { kind: 'funded'; balance: bigint } // pays from its own Fee Juice
  | { kind: 'not-funded'; balance: bigint; fundAmount: bigint }; // will bridge before paying

export interface DeployPlanAccount {
  alias: string;
  address: AztecAddress;
  funding: AccountFunding;
}

export interface DeployPlanStep {
  id: string;
  kind: 'contract' | 'action';
  /**
   * Status at the start of the run: a contract is `published` / `to publish` (public) or
   * `registered` (private); an action is `done` / `to run`.
   */
  status: 'published' | 'to publish' | 'registered' | 'done' | 'to run';
  /** Steps it depends on (constructor-arg refs and explicit `dependsOn`). */
  dependsOn: string[];
}

export interface DeployPlan {
  /** Human label for the target (e.g. `local`, or a caller-chosen name). */
  label: string;
  accounts: DeployPlanAccount[];
  steps: DeployPlanStep[];
  /** Execution layers (step ids) — what will actually run, in dependency order. A layer runs parallel. */
  layers: string[][];
}

export interface DeploySummary {
  label: string;
  contracts: { alias: string; address: AztecAddress; status: 'published' | 'registered' }[];
  accounts: { alias: string; address: AztecAddress }[];
}

export interface BridgeEvent {
  recipient: AztecAddress;
  amount: bigint;
  /** True when resuming a persisted claim instead of bridging anew. */
  reused: boolean;
}

/** Lifecycle hooks the framework emits during a run. All optional — implement only what you need. */
export interface DeployReporter {
  /** The resolved plan, before execution. */
  onPlan?(plan: DeployPlan): void;
  /** Everything is already on-chain; nothing will be sent. */
  onNothingToDo?(label: string): void;
  /** An account's Fee Juice is being topped up (or a persisted claim is being resumed). */
  onBridge?(event: BridgeEvent): void;
  /** A unit's tx is about to be sent. */
  onUnitStart?(unit: DeployUnitInfo): void;
  /** A unit's tx settled successfully. */
  onUnitSettled?(unit: DeployUnitInfo, result: DeployUnitResult): void;
  /** A unit's tx threw; the run will abort after this. */
  onUnitError?(unit: DeployUnitInfo, error: unknown): void;
  /** The run finished; `summary` holds the final resolved state. */
  onComplete?(summary: DeploySummary): void;
}

const MS_PER_SECOND = 1000;
const WEI_PER_FEE_JUICE = 10n ** 18n;
const seconds = (ms: number): string => `${(ms / MS_PER_SECOND).toFixed(1)}s`;
const feeJuice = (wei: bigint): string => `${wei / WEI_PER_FEE_JUICE} FJ`;

function describeFunding(f: AccountFunding): string {
  switch (f.kind) {
    case 'idle':
      return 'idle (no work)';
    case 'sponsored':
      return 'sponsored';
    case 'funded':
      return `funded (${feeJuice(f.balance)})`;
    case 'not-funded':
      return `not funded (${feeJuice(f.balance)}) → will bridge ${feeJuice(f.fundAmount)}`;
  }
}

/**
 * The default reporter: renders events human-readably to **stderr**. Stderr (not stdout) so the
 * traces survive an orchestrator that captures stdout for the scripts' `export` lines.
 */
export function consoleReporter(): DeployReporter {
  const log = (line: string): void => void process.stderr.write(`${line}\n`);
  return {
    onPlan(plan) {
      log(`\n── Plan (${plan.label}) ──`);
      log(
        formatList(
          'accounts',
          plan.accounts.map(a => ({ name: a.alias, tag: describeFunding(a.funding) })),
        ),
      );
      log(
        formatList(
          'steps',
          plan.steps.map(s => ({
            name: s.id,
            tag: `${s.kind} · ${s.status}`,
            dependencies: s.dependsOn,
          })),
        ),
      );
      log(
        formatLayers(
          'execution layers',
          plan.layers.map(layer => layer.map(name => ({ name }))),
        ),
      );
    },
    onNothingToDo(label) {
      log(`\nNothing to do on ${label} — everything is already on-chain.`);
    },
    onBridge({ recipient, amount, reused }) {
      log(
        reused
          ? `Reusing a pending bridge claim for ${recipient} (resuming a top-up).`
          : `Bridging ${amount} Fee Juice to ${recipient} (this can take a few minutes)...`,
      );
    },
    onUnitStart(unit) {
      log(`→ ${unit.label}...`);
    },
    onUnitSettled(unit, result) {
      const bits = [
        result.txHash ? `tx ${result.txHash.toString().slice(0, 10)}…` : undefined,
        result.blockNumber != null ? `block ${result.blockNumber}` : undefined,
        seconds(result.durationMs),
      ].filter(Boolean);
      log(`✓ ${unit.label}  ${bits.join('  ')}`);
    },
    onUnitError(unit, error) {
      log(`✗ ${unit.label}  failed: ${error instanceof Error ? error.message : String(error)}`);
    },
    onComplete(summary) {
      log(`\n── Deployed to ${summary.label} ──`);
      for (const c of summary.contracts) {
        log(`  ${c.alias.padEnd(16)} ${c.address}  (${c.status})`);
      }
      for (const a of summary.accounts) {
        log(`  account ${a.alias}: ${a.address}`);
      }
    },
  };
}
