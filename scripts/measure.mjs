// Rough latency probe against the running demo: node scripts/measure.mjs [baseUrl]
// Signs in with the admin demo account from .env and times sequential requests to the main read endpoints.
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8101';
const password = /^SEED_ADMIN_PASSWORD=(.*)$/m.exec(readFileSync('.env', 'utf8'))?.[1]?.trim();
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@fieldline.test', password }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];

const endpoints = [
  '/api/requests?page=1&pageSize=25',
  '/api/requests?q=freezer&status=new,assigned,in_progress,on_hold&sort=-priority',
  '/api/customers?sort=-open',
  '/api/dashboard',
];
const runs = 60;
for (const path of endpoints) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    const res = await fetch(base + path, { headers: { cookie } });
    await res.arrayBuffer();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(1);
  console.log(`${path.padEnd(80)} p50 ${pct(0.5)} ms  p95 ${pct(0.95)} ms`);
}
