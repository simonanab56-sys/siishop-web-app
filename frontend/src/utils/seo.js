/**
 * seo.js — Automatic SEO generation for product categories
 * Generates title, description, keywords, Open Graph, Twitter, and structured data
 */

/**
 * Category keyword enhancement mapping
 * Extends category names with relevant keywords for better SEO
 */
const CATEGORY_KEYWORDS = {
  electronics: ["phones", "laptops", "gadgets", "accessories", "tech"],
  fashion: ["clothes", "shoes", "accessories", "apparel", "wear"],
  food: ["groceries", "meals", "drinks", "beverages", "snacks"],
  beauty: ["cosmetics", "skincare", "makeup", "personal care", "wellness"],
  home: ["furniture", "decor", "appliances", "kitchenware", "bedding"],
  sports: ["equipment", "athletic", "fitness", "outdoor", "gear"],
  books: ["reading", "literature", "education", "knowledge", "media"],
  toys: ["games", "play", "children", "entertainment", "fun"],
};

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Generate SEO metadata for a category
 * @param {string} category - The category name
 * @returns {object} SEO metadata object with title, description, keywords, OG, Twitter, and structured data
 */
export function generateCategorySEO(category) {
  // Handle undefined/null/empty categories
  if (!category || typeof category !== "string") {
    return generateDefaultSEO();
  }

  const normalizedCategory = category.trim().toLowerCase();
  const displayName = capitalizeWords(normalizedCategory);

  // Get enhanced keywords for this category
  const baseKeywords = CATEGORY_KEYWORDS[normalizedCategory] || [];
  const keywordString = [
    normalizedCategory,
    "buy online",
    "shop",
    "ghana",
    "siishop",
    ...baseKeywords,
  ]
    .filter(Boolean)
    .join(", ");

  const title = `Buy ${displayName} Online in Ghana – SiiShop`;
  const description = `Shop the best ${displayName.toLowerCase()} online in Ghana. Wide selection of quality ${normalizedCategory} from verified vendors. Fast delivery to your door.`;
  const url = `/category/${normalizedCategory}`;

  return {
    title,
    description,
    keywords: keywordString,
    canonical: url,
    ogTitle: title,
    ogDescription: description,
    ogType: "website",
    ogUrl: url,
    twitterTitle: title,
    twitterDescription: description,
    twitterCard: "summary_large_image",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description: description,
      url: url,
      mainEntity: {
        "@type": "ItemCollection",
        name: displayName,
        description: description,
      },
    },
  };
}

/**
 * Generate default SEO for home/unknown categories
 */
function generateDefaultSEO() {
  const title = "SiiShop – Africa's Marketplace";
  const description =
    "Shop thousands of products from verified vendors in Ghana. Electronics, fashion, food, beauty, and more. Fast delivery to your door.";
  const url = "/";

  return {
    title,
    description,
    keywords:
      "shop online, marketplace, ghana, electronics, fashion, food, beauty, siishop",
    canonical: url,
    ogTitle: title,
    ogDescription: description,
    ogType: "website",
    ogUrl: url,
    twitterTitle: title,
    twitterDescription: description,
    twitterCard: "summary_large_image",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "SiiShop",
      description: description,
      url: url,
    },
  };
}

/**
 * Extract category from URL pathname
 * Supports /category/{name} format
 * @returns {string|null} The category name or null if not in category route
 */
export function extractCategoryFromURL() {
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/category\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Update browser URL for category without full page reload
 * @param {string} category - The category name
 */
export function updateCategoryURL(category) {
  if (!category || category === "All") {
    window.history.pushState({}, "", "/");
    return;
  }
  const url = `/category/${encodeURIComponent(category.toLowerCase())}`;
  window.history.pushState({ category }, "", url);
}

/**
 * Generate Open Graph meta tags object
 * @param {object} seoData - SEO data from generateCategorySEO
 * @returns {object} Object suitable for Helmet meta tags
 */
export function getOpenGraphTags(seoData) {
  return {
    property: "og:title",
    content: seoData.ogTitle,
  };
}

/**
 * Generate Twitter Card meta tags object
 * @param {object} seoData - SEO data from generateCategorySEO
 * @returns {object} Object suitable for Helmet meta tags
 */
export function getTwitterCardTags(seoData) {
  return {
    name: "twitter:card",
    content: seoData.twitterCard,
  };
}
