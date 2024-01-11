import { FileManager } from '../file-manager/file-manager';
import { Package } from '../package';
import { Dependency, DependencyResolver } from './dependency-resolver';
import { DependencyConfig } from '../../types/noir_package_config';
/**
 * Resolves dependencies on-disk, relative to current package
 */
export declare class LocalDependencyResolver implements DependencyResolver {
    #private;
    constructor(fm: FileManager);
    resolveDependency(parent: Package, config: DependencyConfig): Promise<Dependency | null>;
}
