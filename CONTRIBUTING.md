# Contributing

## Before code

Tests come first, without exception. A defect is fixed by writing the test that
states the right answer, then correcting the production code. A test written
afterwards proves only what the code already does.

Tests are deterministic or they do not exist. Anything touching time goes
through `vi.useFakeTimers` with a fixed epoch. No tolerance constants, no real
clock measurement. The gate is five consecutive identical runs.

Fixtures are generated, never captured: `scripts/build-fixtures.mjs` writes
invented postings carrying the shapes the API publishes.

## The rule that governs the rest

The server never states anything the data does not carry. A breakdown is never
rendered as an empty result, a value Ashby does not publish is never rendered as
zero, and a count never claims to measure something it does not.

## Running it

```bash
npm install
npm run typecheck
npm test
ASHBY_LIVE=1 npm run test:live
```

## Writing

Every piece of text reads on its own, for someone meeting the project for the
first time, with no knowledge of a previous version. Describe what the code does
and why, never how it differs from a past state. Text addressed to a caller is
in English.
