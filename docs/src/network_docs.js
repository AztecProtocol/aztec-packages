// Which docs version each public network reads, and the URL path that version
// is served at. docusaurus.config.js builds its versions from this.

const NETWORKS = ["mainnet", "testnet"];

/**
 * Groups the networks of a version config by docs version, in NETWORKS order,
 * so networks on one version share one set of pages. The first group is served
 * at `firstPath`, every later one at its network's name.
 *
 * @param {Record<string, string>} config release type → version
 * @param {string} firstPath path under the instance's routeBasePath
 * @returns {{version: string, networks: string[], path: string}[]}
 */
function networkVersions(config, firstPath) {
  const groups = [];
  for (const network of NETWORKS) {
    const version = config[network];
    if (!version) continue;
    const group = groups.find((g) => g.version === version);
    if (group) group.networks.push(network);
    else
      groups.push({
        version,
        networks: [network],
        path: groups.length ? network : firstPath,
      });
  }
  return groups;
}

/**
 * The versioned docs instances. Outside production the current docs are built
 * too (`networks: []`); the operator docs serve them at their root, which moves
 * the first network version to `alpha`.
 */
function docsInstances(developerConfig, networkConfig, production) {
  const current = (path) =>
    production ? [] : [{ version: "current", networks: [], path }];
  return [
    {
      routeBasePath: "developers",
      title: "Developer docs",
      versions: [...networkVersions(developerConfig, ""), ...current("dev")],
    },
    {
      routeBasePath: "operate",
      title: "Operator docs",
      versions: [
        ...networkVersions(networkConfig, production ? "" : "alpha"),
        ...current(""),
      ],
    },
  ];
}

module.exports = { docsInstances };
