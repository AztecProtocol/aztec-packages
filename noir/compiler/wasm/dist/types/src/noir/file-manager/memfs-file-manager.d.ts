import { IFs } from 'memfs';
import { FileManager } from './file-manager';
/**
 * Creates a new FileManager instance based on a MemFS instance
 * @param memFS - the memfs backing instance
 * @param dataDir - where to store files
 */
export declare function createMemFSFileManager(memFS?: IFs, dataDir?: string): FileManager;
