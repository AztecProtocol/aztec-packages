/**
 * URLs that let people and agents consume a doc page outside the browser.
 *
 * The llms-txt plugin emits a markdown sibling for every route at build time
 * (`/developers/overview` -> `/developers/overview.md`, `/` -> `/index.md`), and
 * the Netlify edge function serves the same file for `Accept: text/markdown`.
 */

export interface AgentLinks {
  pageUrl: string;
  markdownUrl: string;
  chatGptUrl: string;
  claudeUrl: string;
}

export function markdownPathFor(permalink: string): string {
  const path = permalink.replace(/\/+$/, '');
  return path === '' ? '/index.md' : `${path}.md`;
}

export function buildAgentLinks(siteUrl: string, permalink: string): AgentLinks {
  const base = siteUrl.replace(/\/+$/, '');
  const pageUrl = `${base}${permalink}`;
  const markdownUrl = `${base}${markdownPathFor(permalink)}`;
  const prompt = encodeURIComponent(
    `Read ${markdownUrl} so I can ask questions about it.`,
  );
  return {
    pageUrl,
    markdownUrl,
    chatGptUrl: `https://chatgpt.com/?hints=search&q=${prompt}`,
    claudeUrl: `https://claude.ai/new?q=${prompt}`,
  };
}
