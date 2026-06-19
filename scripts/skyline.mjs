// Renders a year of GitHub contributions as a bespoke 3D isometric city.
// Each day is a coral tower; height = that day's commits. The skyline
// assembles itself tower by tower (back to front). Pulls real data via
// GraphQL (GITHUB_TOKEN). Output: a single self-contained dark SVG.
import { writeFileSync, mkdirSync } from 'node:fs';

const login = process.env.LOGIN || 'ndresca';
const token = process.env.GH_TOKEN;
if (!token) { console.error('Missing GH_TOKEN'); process.exit(1); }

const query = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ contributionCount date } }
      }
    }
  }
}`;

const resp = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'skyline' },
  body: JSON.stringify({ query, variables: { login } }),
});
const j = await resp.json();
if (j.errors || !j.data?.user) { console.error('GraphQL error:', JSON.stringify(j.errors || j, null, 2)); process.exit(1); }
const cal = j.data.user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks;
const total = cal.totalContributions;

let maxCount = 1;
const counts = [];
weeks.forEach((wk) => wk.contributionDays.forEach((d) => {
  if (d.contributionCount > maxCount) maxCount = d.contributionCount;
  if (d.contributionCount > 0) counts.push(d.contributionCount);
}));
counts.sort((a, b) => a - b);
// 90th-percentile reference so a single outlier day doesn't flatten the skyline
const REF = counts.length ? Math.max(8, counts[Math.floor(counts.length * 0.9)]) : 10;

const TW = 11, TH = 5.5, ORX = 104, ORY = 116, MAXH = 64;
const W = 712, H = 480;

// [top, left, right] face shades per intensity level (coral, brighter = busier)
const RAMP = [
  ['#1b1b22', '#15151b', '#101015'], // empty ground tile
  ['#7a3a22', '#5e2c1a', '#481f12'],
  ['#b24a22', '#8a3a1b', '#682a13'],
  ['#ef5a2a', '#c4471f', '#933416'],
  ['#ff8c61', '#ef6a3d', '#c44f28'],
];
const level = (c) => (c <= 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 10 ? 3 : 4);
const height = (c) => (c <= 0 ? 3.5 : 4 + Math.min(Math.sqrt(c / REF), 1.14) * (MAXH - 4));

const towers = [];
weeks.forEach((wk, w) => {
  wk.contributionDays.forEach((day) => {
    const d = new Date(day.date + 'T00:00:00Z').getUTCDay();
    towers.push({ w, d, c: day.contributionCount });
  });
});
// painter's order: back (small w+d) to front
towers.sort((a, b) => (a.w + a.d) - (b.w + b.d) || a.w - b.w);

let body = '';
towers.forEach(({ w, d, c }) => {
  const lv = level(c), h = height(c);
  const [top, left, right] = RAMP[lv];
  const bx = ORX + (w - d) * TW;
  const by = ORY + (w + d) * TH;
  const ty = by - h;
  const topFace = `${bx},${(ty - TH).toFixed(1)} ${bx + TW},${ty.toFixed(1)} ${bx},${(ty + TH).toFixed(1)} ${bx - TW},${ty.toFixed(1)}`;
  const leftFace = `${bx - TW},${ty.toFixed(1)} ${bx},${(ty + TH).toFixed(1)} ${bx},${(by + TH).toFixed(1)} ${bx - TW},${by.toFixed(1)}`;
  const rightFace = `${bx},${(ty + TH).toFixed(1)} ${bx + TW},${ty.toFixed(1)} ${bx + TW},${by.toFixed(1)} ${bx},${(by + TH).toFixed(1)}`;
  const begin = (0.3 + (w + d) * 0.012).toFixed(3);
  body += `<g opacity="0"><animate attributeName="opacity" values="0;1" dur="0.45s" begin="${begin}s" fill="freeze"/><animateTransform attributeName="transform" type="translate" from="0 18" to="0 0" dur="0.5s" begin="${begin}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/><polygon points="${leftFace}" fill="${left}"/><polygon points="${rightFace}" fill="${right}"/><polygon points="${topFace}" fill="${top}"/></g>`;
});

const totalStr = total.toLocaleString('en-US');
const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${totalStr} contributions over the last year, rendered as a 3D city">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="#0B0B0E"/><stop offset="1" stop-color="#100E13"/></linearGradient>
    <radialGradient id="glow" cx="0.55" cy="0.74" r="0.5"><stop offset="0" stop-color="#FF5A36" stop-opacity="0.16"/><stop offset="1" stop-color="#FF5A36" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="#FFFFFF" fill-opacity="0.03"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#dots)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#glow)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="17" fill="none" stroke="#23232B" stroke-width="1.5"/>
  <text x="36" y="42" font-family="ui-monospace,'SF Mono',Menlo,monospace" font-size="16" font-weight="700" opacity="0"><tspan fill="#FF7A4F">${totalStr}</tspan><tspan fill="#8A8A93" font-weight="400"> contributions · the city I'm building</tspan><animate attributeName="opacity" values="0;1" dur="0.5s" begin="0.1s" fill="freeze"/></text>
  ${body}
</svg>`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/skyline.svg', svg);
console.log(`Wrote dist/skyline.svg — ${total} contributions, ${weeks.length} weeks, max/day ${maxCount}`);
