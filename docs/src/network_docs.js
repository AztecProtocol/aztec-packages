// Which docs version each public network reads, and the URL path that version
// is served at. docusaurus.config.js builds its versions from this and the
// llms.txt post-build step describes them, so the two cannot disagree.

const fs = require("fs");
const path = require("path");

const NETWORKS = ["mainnet", "testnet"];

const docsPath = (routeBasePath, path) =>
  `/${[routeBasePath, path].filter(Boolean).join("/")}`;

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

const sectionName = (title, { version, networks }) =>
  `${title}: ${networks.length ? `${networks.join(" and ")} (${version})` : "unreleased"}`;

/**
 * llms-txt plugin options for one instance: a section per built version, named
 * for the networks that read it, and every cut version no network reads
 * excluded (Docusaurus serves those at their version name).
 */
function llmsRoutes(instance, cutVersions) {
  const { routeBasePath, versions } = instance;
  return {
    routeRules: versions.map((v) => ({
      route: `${docsPath(routeBasePath, v.path)}/**`,
      categoryName: sectionName(instance.title, v),
      ...(v.path && { depth: 2 }),
    })),
    excludeRoutes: cutVersions
      .filter((cut) => !versions.some((v) => v.version === cut))
      .map((cut) => `${docsPath(routeBasePath, cut)}/**`),
  };
}

/**
 * One line per set of networks that read the same docs: the version of each
 * instance and its path. A version served under another's path is listed as
 * an exception to it.
 */
function networkLines(instances) {
  const byDocs = new Map();
  for (const network of NETWORKS) {
    const docs = instances
      .flatMap(({ routeBasePath, title, versions }) => {
        const own = versions.find((v) => v.networks.includes(network));
        if (!own) return [];
        const at = `${docsPath(routeBasePath, own.path)}/`;
        const nested = versions
          .map((v) => `${docsPath(routeBasePath, v.path)}/`)
          .filter((p) => p !== at && p.startsWith(at));
        const except = nested.length
          ? ` (except ${nested.map((p) => `\`${p}\``).join(", ")})`
          : "";
        return [`${title.toLowerCase()} ${own.version} at \`${at}\`${except}`];
      })
      .join("; ");
    if (docs) byDocs.set(docs, [...(byDocs.get(docs) ?? []), network]);
  }
  return [...byDocs].map(
    ([docs, networks]) => `- **${networks.join(" and ")}**: ${docs}`,
  );
}

/**
 * The llms.txt "Networks and versions" section: the network → version → path
 * lines, then the built /networks page with its headings demoted below this
 * section's H2, so llms.txt keeps a single H1.
 */
function networkSection(instances, networksPage, siteUrl) {
  let fence = false;
  const page = networksPage
    .trim()
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      return !fence && /^#{1,4} /.test(line) ? `##${line}` : line;
    })
    .join("\n");
  return [
    "## Networks and versions",
    "",
    "Each public network reads the docs of the version it runs; networks on one version share one set of pages. The sections below are named the same way.",
    "",
    ...networkLines(instances),
    "",
    `Node URLs, chain IDs and contract addresses for each network, from [Networks](${siteUrl}/networks):`,
    "",
    page,
    "",
  ].join("\n");
}

/**
 * Writes the Docusaurus versions file for one docs instance: the versions the
 * config maps that have a snapshot, each once and in config order, then every
 * snapshot no release type maps.
 *
 * @param {string} configFile release type → version JSON
 * @param {string} versionsFile the `*_versions.json` to write
 * @param {string} versionedDocsDir the instance's `*_versioned_docs` directory
 * @returns {Record<string, string>} the config
 */
function syncVersionsFile(configFile, versionsFile, versionedDocsDir) {
  const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
  const snapshots = fs.existsSync(versionedDocsDir)
    ? fs
        .readdirSync(versionedDocsDir)
        .filter((d) => d.startsWith("version-"))
        .map((d) => d.slice("version-".length))
    : [];
  const mapped = new Set(Object.values(config).filter(Boolean));
  const versions = [
    ...[...mapped].filter((v) => snapshots.includes(v)),
    ...snapshots.filter((v) => !mapped.has(v)),
  ];
  fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2) + "\n");
  return config;
}

module.exports = { docsInstances, llmsRoutes, networkSection, syncVersionsFile };
