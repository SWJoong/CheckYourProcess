import { ensureService, isHealthy, readRuntime, VERSION } from './runtime.js';

const command = process.argv[2] || 'start';
try {
  if (command === 'start') {
    const runtime = await ensureService();
    process.stdout.write(`CheckYourProcess ${VERSION} is running at ${runtime.url}.\nRun "node dist/cli.js preview" to open a local preview link.\n`);
  } else if (command === 'status') {
    const runtime = await readRuntime();
    const online = runtime && await isHealthy(runtime);
    process.stdout.write(online ? `CheckYourProcess ${VERSION}: running (${runtime!.url}).\n` : 'CheckYourProcess: stopped.\n');
    if (!online) process.exitCode = 1;
  } else if (command === 'stop') {
    const runtime = await readRuntime();
    if (!runtime || !await isHealthy(runtime)) process.stdout.write('CheckYourProcess is already stopped.\n');
    else {
      const response = await fetch(`${runtime.url}/api/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}` } });
      if (!response.ok) throw new Error('Could not stop the local service.');
      process.stdout.write('CheckYourProcess stopped.\n');
    }
  } else if (command === 'preview') {
    const runtime = await ensureService();
    const response = await fetch(`${runtime.url}/api/preview-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}` } });
    if (!response.ok) throw new Error('Could not create a preview link.');
    const body = await response.json() as { url: string };
    process.stdout.write(`${body.url}\n`);
  } else if (command === 'stdio') {
    await import('./stdio.js');
  } else {
    process.stdout.write('Usage: node dist/cli.js [start|stop|status|preview|stdio]\n');
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
}
