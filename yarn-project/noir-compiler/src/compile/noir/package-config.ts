/**
 * Noir package configuration.
 */
export type NoirPackageConfig = {
  /** Package metadata */
  package: {
    /** Package name */
    name: string;
    /** Package type */
    type: 'lib' | 'contract' | 'binary';
  };
  /** Package dependencies */
  dependencies: Record<string, NoirDependencyConfig>;
};

/**
 * A remote package dependency.
 */
export type NoirGitDependencyConfig = {
  /** Git repository URL. */
  git: string;
  /** Tag to check out */
  tag?: string;
  /** Where the dependency sits inside the repo */
  directory?: string;
};

/**
 * A local package dependency.
 */
export type NoirLocalDependencyConfig = {
  /** Path to the dependency */
  path: string;
};

/**
 * A package dependency.
 */
export type NoirDependencyConfig = NoirGitDependencyConfig | NoirLocalDependencyConfig;

/**
 * Checks that an object is a package configuration.
 * @param config - Config to check
 */
export function isPackageConfig(config: any): config is NoirPackageConfig {
  // TODO: validate
  return true;
}
