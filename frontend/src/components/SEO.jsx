// components/SEO.jsx
//
// SEO component for setting per-page meta tags, Open Graph, Twitter Cards,
// canonical link, and JSON-LD structured data.
//
// IMPORTANT — this component no longer mutates `document.head` directly.
// Previous versions did `document.head.appendChild(...)` and raced with the
// `<Helmet>` blocks inside individual pages. With two head-writers
// competing, `react-helmet-async` (which manages its tags by manual DOM
// manipulation) could call `removeChild` on a node React had already
// reconciled, surfacing as:
//
//   "Failed to execute 'removeChild' on 'Node':
//    The node to be removed is not a child of this node."
//
// All head tags are now rendered through `<Helmet>` from `react-helmet-async`.
// Helmet hoists the children into <head> with full reconciliation ownership,
// so React/Helmet remain the single source of truth. The component still
// accepts the same props (title, description, keywords, image, url, type,
// product, vendor, category, breadcrumbs) — public API is unchanged.
//
// Title is also pushed through Helmet (so the document title and the head
// <title> stay in sync), but we additionally call `document.title =` once
// for an instant paint before Helmet's effect runs. That is a single
// idempotent set, not a managed child, so it cannot race.
import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";

const DEFAULT_SEO = {
  title: "SiiShop - Multi-Vendor Marketplace",
  description: "Discover amazing products from verified vendors. Shop electronics, fashion, home & garden, beauty, sports and more. Secure payments, fast delivery.",
  keywords: "online shopping, multi-vendor marketplace, electronics, fashion, home decor, beauty products, sports equipment, buy online, e-commerce Ghana",
  image: "https://siishops.com/og-image.jpg",
  url: "https://siishops.com",
  siteName: "SiiShop",
  twitter: "@siishops",
};

export default function SEO({
  title,
  description,
  keywords,
  image,
  url,
  type = "website",
  product,
  vendor,
  category,
  breadcrumbs,
}) {
  const fullTitle = title ? `${title} | SiiShop` : DEFAULT_SEO.title;
  const metaDescription = description || DEFAULT_SEO.description;
  const metaKeywords = keywords || DEFAULT_SEO.keywords;
  const ogImage = image || DEFAULT_SEO.image;
  const ogUrl = url || DEFAULT_SEO.url;

  // Build JSON-LD structured data — memoized so the Helmet child identity
  // is stable across renders unless any of the schema inputs change.
  const jsonLd = useMemo(() => {
    const list = [];

    // Organization schema (always present)
    list.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SiiShop",
      url: "https://siishops.com",
      logo: "https://siishops.com/logo.png",
      sameAs: [
        "https://facebook.com/siishops",
        "https://instagram.com/siishops",
        "https://twitter.com/siishops",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+233-000-000-000",
        contactType: "customer service",
        availableLanguage: "English",
      },
    });

    // Website schema
    list.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "SiiShop",
      url: "https://siishops.com",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://siishops.com/search?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    });

    // Product schema
    if (product) {
      list.push({
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description,
        image: product.images ? product.images.filter(Boolean) : (product.image ? [product.image] : []),
        sku: product._id,
        brand: {
          "@type": "Brand",
          name: product.vendorName || product.vendorId?.storeName || "SiiShop",
        },
        offers: {
          "@type": "Offer",
          price: product.price,
          priceCurrency: "GHS",
          availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          seller: {
            "@type": "Organization",
            name: product.vendorName || product.vendorId?.storeName || "SiiShop",
          },
        },
      });
    }

    // Vendor / Store schema
    if (vendor) {
      list.push({
        "@context": "https://schema.org",
        "@type": "Store",
        name: vendor.storeName,
        url: `https://siishops.com/store/${vendor.slug}`,
        description: vendor.description || `Shop products from ${vendor.storeName} on SiiShop`,
        image: vendor.avatar || vendor.image,
        priceRange: "GHS",
        address: {
          "@type": "PostalAddress",
          addressCountry: "GH",
        },
      });
    }

    // Category schema
    if (category) {
      list.push({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${category} Products in Ghana | SiiShop`,
        description: `Shop ${category} products from verified vendors on SiiShop Ghana. Best prices, secure payments.`,
        url: `https://siishops.com/categories?category=${encodeURIComponent(category)}`,
      });
    }

    // BreadcrumbList schema
    if (breadcrumbs && breadcrumbs.length > 0) {
      list.push({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: crumb.url,
        })),
      });
    }

    return list;
  }, [product, vendor, category, breadcrumbs]);

  // ✅ Single head-writer path: every tag goes through Helmet. Helmet owns
  // its tags' lifecycle (insert/update/remove) end-to-end. React reconciles
  // the Helmet children, so add/remove cycles are atomic — there is no
  // window for a separate `document.head.appendChild` call to leave a
  // dangling node that Helmet later tries to detach.
  //
  // Title is set once via document.title for an instant paint, then mirrored
  // by the Helmet <title> child so React stays the source of truth.
  useEffect(() => {
    document.title = fullTitle;
  }, [fullTitle]);

  // Serialize jsonLd once so the <script> child identity is stable.
  const jsonLdText = JSON.stringify(jsonLd);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      <meta name="keywords" content={metaKeywords} />
      <meta name="robots" content="index, follow" />
      <meta name="author" content="SiiShop" />
      <meta name="revisit-after" content="7 days" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={ogUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={DEFAULT_SEO.siteName} />
      <meta property="og:locale" content="en_GH" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={DEFAULT_SEO.twitter} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImage} />
      <link rel="canonical" href={ogUrl} />
      <script type="application/ld+json">{jsonLdText}</script>
    </Helmet>
  );
}

// Hook for easy use in any component
export function useSEO(props) {
  return <SEO {...props} />;
}
