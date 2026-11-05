/**
 * The dev line a docs plugin serves, from its id (`developer-<line>` or `network-<line>`, as
 * `lineInstances` in src/network_docs.js names them).
 *
 * @param {string | undefined} pluginId
 * @returns {string | undefined} the line, like `v6`; undefined for every other plugin
 */
export const lineOfPlugin = (pluginId) => /^(?:developer|network)-(v\d+)$/.exec(pluginId ?? "")?.[1];

/**
 * `path` moved onto `line`'s instances when it points into the dev docs (`/developers`, `/operate`);
 * any other path unchanged.
 *
 * @param {string} path a site path, like `/developers/docs/aztec-js`
 * @param {string} line
 * @returns {string}
 */
export const lineDocsPath = (path, line) => path.replace(/^\/(developers|operate)(?=[/?#]|$)/, `/$1-${line}`);
