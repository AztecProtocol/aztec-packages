// module.exports = require('@aztec/foundation/eslint-legacy');

// TODO: uncomment first line and remove the following once docs are re-enabled globally
const config = require('@aztec/foundation/eslint-legacy');
config.plugins.push('eslint-plugin-tsdoc', 'jsdoc');
config.rules['tsdoc/syntax'] = 'error';
module.exports = config;