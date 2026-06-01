// routes/sitemap.js - Dynamic sitemap generator
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const User = require("../models/User");

// Get base URL from environment
const getBaseUrl = () => {
  return process.env.FRONTEND_URL || process.env.APP_URL || "https://siishops.com";
};

// Generate sitemap XML
router.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date().toISOString().split("T")[0];

    // Fetch data from MongoDB
    const [products, vendors] = await Promise.all([
      Product.find({ available: true })
        .select("name slug updatedAt")
        .limit(5000)
        .lean(),
      User.find({ isVendor: true, vendorStatus: "approved" })
        .select("storeName slug updatedAt")
        .limit(1000)
        .lean(),
    ]);

    // Build sitemap XML
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
         xmlns:xhtml="http://www.w3.org/1999/xhtml"
         xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0"
         xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
         xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
         xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
`;

    // Static pages
    const staticPages = [
      { url: "", priority: "1.0", changefreq: "daily" },
      { url: "/home", priority: "1.0", changefreq: "daily" },
      { url: "/vendors", priority: "0.9", changefreq: "daily" },
      { url: "/categories", priority: "0.9", changefreq: "weekly" },
      { url: "/about", priority: "0.7", changefreq: "monthly" },
      { url: "/contact", priority: "0.7", changefreq: "monthly" },
      { url: "/faq", priority: "0.6", changefreq: "monthly" },
      { url: "/privacy", priority: "0.5", changefreq: "monthly" },
      { url: "/terms", priority: "0.5", changefreq: "monthly" },
      { url: "/refund", priority: "0.5", changefreq: "monthly" },
    ];

    staticPages.forEach((page) => {
      const loc = page.url ? `${baseUrl}${page.url}` : baseUrl;
      sitemap += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    });

    // Vendors
    vendors.forEach((vendor) => {
      const slug = vendor.slug || vendor.storeName?.toLowerCase().replace(/\s+/g, "-");
      if (slug) {
        sitemap += `
  <url>
    <loc>${baseUrl}/vendors/${slug}</loc>
    <lastmod>${vendor.updatedAt ? vendor.updatedAt.toISOString().split("T")[0] : currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }
    });

    // Products
    products.forEach((product) => {
      const slug = product.slug || product.name?.toLowerCase().replace(/\s+/g, "-");
      if (slug) {
        sitemap += `
  <url>
    <loc>${baseUrl}/products/${slug}</loc>
    <lastmod>${product.updatedAt ? product.updatedAt.toISOString().split("T")[0] : currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
      }
    });

    sitemap += `
</urlset>`;

    res.type("application/xml").send(sitemap);
  } catch (error) {
    console.error("[Sitemap] Error:", error.message);
    console.error("[Sitemap] Stack:", error.stack);
    res.status(500).send("Error generating sitemap: " + error.message);
  }
});

// robots.txt endpoint
router.get("/robots.txt", (req, res) => {
  const baseUrl = getBaseUrl();

  const robotsTxt = `# Robots.txt for SiiShops
# https://siishops.com

User-agent: *
Allow: /

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay (optional)
Crawl-delay: 1
`;

  res.type("text/plain").send(robotsTxt);
});

module.exports = router;