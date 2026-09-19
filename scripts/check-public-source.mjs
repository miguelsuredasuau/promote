import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Inspect only Git's publication set, including staged additions. Never print matches.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbiddenParts = new Set(['node_modules', '.local', 'scratchpad', 'out']);
const forbiddenNames = new Set(['.npmrc', '.netrc', '.pypirc', 'id_rsa', 'id_ed25519']);
const patterns = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32,}/i,
  new RegExp('cog' + '_[A-Za-z0-9]{20,}'),
  new RegExp('gh[pousr]' + '_[A-Za-z0-9]{20,}'),
  new RegExp('github' + '_pat_[A-Za-z0-9_]{20,}'),
  new RegExp('sk' + '-[A-Za-z0-9_-]{20,}'),
  new RegExp('AKIA' + '[A-Z0-9]{16}'),
  new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
  /(?:password|secret|token|api_key)\s*[=:]\s*["'][A-Za-z0-9+/=_-]{20,}["']/i,
];
const findings = [];
for (const file of files) {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (parts.some((p) => forbiddenParts.has(p)) || forbiddenNames.has(name) ||
      (name.startsWith('.env') && name !== '.env.example') ||
      /\.(?:pem|key|p12|pfx|sqlite(?:-.*)?|db(?:-.*)?)$/.test(name) || /^credentials(?:\.|$)/.test(name)) {
    findings.push(`${file}: excluded publication path`);
    continue;
  }
  // Scan index bytes: these are what the next commit will publish.
  const content = execFileSync('git', ['show', `:${file}`], { maxBuffer: 10 * 1024 * 1024 });
  if (patterns.some((pattern) => pattern.test(content.toString('utf8')))) {
    findings.push(`${file}: possible credential (value withheld)`);
  }
}
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const [name, version] of Object.entries(manifest[group] ?? {})) {
    if (/^(?:file:|link:|workspace:|\/|\.\.?\/)/.test(version)) findings.push(`${name}: non-independent dependency`);
  }
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}
console.log(`Public-source check passed (${files.length} tracked files). Pattern checks do not replace source review.`);
