// The docs origin. Canonical URLs, the sitemap and structured data always name it; llms.txt links
// name the host that serves the build, so a deploy preview's index keeps an agent on the preview.

const SITE_URL = "https://docs.aztec.network";

/**
 * The origin for absolute links in the llms files: Netlify's deploy URL in a deploy preview
 * (CONTEXT and DEPLOY_PRIME_URL are Netlify build variables), else SITE_URL. No trailing slash.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function llmsSiteUrl(env) {
  const preview = env.CONTEXT === "deploy-preview" && env.DEPLOY_PRIME_URL;
  return (preview || SITE_URL).replace(/\/+$/, "");
}

module.exports = { SITE_URL, llmsSiteUrl };
