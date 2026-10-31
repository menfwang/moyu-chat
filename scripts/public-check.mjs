const base = process.env.BASE_URL ?? 'http://127.0.0.1:8787';

const home = await fetch(`${base}/`, { signal: AbortSignal.timeout(30_000) });
const html = await home.text();
console.log('home:', home.status, 'csp:', Boolean(home.headers.get('content-security-policy')));
const script = html.match(/src="([^"]+\.js)"/)?.[1];
console.log('script:', script);
if (script) {
  const asset = await fetch(`${base}${script}`, { signal: AbortSignal.timeout(30_000) });
  console.log('asset:', asset.status, (await asset.text()).length, 'chars');
}
const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(30_000) });
console.log('health:', health.status, await health.text());
