import { FileManager } from '../file-manager/file-manager';
import { Package } from '../package';
import { Dependency, DependencyResolver } from './dependency-resolver';
import { DependencyConfig, GitDependencyConfig } from '../../types/noir_package_config';
/**
 * Downloads dependencies from github
 */
export declare class GithubDependencyResolver implements DependencyResolver {
    #private;
    constructor(fm: FileManager);
    /**
     * Resolves a dependency from github. Returns null if URL is for a different website.
     * @param _pkg - The package to resolve the dependency for
     * @param dependency - The dependency configuration
     * @returns asd
     */
    resolveDependency(_pkg: Package, dependency: DependencyConfig): Promise<Dependency | null>;
}
/**
 * Returns a safe filename for a value
 * @param val - The value to convert
 */
export declare function safeFilename(val: string): string;
/**
 * Resolves a dependency's archive URL.
 * @param dependency - The dependency configuration
 * @returns The URL to the library archive
 */
export declare function resolveGithubCodeArchive(dependency: GitDependencyConfig, format: 'zip' | 'tar'): URL;
