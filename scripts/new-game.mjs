#!/usr/bin/env node
/**
 * Scaffold a new game workspace from `packages/_template`.
 *
 *   npm run new-game -- --slug foo --title "Foo Quest"
 *
 * Copies the template to `packages/<slug>`, substitutes the `__slug__` and
 * `__title__` placeholders in every file, and regenerates the README tables.
 * Nothing else in the repo needs editing: the landing page, the README, and the
 * Pages workflow all discover the new workspace through its `game.json`.
 */
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { packagesDir } from './lib/games.mjs';

const TEMPLATE_DIR = join(packagesDir, '_template');
/** Slugs must be usable as a directory, a URL subpath, and an npm name suffix. */
const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

function usage(message) {
  console.error(
    `${message}\n\n` +
      'Usage: npm run new-game -- --slug <slug> --title "<Title>"\n\n' +
      '  --slug   lowercase directory / URL name, e.g. "foo" or "foo-quest"\n' +
      '  --title  human-readable English title, e.g. "Foo Quest"\n',
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--slug' || flag === '--title') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) usage(`${flag} needs a value.`);
      args[flag.slice(2)] = value;
      i += 1;
    } else {
      usage(`Unknown argument: ${flag}`);
    }
  }
  if (!args.slug) usage('--slug is required.');
  if (!args.title) usage('--title is required.');
  if (!SLUG_PATTERN.test(args.slug)) {
    usage(`Invalid --slug "${args.slug}": use 3-32 lowercase letters, digits and hyphens, starting with a letter.`);
  }
  return args;
}

/** Walk a directory tree, yielding every file path. */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function substitute(dir, { slug, title }) {
  for (const path of walk(dir)) {
    const original = readFileSync(path, 'utf8');
    const replaced = original.split('__slug__').join(slug).split('__title__').join(title);
    if (replaced !== original) writeFileSync(path, replaced);
  }
}

function main() {
  const { slug, title } = parseArgs(process.argv.slice(2));

  if (!existsSync(TEMPLATE_DIR) || !statSync(TEMPLATE_DIR).isDirectory()) {
    throw new Error(`Template not found at ${TEMPLATE_DIR}`);
  }
  const target = join(packagesDir, slug);
  if (existsSync(target)) {
    console.error(`packages/${slug} already exists; pick a different --slug or remove it first.`);
    process.exit(1);
  }

  cpSync(TEMPLATE_DIR, target, { recursive: true });
  substitute(target, { slug, title });

  console.log(`[new-game] created packages/${slug} ("${title}")

Next:
  1. Fill in packages/${slug}/game.json (genre, summary, Korean strings).
  2. npm install
  3. npm run typecheck && npm run test && npm run build
  4. npm run docs:readme   # refresh the root README tables

See CONTRIBUTING.md for the full checklist.`);
}

main();
