import { PublicKernelType, type Tx } from '@aztec/circuit-types';
import { type PublicKernelCircuitPublicInputs } from '@aztec/circuits.js';

import { type AbstractPhaseManager, type PhaseConfig } from './abstract_phase_manager.js';
import { AppLogicPhaseManager } from './app_logic_phase_manager.js';
import { SetupPhaseManager } from './setup_phase_manager.js';
import { TailPhaseManager } from './tail_phase_manager.js';
import { TeardownPhaseManager } from './teardown_phase_manager.js';

export class PhaseDidNotChangeError extends Error {
  constructor(phase: PublicKernelType) {
    super(`Tried to advance the phase from [${phase}] when the circuit still needs [${phase}]`);
  }
}

export class CannotTransitionToSetupError extends Error {
  constructor() {
    super('Cannot transition to setup phase');
  }
}

export class PhaseManagerFactory {
  public static phaseFromTx(tx: Tx, config: PhaseConfig): AbstractPhaseManager | undefined {
    const data = tx.data.forPublic!;
    if (data.needsSetup) {
      return new SetupPhaseManager(config);
    } else if (data.needsAppLogic) {
      return new AppLogicPhaseManager(config);
    } else if (data.needsTeardown) {
      return new TeardownPhaseManager(config);
    } else {
      return undefined;
    }
  }

  public static phaseFromOutput(
    output: PublicKernelCircuitPublicInputs,
    currentPhaseManager: AbstractPhaseManager,
    config: PhaseConfig,
  ): AbstractPhaseManager | undefined {
    if (output.needsSetup) {
      throw new CannotTransitionToSetupError();
    } else if (output.needsAppLogic) {
      if (currentPhaseManager.phase === PublicKernelType.APP_LOGIC) {
        throw new PhaseDidNotChangeError(currentPhaseManager.phase);
      }
      return new AppLogicPhaseManager(config);
    } else if (output.needsTeardown) {
      if (currentPhaseManager.phase === PublicKernelType.TEARDOWN) {
        throw new PhaseDidNotChangeError(currentPhaseManager.phase);
      }
      return new TeardownPhaseManager(config);
    } else if (currentPhaseManager.phase !== PublicKernelType.TAIL) {
      return new TailPhaseManager(config);
    } else {
      return undefined;
    }
  }
}
