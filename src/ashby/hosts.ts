import { ALLOWED_HOSTS } from "./config.js";
import { invalidInput } from "./errors.js";

/**
 * The allowlist, applied before a connection is opened.
 *
 * Ashby serves the same postings through two doors, and one of them disallows
 * `/api/` in its robots.txt. Holding that line by discipline alone would leave
 * it to be crossed by an address built somewhere else, so every read passes
 * through here.
 */
export function assertAllowed(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidInput(`${url} is not an address this client can request.`);
  }
  if (parsed.protocol !== "https:") {
    throw invalidInput(`This client reads over https, and ${url} asks for ${parsed.protocol}`);
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw invalidInput(
      `This client reads ${ALLOWED_HOSTS.join(", ")} and nothing else, so it will not request ${parsed.hostname}.`,
    );
  }
  return parsed;
}
