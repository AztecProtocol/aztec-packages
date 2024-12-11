import { type LogFn } from '@aztec/foundation/log';
import { ProofVerifier, proofVerifierConfigMappings } from '@aztec/proof-verifier';
import { createAndStartTelemetryClient, telemetryClientConfigMappings } from '@aztec/telemetry-client/start';

import { extractRelevantOptions } from '../util.js';

export async function startProofVerifier(options: any, signalHandlers: (() => Promise<void>)[], userLog: LogFn) {
  const config = extractRelevantOptions(options, proofVerifierConfigMappings, 'proofVerifier');

  const telemetryConfig = extractRelevantOptions(options, telemetryClientConfigMappings, 'tel');
  const telemetry = await createAndStartTelemetryClient(telemetryConfig);
  const proofVerifier = await ProofVerifier.new(config, telemetry);

  userLog('Starting proof verifier');
  proofVerifier.start();

  signalHandlers.push(() => proofVerifier.stop());
}
