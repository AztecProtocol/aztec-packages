import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CompositeServerCircuitProver } from './composite_circuit_prover.js';

describe('CompositeServerCircuitProver', () => {
  let base: MockProxy<ServerCircuitProver>;
  let execution: MockProxy<ServerCircuitProver>;
  let composite: CompositeServerCircuitProver;

  beforeEach(() => {
    base = mock<ServerCircuitProver>();
    execution = mock<ServerCircuitProver>();
    composite = new CompositeServerCircuitProver(base, execution);
  });

  it('routes proving methods to the base prover', async () => {
    base.getAvmProof.mockResolvedValue('avm' as unknown as Awaited<ReturnType<ServerCircuitProver['getAvmProof']>>);
    base.getBaseParityProof.mockResolvedValue(
      'parity' as unknown as Awaited<ReturnType<ServerCircuitProver['getBaseParityProof']>>,
    );

    await composite.getAvmProof({} as any);
    await composite.getBaseParityProof({} as any);

    expect(base.getAvmProof).toHaveBeenCalledTimes(1);
    expect(base.getBaseParityProof).toHaveBeenCalledTimes(1);
    expect(execution.getAvmProof).not.toHaveBeenCalled();
    expect(execution.getBaseParityProof).not.toHaveBeenCalled();
  });

  it('routes executeBlock to the execution prover', async () => {
    execution.executeBlock.mockResolvedValue(
      'block-execution-result' as unknown as Awaited<ReturnType<ServerCircuitProver['executeBlock']>>,
    );

    await composite.executeBlock({} as any);

    expect(execution.executeBlock).toHaveBeenCalledTimes(1);
    expect(base.executeBlock).not.toHaveBeenCalled();
  });

  it('falls back to the base prover for executeBlock when no execution prover is supplied', async () => {
    const fallback = new CompositeServerCircuitProver(base);
    base.executeBlock.mockRejectedValue(new Error('not supported'));

    await expect(fallback.executeBlock({} as any)).rejects.toThrow(/not supported/);
    expect(base.executeBlock).toHaveBeenCalledTimes(1);
  });

  it('preserves rejection from the underlying prover', async () => {
    base.getRootRollupProof.mockRejectedValue(new Error('boom'));

    await expect(composite.getRootRollupProof({} as any)).rejects.toThrow('boom');
  });

  it('forwards multiple arguments through to the underlying prover', async () => {
    base.getAvmProof.mockResolvedValue('avm' as any);

    const inputs = {} as any;
    const signal = new AbortController().signal;
    const epochNumber = 5;
    await composite.getAvmProof(inputs, signal, epochNumber);

    expect(base.getAvmProof).toHaveBeenCalledWith(inputs, signal, epochNumber);
  });
});
