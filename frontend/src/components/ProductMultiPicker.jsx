// components/ProductMultiPicker.jsx — Admin multi-select product picker.
//
// Used by the "Sections" admin tab when source.type === "manual" to let the
// admin pick which products live in a section. Debounced server-side search,
// selected products render as removable chips, results show "+ Add" per row.
//
// Props:
//   value:        Array<ObjectId|string>  — currently selected product IDs
//   onChange(ids) — fired with the full new array
//   maxSelected   — soft cap; UI shows a hint when reached
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { productAPI } from "../services/api";
import { useDebounce } from "../hooks/useDebounce";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../utils/image";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./ProductMultiPicker.module.css";

const PAGE_SIZE = 20;

export default function ProductMultiPicker({ value = [], onChange, maxSelected }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 200);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const mountedRef = useRef(true);
  const { fmt } = useCurrency();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch results when the debounced query or page changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = { limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE };
    if (debouncedQuery.trim()) params.search = debouncedQuery.trim();
    productAPI
      .getAll(params)
      .then((rows) => {
        if (cancelled || !mountedRef.current) return;
        const list = Array.isArray(rows) ? rows : [];
        setResults(list);
        setHasMore(list.length === PAGE_SIZE);
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return;
        setError(err?.message || "Failed to load products");
        setResults([]);
        setHasMore(false);
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page]);

  // Reset to page 1 on new search.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const selectedIds = new Set(value.map(String));
  const isFull = maxSelected && selectedIds.size >= maxSelected;

  const add = (product) => {
    const id = String(product._id);
    if (selectedIds.has(id)) return;
    if (isFull) return;
    onChange([...value, id]);
  };
  const remove = (id) => {
    onChange(value.filter((v) => String(v) !== String(id)));
  };

  // Look up the full product record for each selected id (so we can show
  // the name + image in the chip). We use a separate fetch for the chips
  // only when the current results don't include them.
  const [selectedMeta, setSelectedMeta] = useState({}); // id -> {name, image, price}
  useEffect(() => {
    const missing = value.filter((id) => !selectedMeta[String(id)] && !results.find((r) => String(r._id) === String(id)));
    if (missing.length === 0) return;
    // Best-effort lookup: search by SKU isn't available, so we filter from
    // the latest /most recent getRecent if available; otherwise we issue a
    // small lookup by id. The simplest approach: re-fetch getAll without
    // a query and just keep the items we need. We do this lazily.
    let cancelled = false;
    (async () => {
      try {
        const all = await productAPI.getAll({ limit: 1000 });
        if (cancelled || !mountedRef.current) return;
        const map = {};
        for (const p of all || []) map[String(p._id)] = p;
        setSelectedMeta((prev) => ({ ...prev, ...map }));
      } catch (_) {
        // Ignore — the chip will just render the id.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.picker}>
      {/* Selected chips */}
      <div className={styles.chipsRow}>
        {value.length === 0 ? (
          <span className={styles.muted}>No products selected yet.</span>
        ) : (
          value.map((id) => {
            const meta =
              selectedMeta[String(id)] ||
              results.find((r) => String(r._id) === String(id)) ||
              { _id: id, name: `Product #${String(id).slice(-6)}` };
            return (
              <span key={String(id)} className={styles.chip}>
                <img
                  src={
                    getImageUrl(meta.images?.[0]?.url || meta.image) ||
                    PLACEHOLDER_IMAGE
                  }
                  alt=""
                  className={styles.chipImg}
                />
                <span className={styles.chipLabel}>{meta.name}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${meta.name}`}
                  onClick={() => remove(id)}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
        {isFull && (
          <span className={styles.muted}>
            Maximum {maxSelected} products selected.
          </span>
        )}
      </div>

      {/* Search box */}
      <div className={styles.searchRow}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search products by name, vendor, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search products"
        />
      </div>

      {/* Results */}
      {error ? (
        <div className={styles.errorBox}>
          {error}
          <button type="button" onClick={() => setPage((p) => p + 0)}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className={styles.muted}>Loading products…</div>
      ) : results.length === 0 ? (
        <div className={styles.muted}>
          {debouncedQuery
            ? `No products match "${debouncedQuery}".`
            : "No products found."}
        </div>
      ) : (
        <ul className={styles.list} role="listbox" aria-label="Product results">
          {results.map((p) => {
            const id = String(p._id);
            const isSel = selectedIds.has(id);
            return (
              <li key={id} className={styles.row} role="option" aria-selected={isSel}>
                <img
                  src={getImageUrl(p.images?.[0]?.url || p.image) || PLACEHOLDER_IMAGE}
                  alt=""
                  className={styles.rowImg}
                  loading="lazy"
                />
                <div className={styles.rowBody}>
                  <div className={styles.rowName}>{p.name}</div>
                  <div className={styles.rowMeta}>
                    <span>{p.category || "—"}</span>
                    <span>·</span>
                    <span>{fmt(Number(p.price || 0))}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={isSel ? styles.removeBtn : styles.addBtn}
                  onClick={() => (isSel ? remove(id) : add(p))}
                  disabled={!isSel && isFull}
                >
                  {isSel ? "Remove" : "+ Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {results.length > 0 && (
        <div className={styles.pager}>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
