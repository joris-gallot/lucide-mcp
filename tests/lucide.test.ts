import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addIconToProject, getIconSvg, normalizeIconName, searchIcons } from '../src/lucide.ts';

describe('lucide icons', () => {
  it('normalizes icon names', () => {
    expect(normalizeIconName(' Panel Left ')).toBe('panel-left');
    expect(normalizeIconName('arrow_left')).toBe('arrow-left');
  });

  it('searches icons using semantic aliases', async () => {
    const sidebarResults = await searchIcons('sidebar', 8);
    expect(sidebarResults.some((icon) => icon.name === 'panel-left')).toBe(true);

    const settingsResults = await searchIcons('settings', 8);
    expect(settingsResults.some((icon) => icon.name === 'cog')).toBe(true);
  });

  it('gets raw SVG markup', async () => {
    const { name, svg } = await getIconSvg('panel-left');

    expect(name).toBe('panel-left');
    expect(svg).toContain('<svg');
    expect(svg).toContain('lucide-panel-left');
  });

  it('cleans SVG markup when requested', async () => {
    const { svg } = await getIconSvg('panel-left', {
      stripLicense: true,
      stripClass: true,
      strokeWidth: 1.5,
    });

    expect(svg).not.toContain('@license');
    expect(svg).not.toContain('class="lucide');
    expect(svg).toContain('stroke-width="1.5"');
  });

  it('suggests icons for unknown names', async () => {
    await expect(getIconSvg('panel-left-missing')).rejects.toThrow(/Did you mean:/);
  });

  it('adds icons without overwriting by default', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'lucide-mcp-'));

    try {
      const first = await addIconToProject({ name: 'search', cwd, stripLicense: true, stripClass: true });
      expect(first.path).toBe('assets/icons/search.svg');
      const svg = await readFile(path.join(cwd, first.path), 'utf8');
      expect(svg).toContain('<svg');
      expect(svg).not.toContain('@license');
      expect(svg).not.toContain('class="lucide');

      await expect(addIconToProject({ name: 'search', cwd })).rejects.toThrow(/File already exists/);

      const second = await addIconToProject({ name: 'search', cwd, overwrite: true });
      expect(second.path).toBe(first.path);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
