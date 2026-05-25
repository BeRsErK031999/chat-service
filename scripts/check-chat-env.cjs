const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

const readText = (relativePath) => {
  try {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  } catch {
    return '';
  }
};

const env = process.env;
const checks = [];

const addCheck = (level, label, detail) => {
  checks.push({ level, label, detail });
};

const hasValue = (name) => typeof env[name] === 'string' && env[name].trim().length > 0;
const envValue = (name) => (typeof env[name] === 'string' ? env[name].trim() : '');

const docsText = [
  readText('README.md'),
  readText('docs/operational-readiness.md'),
  readText('docs/developer-onboarding.md'),
  readText('docs/server-deploy.md'),
].join('\n');
const envSchemaText = readText('src/config/env.ts');
const corsText = readText('src/config/cors.ts');
const envExampleText = [readText('.env.example'), readText('.env.local.example')].join('\n');

for (const name of ['DATABASE_URL', 'CHAT_INTERNAL_AUTH_SECRET', 'CHAT_ALLOW_DEV_USER_ID']) {
  addCheck(
    envSchemaText.includes(name) ? 'OK' : 'FAIL',
    `${name} validated by server env schema`,
    'schema presence only; value is not printed',
  );
}

for (const name of ['CHAT_INTERNAL_AUTH_SECRET', 'CHAT_ALLOW_DEV_USER_ID', 'CORS_ALLOWED_ORIGINS']) {
  addCheck(
    envExampleText.includes(name) || docsText.includes(name) ? 'OK' : 'FAIL',
    `${name} documented for setup/smoke`,
    'documentation presence only; value is not printed',
  );
}

if (hasValue('VITE_CHAT_INTERNAL_AUTH_SECRET')) {
  addCheck(
    'FAIL',
    'VITE_CHAT_INTERNAL_AUTH_SECRET is absent',
    'renderer-prefixed chat signing secret must never be set',
  );
} else {
  addCheck('OK', 'VITE_CHAT_INTERNAL_AUTH_SECRET is absent', 'no renderer-prefixed secret detected');
}

if (hasValue('CHAT_INTERNAL_AUTH_SECRET')) {
  addCheck(
    envValue('CHAT_INTERNAL_AUTH_SECRET').length >= 32 ? 'OK' : 'FAIL',
    'CHAT_INTERNAL_AUTH_SECRET length',
    'secret is present and masked; only length policy was checked',
  );
} else {
  addCheck(
    'WARN',
    'CHAT_INTERNAL_AUTH_SECRET length',
    'not set in this shell; required for bearer staging smoke',
  );
}

const devUserEnabled = envValue('CHAT_ALLOW_DEV_USER_ID').toLowerCase() === 'true';
addCheck(
  devUserEnabled ? 'WARN' : 'OK',
  'CHAT_ALLOW_DEV_USER_ID guardrail',
  devUserEnabled
    ? 'enabled in this shell; local/dev only, keep false for staging/prod'
    : hasValue('CHAT_ALLOW_DEV_USER_ID')
      ? 'not enabled in this shell'
      : 'not set in this shell; production default is false',
);

const configuredOrigins = envValue('CORS_ALLOWED_ORIGINS') || envValue('CHAT_CORS_ALLOWED_ORIGINS');
if (configuredOrigins.length > 0) {
  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  addCheck(
    origins.length > 0 ? 'OK' : 'WARN',
    'CORS allowed origins configured',
    `${origins.length} origin(s) present; values are not printed`,
  );
  addCheck(
    origins.includes('*') ? 'FAIL' : 'OK',
    'CORS wildcard guardrail',
    'wildcard origins are not allowed for production-style chat',
  );
} else {
  addCheck(
    'WARN',
    'CORS allowed origins configured',
    'not set in this shell; staging/prod must configure explicit origins',
  );
}

addCheck(
  corsText.includes('access-control-allow-private-network') ? 'OK' : 'FAIL',
  'Private Network Access response support',
  'code path presence only; no network request was made',
);
addCheck(
  docsText.includes('Private Network Access') || docsText.includes('PNA')
    ? 'OK'
    : 'FAIL',
  'Private Network Access documented',
  'documentation presence only',
);

console.log('chat-service environment guardrails');
console.log('Values are masked: this command prints only safe statuses.\n');

for (const check of checks) {
  console.log(`[${check.level}] ${check.label} - ${check.detail}`);
}

const failures = checks.filter((check) => check.level === 'FAIL');
const warnings = checks.filter((check) => check.level === 'WARN');

console.log(`\nSummary: ${failures.length} failure(s), ${warnings.length} warning(s).`);

if (failures.length > 0) {
  process.exitCode = 1;
}
