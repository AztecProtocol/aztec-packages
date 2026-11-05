/**
 * The dev line a docs plugin serves, from its id (`developer-<line>` or `network-<line>`, as
 * `lineInstances` in src/network_docs.js names them).
 *
 * @param {string | undefined} pluginId
 * @returns {string | undefined} the line, like `v6`; undefined for every other plugin
 */
export const lineOfPlugin = (pluginId) => /^(?:developer|network)-(v\d+)$/.exec(pluginId ?? "")?.[1];
