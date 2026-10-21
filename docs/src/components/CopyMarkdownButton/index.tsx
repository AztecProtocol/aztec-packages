import React, { useState, useCallback } from 'react';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import styles from './styles.module.css';
import { htmlToMarkdown } from './htmlToMarkdown';

// Clipboard icon SVG
const ClipboardIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

// Checkmark icon SVG
const CheckIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function CopyMarkdownButton() {
  const [copied, setCopied] = useState(false);
  const { metadata } = useDoc();

  const handleCopy = useCallback(async () => {
    // Find the markdown content container
    const contentEl = document.querySelector('.theme-doc-markdown');
    if (!contentEl) {
      console.error('Could not find markdown content element');
      return;
    }

    // Convert HTML to markdown
    const markdownContent = htmlToMarkdown(contentEl);

    // Build the final output with title and source URL
    const title = metadata.title || document.title;
    const sourceUrl = window.location.href;

    const output = `# ${title}

Source: ${sourceUrl}

${markdownContent}`;

    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = output;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        console.error('Failed to copy:', e);
      }
      document.body.removeChild(textarea);
    }
  }, [metadata.title]);

  return (
    <div className={styles.copyButtonContainer}>
      <button
        className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
        onClick={handleCopy}
        title="Copy page content as markdown"
        type="button"
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
        <span className={styles.label}>{copied ? 'Copied!' : 'Copy page'}</span>
      </button>
    </div>
  );
}
