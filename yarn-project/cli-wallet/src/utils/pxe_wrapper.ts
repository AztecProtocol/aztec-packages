import { AztecNode, type PXE, createAztecNodeClient } from '@aztec/circuit-types';
import { type PXEServiceConfig, createPXEService, getPXEServiceConfig } from '@aztec/pxe';

/*
 * Wrapper class for PXE service, avoids initialization issues due to
 * closures when providing PXE service to injected commander.js commands
 */
export class PXEWrapper {
  private static pxe: PXE | undefined;
  private static node: AztecNode | undefined;

  getPXE(): PXE | undefined {
    return PXEWrapper.pxe;
  }

  getNode(): AztecNode | undefined {
    return PXEWrapper.node;
  }

  async init(nodeUrl: string, dataDir: string, overridePXEServiceConfig?: Partial<PXEServiceConfig>) {
    PXEWrapper.node = createAztecNodeClient(nodeUrl);
    const pxeConfig = Object.assign(getPXEServiceConfig(), overridePXEServiceConfig);
    pxeConfig.dataDirectory = dataDir;
    PXEWrapper.pxe = await createPXEService(PXEWrapper.node, pxeConfig);
  }
}
