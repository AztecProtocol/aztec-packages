import { Fr } from '@aztec/aztec.js/fields';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { type ActionStep, type ContractStep, type Resolver, runDeployment } from './index.js';

// Spec validation happens before anything touches the network, so these run fast against a
// nodeUrl that points nowhere.
describe('runDeployment spec validation', () => {
  const secret = new Fr(1);
  const base = {
    nodeUrl: 'http://127.0.0.1:1',
    accounts: { admin: { secret } },
    reporter: {},
  };

  const token = {
    kind: 'contract',
    contract: TokenContract,
    deployer: r => r.account('admin'),
    mode: 'publish',
    initializerArgs: r => [r.account('admin'), 'Token', 'TKN', 18],
  } satisfies ContractStep;

  const neverCalled = {
    call: (): never => {
      throw new Error('unreachable');
    },
    done: () => Promise.resolve(false),
  };

  it('rejects a dependsOn alias that is not a step', async () => {
    const mint = {
      kind: 'action',
      from: r => r.account('admin'),
      dependsOn: ['tokn'],
      ...neverCalled,
    } satisfies ActionStep;
    await expect(runDeployment({ ...base, steps: { token, mint } })).rejects.toThrow(
      'Unknown step "tokn" in dependsOn of "mint".',
    );
  });

  // `ContractStep` is a union whose variants make these three specs unwritable in TypeScript. The
  // cast stands in for what still reaches the runtime check: a JS caller, or a spec assembled
  // dynamically (e.g. through `Object.fromEntries`) where the element types are erased.
  const illTyped = (step: object): ContractStep => step as ContractStep;

  it('rejects a deferred contract with no dependsOn', async () => {
    const deferred = illTyped({
      kind: 'contract',
      contract: TokenContract,
      deployer: (r: Resolver) => r.account('admin'),
      mode: 'publish',
      deferredInitializerArgs: () => [],
    });
    await expect(runDeployment({ ...base, steps: { token, deferred } })).rejects.toThrow(/deferred args.*dependsOn/);
  });

  it('accepts a deferred contract with an explicit empty dependsOn (nothing to reject before the network)', async () => {
    const deferred = {
      kind: 'contract',
      contract: TokenContract,
      deployer: r => r.account('admin'),
      mode: 'publish',
      dependsOn: [],
      deferredInitializerArgs: () => [],
    } satisfies ContractStep;
    // Validation passes; the run then fails on the unreachable node, not on the spec.
    await expect(runDeployment({ ...base, steps: { token, deferred } })).rejects.not.toThrow(/dependsOn/);
  });

  it('rejects a register-mode contract with deferred args', async () => {
    const reg = illTyped({
      kind: 'contract',
      contract: TokenContract,
      deployer: (r: Resolver) => r.account('admin'),
      mode: 'register',
      dependsOn: ['token'],
      deferredInitializerArgs: () => [],
    });
    await expect(runDeployment({ ...base, steps: { token, reg } })).rejects.toThrow(/register-mode with deferred/);
  });

  it('rejects a contract declaring both deterministic and deferred args', async () => {
    const both = illTyped({
      kind: 'contract',
      contract: TokenContract,
      deployer: (r: Resolver) => r.account('admin'),
      mode: 'publish',
      dependsOn: [],
      initializerArgs: (r: Resolver) => [r.account('admin')],
      deferredInitializerArgs: () => [],
    });
    await expect(runDeployment({ ...base, steps: { token, both } })).rejects.toThrow(
      /both initializerArgs and deferredInitializerArgs/,
    );
  });
});
