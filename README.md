# mcp-sciencebase

USGS ScienceBase catalog MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_items` | Search the USGS ScienceBase catalog (sciencebase.gov) — the U.S. Geological Survey's scientific data catalog of datasets, publications, and projects, with summaries, categories, dates, and direct download links. Keyless. |
| `get_item` | Get a single ScienceBase catalog item by id — full summary, categories, types, dates, contacts, web links, and attached files (download URLs). e.g. id "58f8be37e4b0b7ea5452260e". Keyless. |
| `item_children` | List the child items of a ScienceBase catalog item. The catalog is hierarchical — collections and folders contain sub-items (use get_item to check has_children). Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "sciencebase": {
      "url": "https://gateway.pipeworx.io/sciencebase/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Sciencebase data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
