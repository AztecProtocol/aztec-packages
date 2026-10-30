import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHistory } from "@docusaurus/router";
import useBaseUrl from "@docusaurus/useBaseUrl";
import {
  useActivePluginAndVersion,
  useDocsPreferredVersion,
  useLatestVersion,
  useVersions,
} from "@docusaurus/plugin-content-docs/client";
import { apiTitle, contextTags, excerptParts, safeHref, sectionLabel } from "./search.mjs";
import styles from "./styles.module.css";

const PAGE_SIZE = 5;
const SUB_RESULTS = 3;
const DEBOUNCE_MS = 150;
// Static HTML outside the router, so it needs a full page load.
const STATIC_PREFIX = "/aztec-nr-api/";

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
function toRows(results) {
  const rows = [];
  for (const result of results) {
    const href = safeHref(result.url);
    if (!href) continue;
    rows.push({
      href,
      title: apiTitle(href) ?? (cleanTitle(result.meta?.title) || href),
      excerpt: result.excerpt,
      section: sectionLabel(result.filters?.docusaurus_tag?.[0]),
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

export default function SearchBar() {
  const tagsKey = useSearchTags().join(" ");
  const history = useHistory();
  const pagefindUrl = useBaseUrl("/pagefind/pagefind.js");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allVersions, setAllVersions] = useState(false);
  const [search, setSearch] = useState({ status: "idle" });
  const [active, setActive] = useState(0);
  const [shortcut, setShortcut] = useState("Ctrl K");
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
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘ K");
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      return undefined;
    }
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
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, allVersions, tagsKey, loadPagefind]);

  const showMore = async () => {
    const id = searchId.current;
    const { results, data } = search;
    input.current?.focus();
    try {
      const more = await Promise.all(results.slice(data.length, data.length + PAGE_SIZE).map((r) => r.data()));
      if (id === searchId.current) setSearch((s) => ({ ...s, data: [...s.data, ...more] }));
    } catch {
      if (id === searchId.current) setSearch({ status: "error" });
    }
  };

  const rows = search.status === "done" ? toRows(search.data) : [];

  const go = (href) => {
    close();
    if (href.startsWith(STATIC_PREFIX)) window.location.assign(href);
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

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Search (${shortcut})`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg className={styles.icon} width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M14.386 14.386l4.088 4.088-4.088-4.088A7.533 7.533 0 1 1 3.733 3.733a7.533 7.533 0 0 1 10.653 10.653z"
            stroke="currentColor"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.triggerLabel}>Search</span>
        <kbd className={styles.triggerKeys}>{shortcut}</kbd>
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
                <button type="button" className={styles.close} aria-label="Close search" onClick={close}>
                  Esc
                </button>
              </div>
              <div className={styles.scope}>
                <button type="button" aria-pressed={!allVersions} onClick={() => setAllVersions(false)}>
                  This version
                </button>
                <button type="button" aria-pressed={allVersions} onClick={() => setAllVersions(true)}>
                  All versions
                </button>
              </div>
              <div className={styles.body}>
                <div aria-live="polite">
                  {search.status === "error" && (
                    <p className={styles.message}>Search could not load. Check your connection and try again.</p>
                  )}
                  {search.status === "done" && !rows.length && (
                    <p className={styles.message}>No results for “{search.term}”.</p>
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
                        <span className={styles.title}>{row.title}</span>
                        {row.section && <span className={styles.section}>{row.section}</span>}
                        <span className={styles.excerpt}>
                          <Excerpt excerpt={row.excerpt} />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                {search.status === "done" && search.data.length < search.results.length && (
                  <button type="button" className={styles.more} onClick={showMore}>
                    Show more
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
