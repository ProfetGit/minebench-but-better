import type { Metadata } from "next";
import { Builder } from "@/components/builder/Builder";
import { breadcrumbJsonLd, DEFAULT_OG_IMAGE, SEO_KEYWORDS, SITE_DESCRIPTION } from "@/lib/seo";

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
  keywords: [...SEO_KEYWORDS],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "MineBench | Minecraft Build Generator",
    description: SITE_DESCRIPTION,
    url: "/",
    images: [{ url: DEFAULT_OG_IMAGE, alt: "MineBench" }],
  },
  twitter: {
    title: "MineBench | Minecraft Build Generator",
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};

const breadcrumbData = breadcrumbJsonLd([{ name: "Builder", path: "/" }]);

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }}
      />
      <Builder />
    </>
  );
}
