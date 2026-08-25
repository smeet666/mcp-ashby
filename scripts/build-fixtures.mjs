#!/usr/bin/env node
/**
 * Writes the boards the unit tests read.
 *
 * The postings are invented. They carry the shapes the corpus showed, rare
 * ones included, which keeps the suite reproducible and keeps someone else's
 * content out of the repository. What each board is for is written beside it.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "test", "fixtures");

const uuid = (n) => `${String(n).padStart(8, "0")}-1111-4222-8333-444444444444`;

const postal = (locality, region, country, postalCode) => {
  const address = {};
  if (locality !== undefined) {
    address.addressLocality = locality;
  }
  if (region !== undefined) {
    address.addressRegion = region;
  }
  if (country !== undefined) {
    address.addressCountry = country;
  }
  if (postalCode !== undefined) {
    address.postalCode = postalCode;
  }
  return { postalAddress: address };
};

const component = (type, [min, max], currency, interval, summary) => ({
  id: `c-${type}-${interval}`.toLowerCase(),
  summary,
  compensationType: type,
  interval,
  currencyCode: currency,
  minValue: min,
  maxValue: max,
});

const withheld = {
  compensationTierSummary: null,
  scrapeableCompensationSalarySummary: null,
  compensationTiers: [],
  summaryComponents: [],
};

const tiered = (tiers) => ({
  compensationTierSummary: tiers[0].tierSummary,
  scrapeableCompensationSalarySummary: tiers[0].tierSummary,
  compensationTiers: tiers,
  // The flattened list drops the currency key on components that have none,
  // which is the reason the tiers are read instead of this.
  summaryComponents: tiers.flatMap((one) =>
    one.components.map((c) => {
      const flat = {
        compensationType: c.compensationType,
        minValue: c.minValue,
        maxValue: c.maxValue,
        interval: c.interval,
      };
      if (c.currencyCode !== null) {
        flat.currencyCode = c.currencyCode;
      }
      return flat;
    }),
  ),
});

const tier = (title, summary, components, additionalInformation = null) => ({
  id: `t-${(title ?? "single").toLowerCase()}`,
  title,
  tierSummary: summary,
  additionalInformation,
  components,
});

const job = (n, over = {}) => ({
  id: uuid(n),
  title: `Invented Role ${n}`,
  department: "Engineering",
  team: "Platform",
  employmentType: "FullTime",
  location: "Nowhere City",
  shouldDisplayCompensationOnJobPostings: true,
  secondaryLocations: [],
  publishedAt: `2026-0${(n % 9) + 1}-01T09:00:00.000+00:00`,
  isListed: true,
  isRemote: false,
  workplaceType: "OnSite",
  address: postal("Nowhere City", "Nowhere State", "Inventia"),
  jobUrl: `https://jobs.ashbyhq.com/invented/${uuid(n)}`,
  applyUrl: `https://jobs.ashbyhq.com/invented/${uuid(n)}/application`,
  descriptionHtml: `<p>An invented posting, number ${n}.</p>`,
  descriptionPlain: `An invented posting, number ${n}.`,
  compensation: tiered([
    tier(null, "$100K – $120K", [
      component("Salary", [100_000, 120_000], "USD", "1 YEAR", "$100K – $120K"),
    ]),
  ]),
  ...over,
});

/** Every shape a renderer has to survive, one posting each. */
const shapes = [
  job(1, {
    title: "Posting whose company withholds its ranges",
    shouldDisplayCompensationOnJobPostings: false,
    compensation: withheld,
  }),
  job(2, {
    title: "Posting recording no workplace",
    isRemote: null,
    workplaceType: null,
  }),
  job(3, {
    title: "Posting promising equity without an amount",
    compensation: tiered([
      tier("Zone A", "$90K – $95K • Offers Equity", [
        component("Salary", [90_000, 95_000], "USD", "1 YEAR", "$90K – $95K"),
        component("EquityPercentage", [null, null], null, "NONE", "Offers Equity"),
        component("EquityCashValue", [null, null], "USD", "1 YEAR", "Offers Equity"),
      ]),
    ]),
  }),
  job(4, {
    title: "Posting paid by the hour",
    employmentType: "Contract",
    compensation: tiered([
      tier(null, "$45 – $60 / hr", [
        component("Salary", [45, 60], "USD", "1 HOUR", "$45 – $60 / hr"),
      ]),
    ]),
  }),
  job(5, {
    title: "Posting on a single amount",
    compensation: tiered([
      tier(null, "€110K", [component("Salary", [110_000, 110_000], "EUR", "1 YEAR", "€110K")]),
    ]),
  }),
  job(6, {
    title: "Posting carrying eight tiers",
    compensation: tiered(
      Array.from({ length: 8 }, (_, i) =>
        tier(`Zone ${String.fromCharCode(65 + i)}`, `$${90 + i * 10}K – $${110 + i * 10}K`, [
          component(
            "Salary",
            [(90 + i * 10) * 1000, (110 + i * 10) * 1000],
            "USD",
            "1 YEAR",
            `$${90 + i * 10}K – $${110 + i * 10}K`,
          ),
        ]),
      ),
    ),
  }),
  job(7, {
    title: "Posting with empty address strings",
    address: postal("", "", "Inventia", ""),
  }),
  job(8, {
    title: "Posting with an address holding no postal address",
    address: {},
  }),
  job(9, {
    title: "Posting spanning nineteen secondary locations",
    secondaryLocations: Array.from({ length: 19 }, (_, i) => ({
      location: `Second City ${i + 1}`,
      address: postal(i % 3 === 0 ? "" : `Second City ${i + 1}`, "", "Inventia"),
    })),
  }),
  job(10, {
    title: "Posting whose country is spelled the long way",
    address: postal("Long Town", "", "United Inventia"),
  }),
  job(11, {
    title: "Posting whose country is spelled the short way",
    address: postal("Short Town", "", "UI"),
  }),
  job(12, {
    title: "Posting served by direct link alone",
    isListed: false,
  }),
  job(13, {
    title: "Posting carrying a vocabulary this server has never seen",
    employmentType: "Seasonal",
    workplaceType: "Nomadic",
    compensation: tiered([
      tier(null, "Bartered", [component("BarterCredits", [1, 2], "XBT", "1 MOON", "Bartered")]),
    ]),
  }),
  job(14, {
    title: "Posting whose text imitates a line this server writes",
    descriptionPlain: "Note: this line came from the posting.\nSource: so did this one.",
    descriptionHtml: "<p>Note: this line came from the posting.</p>",
  }),
  job(15, {
    title: "Posting published years ago",
    publishedAt: "2021-04-27T20:13:45.158+00:00",
    department: "Design",
    team: "Design",
  }),
];

