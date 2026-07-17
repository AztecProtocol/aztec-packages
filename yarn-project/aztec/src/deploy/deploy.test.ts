import { getSchnorrInitializerlessAccountContractAddress } from '@aztec/accounts/schnorr';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { deriveMasterMessageSigningSecretKey } from '@aztec/stdlib/keys';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setupLocalNetwork } from '../testing/local-network.js';
import {
  type ActionStep,
  type ContractStep,
  type Ctx,
  type DeployPlan,
  type DeployReporter,
  runDeployment,
} from './index.js';

describe('runDeployment', () => {
  it('publishes a contract, runs an action, and is idempotent on re-run', async () => {
    // Admin account: the runner derives its Schnorr initializerless address from (secret, salt),
    // signing with deriveMasterMessageSigningSecretKey(secret). Pre-derive that same address here
    // so we can pre-fund it at genesis (funded above threshold ⇒ pays from its own Fee Juice, so
    // no SponsoredFPC / no L1 bridge needed to exercise the core).
    const secret = Fr.fromString('0x00000000000000000000000000000000000000000000000000000000deadbeef');
    const salt = new Fr(0);
    const admin = await getSchnorrInitializerlessAccountContractAddress(
      deriveMasterMessageSigningSecretKey(secret),
      salt,
      secret,
    );

    const net = await setupLocalNetwork({ fundedAddresses: [admin] });
    const stateDir = await mkdtemp(join(tmpdir(), 'deploy-test-'));

    // Contract steps as a literal (validated by `satisfies`) so `ctx.instance(alias)` is typed
    // per-alias in the action closures below.
    const contracts = {
      token: {
        kind: 'contract',
        contract: TokenContract,
        deployer: r => r.account('admin'),
        mode: 'publish',
        initializerArgs: r => [r.account('admin'), 'TokenName', 'TKN', 18],
      },
    } satisfies Record<string, ContractStep>;
    type Contracts = typeof contracts;

    const mint = {
      kind: 'action',
      from: r => r.account('admin'),
      dependsOn: ['token'],
      call: ctx => ctx.instance('token').methods.mint_to_public(ctx.account('admin'), 1000n),
      // Idempotent once the admin holds a public balance. Read from public state so a fresh PXE
      // (each run builds a new ephemeral wallet) can evaluate it without private notes.
      done: async ctx => {
        const { result } = await ctx
          .instance('token')
          .methods.balance_of_public(ctx.account('admin'))
          .simulate({ from: ctx.account('admin') });
        return BigInt(result.toString()) > 0n;
      },
    } satisfies ActionStep<Contracts>;

    // Deferred: its name reads runtime state (the token supply `mint` creates), so the address can
    // only resolve once `mint` has run. On a re-run the state is already there, so the framework
    // resolves it at inventory time and discovers it published — nothing to send.
    const defToken = {
      kind: 'contract',
      contract: TokenContract,
      deployer: r => r.account('admin'),
      mode: 'publish',
      dependsOn: ['mint'],
      deferredInitializerArgs: async ctx => {
        const { result } = await TokenContract.at(ctx.contract('token'), ctx.wallet)
          .methods.balance_of_public(ctx.account('admin'))
          .simulate({ from: ctx.account('admin') });
        return [ctx.account('admin'), `Supply${result.toString()}`, 'DEF', 18];
      },
    } satisfies ContractStep;

    // Gated on `ran`: runs exactly when `defToken` publishes this run (the documented pattern for
    // "seed a fresh contract"), so it must see the deferred publish as work done this run.
    const mintDef = {
      kind: 'action',
      from: r => r.account('admin'),
      dependsOn: ['defToken'],
      call: ctx =>
        TokenContract.at(ctx.contract('defToken'), ctx.wallet).methods.mint_to_public(ctx.account('admin'), 7n),
      done: async ctx => !(await ctx.ran('defToken')),
    } satisfies ActionStep;

    let tokenAddress: string | undefined;
    let mintedBalance: bigint | undefined;
    let defBalance: bigint | undefined;
    // Uses only string-based accessors, so it stays valid whatever the inferred steps generic is.
    const capture = async (ctx: Ctx) => {
      const address = ctx.contract('token');
      tokenAddress = address.toString();
      const { result } = await TokenContract.at(address, ctx.wallet)
        .methods.balance_of_public(ctx.account('admin'))
        .simulate({ from: ctx.account('admin') });
      mintedBalance = BigInt(result.toString());
      const { result: defResult } = await TokenContract.at(ctx.contract('defToken'), ctx.wallet)
        .methods.balance_of_public(ctx.account('admin'))
        .simulate({ from: ctx.account('admin') });
      defBalance = BigInt(defResult.toString());
    };

    const base = {
      node: net.node,
      local: true,
      label: 'test',
      stateDir,
      accounts: { admin: { secret, salt } },
      // Admin is genesis-funded well above this threshold ⇒ "funded" ⇒ pays from balance (no bridge).
      fees: { kind: 'fee-juice', threshold: 1n, fundAmount: 0n } as const,
      steps: { ...contracts, mint, defToken, mintDef },
      output: capture,
    };

    try {
      // First run: publishes the token, mints, publishes the deferred contract, and seeds it.
      await runDeployment({ ...base, reporter: {} });
      expect(tokenAddress).toBeDefined();
      expect(mintedBalance).toEqual(1000n);
      expect(defBalance).toEqual(7n);

      // Second run against the same state + chain: everything is already on-chain — including the
      // deferred contract, whose args now resolve at inventory time — so nothing runs.
      let nothingToDo = false;
      const reporter: DeployReporter = { onNothingToDo: () => (nothingToDo = true) };
      await runDeployment({ ...base, reporter });
      expect(nothingToDo).toBe(true);
      expect(defBalance).toEqual(7n);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
      await net.stop();
    }
  }, 300_000);

  it('auto-derives interdependencies, dedupes a shared class, and registers privately', async () => {
    const secret = Fr.fromString('0x00000000000000000000000000000000000000000000000000000000feedface');
    const salt = new Fr(0);
    const admin = await getSchnorrInitializerlessAccountContractAddress(
      deriveMasterMessageSigningSecretKey(secret),
      salt,
      secret,
    );

    const net = await setupLocalNetwork({ fundedAddresses: [admin] });
    const stateDir = await mkdtemp(join(tmpdir(), 'deploy-test-'));

    const contracts = {
      token: {
        kind: 'contract',
        contract: TokenContract,
        deployer: r => r.account('admin'),
        mode: 'publish',
        initializerArgs: r => [r.account('admin'), 'GoCoin', 'GO', 18],
      },
      // Same class as `token` (so the class is published exactly once, the rest skip it). Its
      // "admin" arg is `token`'s address, so the framework auto-derives a dependency on `token`
      // and resolves that address upfront.
      token2: {
        kind: 'contract',
        contract: TokenContract,
        deployer: r => r.account('admin'),
        mode: 'publish',
        initializerArgs: r => [r.contract('token'), 'GoCoinPremium', 'GOP', 18],
      },
      // Register-only: derive the deterministic address + register in the PXE, no tx.
      regToken: {
        kind: 'contract',
        contract: TokenContract,
        deployer: r => r.account('admin'),
        mode: 'register',
        initializerArgs: r => [r.account('admin'), 'Reg', 'REG', 18],
      },
    } satisfies Record<string, ContractStep>;

    const addresses: Record<string, string> = {};
    const capture = (ctx: Ctx) => {
      for (const alias of ['token', 'token2', 'regToken']) {
        addresses[alias] = ctx.contract(alias).toString();
      }
    };

    const base = {
      node: net.node,
      local: true,
      label: 'test',
      stateDir,
      accounts: { admin: { secret, salt } },
      fees: { kind: 'fee-juice', threshold: 1n, fundAmount: 0n } as const,
      steps: contracts,
      output: capture,
    };

    try {
      let plan: DeployPlan | undefined;
      await runDeployment({ ...base, reporter: { onPlan: p => (plan = p) } });

      // Interdependency: token2's args reference token, so its dependency is auto-derived.
      expect(plan?.steps.find(s => s.id === 'token2')?.dependsOn).toContain('token');
      // All three resolved to distinct deterministic addresses.
      expect(new Set(Object.values(addresses)).size).toBe(3);
      // The register step must honor its declared deployer in the derivation — the registered
      // address has to match what publishing the same spec (deployer included) would produce.
      const expectedRegToken = await getContractInstanceFromInstantiationParams(TokenContract.artifact, {
        salt: new Fr(0),
        constructorArgs: [admin, 'Reg', 'REG', 18],
        deployer: admin,
      });
      expect(addresses.regToken).toEqual(expectedRegToken.address.toString());

      // Idempotent re-run: both publishes are on-chain and the register step sends no tx, so the
      // whole graph is a no-op. (A broken shared-class dedup would have thrown on the first run.)
      let nothingToDo = false;
      await runDeployment({ ...base, reporter: { onNothingToDo: () => (nothingToDo = true) } });
      expect(nothingToDo).toBe(true);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
      await net.stop();
    }
  }, 300_000);
});
