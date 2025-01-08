import { createConsoleLogger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';

import { ClientProtocolArtifact } from '../artifacts/types.js';
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
  import { type NoirCompiledCircuit } from '@aztec/types/noir';
  import { ClientProtocolArtifact } from './artifacts/types.js';
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

function generateImportFunction() {
  const cases = Object.values(ClientCircuitArtifactNames)
    .flatMap(artifactName => {
      const isReset = artifactName.includes('private_kernel_reset');
      const simulatedArtifactName = isReset
        ? artifactName.replace('private_kernel_reset', 'private_kernel_reset_simulated')
        : `${artifactName}_simulated`;
      return [artifactName, simulatedArtifactName];
    })
    .map(artifactName => {
      return `case '${artifactName}': {
        const { default: compiledCircuit } = await import(\`../artifacts/${artifactName}.json\`, {
          assert: { type: 'json' },
        });
        return compiledCircuit as NoirCompiledCircuit;
      }`;
    });

  return `
    export async function getClientCircuitArtifact(artifactName: string, simulated: boolean): Promise<NoirCompiledCircuit> {
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

const main = async () => {
  const content = `
    /* eslint-disable camelcase */
    // GENERATED FILE - DO NOT EDIT. RUN \`yarn generate\` or \`yarn generate:client-artifacts-helper\`

    ${generateImports()}

    ${generateArtifactNames()}

    ${generateImportFunction()}

  `;

  await fs.writeFile(outputFilename, content);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating client circuits dynamic imports: ${err}`);
  process.exit(1);
}
