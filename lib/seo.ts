export const SITE_NAME = "MineBench";
export const SITE_URL = "https://minebench.ai";
export const SITE_HOST = "minebench.ai";
export const LEGACY_HOSTS = new Set(["minebench.vercel.app", "www.minebench.ai"]);

export const SITE_DESCRIPTION =
  "MineBench generates survival-practical Minecraft builds. Describe a build, edit the program behind it, swap palettes against a cost budget, and export to Litematica.";

export const DEFAULT_OG_IMAGE = "/icon-512.png";

export const SEO_KEYWORDS = [
  "MineBench",
  "Minecraft build generator",
  "AI Minecraft builds",
  "survival Minecraft builds",
  "litematica generator",
  "minecraft schematic generator",
  "minecraft house generator",
  "voxel build generator",
  "minecraft build palette",
] as const;

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function breadcrumbJsonLd(
  items: Array<{
    name: string;
    path: string;
  }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqPageJsonLd(
  items: readonly {
    question: string;
    answer: string;
  }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "en-US",
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/?prompt={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Minecraft Build Generator",
  operatingSystem: "Web",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  keywords: SEO_KEYWORDS.join(", "),
  featureList: [
    "Prompt-driven Minecraft build generation",
    "An editable build program instead of raw block coordinates",
    "Palette swapping with survival cost budgets",
    "Structural validation before you build",
    "Litematica, Sponge schematic and MagicaVoxel export",
  ],
};
