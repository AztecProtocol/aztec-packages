import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHistory } from "@docusaurus/router";
import useBaseUrl from "@docusaurus/useBaseUrl";
import {
  useActivePluginAndVersion,
  useAllDocsData,
  useDocsPreferredVersion,
  useLatestVersion,
  useVersions,
} from "@docusaurus/plugin-content-docs/client";
import { API_PREFIX, contextTags, excerptParts, resultMeta, safeHref } from "./search.mjs";
import styles from "./styles.module.css";

const PAGE_SIZE = 5;
const SUB_RESULTS = 3;
const DEBOUNCE_MS = 150;

function useSearchTags() {
  const active = useActivePluginAndVersion();
  const developer = useVersions("developer");
  const network = useVersions("network");
  const developerLatest = useLatestVersion("developer");
  const networkLatest = useLatestVersion("network");
  const { preferredVersion } = useDocsPreferredVersion("developer");
  return contextTags({
    active: active && { pluginId: active.activePlugin.pluginId, version: active.activeVersion?.name },
    preferred: preferredVersion?.name,
    versions: {
      developer: { names: developer.map((v) => v.name), latest: developerLatest.name },
      network: { names: network.map((v) => v.name), latest: networkLatest.name },
    },
  });
}

// Docusaurus heading anchors end in a zero-width space, which Pagefind keeps in titles.
const cleanTitle = (title) => title?.replaceAll("​", "");

/** The rows the list renders: each result and its heading sub-results, minus any unsafe URL. */
function toRows(results, versionPaths) {
  const rows = [];
  for (const result of results) {
    const href = safeHref(result.url);
    if (!href) continue;
    const meta = resultMeta(href, result.filters?.docusaurus_tag?.[0], versionPaths);
    rows.push({
      ...meta,
      href,
      title: meta.title ?? (cleanTitle(result.meta?.title) || href),
      excerpt: result.excerpt,
    });
    for (const sub of (result.sub_results ?? []).filter((s) => s.url !== result.url).slice(0, SUB_RESULTS)) {
      const subHref = safeHref(sub.url);
      if (subHref) rows.push({ href: subHref, title: cleanTitle(sub.title), excerpt: sub.excerpt, sub: true });
    }
  }
  return rows;
}

function Excerpt({ excerpt }) {
  return excerptParts(excerpt ?? "").map((part, i) =>
    part.mark ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>,
  );
}

function SearchIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M14.386 14.386l4.088 4.088-4.088-4.088A7.533 7.533 0 1 1 3.733 3.733a7.533 7.533 0 0 1 10.653 10.653z"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SearchBar() {
  const tagsKey = useSearchTags().join(" ");
  const readVersion = /(?:^| )docs-developer-(\S+)/.exec(tagsKey)?.[1];
  const versionPaths = Object.values(useAllDocsData()).flatMap((d) => d.versions.map((v) => v.path));
  const history = useHistory();
  const pagefindUrl = useBaseUrl("/pagefind/pagefind.js");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allVersions, setAllVersions] = useState(false);
  const [search, setSearch] = useState({ status: "idle" });
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  const pagefind = useRef(null);
  // Only the newest search may render; a slower earlier one is dropped.
  const searchId = useRef(0);
  const trigger = useRef(null);
  const dialog = useRef(null);
  const input = useRef(null);

  const loadPagefind = useCallback(() => {
    pagefind.current ??= import(/* webpackIgnore: true */ pagefindUrl).then(
      async (module) => {
        await module.options({ excerptLength: 20 });
        await module.init();
        return module;
      },
      (error) => {
        pagefind.current = null;
        throw error;
      },
    );
    return pagefind.current;
  }, [pagefindUrl]);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The navbar item spans the gap between the link groups, which differ in width (per
  // page too: the version dropdown), so its centre is not the page's. Pass the offset to
  // the stylesheet, which shifts the trigger by as much of it as the gap allows.
  useEffect(() => {
    const slot = trigger.current?.closest(".navbar-search-center");
    if (!slot) return undefined;
    const bar = slot.closest(".navbar__inner") ?? document.documentElement;
    const place = () => {
      const s = slot.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const shift = (b.left + b.right - s.left - s.right) / 2;
      slot.style.setProperty("--navbar-search-shift", `${shift}px`);
      slot.style.setProperty("--navbar-search-offset", `${Math.abs(shift)}px`);
      slot.dataset.placed = "";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    input.current?.focus();
    loadPagefind().catch(() => setSearch({ status: "error" }));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open, loadPagefind]);

  useEffect(() => {
    if (!open) return undefined;
    const id = ++searchId.current;
    const term = query.trim();
    if (!term) {
      setSearch({ status: "idle" });
      setPending(false);
      return undefined;
    }
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        const module = await loadPagefind();
        const filters = allVersions ? {} : { docusaurus_tag: { any: tagsKey.split(" ") } };
        const { results } = await module.search(term, { filters });
        const data = await Promise.all(results.slice(0, PAGE_SIZE).map((r) => r.data()));
        if (id !== searchId.current) return;
        setSearch({ status: "done", term, results, data });
        setActive(0);
      } catch {
        if (id === searchId.current) setSearch({ status: "error" });
      }
      if (id === searchId.current) setPending(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, allVersions, tagsKey, loadPagefind]);

  const showMore = async () => {
    const { results, data } = search;
    input.current?.focus();
    // A batch applies only to the list it was fetched for: a newer search or an
    // earlier batch replaces `results` or `data`.
    const owns = (s) => s.results === results && s.data === data;
    try {
      const more = await Promise.all(results.slice(data.length, data.length + PAGE_SIZE).map((r) => r.data()));
      setSearch((s) => (owns(s) ? { ...s, data: [...data, ...more] } : s));
    } catch {
      setSearch((s) => (owns(s) ? { status: "error" } : s));
    }
  };

  const rows = search.status === "done" ? toRows(search.data, versionPaths) : [];
  const versionLabel = readVersion === "current" ? "dev" : readVersion;
  const scope = allVersions || !readVersion ? "all versions" : `the ${versionLabel} docs`;

  const go = (href) => {
    close();
    if (href.startsWith(API_PREFIX)) window.location.assign(href);
    else history.push(href);
  };

  const onLinkClick = (e, href) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(href);
  };

  const onDialogKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!rows.length) return;
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && e.target === input.current && rows[active]) {
      e.preventDefault();
      go(rows[active].href);
    } else if (e.key === "Tab") {
      const focusable = [...dialog.current.querySelectorAll("input, button")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const failed = "Search could not load. Check your connection and try again.";
  let message = null;
  if (!query.trim()) {
    message = search.status === "error" ? failed : `Type to search ${scope}.`;
  } else if ((pending && !rows.length) || search.status === "idle") {
    // A pending search replaces any message about the previous one; results stay until it lands.
    message = "Searching…";
  } else if (search.status === "error") {
    message = failed;
  } else if (!rows.length) {
    message = (
      <>
        No results for “{search.term}” in {scope}.
        {!allVersions && (
          <button
            type="button"
            className={styles.inlineAction}
            onClick={() => {
              // This button unmounts on click; keep focus inside the dialog.
              input.current?.focus();
              setAllVersions(true);
            }}
          >
            Search all versions
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Search (${mac ? "⌘" : "Ctrl"}+K)`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className={styles.icon} />
        <span className={styles.triggerLabel}>Search docs…</span>
        <span className={styles.keys} aria-hidden="true">
          <kbd>{mac ? "⌘" : "Ctrl"}</kbd>
          <kbd>K</kbd>
        </span>
      </button>
      {open &&
        createPortal(
          <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div
              ref={dialog}
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-label="Search the docs"
              onKeyDown={onDialogKeyDown}
            >
              <div className={styles.header}>
                <div className={styles.field}>
                  <SearchIcon className={styles.fieldIcon} />
                  <input
                    ref={input}
                    className={styles.input}
                    type="search"
                    placeholder="Search the docs"
                    autoComplete="off"
                    spellCheck="false"
                    role="combobox"
                    aria-expanded={rows.length > 0}
                    aria-controls={listId}
                    aria-activedescendant={rows.length ? `${listId}-${active}` : undefined}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {pending && <span className={styles.spinner} aria-hidden="true" />}
                </div>
                <button type="button" className={styles.close} aria-label="Close search" onClick={close}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className={styles.toolbar}>
                <div className={styles.scope} role="group" aria-label="Versions to search">
                  <button type="button" aria-pressed={!allVersions} onClick={() => setAllVersions(false)}>
                    This version
                    {versionLabel && <span className={styles.scopeVersion}>{versionLabel}</span>}
                  </button>
                  <button type="button" aria-pressed={allVersions} onClick={() => setAllVersions(true)}>
                    All versions
                  </button>
                </div>
                {search.status === "done" && rows.length > 0 && (
                  <span className={styles.count}>
                    {search.results.length} {search.results.length === 1 ? "result" : "results"}
                  </span>
                )}
              </div>
              <div className={styles.body}>
                <div aria-live="polite">
                  {message && (
                    <p className={styles.message} data-part="message">
                      {message}
                    </p>
                  )}
                </div>
                <ul id={listId} role="listbox" className={styles.results} aria-label="Search results">
                  {rows.map((row, i) => (
                    <li
                      key={`${row.href}-${i}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      className={row.sub ? styles.subResult : styles.result}
                    >
                      <a
                        href={row.href}
                        tabIndex={-1}
                        onClick={(e) => onLinkClick(e, row.href)}
                        onMouseMove={() => setActive(i)}
                      >
                        {!row.sub && (row.section || row.trail.length > 0) && (
                          <span className={styles.trail} data-part="trail">
                            {[row.section, ...row.trail].filter(Boolean).join(" › ")}
                          </span>
                        )}
                        <span className={styles.titleRow}>
                          <span className={styles.title} data-part="title">
                            {row.title}
                          </span>
                          {allVersions && row.version && (
                            <span className={styles.badge} data-part="badge">
                              {row.version}
                            </span>
                          )}
                          {row.api && (
                            <span className={`${styles.badge} ${styles.apiBadge}`} data-part="badge">
                              API
                            </span>
                          )}
                        </span>
                        {row.excerpt && (
                          <span className={styles.excerpt} data-part="excerpt">
                            <Excerpt excerpt={row.excerpt} />
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
                {search.status === "done" && search.data.length < search.results.length && (
                  <button type="button" className={styles.more} onClick={showMore}>
                    Show more results
                  </button>
                )}
              </div>
              <div className={styles.footer} data-part="footer" aria-hidden="true">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> navigate
                </span>
                <span>
                  <kbd>↵</kbd> open
                </span>
                <span>
                  <kbd>esc</kbd> close
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
