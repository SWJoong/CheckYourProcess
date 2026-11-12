import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const release = join(root, 'release');
await mkdir(release, { recursive: true });
const stage = await mkdtemp(join(release, '.stage-'));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

// ZIP's standard deflate format keeps packaging portable without native dependencies.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Symlinks are not allowed in release packages: ${path}`);
  }
  return files.sort();
}
async function zip(directory, destination) {
  const chunks = [], records = [];
  let offset = 0;
  for (const path of await filesIn(directory)) {
    const filename = relative(directory, path).replaceAll('\\', '/');
    if (filename.startsWith('../') || filename.startsWith('/') || /(?:^|\/)(?:token|runtime\.json|.*\.sqlite.*|\.env(?:\..*)?)$/.test(filename)) throw new Error(`Unsafe release entry: ${filename}`);
    const name = Buffer.from(filename);
    const source = await readFile(path);
    const compressed = deflateRawSync(source);
    const crc = crc32(source);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(source.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    chunks.push(local, name, compressed); records.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = records.reduce((sum, buffer) => sum + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(records.length / 2, 8); end.writeUInt16LE(records.length / 2, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  await writeFile(destination, Buffer.concat([...chunks, ...records, end]));
}
async function copy(source, target) {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}
const runtimePackage = { name: 'checkyourprocess-runtime', version, private: true, type: 'module', engines: { node: '>=22.20.0' } };
for (const host of ['claude-code', 'codex', 'claude-desktop']) {
  const target = join(stage, host);
  await copy(join(root, 'integrations', host), target);
  await copy(join(root, 'dist'), join(target, 'dist'));
  for (const file of ['README.md', 'LICENSE']) await copy(join(root, file), join(target, file));
  await copy(join(root, 'docs'), join(target, 'docs'));
  await writeFile(join(target, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`);
  if (host !== 'claude-desktop') {
    await copy(join(root, 'integrations/shared/relay.mjs'), join(target, 'hooks/relay.mjs'));
    await copy(join(root, 'integrations/shared/track'), join(target, 'skills/track'));
  }
  const extension = host === 'claude-desktop' ? 'mcpb' : 'zip';
  const output = join(release, `checkyourprocess-${host}-${version}.${extension}`);
  await zip(target, output);
  process.stdout.write(`${relative(root, output)}\n`);
}

// A repo-local marketplace lets Codex/Claude Code install the same staged payloads.
const codexMarketplace = { name: 'checkyourprocess-local', interface: { displayName: 'CheckYourProcess local' }, plugins: [{ name: 'checkyourprocess', source: { source: 'local', path: `./${relative(release, join(stage, 'codex')).replaceAll('\\', '/')}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }] };
const claudeMarketplace = { name: 'checkyourprocess-local', owner: { name: 'CheckYourProcess' }, plugins: [{ name: 'checkyourprocess', source: `./${relative(release, join(stage, 'claude-code')).replaceAll('\\', '/')}`, description: 'Opt-in progress bands for parallel AI projects', version }] };
await writeFile(join(release, 'codex-marketplace.json'), `${JSON.stringify(codexMarketplace, null, 2)}\n`);
await writeFile(join(release, 'claude-marketplace.json'), `${JSON.stringify(claudeMarketplace, null, 2)}\n`);
process.stdout.write(`Staged packages: ${relative(root, stage)}\n`);
