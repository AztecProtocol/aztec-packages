import { type PXEServiceConfig, createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import { type AztecNode, type PXE, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';

export const DEFAULT_TX_TIMEOUT_S = 180;

/*
 * Wrapper class for PXE service, avoids initialization issues due to
 * closures when providing PXE service to injected commander.js commands
 */
export class PXEWrapper {
  private static pxeConfig: PXEServiceConfig | undefined;
  private static pxe: PXE | undefined;
  private static node: AztecNode | undefined;

  async getPXE() {
    if (!PXEWrapper.pxe) {
      PXEWrapper.pxe = await createPXEService(PXEWrapper.node!, PXEWrapper.pxeConfig!);
    }
    return PXEWrapper.pxe;
  }

  getNode(): AztecNode | undefined {
    return PXEWrapper.node;
  }

  prepare(nodeUrl: string, dataDir: string, overridePXEServiceConfig?: Partial<PXEServiceConfig>) {
    PXEWrapper.node = createAztecNodeClient(nodeUrl);
    const pxeConfig = Object.assign(getPXEServiceConfig(), overridePXEServiceConfig);
    pxeConfig.dataDirectory = dataDir;
    PXEWrapper.pxeConfig = pxeConfig;
  }
}
