import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function writeNotices() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const sections = ['CheckYourProcess — third-party runtime notices', 'The following dependencies retain their respective licenses.'];
  for (const [directory, entry] of Object.entries(lock.packages)) {
    if (!directory || entry.dev || entry.optional) continue;
    const path = join(root, directory);
    const info = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    const files = (await readdir(path)).filter(name => /^(license|copying)(\.|$)/i.test(name));
    sections.push(`\n${'='.repeat(72)}\n${info.name}@${info.version}\nLicense: ${info.license || entry.license || 'See package source'}\n`);
    for (const file of files) sections.push(await readFile(join(path, file), 'utf8'));
    if (!files.length) sections.push(`Source: ${typeof info.repository === 'string' ? info.repository : info.repository?.url || info.homepage || 'https://www.npmjs.com/package/' + info.name}`);
  }
  await writeFile(join(root, 'dist/THIRD_PARTY_NOTICES.txt'), sections.join('\n'));
}
