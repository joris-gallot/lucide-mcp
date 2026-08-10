# lucide-mcp

[![npm version](https://img.shields.io/npm/v/lucide-mcp.svg)](https://www.npmjs.com/package/lucide-mcp)
[![CI](https://github.com/joris-gallot/lucide-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/joris-gallot/lucide-mcp/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/lucide-mcp.svg)](./LICENSE)

MCP server for searching, retrieving, and adding [Lucide](https://lucide.dev) SVG icons from AI coding agents.

## Tools

- `search_icons` - search icons by exact, partial, and fuzzy name matching
- `get_icon_svg` - return raw SVG markup for an icon
- `add_icon_to_project` - write an SVG file into the current project
- `list_icons` - list available Lucide icon names

## Usage

```json
{
  "mcpServers": {
    "lucide": {
      "command": "npx",
      "args": ["lucide-mcp"]
    }
  }
}
```

With a local checkout:

```json
{
  "mcpServers": {
    "lucide": {
      "command": "node",
      "args": ["/path/to/lucide-mcp/dist/index.mjs"]
    }
  }
}
```

## Examples

Search for sidebar icons:

```txt
search_icons({ "query": "sidebar", "limit": 5 })
```

Get raw SVG:

```txt
get_icon_svg({ "name": "panel-left" })
```

Add an icon to a project:

```txt
add_icon_to_project({
  "name": "panel-left",
  "outputDir": "assets/icons",
  "overwrite": false
})
```

The default output directory is `assets/icons`. Existing files are not overwritten unless `overwrite` is set to `true`.

## Agent behavior

Agents can use this server when they need an icon for a UI feature and the project does not already contain a suitable SVG. A good workflow is:

1. Inspect existing project icons first.
2. Search Lucide with a semantic query.
3. Pick the best named icon.
4. Add it to the project's icon directory.
5. Use the SVG according to the project's conventions.

## Development

```sh
pnpm install
pnpm test
pnpm build
pnpm typecheck
```

Run locally:

```sh
pnpm dev
```

## License

MIT. Lucide icons are distributed by the Lucide project under the ISC license.
