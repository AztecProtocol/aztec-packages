import { parentPort } from 'worker_threads';
import { expose } from 'comlink';
import { BarretenbergWasmMain } from '../../index.js';
import { nodeEndpoint } from '../../../helpers/node/node_endpoint.js';

if (!parentPort) {
  throw new Error('No parentPort');
}

// BarretenbergWasmBase pre-populates default stubs for the
// BBERG_WEBGPU_MSM_HOOK env imports (bb_external_msm_bn254 /
// bb_publish_srs_bn254), so a hook-enabled WASM links cleanly in Node
// where the WebGPU bridge can't run.
expose(new BarretenbergWasmMain(), nodeEndpoint(parentPort));
