import { MAX_BOARD_FORMS } from "./config.js";
import { probeBoard, type BoardReader } from "./board.js";
import type { Resolution, ResolvedBoard } from "../types.js";

/**
 * A company name in, the token that addresses its board out.
 *
 * Ashby publishes no index across its customers, so nothing else can be asked
 * until this answers. The token is not always derivable from the name:
 * `elevenlabs` answers where `eleven-labs` does not.
 */
export async function resolveBoard(name: string, reader: BoardReader): Promise<Resolution> {
  const tried: string[] = [];
  const found: ResolvedBoard[] = [];

  for (const form of boardForms(name, MAX_BOARD_FORMS)) {
    tried.push(form);
    const probe = await probeBoard(form, reader);
    if (!probe.exists) continue;
    found.push({ board: form, jobCount: probe.jobCount, publishes: probe.jobCount > 0 });
    // Each further form costs a request, a second and sometimes several
    // megabytes, and Ashby answers one board per token.
    break;
  }

  return { input: name, found, tried };
}

/**
 * The spellings tried for a name, in the order they are sent.
 *
 * Ashby ignores case, which removes half the ladder a case-sensitive service
 * would need.
 */
export function boardForms(name: string, most: number): string[] {
  if (most <= 0) return [];
  const trimmed = name.trim();
  const forms = [
    trimmed,
    trimmed.toLowerCase().replace(/\s+/g, ""),
    trimmed.toLowerCase().replace(/[^a-z0-9]+/gi, ""),
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, ""),
  ];
  const unique: string[] = [];
  for (const form of forms) {
    if (form.length === 0 || unique.includes(form)) continue;
    unique.push(form);
    if (unique.length === most) break;
  }
  return unique;
}
