import { createConsoleLogger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';

import type { ClientProtocolArtifact } from '../artifacts/types.js';
import {
  PrivateKernelResetArtifactFileNames,
  PrivateKernelResetTailArtifactFileNames,
  PrivateKernelResetTailToPublicArtifactFileNames,
} from '../private_kernel_reset_types.js';

const log = createConsoleLogger('autogenerate');

const outputFilename = './src/client_artifacts_helper.ts';

const ClientCircuitArtifactNames: Record<ClientProtocolArtifact, string> = {
  PrivateKernelInitArtifact: 'private_kernel_init',
  PrivateKernelInit2Artifact: 'private_kernel_init_2',
  PrivateKernelInit3Artifact: 'private_kernel_init_3',
  PrivateKernelInnerArtifact: 'private_kernel_inner',
  PrivateKernelInner2Artifact: 'private_kernel_inner_2',
  PrivateKernelInner3Artifact: 'private_kernel_inner_3',
  HidingKernelToRollup: 'hiding_kernel_to_rollup',
  HidingKernelToPublic: 'hiding_kernel_to_public',
  ...PrivateKernelResetArtifactFileNames,
  ...PrivateKernelResetTailArtifactFileNames,
  ...PrivateKernelResetTailToPublicArtifactFileNames,
};

const artifactsWithoutSimulatedVersions = [
  'hiding_kernel_to_rollup',
  'hiding_kernel_to_public',
  'private_kernel_init_2',
  'private_kernel_init_3',
  'private_kernel_inner_2',
  'private_kernel_inner_3',
];

function generateImports() {
  return `
  import type { NoirCompiledCircuit, NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';
  import type { ClientProtocolArtifact } from './artifacts/types.js';
  import { VerificationKeyData } from '@aztec/stdlib/vks';
  import { abiToVKData } from './utils/vk_json.js';
`;
}

function generateArtifactNames() {
  const names = Object.entries(ClientCircuitArtifactNames).map(([artifact, name]) => {
    return `${artifact}: '${name}',`;
  });
  return `
    export const ClientCircuitArtifactNames: Record<ClientProtocolArtifact, string> = {
      ${names.join('\n')}
    }
  `;
}

// Maps a constrained reset-family artifact name to its simulated counterpart. The simple
// `${name}_simulated` rule doesn't work for reset variants because their names carry a dimension
// suffix and the `_simulated` infix lives *before* that suffix on disk. Concretely:
//   private_kernel_reset_4_4_4_4_4_4_0_0_0           ->  private_kernel_reset_simulated_4_4_4_4_4_4_0_0_0
//   private_kernel_reset_tail_4_4_..._4              ->  private_kernel_reset_tail_simulated_4_4_..._4
//   private_kernel_reset_tail_to_public_4_4_..._4    ->  private_kernel_reset_tail_to_public_simulated_4_4_..._4
// Order matters: the longest prefix must be checked first so `_tail_to_public` doesn't get
// truncated to `_tail` (or to plain `_reset`) by an earlier match.
const RESET_SIMULATED_PREFIXES: Array<[string, string]> = [
  ['private_kernel_reset_tail_to_public', 'private_kernel_reset_tail_to_public_simulated'],
  ['private_kernel_reset_tail', 'private_kernel_reset_tail_simulated'],
  ['private_kernel_reset', 'private_kernel_reset_simulated'],
];

// Returns the simulated artifact name for `artifactName`. For reset variants this swaps the
// family prefix per `RESET_SIMULATED_PREFIXES`; for everything else (init, inner, ...) there's
// no dimension suffix, so plain `${name}_simulated` is the right answer.
function generateSimulatedArtifactName(artifactName: string) {
  for (const [from, to] of RESET_SIMULATED_PREFIXES) {
    if (artifactName.startsWith(from)) {
      return artifactName.replace(from, to);
    }
  }
  return `${artifactName}_simulated`;
}

function generateCircuitArtifactImportFunction() {
  const cases = Object.values(ClientCircuitArtifactNames)
    .flatMap(artifactName => {
      const hasSimulatedVersion = !artifactsWithoutSimulatedVersions.includes(artifactName);
      return hasSimulatedVersion ? [artifactName, generateSimulatedArtifactName(artifactName)] : [artifactName];
    })
    .map(artifactName => {
      // Cannot assert this import as it's incompatible with bundlers like vite
      // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
      // Even if now supported by al major browsers, the MIME type is replaced with
      // "text/javascript"
      // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
      return `case '${artifactName}': {
        const { default: compiledCircuit } = await import("../artifacts/${artifactName}.json");
        return { ...(compiledCircuit as NoirCompiledCircuit), name: '${artifactName}' };
      }`;
    });

  // For artifacts without a separate `_simulated` crate, route the simulated lookup to the
  // constrained artifact instead of throwing.
  const simulatedFallbackCases = Object.values(ClientCircuitArtifactNames)
    .filter(artifactName => artifactsWithoutSimulatedVersions.includes(artifactName))
    .map(
      artifactName => `case '${generateSimulatedArtifactName(artifactName)}': {
        const { default: compiledCircuit } = await import("../artifacts/${artifactName}.json");
        return { ...(compiledCircuit as NoirCompiledCircuit), name: '${artifactName}' };
      }`,
    );

  // Emit the same RESET_SIMULATED_PREFIXES table into the generated runtime helper so its prefix
  // mapping stays in lockstep with this generator's.
  const prefixTableLiteral = `[\n${RESET_SIMULATED_PREFIXES.map(([from, to]) => `      ['${from}', '${to}'],`).join(
    '\n',
  )}\n    ]`;

  return `
    // See the comment on RESET_SIMULATED_PREFIXES in generate_client_artifacts_helper.ts for the
    // worked example: reset variant artifacts carry a dimension suffix, so the \`_simulated\`
    // infix has to be substring-replaced into the prefix rather than appended.
    const RESET_SIMULATED_PREFIXES: Array<[string, string]> = ${prefixTableLiteral};

    export async function getClientCircuitArtifact(artifactName: string, simulated: boolean): Promise<NoirCompiledCircuitWithName> {
      let normalizedArtifactName = artifactName;
      if (simulated) {
        const match = RESET_SIMULATED_PREFIXES.find(([from]) => artifactName.startsWith(from));
        normalizedArtifactName = match ? artifactName.replace(match[0], match[1]) : \`\${artifactName}_simulated\`;
      }
      switch(normalizedArtifactName) {
        ${[...cases, ...simulatedFallbackCases].join('\n')}
        default: throw new Error(\`Unknown artifact: \${artifactName}\`);
      }
    }
  `;
}

function generateVkImportFunction() {
  const cases = Object.values(ClientCircuitArtifactNames).map(artifactName => {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by al major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    return `case '${artifactName}': {
        const { default: keyData } = await import("../artifacts/${artifactName}.json");
        return abiToVKData(keyData);
      }`;
  });

  return `
    export async function getClientCircuitVkData(artifactName: string): Promise<VerificationKeyData> {
      switch(artifactName) {
        ${cases.join('\n')}
        default: throw new Error(\`Unknown artifact: \${artifactName}\`);
      }
    }
  `;
}

const main = async () => {
  const content = `
    /* eslint-disable camelcase */
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` in the noir-protocol-circuits-types package to update.

    ${generateImports()}

    ${generateArtifactNames()}

    ${generateCircuitArtifactImportFunction()}

    ${generateVkImportFunction()}

  `;

  await fs.writeFile(outputFilename, content);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating client circuits dynamic imports: ${err}`);
  process.exit(1);
}
