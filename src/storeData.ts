export type Offer = {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  href: string;
  tags: string[];
};

// Same-origin tracking keeps attribution fast and reliable. The Worker stores
// events durably and forwards them to the existing Moneyhi11s revenue engine.
export const REVENUE_API = "";

export const OFFERS: Offer[] = [
  {
    id: "millionaire",
    name: "Millionaire Program",
    eyebrow: "Featured digital offer",
    description:
      "Explore the current offer directly on the merchant page and review the terms, pricing and refund information before purchasing.",
    bestFor: "Shoppers comparing online business and digital-learning offers",
    href: "https://millionaire.a.explodely.com/?aff=moneyhi11s&pid=288853053",
    tags: ["Digital", "Online business", "Featured"],
  },
  {
    id: "neomedias",
    name: "NeoMedias",
    eyebrow: "Creator & media offer",
    description:
      "A direct merchant offer for shoppers researching media and creator-focused products. Verify current details on the merchant page.",
    bestFor: "Creators and digital-media shoppers",
    href: "https://neomedias.a.explodely.com/?aff=moneyhi11s&pid=1413241209",
    tags: ["Creator", "Media", "Digital"],
  },
  {
    id: "nexagroup",
    name: "NexaGroup",
    eyebrow: "Featured partner offer",
    description:
      "Review this partner offer, current pricing and merchant terms before deciding whether it fits your needs.",
    bestFor: "Shoppers comparing digital products and services",
    href: "https://nexagroup.a.explodely.com/?aff=moneyhi11s&pid=400288355",
    tags: ["Partner", "Digital", "Trending"],
  },
];

export const TRAFFIC_SOURCES = [
  "tiktok",
  "instagram",
  "youtube",
  "google",
  "ai",
  "direct",
] as const;
