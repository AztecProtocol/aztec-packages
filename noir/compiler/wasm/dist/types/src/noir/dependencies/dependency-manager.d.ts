import { Package } from '../package';
import { Dependency, DependencyResolver } from './dependency-resolver';
/**
 * Noir Dependency Resolver
 */
export declare class DependencyManager {
    #private;
    /**
     * Creates a new dependency resolver
     * @param resolvers - A list of dependency resolvers to use
     * @param entryPoint - The entry point of the project
     */
    constructor(resolvers: readonly DependencyResolver[] | undefined, entryPoint: Package);
    /**
     * Gets dependencies for the entry point
     */
    getEntrypointDependencies(): string[];
    /**
     * Get transitive libraries used by the package
     */
    getLibraries(): [string, Dependency][];
    /**
     * A map of library dependencies
     */
    getLibraryDependencies(): {
        [k: string]: string[];
    };
    /**
     * Resolves dependencies for a package.
     */
    resolveDependencies(): Promise<void>;
    /**
     * Gets the version of a dependency in the dependency tree
     * @param name - Dependency name
     * @returns The dependency's version
     */
    getVersionOf(name: string): string | undefined;
    /**
     * Gets the names of the crates in this dependency list
     */
    getPackageNames(): string[];
    /**
     * Looks up a dependency
     * @param sourceId - The source being resolved
     * @returns The path to the resolved file
     */
    findFile(sourceId: string): string | null;
}
