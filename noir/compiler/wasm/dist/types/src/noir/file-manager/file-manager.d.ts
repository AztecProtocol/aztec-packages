/**
 * A file system interface that matches the node fs module.
 */
export interface FileSystem {
    /** Checks if the file exists */
    existsSync: (path: string) => boolean;
    /** Creates a directory structure */
    mkdir: (dir: string, opts?: {
        /** Create parent directories as needed */
        recursive: boolean;
    }) => Promise<void>;
    /** Writes a file */
    writeFile: (path: string, data: Uint8Array) => Promise<void>;
    /** Reads a file */
    readFile: (path: string, encoding?: 'utf-8') => Promise<Uint8Array | string>;
    /** Renames a file */
    rename: (oldPath: string, newPath: string) => Promise<void>;
    /** Reads a directory */
    readdir: (path: string, options?: {
        /** Traverse child directories recursively */
        recursive: boolean;
    }) => Promise<string[]>;
}
/**
 * A file manager that writes file to a specific directory but reads globally.
 */
export declare class FileManager {
    #private;
    constructor(fs: FileSystem, dataDir: string);
    /**
     * Returns the data directory
     */
    getDataDir(): string;
    /**
     * Saves a file to the data directory.
     * @param name - File to save
     * @param stream - File contents
     */
    writeFile(name: string, stream: ReadableStream<Uint8Array>): Promise<void>;
    /**
     * Reads a file from the filesystem and returns a buffer
     * Saves a file to the data directory.
     * @param oldName - File to save
     * @param newName - File contents
     */
    moveFile(oldName: string, newName: string): Promise<void>;
    /**
     * Reads a file from the disk and returns a buffer
     * @param name - File to read
     */
    readFile(name: string): Promise<Uint8Array>;
    /**
     * Reads a file from the filesystem as a string
     * @param name - File to read
     * @param encoding - Encoding to use
     */
    readFile(name: string, encoding: 'utf-8'): Promise<string>;
    /**
     * Checks if a file exists and is accessible
     * @param name - File to check
     */
    hasFileSync(name: string): boolean;
    /**
     * Reads a file from the filesystem
     * @param dir - File to read
     * @param options - Readdir options
     */
    readdir(dir: string, options?: {
        /**
         * Traverse child directories recursively
         */
        recursive: boolean;
    }): Promise<string[]>;
}
