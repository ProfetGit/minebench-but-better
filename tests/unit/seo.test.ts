import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  findCatalogEntryBySlugOrKey,
  MODEL_CATALOG,
  resolveModelSlug,
} from "../../lib/ai/modelCatalog";
import {
  SEO_KEYWORDS,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "../../lib/seo";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";
import { middleware } from "../../middleware";

async function main() {
  // Model slugs still resolve both ways, since the model picker uses them.
  for (const model of MODEL_CATALOG) {
    assert.equal(resolveModelSlug(model.key), model.slug);
    assert.equal(resolveModelSlug(model.slug), model.slug);

    const byKey = findCatalogEntryBySlugOrKey(model.key);
    assert.ok(byKey, `Failed to find model by key: ${model.key}`);
    assert.equal(byKey.slug, model.slug);

    const bySlug = findCatalogEntryBySlugOrKey(model.slug);
    assert.ok(bySlug, `Failed to find model by slug: ${model.slug}`);
    assert.equal(bySlug.key, model.key);
  }

  // The site describes a build generator, not a benchmark.
  const keywordSet = new Set<string>(SEO_KEYWORDS);
  assert.ok(keywordSet.has("Minecraft build generator"));
  assert.ok(keywordSet.has("litematica generator"));
  for (const stale of ["llm arena", "lm arena", "AI model leaderboard"]) {
    assert.equal(keywordSet.has(stale), false, `stale keyword still listed: ${stale}`);
  }

  assert.equal(websiteJsonLd["@type"], "WebSite");
  assert.ok(websiteJsonLd.potentialAction.target.includes("{search_term_string}"));
  assert.equal(softwareApplicationJsonLd["@type"], "SoftwareApplication");
  assert.ok(
    softwareApplicationJsonLd.featureList.some((feature) => feature.includes("Litematica")),
  );

  // The sitemap only lists routes that still exist.
  const entries = await sitemap();
  const urls = entries.map((entry) => String(entry.url));
  assert.deepEqual(urls, [
    "https://minebench.ai/",
    "https://minebench.ai/faq",
    "https://minebench.ai/contact",
  ]);

  const robotsRules = robots();
  assert.ok(Array.isArray(robotsRules.rules));
  const primaryRule = robotsRules.rules[0];
  assert.ok(Array.isArray(primaryRule.disallow));
  assert.ok(primaryRule.disallow.includes("/api/"));
  assert.ok(primaryRule.disallow.includes("/admin/"));
  for (const allowed of primaryRule.allow ?? []) {
    assert.ok(
      !allowed.startsWith("/leaderboard") && !allowed.startsWith("/gallery"),
      `robots.txt still allows a removed route: ${allowed}`,
    );
  }

  // Malformed percent-encoded paths still pass through rather than throwing.
  for (const path of ["/foo%bar", "/%ED%A0%80"]) {
    const response = await middleware(new NextRequest(`https://minebench.ai${path}`));
    assert.equal(response.status, 200, `middleware must not fail on ${path}`);
  }

  console.log("SEO tests passed successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
