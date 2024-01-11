import { FileManager } from './file-manager';
export declare function readdirRecursive(dir: string): Promise<string[]>;
/**
 * Creates a new FileManager instance based on nodejs fs
 * @param dataDir - where to store files
 */
export declare function createNodejsFileManager(dataDir: string): FileManager;
