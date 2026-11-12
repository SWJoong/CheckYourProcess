import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeNotices } from './notices.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/service.ts', 'src/cli.ts', 'src/stdio.ts', 'src/runtime.ts'],
  outdir: 'dist', bundle: true, platform: 'node', target: 'node22', format: 'esm', legalComments: 'external',
  banner: { js: "import { createRequire as __cypCreateRequire } from 'node:module'; const require = __cypCreateRequire(import.meta.url);" },
});
const result = await build({ absWorkingDir: root, entryPoints: ['src/ui/app.ts'], bundle: true, platform: 'browser', target: 'es2022', format: 'iife', write: false, minify: true });
const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text || result.outputFiles[0].text;
const [template, style] = await Promise.all([
  readFile(new URL('../src/ui/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui/style.css', import.meta.url), 'utf8'),
]);
const fontData = await Promise.all([['400', 'Galmuri11.woff2'], ['700', 'Galmuri11-Bold.woff2']].map(async ([weight, file]) => [weight, (await readFile(new URL(`../src/ui/fonts/${file}`, import.meta.url))).toString('base64')]));
const fontLicense = await readFile(new URL('../src/ui/fonts/LICENSE.txt', import.meta.url), 'utf8');
// Binary FontFace sources work without font URL requests inside MCP sandbox CSP.
const embeddedScript = `Promise.all(${JSON.stringify(fontData)}.map(([weight,data])=>{const face=new FontFace('Galmuri11',Uint8Array.from(atob(data),c=>c.charCodeAt(0)),{weight});document.fonts.add(face);return face.load();})).catch(()=>{}).then(()=>{${script}\n});`;
const html = template.replace('<!--APP_STYLE-->', () => `<style>/* Galmuri11 font license:\n${fontLicense.replaceAll('*/', '* /')}\n*/\n${style}</style>`).replace('<!--APP_SCRIPT-->', () => `<script>${embeddedScript.replaceAll('</script', '<\\/script')}</script>`);
await writeFile(new URL('../dist/progress.html', import.meta.url), html);
await writeFile(new URL('../dist/Galmuri-LICENSE.txt', import.meta.url), fontLicense);
await writeNotices();
process.stdout.write('Built local service, MCP transports, and embedded progress UI.\n');