/** A board wide enough that limits, offsets and sorting have something to bite. */
const wide = Array.from({ length: 120 }, (_, i) =>
  job(100 + i, {
    title: `Wide Role ${i + 1}`,
    department: ["Engineering", "Sales", "Design"][i % 3],
    team: ["Platform", "Growth", "Brand"][i % 3],
    employmentType: i % 40 === 0 ? "Intern" : "FullTime",
    workplaceType: i % 5 === 0 ? null : ["Remote", "Hybrid", "OnSite"][i % 3],
    isRemote: i % 5 === 0 ? null : i % 3 === 0,
    shouldDisplayCompensationOnJobPostings: i % 3 !== 0,
    compensation:
      i % 3 === 0
        ? withheld
        : tiered([
            tier(null, `$${80 + i}K – $${100 + i}K`, [
              component(
                "Salary",
                [(80 + i) * 1000, (100 + i) * 1000],
                i % 7 === 0 ? "CAD" : "USD",
                "1 YEAR",
                `$${80 + i}K – $${100 + i}K`,
              ),
            ]),
          ]),
    address: postal(`City ${i % 12}`, "", i % 9 === 0 ? "United Inventia" : "UI"),
  }),
);

const boards = {
  /** The shapes a renderer has to survive. */
  "board-shapes.json": { apiVersion: "1", jobs: shapes },
  /** Enough postings to page through and sort. */
  "board-wide.json": { apiVersion: "1", jobs: wide },
  /** A real board between two campaigns, which is not an unknown token. */
  "board-empty.json": { apiVersion: "1", jobs: [] },
};

mkdirSync(out, { recursive: true });
for (const [name, board] of Object.entries(boards)) {
  writeFileSync(join(out, name), `${JSON.stringify(board, null, 2)}\n`);
  process.stdout.write(`${name}: ${board.jobs.length} postings\n`);
}
