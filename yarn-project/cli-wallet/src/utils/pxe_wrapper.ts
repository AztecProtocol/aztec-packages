import { type PXE, createAztecNodeClient } from '@aztec/circuit-types';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe';

/*
 * Wrapper class for PXE service, avoids initialization issues due to
 * closures when providing PXE service to injected commander.js commands
 */
export class PXEWrapper {
  private static pxe: PXE | undefined;

  getPXE(): PXE | undefined {
    return PXEWrapper.pxe;
  }

  async init(nodeUrl: string, dataDir: string) {
    const aztecNode = createAztecNodeClient(nodeUrl);
    const pxeConfig = getPXEServiceConfig();
    pxeConfig.dataDirectory = dataDir;
    PXEWrapper.pxe = await createPXEService(aztecNode, pxeConfig);
  }
}
