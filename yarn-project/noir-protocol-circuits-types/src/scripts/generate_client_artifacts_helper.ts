import { createConsoleLogger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';

import type { ClientProtocolArtifact } from '../artifacts/types.js';
import { PrivateKernelResetArtifactFileNames } from '../private_kernel_reset_types.js';

const log = createConsoleLogger('autogenerate');

const outputFilename = './src/client_artifacts_helper.ts';

const ClientCircuitArtifactNames: Record<ClientProtocolArtifact, string> = {
  PrivateKernelInitArtifact: 'private_kernel_init',
  PrivateKernelInnerArtifact: 'private_kernel_inner',
  PrivateKernelTailArtifact: 'private_kernel_tail',
  PrivateKernelTailToPublicArtifact: 'private_kernel_tail_to_public',
  ...PrivateKernelResetArtifactFileNames,
};

function generateImports() {
  return `
  import type { NoirCompiledCircuit, NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';
  import type { ClientProtocolArtifact } from './artifacts/types.js';
  import { VerificationKeyData } from '@aztec/stdlib/vks';
  import { keyJsonToVKData } from './utils/vk_json.js';
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

function generateCircuitArtifactImportFunction() {
  const cases = Object.values(ClientCircuitArtifactNames)
    .flatMap(artifactName => {
      const isReset = artifactName.includes('private_kernel_reset');
      const simulatedArtifactName = isReset
        ? artifactName.replace('private_kernel_reset', 'private_kernel_reset_simulated')
        : `${artifactName}_simulated`;
      return [artifactName, simulatedArtifactName];
    })
    .map(artifactName => {
      // Cannot assert this import as it's incompatible with browsers
      // https://caniuse.com/mdn-javascript_statements_import_import_assertions_type_json
      // Use the new "with" syntax once supported by firefox
      // https://caniuse.com/mdn-javascript_statements_import_import_attributes_type_json
      // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
      return `case '${artifactName}': {
        const { default: compiledCircuit } = await import("../artifacts/${artifactName}.json");
        return { ...(compiledCircuit as NoirCompiledCircuit), name: '${artifactName}' };
      }`;
    });

  return `
    export async function getClientCircuitArtifact(artifactName: string, simulated: boolean): Promise<NoirCompiledCircuitWithName> {
      const isReset = artifactName.includes('private_kernel_reset');
      const normalizedArtifactName = isReset
        ? \`\${simulated ? artifactName.replace('private_kernel_reset', 'private_kernel_reset_simulated') : artifactName}\`
        : \`\${artifactName}\${simulated ? '_simulated' : ''}\`;
      switch(normalizedArtifactName) {
        ${cases.join('\n')}
        default: throw new Error(\`Unknown artifact: \${artifactName}\`);
      }
    }
  `;
}

function generateVkImportFunction() {
  const cases = Object.values(ClientCircuitArtifactNames).map(artifactName => {
    // Cannot assert this import as it's incompatible with browsers
    // https://caniuse.com/mdn-javascript_statements_import_import_assertions_type_json
    // Use the new "with" syntax once supported by firefox
    // https://caniuse.com/mdn-javascript_statements_import_import_attributes_type_json
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    return `case '${artifactName}': {
        const { default: keyData } = await import("../artifacts/keys/${artifactName}.vk.data.json");
        return keyJsonToVKData(keyData);
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
