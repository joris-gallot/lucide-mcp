import Fuse from 'fuse.js';
import { createRequire } from 'node:module';
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

type IconTags = Record<string, string[]>;

type SearchableIcon = {
  name: string;
  parts: string[];
  tags: string[];
  aliases: string[];
  searchText: string;
};

export type IconSearchResult = {
  name: string;
  score?: number;
  tags?: string[];
};

export type SvgOptions = {
  stripLicense?: boolean;
  stripClass?: boolean;
  strokeWidth?: number;
};

export type IconMetadata = {
  name: string;
  exists: boolean;
  path?: string;
  parts?: string[];
  tags?: string[];
  aliases?: string[];
  suggestions?: IconSearchResult[];
};

const semanticAliases: Record<string, string[]> = {
  account: ['user', 'profile', 'person'],
  add: ['plus', 'create', 'new'],
  alert: ['warning', 'danger', 'error'],
  attachment: ['paperclip', 'file'],
  back: ['left', 'arrow-left', 'chevron-left'],
  calendar: ['date', 'event'],
  close: ['x', 'cancel', 'dismiss', 'remove'],
  copy: ['duplicate', 'clipboard'],
  delete: ['trash', 'remove'],
  done: ['check', 'success', 'complete'],
  download: ['save', 'export'],
  drag: ['grip', 'handle', 'move'],
  edit: ['pencil', 'write'],
  error: ['alert', 'warning', 'danger'],
  external: ['external-link', 'open', 'launch'],
  filter: ['funnel', 'sliders'],
  forward: ['right', 'arrow-right', 'chevron-right'],
  home: ['house', 'dashboard'],
  image: ['picture', 'photo'],
  info: ['information', 'help'],
  loading: ['loader', 'spinner'],
  menu: ['hamburger', 'navigation', 'bars'],
  more: ['ellipsis', 'dots'],
  next: ['right', 'arrow-right', 'chevron-right'],
  notification: ['bell', 'alert'],
  open: ['external-link', 'folder-open'],
  previous: ['left', 'arrow-left', 'chevron-left'],
  profile: ['user', 'account', 'person'],
  refresh: ['rotate', 'reload', 'sync'],
  remove: ['minus', 'delete', 'trash', 'x'],
  save: ['download', 'floppy'],
  search: ['find', 'magnifier'],
  send: ['mail', 'message', 'paper-airplane'],
  settings: ['gear', 'cog', 'preferences'],
  sidebar: ['panel', 'panel-left', 'drawer', 'navigation'],
  success: ['check', 'done', 'complete'],
  theme: ['sun', 'moon', 'palette'],
  upload: ['import', 'cloud-upload'],
  user: ['account', 'profile', 'person'],
  warning: ['alert', 'error', 'danger'],
};

let iconNamesCache: string[] | undefined;
let iconTagsCache: IconTags | undefined;
let searchableIconsCache: SearchableIcon[] | undefined;
let fuseCache: Fuse<SearchableIcon> | undefined;

export function normalizeIconName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeTerm(input: string): string {
  return normalizeIconName(input).replace(/-/g, ' ');
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map(normalizeTerm).filter(Boolean))];
}

function getPackageRoot(): string {
  const packageJsonPath = require.resolve('lucide-static/package.json');
  return path.dirname(packageJsonPath);
}

