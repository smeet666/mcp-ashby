/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one cache are shared by every tool, so the
 * pacing applies to the server as a whole rather than per tool, and a board
 * downloaded by one tool serves the next. Tools are registered in a fixed
 * order, which is the order they are listed in.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ClientOptions } from "./ashby/config.js";
import { Client } from "./ashby/client.js";
import {
  compareCompensationDescription,
  compareCompensationSchema,
  runCompareCompensation,
  type CompareCompensationArgs,
} from "./tools/compareCompensation.js";
import { getJobDescription, getJobSchema, runGetJob, type GetJobArgs } from "./tools/getJob.js";
import {
  listFilterValuesDescription,
  listFilterValuesSchema,
  runListFilterValues,
  type ListFilterValuesArgs,
} from "./tools/listFilterValues.js";
import {
  resolveBoardDescription,
  resolveBoardSchema,
  runResolveBoard,
  type ResolveBoardArgs,
} from "./tools/resolveBoard.js";
import {
  runSearchJobs,
  searchJobsDescription,
  searchJobsSchema,
  type SearchJobsArgs,
} from "./tools/searchJobs.js";
import {
  compareCompensationOutputShape,
  getJobOutputShape,
  listFilterValuesOutputShape,
  resolveBoardOutputShape,
  searchJobsOutputShape,
} from "./tools/schemas.js";
import { PACKAGE_NAME, VERSION } from "./version.js";

/** This server only reads. It writes nowhere and contributes nothing back. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const INSTRUCTIONS =
  "Tools for the public job boards companies publish through Ashby. No API key and no account are needed. " +
  "Ashby holds one board per company and offers no search across them, so every question starts with a company: " +
  "search_jobs takes company names and turns each one into a board token itself, so it needs no preparation. " +
  "A board token is not always derivable from the name, and elevenlabs answers where eleven-labs returns 404, so nothing found is never proof that a company is absent from Ashby. " +
  "Four answers are different and are never merged: a token that does not exist, a board that publishes nothing, a posting that declares nothing about a field, and a read that failed. " +
  "A fifth of the postings record no workplace at all, so filtering on remote work drops them, and the undeclared count says how many. " +
  "A third of the postings belong to companies that withhold their pay ranges: that is null, never zero, and never a salary the company failed to offer. " +
  "Amounts are reported in the currency and the period they were published in, and are never converted, annualised, summed across components or averaged. " +
  "Filtering by department, team or country uses each board's own wording, which list_filter_values publishes with the count of postings behind each. " +
  "A search returns rows without the advert text, because one board runs to megabytes: read one posting with get_job. " +
  "Every posting carries the address of its Ashby page. Credit the company and link that page when you show a posting.";

export function createServer(options: ClientOptions = {}): McpServer {
  const client = new Client(options);

  const server = new McpServer(
    { name: PACKAGE_NAME, version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "resolve_board",
    {
      title: "Resolve company names to Ashby boards",
      description: resolveBoardDescription,
      inputSchema: resolveBoardSchema,
      outputSchema: z.object(resolveBoardOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runResolveBoard(client, args as ResolveBoardArgs),
  );

  server.registerTool(
    "search_jobs",
    {
      title: "Search postings at named companies",
      description: searchJobsDescription,
      inputSchema: searchJobsSchema,
      outputSchema: z.object(searchJobsOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runSearchJobs(client, args as SearchJobsArgs),
  );

  server.registerTool(
    "get_job",
    {
      title: "Read one posting",
      description: getJobDescription,
      inputSchema: getJobSchema,
      outputSchema: z.object(getJobOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runGetJob(client, args as GetJobArgs),
  );

  server.registerTool(
    "list_filter_values",
    {
      title: "List a board's filter wordings",
      description: listFilterValuesDescription,
      inputSchema: listFilterValuesSchema,
      outputSchema: z.object(listFilterValuesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runListFilterValues(client, args as ListFilterValuesArgs),
  );

  server.registerTool(
    "compare_compensation",
    {
      title: "Compare published pay on one board",
      description: compareCompensationDescription,
      inputSchema: compareCompensationSchema,
      outputSchema: z.object(compareCompensationOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runCompareCompensation(client, args as CompareCompensationArgs),
  );

  return server;
}
