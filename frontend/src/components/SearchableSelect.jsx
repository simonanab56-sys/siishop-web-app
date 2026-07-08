// components/SearchableSelect.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Generic single-select searchable dropdown. Domain-agnostic — accepts a list
// of strings OR {value,label} objects, a controlled `value`/`onChange`, and an
// optional `onRequestNew(query)` affordance for unknown values.
//
// Features:
//   - Text input filters options as the user types
//   - Keyboard navigation: Up/Down moves highlight, Enter commits, Esc closes
//   - Click-outside closes the panel
//   - Loading / empty / error states
//   - Optional "Request '…' as new" button when the typed text has no match
//   - Accessible: role="combobox", aria-expanded, aria-activedescendant
//   - Free-text commit is NOT possible unless the user picks a known option
//     OR clicks the request-new affordance (which still requires admin
//     approval before the value becomes a real category)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./SearchableSelect.module.css";

/**
 * @param {object} props
 * @param {string|number|null} props.value                 — controlled selected value
 * @param {(v: string) => void} props.onChange             — committed selection
 * @param {Array<string|{value:string,label?:string}>} props.options
 * @param {string} [props.placeholder]                     — input placeholder
 * @param {boolean} [props.loading]                        — show "Loading…" state
 * @param {string} [props.error]                           — error message
 * @param {string} [props.emptyMessage]                    — empty-state message
 * @param {(query: string) => void} [props.onRequestNew]   — request-new affordance
 * @param {string} [props.requestNewLabel]                 — label for the affordance
 * @param {(query: string) => void} [props.onQueryChange]  — called on every keystroke
 * @param {string} [props.id]                              — id (for label htmlFor)
 * @param {string} [props.className]                       — extra class on the wrapper
 * @param {boolean} [props.required]                       — mark with asterisk
 * @param {boolean} [props.disabled]                       — disable the input
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  loading = false,
  error = null,
  emptyMessage = "No matches",
  onRequestNew,
  requestNewLabel = "Request new",
  onQueryChange,
  id,
  className = "",
  required = false,
  disabled = false,
}) {
  const reactId = useId();
  const inputId = id || `ss-${reactId}`;
  const listboxId = `${inputId}-list`;

  // Two input modes:
  //  - "display": the field shows the currently selected value, no filtering
  //  - "edit":    the field shows the user's live filter text
  // We start in "display" mode when the user clicks the field and the
  // current value matches an option; otherwise in "edit" mode.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const [mode, setMode] = useState("display"); // "display" | "edit"
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const rootRef = useRef(null);

  // Normalize options → array of {value,label}
  const normalized = useMemo(() => {
    return (options || [])
      .map((o) => {
        if (o == null) return null;
        if (typeof o === "string" || typeof o === "number") {
          return { value: String(o), label: String(o) };
        }
        return { value: String(o.value), label: String(o.label ?? o.value) };
      })
      .filter(Boolean);
  }, [options]);

  // Build the displayed list. If the user is editing, filter by query; if
  // displaying the current value, show the full list (so they can scroll
  // and pick a different one).
  const filtered = useMemo(() => {
    if (mode === "edit") {
      const q = query.trim().toLowerCase();
      if (!q) return normalized;
      return normalized.filter((o) => o.label.toLowerCase().includes(q));
    }
    return normalized;
  }, [normalized, mode, query]);

  // True when the user typed something that does not match any known option
  // and we have an onRequestNew callback to surface.
  const queryHasNoMatch = useMemo(() => {
    if (!onRequestNew) return false;
    if (mode !== "edit") return false;
    const q = query.trim();
    if (!q) return false;
    return !normalized.some((o) => o.value.toLowerCase() === q.toLowerCase());
  }, [onRequestNew, mode, query, normalized]);

  // Click-outside close.
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) {
        setOpen(false);
        setMode("display");
        setQuery("");
        setHighlight(-1);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Reset highlight when filter changes.
  useEffect(() => {
    setHighlight(filtered.length ? 0 : -1);
  }, [filtered.length]);

  // When an external `value` arrives, reflect it in the field. We don't
  // overwrite while the user is mid-typing.
  useEffect(() => {
    if (mode === "edit") return;
    const match = normalized.find((o) => o.value === value);
    if (match) {
      setQuery("");
    } else if (value) {
      // Legacy / unknown value: keep showing it as plain text so the user
      // understands their previous selection survived the upgrade.
      setQuery(String(value));
    } else {
      setQuery("");
    }
  }, [value, normalized, mode]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const focusInput = () => {
    if (inputRef.current) inputRef.current.focus();
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    onQueryChange?.(v);
    if (mode === "display") setMode("edit");
    if (!open) setOpen(true);
  };

  const handleFocus = () => {
    // Opening focuses the input and switches to edit mode so the user can
    // type a filter. If they don't type, the full list is shown.
    setOpen(true);
    setMode("edit");
    setQuery("");
    onQueryChange?.("");
  };

  const handleSelect = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
    setMode("display");
    setQuery("");
    onQueryChange?.("");
    setHighlight(-1);
    focusInput();
  };

  const handleRequestNew = () => {
    const v = query.trim();
    if (!v) return;
    onRequestNew?.(v);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setMode("edit");
        return;
      }
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
      scrollHighlightIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      scrollHighlightIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlight >= 0 && filtered[highlight]) {
        handleSelect(filtered[highlight]);
      } else if (queryHasNoMatch) {
        handleRequestNew();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setMode("display");
      setQuery("");
      onQueryChange?.("");
      setHighlight(-1);
    }
  };

  const scrollHighlightIntoView = () => {
    requestAnimationFrame(() => {
      if (!listRef.current) return;
      const el = listRef.current.querySelector("[data-active='true']");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const selectedLabel = useMemo(() => {
    const match = normalized.find((o) => o.value === value);
    if (match) return match.label;
    return value ? String(value) : "";
  }, [normalized, value]);

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${className} ${disabled ? styles.disabled : ""}`}
    >
      <div className={styles.inputWrap}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck="false"
          disabled={disabled}
          placeholder={placeholder}
          value={mode === "display" ? selectedLabel : query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            open && highlight >= 0 && filtered[highlight]
              ? `${listboxId}-opt-${highlight}`
              : undefined
          }
          className={`${styles.input} ${error ? styles.inputError : ""}`}
        />
        {required && <span className={styles.requiredMark} aria-hidden="true">*</span>}
        <span className={styles.chev} aria-hidden="true">▾</span>
      </div>

      {error && <div className={styles.errorMsg} role="alert">{error}</div>}

      {open && (
        <div className={styles.panel}>
          {loading ? (
            <div className={styles.muted}>Loading…</div>
          ) : filtered.length === 0 ? (
            <>
              {emptyMessage && <div className={styles.muted}>{emptyMessage}</div>}
              {queryHasNoMatch && (
                <button
                  type="button"
                  className={styles.requestBtn}
                  onMouseDown={(e) => e.preventDefault() /* keep focus on input */}
                  onClick={handleRequestNew}
                >
                  {requestNewLabel} "{query.trim()}"
                </button>
              )}
            </>
          ) : (
            <ul ref={listRef} id={listboxId} role="listbox" className={styles.list}>
              {filtered.map((opt, i) => {
                const isHighlight = i === highlight;
                const isSelected = opt.value === value;
                return (
                  <li
                    id={`${listboxId}-opt-${i}`}
                    key={`${opt.value}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    data-active={isHighlight ? "true" : "false"}
                    className={`${styles.option} ${isHighlight ? styles.optionHl : ""} ${isSelected ? styles.optionSel : ""}`}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => e.preventDefault() /* keep focus on input */}
                    onClick={() => handleSelect(opt)}
                  >
                    <span className={styles.optionLabel}>{opt.label}</span>
                    {isSelected && <span aria-hidden="true" className={styles.optionTick}>✓</span>}
                  </li>
                );
              })}
              {queryHasNoMatch && (
                <li
                  className={styles.requestRow}
                  onMouseEnter={() => setHighlight(-1)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <button
                    type="button"
                    className={styles.requestBtn}
                    onClick={handleRequestNew}
                  >
                    {requestNewLabel} "{query.trim()}"
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}