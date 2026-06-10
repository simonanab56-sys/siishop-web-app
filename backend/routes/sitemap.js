// routes/sitemap.js - Dynamic sitemap generator with multiple sitemaps
const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const User = require("../models/User");

// Get base URL from environment
const getBaseUrl = () => {
  return process.env.FRONTEND_URL || process.env.APP_URL || "https://siishops.com";
};

// Helper to escape XML characters
const escapeXml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Main sitemap index - references all sitemaps
router.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date().toISOString().split("T")[0];

    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-pages.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-products.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-vendors.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-categories.xml</loc>
    <lastmod>${currentDate}</lastmod>
  </sitemap>
</sitemapindex>`;

    res.type("application/xml").send(sitemapIndex);
  } catch (error) {
    console.error("[Sitemap Index] Error:", error.message);
    res.status(500).send("Error generating sitemap index: " + error.message);
  }
});

// Static pages sitemap
router.get("/sitemap-pages.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date().toISOString().split("T")[0];

    const staticPages = [
      { url: "", priority: "1.0", changefreq: "daily" },
      { url: "/home", priority: "1.0", changefreq: "daily" },
      { url: "/categories", priority: "0.9", changefreq: "daily" },
      { url: "/vendors", priority: "0.9", changefreq: "daily" },
      { url: "/search", priority: "0.8", changefreq: "daily" },
      { url: "/about", priority: "0.7", changefreq: "monthly" },
      { url: "/contact", priority: "0.7", changefreq: "monthly" },
      { url: "/faq", priority: "0.6", changefreq: "monthly" },
      { url: "/privacy", priority: "0.5", changefreq: "monthly" },
      { url: "/terms", priority: "0.5", changefreq: "monthly" },
      { url: "/refund", priority: "0.5", changefreq: "monthly" },
    ];

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
         xmlns:xhtml="http://www.w3.org/1999/xhtml"
         xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

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

    sitemap += `
</urlset>`;

    res.type("application/xml").send(sitemap);
  } catch (error) {
    console.error("[Sitemap Pages] Error:", error.message);
    res.status(500).send("Error generating sitemap: " + error.message);
  }
});

// Products sitemap - ONLY active products
router.get("/sitemap-products.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date().toISOString().split("T")[0];

    // Get only available products
    const products = await Product.find({ available: true })
      .select("name _id updatedAt image")
      .sort({ updatedAt: -1 })
      .limit(50000)
      .lean();

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
         xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

    products.forEach((product) => {
      const loc = `${baseUrl}/product/${product._id}`;
      const lastmod = product.updatedAt ? product.updatedAt.toISOString().split("T")[0] : currentDate;

      // Add image if available
      let imageTag = "";
      if (product.image) {
        imageTag = `
    <image:image>
      <image:loc>${escapeXml(product.image)}</image:loc>
      <image:title>${escapeXml(product.name)}</image:title>
    </image:image>`;
      }

      sitemap += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${imageTag}
  </url>`;
    });

    sitemap += `
</urlset>`;

    res.type("application/xml").send(sitemap);
  } catch (error) {
    console.error("[Sitemap Products] Error:", error.message);
    res.status(500).send("Error generating sitemap: " + error.message);
  }
});

// Vendors sitemap - ONLY approved vendors
router.get("/sitemap-vendors.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date().toISOString().split("T")[0];

    const vendors = await User.find({ isVendor: true, vendorStatus: "approved" })
      .select("storeName slug updatedAt avatar")
      .sort({ updatedAt: -1 })
      .limit(5000)
      .lean();

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
         xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

    vendors.forEach((vendor) => {
      // Use slug or generate from storeName
      const slug = vendor.slug || vendor.storeName?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (slug) {
        const loc = `${baseUrl}/store/${slug}`;
        const lastmod = vendor.updatedAt ? vendor.updatedAt.toISOString().split("T")[0] : currentDate;

        let imageTag = "";
        if (vendor.avatar) {
          imageTag = `
    <image:image>
      <image:loc>${escapeXml(vendor.avatar)}</image:loc>
      <image:title>${escapeXml(vendor.storeName)}</image:title>
    </image:image>`;
        }

        sitemap += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${imageTag}
  </url>`;
      }
    });

    sitemap += `
</urlset>`;

    res.type("application/xml").send(sitemap);
  } catch (error) {
    console.error("[Sitemap Vendors] Error:", error.message);
    res.status(500).send("Error generating sitemap: " + error.message);
  }
});

// Categories sitemap
router.get("/sitemap-categories.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date().toISOString().split("T")[0];

    // Get categories from database or use default ones
    let categories = [];
    try {
      const cats = await Category.find({}).select("name slug").lean();
      if (cats && cats.length > 0) {
        categories = cats;
      }
    } catch (e) {
      // If Category model doesn't exist, use defaults
    }

    // Default categories if none in DB
    const defaultCategories = [
      "Electronics", "Fashion", "Home & Garden", "Beauty", "Sports",
      "Books", "Toys", "Food", "Health", "Automotive"
    ];

    const categoryList = categories.length > 0 ? categories : defaultCategories.map(c => ({ name: c, slug: c.toLowerCase().replace(/\s+/g, "-") }));

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    categoryList.forEach((cat) => {
      const slug = cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-");
      const loc = `${baseUrl}/categories?category=${encodeURIComponent(slug)}`;
      sitemap += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    sitemap += `
</urlset>`;

    res.type("application/xml").send(sitemap);
  } catch (error) {
    console.error("[Sitemap Categories] Error:", error.message);
    res.status(500).send("Error generating sitemap: " + error.message);
  }
});

// robots.txt endpoint
router.get("/robots.txt", (req, res) => {
  const baseUrl = getBaseUrl();

  const robotsTxt = `# Robots.txt for SiiShop
# https://siishops.com

User-agent: *
Allow: /

# Sitemaps
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay
Crawl-delay: 1
`;

  res.type("text/plain").send(robotsTxt);
});

module.exports = router;