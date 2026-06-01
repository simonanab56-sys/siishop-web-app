// components/SEO.jsx - Complete SEO component with meta tags, Open Graph, Twitter Cards, and JSON-LD
import { useEffect } from "react";

const DEFAULT_SEO = {
  title: "SiiShops Online Marketplace in Ghana | Multi-Vendor Marketplace in Ghana",
  description: "Shop a wide range of products from trusted vendors across Ghana. Fast delivery and secure payments., and local vendors. Shop from the best stores near you.",
  keywords: "multi vendor ecommerce Ghana, online marketplace Ghana, buy products online Ghana, local vendors Ghana, food delivery Ghana, grocery delivery, online shopping Ghana",
  image: "https://siishops.com/og-image.jpg",
  url: "https://siishops.com",
  siteName: "SiiShops",
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
}) {
  const fullTitle = title ? `${title} | SiiShops` : DEFAULT_SEO.title;
  const metaDescription = description || DEFAULT_SEO.description;
  const metaKeywords = keywords || DEFAULT_SEO.keywords;
  const ogImage = image || DEFAULT_SEO.image;
  const ogUrl = url || DEFAULT_SEO.url;

  // Build JSON-LD structured data
  let jsonLd = [];

  // Organization schema
  jsonLd.push({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SiiShops",
    url: "https://siishops.com",
    logo: "https://siishops.com/logo.png",
    sameAs: [
      "https://facebook.com/siishops",
      "https://instagram.com/siishops",
      "https://twitter.com/siishops",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+233",
      contactType: "customer service",
      availableLanguage: "English",
    },
  });

  // Website schema
  jsonLd.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "SiiShops",
    url: "https://siishops.com",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://siishops.com/search?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  });

  // Product schema (if product data provided)
  if (product) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description,
      image: product.image || product.images?.[0],
      offers: {
        "@type": "Offer",
        price: product.price,
        priceCurrency: "GHS",
        availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
      seller: {
        "@type": "Organization",
        name: product.vendorName || "SiiShops",
      },
    });
  }

  // Vendor/LocalBusiness schema (if vendor data provided)
  if (vendor) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: vendor.storeName,
      description: vendor.description,
      image: vendor.avatar || vendor.image,
      address: {
        "@type": "PostalAddress",
        addressCountry: "GH",
      },
      priceRange: "$$",
    });
  }

  useEffect(() => {
    // Set document title
    document.title = fullTitle;

    // Meta tags
    const metaTags = [
      { name: "description", content: metaDescription },
      { name: "keywords", content: metaKeywords },
      { name: "robots", content: "index, follow" },
      { name: "author", content: "SiiShops" },
      { name: "revisit-after", content: "7 days" },
    ];

    // Open Graph
    const ogTags = [
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: metaDescription },
      { property: "og:image", content: ogImage },
      { property: "og:url", content: ogUrl },
      { property: "og:type", content: type },
      { property: "og:site_name", content: DEFAULT_SEO.siteName },
      { property: "og:locale", content: "en_GH" },
    ];

    // Twitter Card
    const twitterTags = [
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: DEFAULT_SEO.twitter },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: metaDescription },
      { name: "twitter:image", content: ogImage },
    ];

    // Set meta tags
    const setMetaTags = (tags) => {
      tags.forEach((tag) => {
        const existing = document.querySelector(
          tag.name
            ? `meta[name="${tag.name}"]`
            : `meta[property="${tag.property}"]`
        );
        if (existing) {
          existing.setAttribute(
            tag.name ? "content" : "content",
            tag.name ? tag.content : tag.content
          );
        } else {
          const newTag = document.createElement("meta");
          if (tag.name) {
            newTag.setAttribute("name", tag.name);
          } else {
            newTag.setAttribute("property", tag.property);
          }
          newTag.setAttribute("content", tag.content);
          document.head.appendChild(newTag);
        }
      });
    };

    setMetaTags([...metaTags, ...ogTags, ...twitterTags]);

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", ogUrl);

    // Set JSON-LD structured data
    let jsonLdScript = document.getElementById("json-ld");
    if (!jsonLdScript) {
      jsonLdScript = document.createElement("script");
      jsonLdScript.setAttribute("type", "application/ld+json");
      jsonLdScript.setAttribute("id", "json-ld");
      document.head.appendChild(jsonLdScript);
    }
    jsonLdScript.textContent = JSON.stringify(jsonLd);

    // Cleanup on unmount
    return () => {
      document.title = DEFAULT_SEO.title;
    };
  }, [fullTitle, metaDescription, metaKeywords, ogImage, ogUrl, type, jsonLd]);

  return null;
}

// Hook for easy use in any component
export function useSEO(props) {
  return <SEO {...props} />;
}