export function getIconsDir(): string {
  return path.join(getPackageRoot(), 'icons');
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

async function getIconTags(): Promise<IconTags> {
  if (iconTagsCache) {
    return iconTagsCache;
  }

  const tagsPath = path.join(getPackageRoot(), 'tags.json');
  iconTagsCache = JSON.parse(await readFile(tagsPath, 'utf8')) as IconTags;
  return iconTagsCache;
}

function getAliases(name: string, parts: string[], tags: string[]): string[] {
  const sourceTerms = uniqueTerms([name, ...parts, ...tags]);
  const aliases = sourceTerms.flatMap((term) => semanticAliases[term] ?? []);
  return uniqueTerms(aliases);
}

async function getSearchableIcons(): Promise<SearchableIcon[]> {
  if (searchableIconsCache) {
    return searchableIconsCache;
  }

  const [icons, tagsByIcon] = await Promise.all([listIcons(), getIconTags()]);
  searchableIconsCache = icons.map((name) => {
    const parts = uniqueTerms(name.split('-'));
    const tags = uniqueTerms(tagsByIcon[name] ?? []);
    const aliases = getAliases(name, parts, tags);
    const searchText = uniqueTerms([name, ...parts, ...tags, ...aliases]).join(' ');

    return { name, parts, tags, aliases, searchText };
  });

  return searchableIconsCache;
}

async function getFuse(): Promise<Fuse<SearchableIcon>> {
  if (fuseCache) {
    return fuseCache;
  }

  fuseCache = new Fuse(await getSearchableIcons(), {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: [
      { name: 'name', weight: 0.55 },
      { name: 'parts', weight: 0.2 },
      { name: 'tags', weight: 0.2 },
      { name: 'aliases', weight: 0.05 },
    ],
  });

  return fuseCache;
}

function expandQuery(query: string): string[] {
  const terms = uniqueTerms([query, ...normalizeIconName(query).split('-')]);
  const aliases = terms.flatMap((term) => semanticAliases[term] ?? []);
  return uniqueTerms([...terms, ...aliases]);
}

export async function getIconMetadata(name: string): Promise<IconMetadata> {
  const normalizedName = normalizeIconName(name);
  const searchableIcons = await getSearchableIcons();
  const icon = searchableIcons.find((item) => item.name === normalizedName);

  if (!icon) {
    return {
      name: normalizedName,
      exists: false,
      suggestions: await searchIcons(name, 5),
    };
  }

  return {
    name: icon.name,
    exists: true,
    path: path.join(getIconsDir(), `${icon.name}.svg`),
    parts: icon.parts,
    tags: icon.tags,
    aliases: icon.aliases,
  };
}

export async function searchIcons(query: string, limit = 10): Promise<IconSearchResult[]> {
  const normalizedQuery = normalizeIconName(query);
  const searchableIcons = await getSearchableIcons();

  if (!normalizedQuery) {
    return searchableIcons.slice(0, limit).map((icon) => ({ name: icon.name, tags: icon.tags }));
  }

  const expandedSearchTerms = expandQuery(query);
  const expandedNameTerms = expandedSearchTerms.map(normalizeIconName);
  const getNameMatchScore = (name: string): number => {
    if (name === normalizedQuery) {
      return 0;
    }

    if (name.includes(normalizedQuery)) {
      return 1;
    }

    const aliasIndex = expandedNameTerms.findIndex((term) => term !== normalizedQuery && name === term);
    if (aliasIndex >= 0) {
      return 2 + aliasIndex / 100;
    }

    const partialAliasIndex = expandedNameTerms.findIndex((term) => term !== normalizedQuery && name.includes(term));
    if (partialAliasIndex >= 0) {
      return 3 + partialAliasIndex / 100;
    }

    return Number.POSITIVE_INFINITY;
  };

  const exactMatches = searchableIcons
    .map((icon) => ({ icon, matchScore: getNameMatchScore(icon.name) }))
    .filter((match) => Number.isFinite(match.matchScore))
    .sort((a, b) => a.matchScore - b.matchScore || a.icon.name.localeCompare(b.icon.name))
    .slice(0, limit)
    .map(({ icon, matchScore }) => ({ name: icon.name, score: matchScore === 0 ? 0 : matchScore / 1000, tags: icon.tags }));

  if (exactMatches.length >= limit) {
    return exactMatches;
  }

  const fuse = await getFuse();
  const fuzzyMatchesByName = new Map<string, IconSearchResult>();

  for (const [index, term] of expandedSearchTerms.entries()) {
    for (const result of fuse.search(term, { limit })) {
      if (exactMatches.some((match) => match.name === result.item.name)) {
        continue;
      }

      const score = (result.score ?? 0) + index * 0.02;
      const previous = fuzzyMatchesByName.get(result.item.name);

      if (!previous || score < (previous.score ?? Number.POSITIVE_INFINITY)) {
        fuzzyMatchesByName.set(result.item.name, { name: result.item.name, score, tags: result.item.tags });
      }
    }
  }

  const fuzzyMatches = [...fuzzyMatchesByName.values()].sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.name.localeCompare(b.name));

  return [...exactMatches, ...fuzzyMatches].slice(0, limit);
}

function applySvgOptions(svg: string, options: SvgOptions = {}): string {
  let output = svg;

  if (options.stripLicense) {
    output = output.replace(/^<!-- @license[\s\S]*?-->\n?/, '');
  }

  if (options.stripClass) {
    output = output.replace(/\s+class="lucide[^"]*"/, '');
  }

  if (options.strokeWidth !== undefined) {
    output = output.replace(/stroke-width="[^"]*"/, `stroke-width="${options.strokeWidth}"`);
  }

  return output;
}

export async function getIconSvg(name: string, options: SvgOptions = {}): Promise<{ name: string; svg: string }> {
  const normalizedName = normalizeIconName(name);
  const icons = await listIcons();

  if (!icons.includes(normalizedName)) {
    const suggestions = await searchIcons(name, 5);
    const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.map((icon) => icon.name).join(', ')}?` : '';
    throw new Error(`Lucide icon not found: ${name}.${suffix}`);
  }

  const svg = await readFile(path.join(getIconsDir(), `${normalizedName}.svg`), 'utf8');
  return { name: normalizedName, svg: applySvgOptions(svg, options) };
}

export async function addIconToProject(input: {
  name: string;
  outputDir?: string;
  filename?: string;
  cwd?: string;
  overwrite?: boolean;
  stripLicense?: boolean;
  stripClass?: boolean;
  strokeWidth?: number;
}): Promise<{ name: string; path: string; svg: string }> {
  const { name, svg } = await getIconSvg(input.name, {
    stripLicense: input.stripLicense,
    stripClass: input.stripClass,
    strokeWidth: input.strokeWidth,
  });
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
  const outputDir = input.outputDir ? path.resolve(cwd, input.outputDir) : path.resolve(cwd, 'assets/icons');
  const filename = input.filename ? input.filename : `${name}.svg`;
  const filePath = path.resolve(outputDir, filename.endsWith('.svg') ? filename : `${filename}.svg`);

  await mkdir(path.dirname(filePath), { recursive: true });

  if (!input.overwrite) {
    try {
      await access(filePath, constants.F_OK);
      throw new Error(`File already exists: ${path.relative(cwd, filePath)}. Pass overwrite: true to replace it.`);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await writeFile(filePath, svg, 'utf8');
        return { name, path: path.relative(cwd, filePath), svg };
      }

      throw error;
    }
  }

  await writeFile(filePath, svg, 'utf8');

  return { name, path: path.relative(cwd, filePath), svg };
}
