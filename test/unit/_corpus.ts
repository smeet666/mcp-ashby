/**
 * Typed access to the generated boards.
 *
 * Postings are addressed by what they demonstrate rather than by their index,
 * so a test states the shape it exercises.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawBoard, RawJob } from "../../src/types.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function load(name: string): RawBoard {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as RawBoard;
}

export const shapesBoard: RawBoard = load("board-shapes.json");
export const wideBoard: RawBoard = load("board-wide.json");
export const emptyBoard: RawBoard = load("board-empty.json");

export const shapesJobs: RawJob[] = shapesBoard.jobs;
export const wideJobs: RawJob[] = wideBoard.jobs;

/** The identifier scheme the generator uses, restated so tests can address a posting. */
export function fixtureId(n: number): string {
  return `${String(n).padStart(8, "0")}-1111-4222-8333-444444444444`;
}

function pick(jobs: RawJob[], n: number): RawJob {
  const found = jobs.find((job) => job.id === fixtureId(n));
  if (found === undefined) {
    throw new Error(`the fixtures carry no posting numbered ${n}`);
  }
  return found;
}

/** A posting from board-shapes.json, by its number in the generator. */
export function shape(n: number): RawJob {
  return pick(shapesJobs, n);
}

export const withheldPay = (): RawJob => shape(1);
export const noWorkplace = (): RawJob => shape(2);
export const equityWithoutAmount = (): RawJob => shape(3);
export const paidByTheHour = (): RawJob => shape(4);
export const singleAmount = (): RawJob => shape(5);
export const eightTiers = (): RawJob => shape(6);
export const emptyAddressStrings = (): RawJob => shape(7);
export const addressWithoutPostal = (): RawJob => shape(8);
export const nineteenSecondaryLocations = (): RawJob => shape(9);
export const countrySpelledLong = (): RawJob => shape(10);
export const countrySpelledShort = (): RawJob => shape(11);
export const directLinkOnly = (): RawJob => shape(12);
export const unknownVocabulary = (): RawJob => shape(13);
export const textImitatingTheServer = (): RawJob => shape(14);
export const publishedYearsAgo = (): RawJob => shape(15);

/** A board carrying exactly the postings handed in, under the generated envelope. */
export function boardOf(jobs: RawJob[]): RawBoard {
  return { apiVersion: "1", jobs } as RawBoard;
}
