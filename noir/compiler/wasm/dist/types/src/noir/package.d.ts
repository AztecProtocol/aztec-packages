import { FileManager } from './file-manager/file-manager';
import { DependencyConfig, PackageConfig } from '../types/noir_package_config';
/**
 * An array of sources for a package
 */
type SourceList = Array<{
    /**
     * The source path, taking into account modules and aliases. Eg: mylib/mod/mysource.nr
     */
    path: string;
    /**
     * Resolved source plaintext
     */
    source: string;
}>;
/**
 * A Noir package.
 */
export declare class Package {
    #private;
    constructor(path: string, srcDir: string, config: PackageConfig);
    /**
     * Gets this package's path.
     */
    getPackagePath(): string;
    /**
     * Gets this package's Nargo.toml (NoirPackage)Config.
     */
    getPackageConfig(): {
        package: {
            name: string;
            type: "lib" | "contract" | "bin";
            entry?: string | undefined;
            /**
             * An array of sources for a package
             */
            description?: string | undefined;
            authors?: string[] | undefined;
            compiler_version?: string | undefined;
            backend?: string | undefined;
            license?: string | undefined;
        };
        dependencies: Record<string, {
            git: string;
            tag: string;
            directory?: string | undefined;
        } | {
            path: string;
        }>;
    };
    /**
     * The path to the source directory.
     */
    getSrcPath(): string;
    /**
     * Gets the entrypoint path for this package.
     */
    getEntryPointPath(): string;
    /**
     * Gets the project type
     */
    getType(): "lib" | "contract" | "bin";
    /**
     * Gets this package's dependencies.
     */
    getDependencies(): Record<string, DependencyConfig>;
    /**
     * Gets this package's sources.
     * @param fm - A file manager to use
     * @param alias - An alias for the sources, if this package is a dependency
     */
    getSources(fm: FileManager, alias?: string): Promise<SourceList>;
    /**
     * Opens a path on the filesystem.
     * @param path - Path to the package.
     * @param fm - A file manager to use.
     * @returns The Noir package at the given location
     */
    static open(path: string, fm: FileManager): Promise<Package>;
}
export {};
