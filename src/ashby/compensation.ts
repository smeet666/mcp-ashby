import type { Pay, PayComponent, PayTier, RawCompensationComponent, RawJob } from "../types.js";

/**
 * Reads what a posting states about pay.
 *
 * The tiers are the source. Ashby also publishes the same amounts flattened,
 * and that list drops the currency key on components that carry none, so a
 * reader working from it would report a currency it never received.
 */
export function readPay(job: RawJob): Pay {
  const raw = job.compensation;
  const tiers = raw?.compensationTiers ?? [];
  // A company that withholds its ranges is a decision, and it is never a
  // salary of zero.
  if (job.shouldDisplayCompensationOnJobPostings === false || tiers.length === 0) {
    return { published: false, summary: null, tiers: [] };
  }
  const read: PayTier[] = tiers.map((tier) => ({
    title: tier.title ?? null,
    summary: tier.tierSummary,
    additional_information: tier.additionalInformation ?? null,
    components: (tier.components ?? []).map(readComponent),
  }));
  return { published: true, summary: raw.compensationTierSummary ?? null, tiers: read };
}

function readComponent(component: RawCompensationComponent): PayComponent {
  return {
    type: component.compensationType,
    // A component promising equity or a bonus without naming an amount keeps
    // null bounds, and a percentage of capital keeps its null currency.
    min: component.minValue ?? null,
    max: component.maxValue ?? null,
    currency: component.currencyCode ?? null,
    interval: component.interval,
    summary: component.summary,
  };
}

/** The components of one type, across every tier of a posting. */
export function componentsOfType(job: RawJob, type: string): PayComponent[] {
  const pay = readPay(job);
  if (!pay.published) return [];
  return pay.tiers.flatMap((tier) => tier.components.filter((c) => c.type === type));
}

export interface PayRow {
  job_id: string;
  title: string;
  /** Which tier the amounts belong to, since one posting carries up to eight. */
  tier_title: string | null;
  min: number | null;
  max: number | null;
  currency: string | null;
}

export interface PayComparison {
  rows: PayRow[];
  /** Named, so a caller sees that rows in different currencies do not rank. */
  currencies_present: string[];
  /** Postings whose company publishes nothing, named rather than dropped. */
  not_published: { job_id: string; title: string }[];
  /** Postings whose period differs from the one asked for, left unconverted. */
  other_intervals: { job_id: string; interval: string }[];
  /**
   * Postings publishing a range that carries no component of this kind. A
   * company stating a salary and no bonus withholds nothing, so these stay
   * apart from the postings that publish nothing at all.
   */
  without_component: number;
}

/**
 * Puts amounts side by side without melting them together.
 *
 * The corpus mixes eight currencies and four periods, and a third of the
 * postings publish nothing: a mean computed over the rest would read as a mean
 * of the board.
 */
export function comparePay(
  jobs: readonly RawJob[],
  component: string,
  interval: string,
): PayComparison {
  const rows: PayRow[] = [];
  const currencies = new Set<string>();
  const notPublished: { job_id: string; title: string }[] = [];
  const otherIntervals: { job_id: string; interval: string }[] = [];
  let withoutComponent = 0;

  for (const job of jobs) {
    const pay = readPay(job);
    if (!pay.published) {
      notPublished.push({ job_id: job.id, title: job.title });
      continue;
    }
    let carries = false;
    let onThisPeriod = false;
    for (const tier of pay.tiers) {
      for (const part of tier.components) {
        if (part.type !== component) continue;
        carries = true;
        if (part.interval !== interval) {
          otherIntervals.push({ job_id: job.id, interval: part.interval });
          continue;
        }
        onThisPeriod = true;
        rows.push({
          job_id: job.id,
          title: job.title,
          tier_title: tier.title,
          min: part.min,
          max: part.max,
          currency: part.currency,
        });
        if (part.currency !== null) currencies.add(part.currency);
      }
    }
    if (!carries && !onThisPeriod) withoutComponent += 1;
  }

  return {
    rows,
    currencies_present: [...currencies].sort(),
    not_published: notPublished,
    other_intervals: otherIntervals,
    without_component: withoutComponent,
  };
}

/**
 * Whether a posting clears a floor, at equal currency and equal period.
 *
 * A posting carrying several tiers clears it as soon as one of them does, and
 * an hourly amount is never weighed against a yearly floor.
 */
export function clearsFloor(
  job: RawJob,
  floor: number,
  currency: string,
  interval: string,
): { cleared: boolean; declared: boolean; comparable: boolean } {
  const pay = readPay(job);
  // A company withholding its ranges is the one case where nothing at all is
  // stated about pay.
  if (!pay.published) return { cleared: false, declared: false, comparable: false };
  let declared = false;
  let comparable = false;
  for (const tier of pay.tiers) {
    for (const part of tier.components) {
      if (part.type !== "Salary") continue;
      if (part.min === null && part.max === null) continue;
      declared = true;
      // A monthly amount and a yearly floor share no scale, and neither do two
      // currencies. The amount is stated, and it stands outside this comparison.
      if (part.interval !== interval) continue;
      if (part.currency === null || part.currency.toUpperCase() !== currency.toUpperCase())
        continue;
      comparable = true;
      const top = part.max ?? part.min ?? 0;
      if (top >= floor) return { cleared: true, declared: true, comparable: true };
    }
  }
  return { cleared: false, declared, comparable };
}
