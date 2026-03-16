import { findBbBinary } from '@aztec/bb.js';
import type { LogFn } from '@aztec/foundation/log';

import { readFile, rename, rm, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';

import { makeFunctionArtifact } from './profile_utils.js';
import type { CompiledArtifact } from './utils/artifacts.js';
import { run } from './utils/spawn.js';

/** Generates a gate count flamegraph SVG for a single contract function. */
export async function profileFlamegraph(artifactPath: string, functionName: string, log: LogFn): Promise<void> {
  const raw = await readFile(artifactPath, 'utf-8');
  const artifact: CompiledArtifact = JSON.parse(raw);

  if (!Array.isArray(artifact.functions)) {
    throw new Error(`${artifactPath} does not appear to be a contract artifact (no functions array)`);
  }

  const func = artifact.functions.find(f => f.name === functionName);
  if (!func) {
    const available = artifact.functions.map(f => f.name).join(', ');
    throw new Error(`Function "${functionName}" not found in artifact. Available: ${available}`);
  }
  if (func.is_unconstrained) {
    throw new Error(`Function "${functionName}" is unconstrained and cannot be profiled`);
  }

  const outputDir = dirname(artifactPath);
  const contractName = basename(artifactPath, '.json');
  const functionArtifact = join(outputDir, `${contractName}-${functionName}.json`);

  try {
    await writeFile(functionArtifact, makeFunctionArtifact(artifact, func));

    const profiler = process.env.PROFILER_PATH ?? 'noir-profiler';
    const bb = process.env.BB ?? findBbBinary() ?? 'bb';

    await run(profiler, [
      'gates',
      '--artifact-path',
      functionArtifact,
      '--backend-path',
      bb,
      '--backend-gates-command',
      'gates',
      '--output',
      outputDir,
      '--scheme',
      'chonk',
      '--include_gates_per_opcode',
    ]);

    // noir-profiler names the SVG using the internal function name which
    // retains the __aztec_nr_internals__ prefix in the bytecode metadata.
    const srcSvg = join(outputDir, `__aztec_nr_internals__${functionName}_gates.svg`);
    const destSvg = join(outputDir, `${contractName}-${functionName}-flamegraph.svg`);
    await rename(srcSvg, destSvg);

    log(`Flamegraph written to ${destSvg}`);
  } finally {
    await rm(functionArtifact, { force: true });
  }
}
