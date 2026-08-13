/**
 * How a posting reaches a caller.
 *
 * A row flattens each place to its label and counts the rest, because one
 * board runs to megabytes and a list carries no description. A record carries
 * the places themselves.
 */

import type { JobRecord, JobRow, Place, RawAddress, RawJob, Undeclared } from "../types.js";
import { readPay } from "../ashby/compensation.js";
import { countryOf } from "../ashby/filter.js";

export function toJobRow(job: RawJob, board: string): JobRow {
  return {
    board,
    id: job.id,
    title: job.title,
    department: job.department,
    team: job.team,
    employment_type: job.employmentType,
    location: job.location,
    country: countryOf(job),
    secondary_location_count: (job.secondaryLocations ?? []).length,
    workplace_type: job.workplaceType ?? null,
    is_remote: job.isRemote ?? null,
    is_listed: job.isListed,
    published_at: job.publishedAt,
    compensation_summary: job.shouldDisplayCompensationOnJobPostings
      ? (job.compensation?.compensationTierSummary ?? null)
      : null,
    job_url: job.jobUrl,
    apply_url: job.applyUrl,
  };
}

export function toJobRecord(
  job: RawJob,
  board: string,
  format: "plain" | "html" | "none",
  includeCompensation: boolean,
  retrievedFrom: string,
): JobRecord {
  const row = toJobRow(job, board);
  const { country: _country, secondary_location_count: _count, ...base } = row;
  return {
    ...base,
    location: toPlace(job.location, job.address),
    secondary_locations: (job.secondaryLocations ?? []).map((second) =>
      toPlace(second.location, second.address),
    ),
    description:
      format === "none"
        ? null
        : {
            format,
            // The structured payload keeps the text as the company published
            // it. The rendered lines are where an imitation could pass.
            text: format === "html" ? job.descriptionHtml : job.descriptionPlain,
          },
    // Asked for no compensation, the record carries none. Rendering a
    // withheld range here would blame the company for a choice of the caller.
    compensation: includeCompensation ? readPay(job) : null,
    source: { site: "Ashby", retrieved_from: retrievedFrom },
  };
}

/** An address field arrives absent or as an empty string, and both are absences. */
export function toPlace(label: string, address: RawAddress | undefined): Place {
  const postal = address?.postalAddress;
  return {
    label,
    locality: text(postal?.addressLocality),
    region: text(postal?.addressRegion),
    country: text(postal?.addressCountry),
  };
}

function text(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Shifts lines that open like a line this server writes.
 *
 * A posting is written by a company, and its text reaches a model. A `Note:`
 * it opens with would otherwise read as a note from the server about what
 * Ashby holds.
 */
export function indentMarkerLines(text: string): string {
  return text.replace(/^(\s*)(Note|Source)\s*:/gm, "$1 $2:");
}

/** The note a filter owes a caller when a field falls silent. */
export function undeclaredNotes(undeclared: Undeclared): string[] {
  const notes: string[] = [];
  const workplace = undeclared["workplace_type"] ?? undeclared["is_remote"];
  if (workplace !== undefined && workplace > 0) {
    notes.push(
      `${workplace} postings record no workplace at all, so this filter set them aside. A posting recording none is not a posting on site.`,
    );
  }
  const withheld = undeclared["compensation"];
  if (withheld !== undefined && withheld > 0) {
    notes.push(
      `${withheld} postings belong to companies that withhold their pay ranges, so a threshold could say nothing about them. That is a decision of the company, never a salary of zero.`,
    );
  }
  const apart = undeclared["salary_comparison"];
  if (apart !== undefined && apart > 0) {
    notes.push(
      `${apart} postings state a salary in another currency or over another period, so the threshold could not weigh them. Nothing here converts between them.`,
    );
  }
  const country = undeclared["country"];
  if (country !== undefined && country > 0) {
    notes.push(`${country} postings state no country, so this filter set them aside.`);
  }
  return notes;
}

/**
 * A short line above the structured payload, for a client showing text alone.
 *
 * Every line is shifted when it opens with a marker, because a title or a
 * description written by a company reaches a model through here.
 */
export function summarise(lines: readonly string[]): string {
  return indentMarkerLines(lines.filter((line) => line.length > 0).join("\n"));
}
