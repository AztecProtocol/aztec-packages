import React, { useEffect } from 'react';
import Layout from '@theme-original/DocItem/Layout';
import { createPortal } from 'react-dom';
import { useDoc, useDocsVersion } from '@docusaurus/plugin-content-docs/client';
import CopyMarkdownButton from '@site/src/components/CopyMarkdownButton';
import MigrationRangeCopy from '@site/src/components/MigrationRangeCopy';

function PortalButton() {
  const [container, setContainer] = React.useState(null);

  useEffect(() => {
    // Find the article element and inject the button
    const article = document.querySelector('article');
    if (article) {
      article.style.position = 'relative';
      setContainer(article);
    }
  }, []);

  if (!container) return null;
  return createPortal(<CopyMarkdownButton />, container);
}

export default function LayoutWrapper(props) {
  // Pages with a custom hero (the landing page) opt out via front matter so the
  // button does not float over the hero panel.
  const { frontMatter, metadata } = useDoc();
  // noIndex versions get no markdown twin, so no section index for the panel to read.
  const { noIndex } = useDocsVersion();
  return (
    <>
      <Layout {...props} />
      {!frontMatter.hide_copy_button && <PortalButton />}
      {metadata.id === 'docs/resources/migration_notes' && !noIndex && (
        <MigrationRangeCopy key={metadata.permalink} permalink={metadata.permalink} />
      )}
    </>
  );
}
