#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { addIconToProject, getIconSvg, listIcons, searchIcons } from './lucide.js';
import packageJson from '../package.json' with { type: 'json' };

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const server = new McpServer({
  name: 'lucide-mcp',
  version: packageJson.version,
});

server.registerTool(
  'lucide_list_icons',
  {
    description: 'List all available Lucide icon names.',
    inputSchema: z.object({
      limit: z.number().int().positive().max(2000).optional().describe('Maximum number of icon names to return.'),
      offset: z.number().int().min(0).optional().describe('Number of icon names to skip.'),
    }),
  },
  async ({ limit = 2000, offset = 0 }) => {
    const icons = await listIcons();
    const names = icons.slice(offset, offset + limit);

    return {
      content: [{ type: 'text', text: jsonText({ total: icons.length, offset, limit, icons: names }) }],
    };
  },
);

server.registerTool(
  'lucide_search_icons',
  {
    description: 'Search Lucide icons by name using exact, partial, and fuzzy matching.',
    inputSchema: z.object({
      query: z.string().describe('Icon search query, for example "sidebar", "settings", or "arrow left".'),
      limit: z.number().int().positive().max(50).optional().describe('Maximum number of matches to return.'),
    }),
  },
  async ({ query, limit = 10 }) => {
    const icons = await searchIcons(query, limit);

    return {
      content: [{ type: 'text', text: jsonText({ query, icons }) }],
    };
  },
);

server.registerTool(
  'lucide_get_icon_svg',
  {
    description: 'Get the raw SVG markup for a Lucide icon by name.',
    inputSchema: z.object({
      name: z.string().describe('Lucide icon name, for example "search", "panel-left", or "chevron-right".'),
    }),
  },
  async ({ name }) => {
    try {
      const icon = await getIconSvg(name);

      return {
        content: [{ type: 'text', text: icon.svg }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      };
    }
  },
);

server.registerTool(
  'lucide_add_icon_to_project',
  {
    description: 'Add a Lucide SVG icon file to the current project.',
    inputSchema: z.object({
      name: z.string().describe('Lucide icon name, for example "search", "panel-left", or "chevron-right".'),
      outputDir: z.string().optional().describe('Output directory relative to the MCP server working directory. Defaults to assets/icons.'),
      filename: z.string().optional().describe('Optional output filename. Defaults to the icon name with .svg.'),
    }),
  },
  async ({ name, outputDir, filename }) => {
    try {
      const result = await addIconToProject({ name, outputDir, filename });

      return {
        content: [
          {
            type: 'text',
            text: jsonText({ name: result.name, path: result.path }),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
