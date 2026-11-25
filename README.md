# Print Pronto Data

Open US price data for custom stickers and labels (edition: November 2026), published as files and as a read-only MCP server.

The data is the Print Pronto US Sticker & Label Price Index: 197 jobs, each defined by product, size, finish and quantity. Prices are in US dollars for the whole job (not per piece). For each job the index gives the lowest listed price, a typical price, a fair range (low to high) and the highest listed price.

Source: https://printpronto.com/custom-sticker-pricing

## Live URLs

| URL | What it is |
|---|---|
| https://data.printpronto.com/ | Home page |
| https://data.printpronto.com/index.json | All rows as JSON, with edition, method, source and licence |
| https://data.printpronto.com/index.csv | The same data as CSV |
| https://data.printpronto.com/llms.txt | Short summary for AI assistants |
| https://data.printpronto.com/mcp | MCP server (Streamable HTTP, no sign-in, read-only) |
| https://data.printpronto.com/embed/code | Builds embed code for a small price-check widget |

Rate limit: 60 requests per minute per IP address (approximate).

## MCP tools

The server only returns jobs that are in the index. If an exact job is not listed it says so and returns the nearest listed jobs for the same product. It never estimates.

### `list_products`
Lists products, sizes, finishes and quantities in the index. No input.

```json
{"name": "list_products", "arguments": {}}
```

### `get_price_range`
Looks up one job.

```json
{"name": "get_price_range", "arguments": {"product": "Die-cut stickers", "size": "3 x 3", "finish": "gloss vinyl", "quantity": 500}}
```

Returns: lowest listed $163, typical $218, fair range $207 to $226, highest listed $284.

### `check_quote`
Compares a quote for the whole job with the index for the same job. The verdict is one of: below every listed price, below fair range, fair price, above fair range, above every listed price.

```json
{"name": "check_quote", "arguments": {"product": "Die-cut stickers", "size": "3 x 3", "finish": "gloss vinyl", "quantity": 500, "quote_usd": 250}}
```

Returns: above fair range.

## Add it in Claude

1. Open Settings > Connectors (on some plans: Plugins).
2. Choose Add custom connector.
3. Name: `Print Pronto Data`. URL: `https://data.printpronto.com/mcp`.
4. Leave sign-in blank. No account or key is needed.
5. Ask, for example: "What do 500 die-cut stickers cost in the US?"

## Other MCP clients

Any client that supports remote servers over Streamable HTTP can use the URL above, with no authentication. Example for clients that read a JSON config:

```json
{
  "mcpServers": {
    "print-pronto-data": {
      "type": "http",
      "url": "https://data.printpronto.com/mcp"
    }
  }
}
```

With Claude Code:

```
claude mcp add --transport http print-pronto-data https://data.printpronto.com/mcp
```

For clients that only speak stdio, use a bridge such as `npx mcp-remote https://data.printpronto.com/mcp`.

## Method

Prices are in US dollars for the whole job, for one product, size, finish and quantity. For each job the index shows the lowest listed price, the highest listed price, a typical price and a fair range (low to high). Only jobs in the index are returned; nothing is estimated. The full method is on the Price Index page: https://printpronto.com/custom-sticker-pricing

## Run it yourself

```
npm install -g wrangler
node build_data.mjs        # regenerates src/data.js from index.csv
wrangler dev               # local server on http://127.0.0.1:8787
node tests/test.mjs http://127.0.0.1:8787
```

`wrangler.toml` holds placeholders only. Add your own hostname, and optionally a D1 database (see `schema.sql`) to count widget loads by referring site.

## Licences

- Data (`index.csv`, `src/data.js`, and the live endpoints): CC BY 4.0, see `DATA_LICENSE`. Cite as: *Source: Print Pronto US Sticker & Label Price Index, November 2026. https://printpronto.com/custom-sticker-pricing*
- Code: MIT, see `LICENSE`.
