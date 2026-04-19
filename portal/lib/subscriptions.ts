export type BillingCycle = "monthly" | "annual";

export type SubscriptionPlan = {
  id: string;
  name: string;
  audience: "developer" | "banking";
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  priceLabel?: string;
  highlight?: string;
  ctaLabel: string;
  ctaHref: string;
  features: string[];
};

export const developerPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter",
    audience: "developer",
    description: "For growing teams shipping production payments at steady volume.",
    monthlyPrice: 59,
    annualPrice: 49,
    priceLabel: "up to 5,000 calls/day",
    ctaLabel: "Choose Starter",
    ctaHref: "/dev",
    features: [
      "Hosted checkout links",
      "Basic webhooks",
      "Sandbox + production keys",
      "Priority webhook retries",
      "Risk and dispute monitoring",
      "Email support SLA",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    audience: "developer",
    description: "For platforms that need high throughput and advanced orchestration.",
    monthlyPrice: 149,
    annualPrice: 129,
    priceLabel: "up to 25,000 calls/day",
    highlight: "Most popular",
    ctaLabel: "Scale with Pro",
    ctaHref: "/dev",
    features: [
      "Everything in Starter",
      "Dedicated merchant environments",
      "Advanced settlement exports",
      "Priority technical support",
    ],
  },
];

export const bankingPlans: SubscriptionPlan[] = [
  {
    id: "bank-connect",
    name: "Bank Connect",
    audience: "banking",
    description: "For pilot institutions joining the permissioned network.",
    monthlyPrice: 399,
    annualPrice: 349,
    priceLabel: "1 branch cluster",
    ctaLabel: "Start Pilot",
    ctaHref: "/bank",
    features: [
      "Bank registration and chain address",
      "Core network stats dashboard",
      "Standard compliance export",
      "Partner onboarding support",
    ],
  },
  {
    id: "bank-scale",
    name: "Bank Scale",
    audience: "banking",
    description: "For banks operating multi-team onboarding and lending programs.",
    monthlyPrice: 899,
    annualPrice: 799,
    priceLabel: "5 branch clusters",
    highlight: "Operational favorite",
    ctaLabel: "Scale Operations",
    ctaHref: "/bank",
    features: [
      "Everything in Bank Connect",
      "Advanced audit and reconciliation",
      "Payout workflow automation",
      "Named solutions architect",
    ],
  },
  {
    id: "bank-enterprise",
    name: "Bank Enterprise",
    audience: "banking",
    description: "For national institutions with custom governance and controls.",
    monthlyPrice: null,
    annualPrice: null,
    priceLabel: "custom volume",
    ctaLabel: "Talk to NexaPay",
    ctaHref: "/bank",
    features: [
      "Private deployment options",
      "Custom governance policies",
      "Regulatory reporting integrations",
      "24/7 incident response",
    ],
  },
];

export const sdkRoadmap = ["Node.js SDK", "Python SDK"];
