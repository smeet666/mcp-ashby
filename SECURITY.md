# Security policy

## Reporting

Report a vulnerability through
[GitHub security advisories](https://github.com/smeet666/mcp-ashby/security/advisories/new),
or by opening an issue when the matter is not sensitive. Expect an
acknowledgement within a week.

## What this server does

It reads one public Ashby host over HTTPS, `api.ashbyhq.com`, and nothing else.
Any other address is refused before a connection opens. It holds no credential,
writes nowhere, and stores nothing on disk.

`jobs.ashbyhq.com` disallows `/api/` in its robots.txt, and this server never
reads it. The `jobUrl` and `applyUrl` a posting carries are rendered as strings
so a caller can link the advert, and they never become a request.

## What reaches a model

Job adverts are written by the companies that publish them, so their text is
third-party content. Every line of it that this server renders is shifted when it
opens with `Note:` or `Source:`, so published text cannot pass for a line the
server wrote. A description asked for as HTML is the company's own markup,
carried as published and never executed here.

## Pacing

One request at a time, one second apart. Ashby publishes no crawl delay and no
quota header, so the floor is set by the weight of what is asked for: a board
runs to megabytes. Configuration widens that interval and never narrows it,
including through the published client entry point.
