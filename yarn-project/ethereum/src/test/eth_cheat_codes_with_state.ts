import fs from 'fs';

import { EthCheatCodes } from './eth_cheat_codes.js';

/**
 * A class that provides utility functions for interacting with ethereum (L1) dumping/loading state to/from a file.
 * It is separated to avoid importing fs in the main EthCheatCodes class, which might be used in the browser.
 */
export class EthCheatCodesWithState extends EthCheatCodes {
  /**
   * Dumps the current chain state to a file.
   * @param fileName - The file name to dump state into
   */
  public async dumpChainState(fileName: string): Promise<void> {
    let res: any;
    try {
      res = await this.rpcCall('hardhat_dumpState', []);
    } catch (e) {
      throw new Error(`Error dumping state: ${e}`);
    }
    fs.writeFileSync(`${fileName}.json`, res, 'utf8');
    this.logger.verbose(`Dumped state to ${fileName}`);
  }

  /**
   * Loads the chain state from a file.
   * @param fileName - The file name to load state from
   */
  public async loadChainState(fileName: string): Promise<void> {
    const data = JSON.parse(fs.readFileSync(`${fileName}.json`, 'utf8'));
    try {
      await this.rpcCall('hardhat_loadState', [data]);
    } catch (e) {
      throw new Error(`Error loading state: ${e}`);
    }
    this.logger.verbose(`Loaded state from ${fileName}`);
  }
}
