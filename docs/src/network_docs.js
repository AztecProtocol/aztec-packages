// Which docs version each public network reads, and the URL path that version
// is served at. docusaurus.config.js builds its versions from this and the
// llms.txt post-build step describes them, so the two cannot disagree.

const fs = require("fs");
const path = require("path");
const { versionLabel } = require("./release_names");

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

/**
 * The Aztec.nr API reference folder (`static/aztec-nr-api/<folder>/`) of each docs version a
 * network reads. The reference is published per network, so a version uses the first network
 * that reads it, in NETWORKS order.
 *
 * @param {{versions: {version: string, networks: string[]}[]}} instance a docsInstances entry
 * @returns {Record<string, string>} version → folder
 */
const aztecNrApiFolders = (instance) =>
  Object.fromEntries(
    instance.versions
      .filter((v) => v.networks.length)
      .map((v) => [v.version, v.networks[0]])
  );

const sectionName = (title, { version, networks }) =>
  `${title}: ${networks.length ? `${versionLabel(version)} on ${networks.join(" and ")}` : "unreleased"}`;

/**
 * The cut versions of an instance that no network reads. Docusaurus serves
 * them at their version name; they are historical, not current, docs.
 *
 * @param {{versions: {version: string}[]}} instance a docsInstances entry
 * @param {string[]} cutVersions the instance's `*_versions.json`
 * @returns {string[]}
 */
function historicalVersions({ versions }, cutVersions) {
  return cutVersions.filter((cut) => !versions.some((v) => v.version === cut));
}

/**
 * llms-txt plugin options for one instance: a section per built version, named
 * for the networks that read it, and every historical version excluded.
 */
function llmsRoutes(instance, cutVersions) {
  const { routeBasePath, versions } = instance;
  return {
    routeRules: versions.map((v) => ({
      route: `${docsPath(routeBasePath, v.path)}/**`,
      categoryName: sectionName(instance.title, v),
      ...(v.path && { depth: 2 }),
    })),
    excludeRoutes: historicalVersions(instance, cutVersions).map(
      (cut) => `${docsPath(routeBasePath, cut)}/**`,
    ),
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

// The llms.txt "Start here" entries, one per task in the order a newcomer needs them. `docs` is
// the instance whose page it is (`page`, its route under the version path); `api` an API
// reference whose scoped llms.txt it is.
const START_HERE = [
  { title: "Getting started", task: "install the toolchain and run a local network", docs: "developers", page: "getting_started_on_local_network" },
  { title: "Aztec.nr", task: "write a contract", docs: "developers", page: "docs/aztec-nr" },
  { title: "Compiling contracts", task: "compile a contract", docs: "developers", page: "docs/aztec-nr/compiling_contracts" },
  { title: "Testing contracts", task: "test a contract with `aztec test` (not `nargo test`)", docs: "developers", page: "docs/aztec-nr/testing_contracts" },
  { title: "aztec.js", task: "call contracts from TypeScript", docs: "developers", page: "docs/aztec-js" },
  { title: "Connecting to a local network", task: "connect aztec.js to a node", docs: "developers", page: "docs/aztec-js/how_to_connect_to_local_network" },
  { title: "Deploying contracts", task: "deploy a contract with aztec.js", docs: "developers", page: "docs/aztec-js/how_to_deploy_contract" },
  { title: "Testing with aztec.js", task: "test an app end to end", docs: "developers", page: "docs/aztec-js/how_to_test" },
  { title: "Counter contract tutorial", task: "build a first contract end to end", docs: "developers", page: "docs/tutorials/contract_tutorials/counter_contract" },
  { title: "Getting started on testnet", task: "deploy to testnet", docs: "developers", page: "getting_started_on_testnet" },
  { title: "Running a full node", task: "run a node", docs: "operate", page: "operators/setup/running_a_node" },
  { title: "Hardware spec", task: "size a node, sequencer or prover", docs: "operate", page: "operators/concepts/hardware" },
  { title: "Aztec.nr API reference", task: "every Aztec.nr module and its items", api: "aztec-nr-api" },
  { title: "TypeScript API reference", task: "the aztec.js, accounts, wallets and PXE packages", api: "typescript-api" },
  { title: "AI tooling", task: "set up a coding agent for Aztec", docs: "developers", page: "ai_tooling" },
];

/**
 * The Start here links, each to the docs version the first public network reads (so a preview,
 * which serves that version at `/operate/alpha`, links there). An API entry is dropped when no
 * network reads a version.
 *
 * @returns {{title: string, task: string, url: string}[]}
 */
function startHereLinks(instances, siteUrl) {
  const read = (instance) => instance.versions.find((v) => v.networks.length);
  const developer = instances.find((i) => i.routeBasePath === "developers");
  const folder = read(developer) && aztecNrApiFolders(developer)[read(developer).version];
  return START_HERE.flatMap(({ title, task, docs, page, api }) => {
    if (api) return folder ? [{ title, task, url: `${siteUrl}/${api}/${folder}/llms.txt` }] : [];
    const instance = instances.find((i) => i.routeBasePath === docs);
    const version = read(instance) ?? instance.versions[0];
    return [{ title, task, url: `${siteUrl}${docsPath(docs, version.path)}/${page}.md` }];
  });
}

/** The llms.txt "Start here" section: the task links, then which docs each network reads. */
function startHere(instances, siteUrl) {
  return [
    "## Start here",
    "",
    "One link per task, to the docs the public networks read. Every docs page is also markdown: append `.md` to its URL.",
    "",
    ...startHereLinks(instances, siteUrl).map(({ title, task, url }) => `- [${title}](${url}): ${task}`),
    "",
    "Docs per network (node URLs, chain IDs and contract addresses are under Networks and versions, below):",
    "",
    ...networkLines(instances),
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

module.exports = {
  aztecNrApiFolders,
  docsInstances,
  historicalVersions,
  llmsRoutes,
  networkSection,
  startHere,
  startHereLinks,
  syncVersionsFile,
};
