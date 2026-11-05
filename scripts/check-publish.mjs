/**
 * Pre-publish guard for `npm publish` / `npm pack`.
 *
 * The manifest carries two placeholders that must be replaced when the package
 * moves into its public repository. Publishing them literally would ship a
 * package whose repository, author, and issue tracker point nowhere, and the
 * registry would keep that version forever — so the check fails the pack
 * instead of leaving it to review.
 *
 * @module dsh-deepseek-status-pill/scripts/check-publish
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

/** Fields that must be filled in before a public publish. */
const placeholders = [];
for (const [name, value] of Object.entries({ author: manifest.author, repository: manifest.repository?.url, homepage: manifest.homepage, bugs: manifest.bugs?.url })) {
  if (typeof value !== 'string' || value.includes('<github-owner>')) placeholders.push(name);
}
try {
  const license = await readFile(join(root, 'LICENSE'), 'utf8');
  if (license.includes('<github-owner>')) placeholders.push('LICENSE');
} catch {
  placeholders.push('LICENSE');
}

/** Files the published tarball and the bundle loader both need. */
const required = ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE', 'locale/zh.json', 'locale/en.json'];
const missing = [];
for (const relative of required) {
  try {
    await readFile(join(root, relative));
  } catch {
    missing.push(relative);
  }
}

if (missing.length > 0) {
  console.error(`[check-publish] missing required files: ${missing.join(', ')}`);
}
if (placeholders.length > 0) {
  console.error(
    `[check-publish] replace the <github-owner> placeholder in ${placeholders.join(', ')} before publishing (see PUBLISHING.md)`,
  );
}
if (missing.length > 0 || placeholders.length > 0) process.exit(1);
console.log(`[check-publish] ok: ${manifest.name}@${manifest.version}`);
