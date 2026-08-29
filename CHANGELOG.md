# Changelog

## 2.0.1

- **Every tool is documented, with its arguments and what its answer carries.**
  The README is written for a person deciding whether to install and for a
  program installing on its own, and a test holds both halves to what the server
  registers.
- **The privacy policy travels in the package.** It states the hosts contacted,
  what a request carries, what is held and for how long.
- **The manifest names every tool the server registers**, which a host reads
  before installing anything.

## 2.0.0

- **This server now needs node 24 or later.** Node 20 reached its end of
  support on 2026-04-30 and node 22 is no longer what this code is built and
  typed against. That is what makes this a major version: an install on an
  older node is refused rather than left to fail somewhere later.
- **A container image is published for each version**, on ghcr, for amd64 and
  arm64. The readme carries the configuration that runs it.
- The published package carries its changelog, and the entry point it declares
  for the package root now publishes its types.

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-08-14

- The README carries the same badge row as every server here: npm, CI, the
  licence, the MCP registry entry, the Glama score, and one-click installs for
  Cursor and VS Code. Each install link encodes this package. npm serves the
  README frozen at publish time, so a release is what puts it there.

## [1.0.0] - 2026-08-13

First release. See **Stability** in the README for the surface a major version
covers and the changes that stay minor.

### Added

- `resolve_board`, which turns a company name into the token that addresses its
  Ashby board. Four spellings are tried in order, and the answer lists the ones
  that were sent, since a token does not always derive from the name.
- `search_jobs`, which reads the boards of up to ten named companies and filters
  them here, because Ashby filters nothing at the source. Rows carry no
  description.
- `get_job`, which reads one posting in full, with its places, its description
  and the pay tiers its company published.
- `list_filter_values`, which publishes the wording one board uses with the
  count of postings behind each word, and the count of postings that declare
  nothing.
- `compare_compensation`, which puts published pay ranges side by side, one
  component and one period at a time, without converting between currencies.
- A published `./client` subpath carrying the pacing, the cache and the six
  error codes, with no protocol attached.

### Notes

- A company withholding its pay ranges is reported as null, never zero. A third
  of the postings measured are in that case.
- A posting recording no workplace is reported as undeclared, never as on site.
  A fifth of the postings measured are in that case.
- A token that names nothing, a board publishing nothing and a read that failed
  are three different answers.

[1.0.0]: https://github.com/smeet666/mcp-ashby/releases/tag/v1.0.0
