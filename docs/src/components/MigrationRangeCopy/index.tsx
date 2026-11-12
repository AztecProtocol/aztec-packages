import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseVersion, renderRange, selectRange } from '@site/src/migration_ranges.mjs';
import { markdownPathFor } from '@site/src/utils/agentLinks';
import { copyText } from '@site/src/utils/clipboard';
import styles from './styles.module.css';

type Section = { version: string; markdown: string };
type Index = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; sections: Section[] };

const isReleased = (s: Section) => !parseVersion(s.version).unreleased;
const major = (version: string) => parseVersion(version).core[0];

/** The newest release before `to`'s major, the usual starting point of an upgrade. */
function defaultFrom(sections: Section[], to: string): string | undefined {
  if (!to) return undefined;
  const released = sections.filter(isReleased);
  return (released.find((s) => major(s.version) < major(to)) ?? released[1] ?? released[0])?.version;
}

function formatSize(bytes: number): string {
  const tokens = Math.round(bytes / 4);
  const size = bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
  return `${size}, about ${tokens < 1000 ? tokens : `${Math.round(tokens / 1000)}k`} tokens`;
}

function Panel({ permalink }: { permalink: string }) {
  const id = useId();
  const markdownPath = markdownPathFor(permalink);
  const [index, setIndex] = useState<Index>({ state: 'loading' });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [copied, setCopied] = useState<boolean | null>(null);

  // Loaded up front so the copy runs synchronously in the click: Safari refuses clipboard writes
  // that wait on a fetch.
  useEffect(() => {
    const abort = new AbortController();
    fetch(markdownPath.replace(/\.md$/, '.json'), { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(({ sections }: { sections: Section[] }) => {
        const newest = sections.find(isReleased)?.version ?? '';
        setTo(newest);
        setFrom(defaultFrom(sections, newest) ?? '');
        setIndex({ state: 'ready', sections });
      })
      .catch(() => abort.signal.aborted || setIndex({ state: 'failed' }));
    return () => abort.abort();
  }, [markdownPath]);

  const result = useMemo(() => {
    if (index.state !== 'ready' || !from || !to) return null;
    try {
      const selection = selectRange(index.sections, { from, to });
      const text = renderRange(selection, window.location.origin + permalink.replace(/\/+$/, ''));
      return { count: selection.included.length, text, bytes: new TextEncoder().encode(text).length };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  }, [index, from, to, permalink]);

  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const onCopy = async () => {
    if (!result || !('text' in result)) return;
    setCopied(await copyText(result.text));
    setTimeout(() => setCopied(null), 2000);
  };

  if (index.state === 'failed') {
    return (
      <p className={styles.note}>
        The version picker could not load. Add <code>?from=&lt;version&gt;&amp;to=&lt;version&gt;</code> to{' '}
        <a href={markdownPath}>this page's markdown URL</a> instead.
      </p>
    );
  }
  const versions = index.state === 'ready' ? index.sections : [];
  const ready = result && 'text' in result && result.count > 0;
  return (
    <section className={styles.panel} aria-labelledby={`${id}-title`}>
      <p className={styles.title} id={`${id}-title`}>
        Copy only the notes for your upgrade
      </p>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>From</span>
          <select id={`${id}-from`} value={from} onChange={(e) => setFrom(e.target.value)} disabled={!versions.length}>
            {versions.filter(isReleased).map((s) => (
              <option key={s.version} value={s.version}>
                {s.version}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>to</span>
          <select id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} disabled={!versions.length}>
            {versions.map((s) => (
              <option key={s.version} value={isReleased(s) ? s.version : 'unreleased'}>
                {isReleased(s) ? s.version : 'Unreleased'}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.copy} onClick={onCopy} disabled={!ready}>
          {copied === true ? 'Copied' : copied === false ? 'Copy failed' : 'Copy notes'}
        </button>
        {ready && (
          <a className={styles.open} href={markdownPath + query} target="_blank" rel="noopener noreferrer">
            Open as markdown
          </a>
        )}
      </div>
      <p className={styles.note} aria-live="polite">
        {index.state === 'loading'
          ? 'Loading versions…'
          : !result
            ? ''
            : 'problem' in result
              ? 'Pick a target newer than the version you are on.'
              : result.count === 0
                ? `No notes after ${from} up to ${to}.`
                : `${result.count} ${result.count === 1 ? 'version' : 'versions'} after ${from}, oldest first (${formatSize(result.bytes)}).`}
      </p>
    </section>
  );
}

/**
 * The version-range copy panel, placed under the page title. It renders in the browser only, so it
 * stays out of the server-rendered page and its markdown twin; `data-copy-skip` keeps it out of the
 * Copy page output too.
 */
export default function MigrationRangeCopy({ permalink }: { permalink: string }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const content = document.querySelector('.theme-doc-markdown');
    if (!content) return;
    const node = document.createElement('div');
    node.setAttribute('data-copy-skip', '');
    const title = content.querySelector(':scope > header') ?? content.querySelector('h1');
    if (title) title.after(node);
    else content.prepend(node);
    setContainer(node);
    return () => node.remove();
  }, [permalink]);
  return container && createPortal(<Panel permalink={permalink} />, container);
}
