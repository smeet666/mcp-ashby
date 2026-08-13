# mcp-ashby

**What it is.** An MCP server for the public job boards companies publish
through Ashby. No API key, no account, read-only.

**Install.** `npx mcp-ashby`

**Tools.** `resolve_board`, `search_jobs`, `get_job`, `list_filter_values`,
`compare_compensation`.

**Why it exists.** Ashby hosts one board per company and publishes no index
across them, so a job search there starts with a company name. This server turns
a name into the token that addresses its board, reads the postings of the
companies you name, compares the pay they publish without converting between
currencies, and says plainly what it could not find: a token that names nothing,
a board publishing nothing, and a failed read are three different answers.

**Repository.** https://github.com/smeet666/mcp-ashby
