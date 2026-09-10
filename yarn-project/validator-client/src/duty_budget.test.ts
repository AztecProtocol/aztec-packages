import { TestDateProvider } from '@aztec/foundation/timer';

import { describe, expect, it } from '@jest/globals';

import { DutyBudget, DutyBudgetExpiredError } from './duty_budget.js';

describe('DutyBudget', () => {
  let dateProvider: TestDateProvider;

  beforeEach(() => {
    dateProvider = new TestDateProvider();
  });

  /** A budget whose deadline is already `ms` in the past. */
  const expiredBudget = (ms = 5_000) => new DutyBudget(new Date(dateProvider.now() - ms), dateProvider);

  const hang = () => new Promise<never>(() => {});

  it('lets a duty past its deadline finish a read that answers at once', async () => {
    await expect(expiredBudget().run('read', () => Promise.resolve('answer'))).resolves.toEqual('answer');
  });

  // The grace exists so a duty entered past its deadline can still make the one attempt its callers rely on. It
  // is one allowance for the whole duty: renewing it per stage would let an expired duty walk through as many
  // seconds as it has stages.
  it('gives a duty past its deadline one grace allowance, not one per stage', async () => {
    const budget = expiredBudget();

    const firstStage = Date.now();
    await expect(budget.run('first stage', hang)).rejects.toThrow(DutyBudgetExpiredError);
    expect(Date.now() - firstStage).toBeGreaterThanOrEqual(500);

    const secondStage = Date.now();
    await expect(budget.run('second stage', hang)).rejects.toThrow(DutyBudgetExpiredError);
    expect(Date.now() - secondStage).toBeLessThan(200);
  });

  it('reports the grace as somewhere left to go, and the deadline as gone, past the deadline', () => {
    const budget = expiredBudget();

    expect(budget.expired()).toBe(true);
    expect(budget.canContinue()).toBe(true);
  });

  it('stops offering the grace once the duty is stopped', async () => {
    const budget = expiredBudget();
    budget.stop('sibling failed');

    expect(budget.canContinue()).toBe(false);
    await expect(budget.run('read', () => Promise.resolve('answer'))).rejects.toThrow(DutyBudgetExpiredError);
  });

  it('bounds a read by what is left of the budget rather than by a fresh full timeout', async () => {
    const budget = new DutyBudget(new Date(dateProvider.now() + 300), dateProvider);

    const started = Date.now();
    await expect(budget.run('read', hang)).rejects.toThrow(DutyBudgetExpiredError);

    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
