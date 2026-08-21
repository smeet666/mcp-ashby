import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { INSTRUCTIONS } from "../../src/server.js";
import { makeServer } from "./_harness.js";

interface PublishedTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

const expectedOrder = [
  "resolve_board",
  "search_jobs",
  "get_job",
  "list_filter_values",
  "compare_compensation",
];

let published: PublishedTool[] = [];

beforeAll(async () => {
  const created = makeServer() as {
    connect?: (transport: unknown) => Promise<void>;
    server?: { connect: (transport: unknown) => Promise<void> };
  };
  const connectable = (typeof created.connect === "function" ? created : created.server) as
    | { connect: (transport: unknown) => Promise<void> }
    | undefined;
  if (connectable === undefined) {
    throw new Error("the server exposes no way to connect a transport");
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await connectable.connect(serverTransport);

  const client = new McpClient({ name: "unit-tests", version: "0.0.0" });
  await client.connect(clientTransport);
  const listed = await client.listTools();
  published = listed.tools as unknown as PublishedTool[];
});

describe("the five tools a session sees", () => {
  it("registers five tools", () => {
    expect(published).toHaveLength(5);
  });

  it("registers them in a fixed order, which is what a client may cache", () => {
    expect(published.map((tool) => tool.name)).toEqual(expectedOrder);
  });

  it("gives each tool a description", () => {
    for (const tool of published) {
      expect(typeof tool.description).toBe("string");
      expect((tool.description ?? "").length).toBeGreaterThan(0);
    }
  });

  it("refuses an argument it does not publish, and announces that refusal", () => {
    for (const tool of published) {
      expect(tool.inputSchema?.additionalProperties).toBe(false);
    }
  });

  it("declares the shape of what each tool returns", () => {
    for (const tool of published) {
      expect(tool.outputSchema).toBeDefined();
      expect(tool.outputSchema?.type).toBe("object");
    }
  });

  it("names the companies argument as required on search_jobs", () => {
    const search = published.find((tool) => tool.name === "search_jobs");

    expect(search?.inputSchema?.required).toContain("companies");
  });
});

describe("the instructions a session reads first", () => {
  it("names the site the server reads", () => {
    expect(INSTRUCTIONS).toContain("Ashby");
  });

  it("says the caller has to name the companies, no index crossing the boards", () => {
    expect(INSTRUCTIONS.toLowerCase()).toContain("compan");
  });
});

/**
 * The low layer is published on its own as an ordinary library, which the SDK
 * reaching into it would break.
 */
describe("the seam between the protocol and the reading layer", () => {
  it("keeps the SDK out of every module under the reading layer", () => {
    const layer = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "ashby");
    const offenders: string[] = [];

    for (const entry of readdirSync(layer)) {
      if (!entry.endsWith(".ts")) {
        continue;
      }
      const source = readFileSync(join(layer, entry), "utf8");
      if (source.includes("@modelcontextprotocol/sdk")) {
        offenders.push(entry);
      }
    }

    expect(offenders).toEqual([]);
  });
});
