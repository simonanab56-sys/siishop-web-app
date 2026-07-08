// components/ProductCard.jsx — v8: uniform marketplace layout
//
// Single source of truth for product cards across the entire app.
// Every page renders the SAME component so heights, badges, and actions
// always line up. The layout contract (mirrored in ProductCard.module.css):
//   - Fixed image area at the top (height: 170px desktop / 140px mobile;
//     flex-shrink: 0).
//   - Body is `flex: 1` so the Add-to-cart button is always pinned to the
//     bottom of the card regardless of name length.
//   - Name is clamped to exactly 2 lines (-webkit-line-clamp: 2).
//   - Description is the first 4 words of the source (truncateWords);
//     wraps naturally to up to 3 lines. Cards with longer previews are
//     naturally taller than cards with shorter ones. Only rendered when
//     there's text — empty descriptions take zero vertical space.
//   - Pricing is natural-height: 1 row without discount, 3 rows with it
//     (selling + strikethrough + Save chip). No reservation — non-discount
//     cards are shorter in pricing.
//   - All badges are position:absolute overlays on the image, so they
//     never push the card taller.
//
// Discounts / wishlist / video / category badges remain unchanged in
// semantics — only the layout container is tightened.
//
// Consumers: HomePage, SeeAllPage, DealsPage, StoresPage, VendorStorePage,
// ProductDetailPage (related), SectionRenderer (homepage sections),
// WishlistPage (recommendations), App.jsx (search).
import { useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./ProductCard.module.css";
import { getImageUrl, PLACEHOLDER_IMAGE } from "../utils/image";
import WishlistButton from "./WishlistButton";
import { discountInfo } from "../utils/pricing";
import { truncateWords } from "../utils/text";
import logger from "../utils/logger";

// ✅ RESTORED: pre-migration behavior. The OLD ProductCard called
//   `getImageUrl(url)` with no width option — the helper returned the
//   raw `secure_url` and Cloudinary served the eager-generated w_1200
//   variant that the upload pipeline pre-baked. The recent migration
//   changed the helper to insert an inline transform like
//   `w_400,c_limit,q_auto,f_auto` on every call — which 404s for any
//   product whose Cloudinary asset doesn't have that exact variant
//   cached. We restore the pre-migration call shape: no width, helper
//   returns the secure_url as-is.
function getPrimaryImage(product) {
  if (product.images && product.images.length > 0) {
    return getImageUrl(product.images[0].url);
  }
  return getImageUrl(product.image) || PLACEHOLDER_IMAGE;
}

function getSecondaryImage(product) {
  if (product.images && product.images.length > 1) {
    return getImageUrl(product.images[1].url);
  }
  return null;
}

export default function ProductCard({ product, onAddToCart, onClick, onAuthRequired }) {
  const { fmt } = useCurrency();
  if (!product) return null;

  const [isHovered, setIsHovered] = useState(false);

  const vendorName   = product.vendorId?.storeName || product.vendorId?.name || null;
  // ✅ Discount view (handles BOTH schema originalPrice AND legacy
  // PromoSection-injected _originalPrice). Single source of truth.
  const d           = discountInfo(product);
  const price       = d.price ?? (typeof product.price === "number" ? product.price : 0);
  const originalPrice = d.hasDiscount ? d.originalPrice : null;
  const saved       = d.hasDiscount ? d.saved : 0;
  const percent     = d.hasDiscount ? d.percent : 0;
  const stock        = typeof product.stock === "number" ? product.stock : 999;
  const outOfStock   = stock === 0;

  // ✅ Description: 4-word preview lives on the card; the full source is
  // only rendered on the product detail page. The preview is sliced to the
  // first 4 words and the result wraps naturally in the CSS clamp (up to
  // 3 lines). The card itself does not advertise a "read more" affordance
  // — clicking the card navigates to detail.
  const DESCRIPTION_WORD_LIMIT = 4;
  const rawDescription = (product.description || "").trim();
  const descriptionPreview = rawDescription
    ? truncateWords(rawDescription, DESCRIPTION_WORD_LIMIT)
    : "";

  // Get images for hover effect
  const primaryImage = getPrimaryImage(product);
  const secondaryImage = getSecondaryImage(product);
  const showHoverImage = isHovered && secondaryImage;

  const handleClick = (e) => {
    // Don't trigger click when clicking the add to cart button or wishlist
    if (e.target.closest("button")) return;
    logger.log("ProductCard handleClick, onClick exists:", typeof onClick === "function");
    onClick?.(product);
  };

  return (
    <div
      className={`card ${styles.card}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Image area (fixed height) ─────────────────────────────────── */}
      <div className={styles.imageWrapper}>
        {primaryImage
          ? (
            <img
              src={showHoverImage ? secondaryImage : primaryImage}
              alt={product.name || "Product"}
              className={styles.image}
              loading="lazy"
            />
          )
          : <div className={styles.noImage}>🛍️</div>
        }

        {/* Wishlist button (top-right overlay — does not push content) */}
        <div className={styles.wishlistWrapper}>
          <WishlistButton
            productId={product._id}
            size="small"
            onAuthRequired={onAuthRequired}
          />
        </div>

        {/* Category chip (top-left) */}
        {product.category && <span className={styles.category}>{product.category}</span>}

        {/* Out-of-stock chip — sits next to the wishlist at top-right */}
        {outOfStock && <span className={styles.outOfStock}>Out of Stock</span>}

        {/* Sale % chip (bottom-right, image overlay) */}
        {d.hasDiscount && (
          <span className={styles.saleBadge} title={`Save ${fmt(saved)}`}>-{percent}%</span>
        )}

        {/* Video chip (bottom-left, image overlay) */}
        {product.videoUrl && <span className={styles.videoBadge}>▶ Video</span>}
      </div>

      {/* ── Body (flex column; button pinned to bottom) ──────────────── */}
      <div className={styles.body}>
        {/* Vendor line — collapsed entirely when absent. No placeholder
            height reserved. */}
        {vendorName && <p className={styles.vendor}>🏪 {vendorName}</p>}

        {/* Title clamped to 2 lines. Short titles take fewer rows; long
            titles ellipsis. No min-height reservation. */}
        <h3 className={styles.name}>{product.name || "Unnamed Product"}</h3>

        {/* Description preview — first 30 words of the source description.
            Wraps naturally over up to 3 lines (CSS clamp); wider cards
            fit more words per line, narrower cards wrap to more lines.
            Cards with longer (≤30-word) previews are naturally taller
            than cards with shorter previews — that's correct marketplace
            behavior. Cards without descriptions take zero vertical space
            for this element. The full description lives on the product
            detail page only. */}
        {rawDescription && (
          <p className={styles.description}>{descriptionPreview}</p>
        )}

        {/* Pricing — natural height. Discount cards show 3 rows (selling,
            strikethrough, Save badge). Non-discount cards show 1 row.
            The grid keeps cards equal-height via grid-auto-rows:1fr, not
            via reserved empty slots. */}
        <div className={styles.pricing}>
          <span className={styles.price}>{fmt(price)}</span>
          {d.hasDiscount && (
            <>
              <span className={styles.originalPrice}>{fmt(originalPrice)}</span>
              <span className={styles.savingBadge} title={`Save ${fmt(saved)}`}>
                Save {fmt(saved)}
              </span>
            </>
          )}
        </div>

        {/* ✅ Footer with margin-top:auto pushes the button to the bottom
            of the body — same vertical position on every card. */}
        <div className={styles.footer}>
          <button
            type="button"
            className={`btn btn-primary btn-sm ${styles.addBtn}`}
            onClick={(e) => {
              e.stopPropagation();
              logger.log("Add to cart clicked, onAddToCart exists:", typeof onAddToCart === "function");
              onAddToCart?.(product);
            }}
            disabled={outOfStock}
          >
            {outOfStock ? "Sold Out" : "+ Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
