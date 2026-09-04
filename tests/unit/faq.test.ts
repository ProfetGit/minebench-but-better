import assert from "node:assert/strict";
import { FAQ_ITEMS, FAQ_SECTIONS } from "../../lib/faq";
import { faqPageJsonLd } from "../../lib/seo";

const itemIds = FAQ_ITEMS.map((item) => item.id);
const sectionIds = FAQ_SECTIONS.map((section) => section.id);

assert.equal(new Set(itemIds).size, itemIds.length, "FAQ item IDs must be unique");
assert.equal(new Set(sectionIds).size, sectionIds.length, "FAQ section IDs must be unique");

for (const id of [...sectionIds, ...itemIds]) {
  assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Invalid FAQ anchor: ${id}`);
}

for (const item of FAQ_ITEMS) {
  assert.ok(item.question.trim().endsWith("?"), `FAQ question needs punctuation: ${item.id}`);
  assert.ok(item.answer.length > 0, `FAQ answer is missing: ${item.id}`);
  assert.ok(item.answer.every((paragraph) => paragraph.trim().length > 0));
}

// The FAQ describes the build generator, not the benchmark it replaced.
const answers = FAQ_ITEMS.flatMap((item) => item.answer).join(" ").toLowerCase();
for (const stale of ["leaderboard", "pairwise", "arena", "gallery"]) {
  assert.ok(!answers.includes(stale), `FAQ still describes the benchmark: ${stale}`);
}
assert.ok(FAQ_ITEMS.some((item) => item.answer.join(" ").includes("Litematica")));
assert.ok(FAQ_ITEMS.some((item) => item.id === "how-are-builds-generated"));

const structuredData = faqPageJsonLd(
  FAQ_ITEMS.map((item) => ({
    question: item.question,
    answer: item.answer.join("\n\n"),
  })),
);

assert.equal(structuredData["@type"], "FAQPage");
assert.equal(structuredData.mainEntity.length, FAQ_ITEMS.length);
assert.equal(structuredData.mainEntity[0]?.name, FAQ_ITEMS[0]?.question);

console.log("FAQ checks passed");
