import Fuse from 'fuse.js';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

export type IconSearchResult = {
  name: string;
  score?: number;
};

let iconNamesCache: string[] | undefined;
let fuseCache: Fuse<string> | undefined;

export function normalizeIconName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getIconsDir(): string {
  const packageJsonPath = require.resolve('lucide-static/package.json');
  return path.join(path.dirname(packageJsonPath), 'icons');
}

export async function listIcons(): Promise<string[]> {
  if (iconNamesCache) {
    return iconNamesCache;
  }

  const files = await readdir(getIconsDir());
  iconNamesCache = files
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .sort((a, b) => a.localeCompare(b));

  return iconNamesCache;
}

async function getFuse(): Promise<Fuse<string>> {
  if (fuseCache) {
    return fuseCache;
  }

  fuseCache = new Fuse(await listIcons(), {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
  });

  return fuseCache;
}

export async function searchIcons(query: string, limit = 10): Promise<IconSearchResult[]> {
  const normalizedQuery = normalizeIconName(query);
  const icons = await listIcons();

  if (!normalizedQuery) {
    return icons.slice(0, limit).map((name) => ({ name }));
  }

  const exactMatches = icons
    .filter((name) => name === normalizedQuery || name.includes(normalizedQuery))
    .slice(0, limit)
    .map((name) => ({ name, score: name === normalizedQuery ? 0 : 0.001 }));

  if (exactMatches.length >= limit) {
    return exactMatches;
  }

  const fuse = await getFuse();
  const fuzzyMatches = fuse
    .search(normalizedQuery, { limit })
    .map((result) => ({ name: result.item, score: result.score }))
    .filter((result) => !exactMatches.some((match) => match.name === result.name));

  return [...exactMatches, ...fuzzyMatches].slice(0, limit);
}

export async function getIconSvg(name: string): Promise<{ name: string; svg: string }> {
  const normalizedName = normalizeIconName(name);
  const icons = await listIcons();

  if (!icons.includes(normalizedName)) {
    const suggestions = await searchIcons(name, 5);
    const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.map((icon) => icon.name).join(', ')}?` : '';
    throw new Error(`Lucide icon not found: ${name}.${suffix}`);
  }

  const svg = await readFile(path.join(getIconsDir(), `${normalizedName}.svg`), 'utf8');
  return { name: normalizedName, svg };
}

export async function addIconToProject(input: {
  name: string;
  outputDir?: string;
  filename?: string;
  cwd?: string;
}): Promise<{ name: string; path: string; svg: string }> {
  const { name, svg } = await getIconSvg(input.name);
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
  const outputDir = input.outputDir ? path.resolve(cwd, input.outputDir) : path.resolve(cwd, 'assets/icons');
  const filename = input.filename ? input.filename : `${name}.svg`;
  const filePath = path.resolve(outputDir, filename.endsWith('.svg') ? filename : `${filename}.svg`);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, svg, 'utf8');

  return { name, path: path.relative(cwd, filePath), svg };
}
