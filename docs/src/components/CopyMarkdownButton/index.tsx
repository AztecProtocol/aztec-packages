import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useDoc, useDocsVersion } from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { buildAgentLinks } from '@site/src/utils/agentLinks';
import styles from './styles.module.css';
import { htmlToMarkdown } from './htmlToMarkdown';

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

const ChevronIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const MarkdownIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 15V9l3 3 3-3v6M16 9v6M14 13l2 2 2-2" />
  </svg>
);

const SparkIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </svg>
);

export default function CopyMarkdownButton() {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { metadata } = useDoc();
  // noIndex versions are excluded from the llms build, so they have no .md twin for the menu's
  // links to point at; the DOM-based Copy button still works there.
  const { noIndex } = useDocsVersion();
  const { siteConfig } = useDocusaurusContext();
  const { markdownUrl, chatGptUrl, claudeUrl } = buildAgentLinks(
    siteConfig.url,
    metadata.permalink,
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (rootRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleCopy = useCallback(async () => {
    const contentEl = document.querySelector('.theme-doc-markdown');
    if (!contentEl) {
      console.error('Could not find markdown content element');
      return;
    }

    const markdownContent = htmlToMarkdown(contentEl);
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
    <div
      className={styles.copyButtonContainer}
      ref={rootRef}
      onBlur={(event) => {
        // Safari does not focus links on click, so a null relatedTarget can be a click on a menu
        // link; closing then would unmount it mid-click. Outside clicks close on mousedown instead.
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <div className={styles.group}>
        <button
          className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
          onClick={handleCopy}
          title="Copy page content as markdown"
          type="button"
        >
          {copied ? <CheckIcon /> : <ClipboardIcon />}
          <span className={styles.label}>{copied ? 'Copied!' : 'Copy page'}</span>
        </button>
        {!noIndex && (
          <button
            ref={toggleRef}
            className={`${styles.menuToggle} ${open ? styles.menuToggleOpen : ''}`}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label="More ways to use this page"
            title="Open this page in an AI assistant"
            type="button"
          >
            <ChevronIcon />
          </button>
        )}
      </div>
      {open && !noIndex && (
        <div className={styles.menu} id={menuId}>
          <a
            className={styles.menuItem}
            href={markdownUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <MarkdownIcon />
            <span>
              <span className={styles.menuItemTitle}>View as markdown</span>
              <span className={styles.menuItemHint}>Plain text for agents</span>
            </span>
          </a>
          <a
            className={styles.menuItem}
            href={chatGptUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <SparkIcon />
            <span>
              <span className={styles.menuItemTitle}>Open in ChatGPT</span>
              <span className={styles.menuItemHint}>Ask questions about this page</span>
            </span>
          </a>
          <a
            className={styles.menuItem}
            href={claudeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <SparkIcon />
            <span>
              <span className={styles.menuItemTitle}>Open in Claude</span>
              <span className={styles.menuItemHint}>Ask questions about this page</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
