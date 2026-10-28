export type Demo = {
  id: string;
  title: string;
  description: string;
  cadence: string;
  horizon: string;
  unit: string;
  country?: string;
  note: string;
  synthetic: boolean;
  source?: string;
  sourceUrl?: string;
};
export const demos: Demo[] = [
  {
    id: "retail",
    title: "Retail sales",
    description:
      "Daily units sold by product family at a UK online gift retailer.",
    cadence: "Daily",
    horizon: "14 days",
    unit: "units",
    country: "GB",
    synthetic: false,
    note: "Real transaction history from UCI Online Retail II. Saved model forecasts were precomputed; opening this page does not run the model.",
    source:
      "Chen, D. (2012). Online Retail II. UCI Machine Learning Repository. Product families were assigned from item descriptions; cancellations and non-positive quantities or prices were excluded.",
    sourceUrl: "https://doi.org/10.24432/C5CG6D",
  },
  {
    id: "manufacturing",
    title: "Manufacturing",
    description: "Monthly India cement production index, base 2011–12 = 100.",
    cadence: "Monthly",
    horizon: "12 months",
    unit: "index points",
    country: "IN",
    synthetic: false,
    note: "Real India cement production index history. Saved model forecasts were precomputed; opening this page does not run the model.",
    source:
      "Office of the Economic Adviser, DPIIT, Government of India. Index of Eight Core Industries, base 2011–12 = 100.",
    sourceUrl: "https://eaindustry.nic.in/ici_download_data.asp",
  },
];
// Keep old URLs honest and usable; the homepage advertises the real bundles.
const legacyDemos: Demo[] = [
  {
    id: "retail-mock",
    title: "Retail sales",
    description: "Explore daily demand for a sample grocery department.",
    cadence: "Daily",
    horizon: "14 days",
    unit: "units",
    country: undefined,
    synthetic: true,
    note: "Synthetic retail example. Favorita data is not included yet.",
  },
  {
    id: "manufacturing-mock",
    title: "Manufacturing",
    description: "Explore monthly production for a sample cement plant.",
    cadence: "Monthly",
    horizon: "6 months",
    unit: "index points",
    country: "IN",
    synthetic: true,
    note: "Synthetic production index. Official India cement data is not included yet.",
  },
];
export function findDemo(id: string) {
  return [...demos, ...legacyDemos].find((demo) => demo.id === id);
}
