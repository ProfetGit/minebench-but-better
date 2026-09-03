import type { Metadata } from "next";
import Link from "next/link";
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

// The builder UI lands in the next step. This page keeps the route alive and
// says what the pipeline does in the meantime.
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }}
      />
      <div className="mb-fade-in mx-auto w-full max-w-3xl space-y-6 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          Build generator
        </h1>
        <p className="text-base text-muted">{SITE_DESCRIPTION}</p>
        <p className="text-sm text-muted">
          A model writes a build program, a deterministic compiler turns it into
          a grid of roles, and a palette resolves those roles into blocks. The
          builder page is being wired up next.
        </p>
        <Link href="/faq" className="mb-btn mb-btn-primary h-11 inline-flex">
          Read the FAQ
        </Link>
      </div>
    </>
  );
}
