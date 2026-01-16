import type { Logger } from '@aztec/foundation/log';
import type { CircuitName, CircuitSimulationStats } from '@aztec/stdlib/stats';

export function emitCircuitSimulationStats(
  circuitName: CircuitName,
  duration: number,
  inputSize: number,
  outputSize: number,
  logger: Logger,
) {
  const stats: CircuitSimulationStats = {
    eventName: 'circuit-simulation',
    circuitName,
    inputSize,
    outputSize,
    duration,
  };

  logger.debug('Circuit simulation stats', stats);
}
