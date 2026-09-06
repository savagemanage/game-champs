#!/usr/bin/env node
/**
 * Generate the root landing page from the per-package `game.json` files.
 *
 *   node site/build.mjs [--out <dir>]
 *
 * Reads `site/index.template.html`, renders one card per game found under
 * `packages/*(/)game.json`, and writes `<out>/index.html` (default `_site/`).
 * Games with `status: "archived"` are left out entirely; `wip` games are listed
 * with a badge. Thumbnails, where a package declares one, are copied to
 * `<out>/thumbs/<slug><ext>`; packages without one get a generated monogram
 * placeholder.
 *
 * Adding a game never requires touching this script or the template.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadListedGames, repoRoot } from '../scripts/lib/games.mjs';

const siteDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(siteDir, 'index.template.html');
const CARDS_MARKER = '<!-- @cards -->';

function parseArgs(argv) {
  let out = '_site';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      out = argv[i + 1];
      i += 1;
      if (!out) throw new Error('--out needs a directory argument');
    }
  }
  return { outDir: resolve(repoRoot, out) };
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Stable per-slug hue so each placeholder tile gets its own colour. */
function hueFor(slug) {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/** "Arena Champions" -> "AC"; "Wirework" -> "WI". */
function monogram(title) {
  const words = title.split(/[\s:/-]+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [title.slice(0, 2)];
  return letters.join('').toUpperCase();
}

function renderThumb(game, outDir) {
  const hue = hueFor(game.slug);
  if (!game.thumbnail) {
    return `<span class="thumb" style="--hue: ${hue}" aria-hidden="true">${escapeHtml(
      monogram(game.title),
    )}</span>`;
  }
  const ext = extname(game.thumbnail) || '.png';
  const rel = `thumbs/${game.slug}${ext}`;
  mkdirSync(join(outDir, 'thumbs'), { recursive: true });
  copyFileSync(join(game.packageDir, game.thumbnail), join(outDir, rel));
  return `<img class="thumb" src="${escapeHtml(rel)}" alt="" width="72" height="72" loading="lazy" />`;
}

function renderCard(game, outDir) {
  const badge =
    game.status === 'wip' ? '\n            <span class="badge">work in progress</span>' : '';
  const titleKo = game.titleKo
    ? `\n            <span class="name-ko" lang="ko">${escapeHtml(game.titleKo)}</span>`
    : '';
  const summary = game.summaryKo
    ? `${escapeHtml(game.summary)}<br /><span lang="ko">${escapeHtml(game.summaryKo)}</span>`
    : escapeHtml(game.summary);

  // Links are relative so the page works at any base path (the project Pages
  // subpath, a user site, or a local preview) without being regenerated.
  return `      <li>
        <a class="game" href="./${escapeHtml(game.slug)}/">
          ${renderThumb(game, outDir)}
          <span class="body">
            <span class="title-row">
              <span class="name">${escapeHtml(game.title)}</span>${badge}
            </span>${titleKo}
            <span class="genre">${escapeHtml(game.genre)}</span>
            <span class="summary">${summary}</span>
          </span>
        </a>
      </li>`;
}

function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  const games = loadListedGames();
  if (games.length === 0) {
    throw new Error('No listed games found under packages/*/game.json; refusing to build an empty landing page.');
  }

  const template = readFileSync(TEMPLATE, 'utf8');
  if (!template.includes(CARDS_MARKER)) {
    throw new Error(`site/index.template.html is missing the ${CARDS_MARKER} marker`);
  }

  const cards = games.map((game) => renderCard(game, outDir)).join('\n');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), template.replace(CARDS_MARKER, cards.trimStart()));

  const wip = games.filter((game) => game.status === 'wip').length;
  console.log(
    `[site] wrote ${join(outDir, 'index.html')} with ${games.length} game(s)` +
      (wip > 0 ? ` (${wip} marked work in progress)` : ''),
  );
}

main();
