import Metadata from '@theme-original/DocItem/Metadata';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { useDoc, useDocsVersion } from '@docusaurus/plugin-content-docs/client';
import { buildAgentLinks } from '@site/src/utils/agentLinks';

function toIsoDate(timestamp) {
  // Docusaurus has reported lastUpdatedAt in both seconds and milliseconds
  // across releases; normalise before formatting.
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(ms).toISOString();
}

/**
 * Adds machine-readable context to every doc page on top of the default
 * metadata: a TechArticle JSON-LD block that links back to the site-wide
 * Organization and WebSite entities declared in docusaurus.config.js, and a
 * rel=alternate pointer to the page's markdown twin for agents.
 */
export default function MetadataWrapper(props) {
  const { siteConfig } = useDocusaurusContext();
  const { metadata, frontMatter } = useDoc();
  const version = useDocsVersion();

  // Old versions are noindex and excluded from the llms.txt build, so they get
  // neither structured data nor a markdown alternate.
  if (version.noIndex) {
    return <Metadata {...props} />;
  }

  const { organizationId, websiteId } = siteConfig.customFields;
  const { pageUrl, markdownUrl } = buildAgentLinks(
    siteConfig.url,
    metadata.permalink,
  );
  const keywords = [
    ...(frontMatter.keywords ?? []),
    ...(metadata.tags ?? []).map((tag) => tag.label),
  ];

  const article = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${pageUrl}#article`,
    headline: metadata.title,
    description: metadata.description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    inLanguage: siteConfig.i18n.defaultLocale,
    isPartOf: { '@id': websiteId },
    author: { '@id': organizationId },
    publisher: { '@id': organizationId },
    ...(keywords.length > 0 && { keywords }),
    ...(metadata.version &&
      metadata.version !== 'current' && { version: metadata.version }),
    ...(metadata.lastUpdatedAt && {
      dateModified: toIsoDate(metadata.lastUpdatedAt),
    }),
    encoding: [
      {
        '@type': 'MediaObject',
        encodingFormat: 'text/markdown',
        contentUrl: markdownUrl,
      },
    ],
  };

  return (
    <>
      <Metadata {...props} />
      <Head>
        <link
          rel="alternate"
          type="text/markdown"
          href={markdownUrl}
          title="Markdown"
        />
        <script type="application/ld+json">{JSON.stringify(article)}</script>
      </Head>
    </>
  );
}
