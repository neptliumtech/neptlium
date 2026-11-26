import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const retired = [
  "apps/app/lib/auth/customer-auth-mode.ts",
  "apps/app/lib/auth/identity-link.ts",
  "apps/app/lib/auth/preview-clerk-api-session.ts",
  "apps/app/lib/auth/clerk-principal-gate.ts",
  "apps/app/lib/clerk-cutover.ts",
  "apps/api/src/clerk-token-boundary.ts",
  "apps/api/src/clerk-preview-middleware.ts",
  "apps/api/src/clerk-preview-identity.ts",
  "apps/api/src/clerk-jwt-verifier.ts",
  "apps/app/test/clerk-cutover.test.mjs",
  "apps/app/test/clerk-cutover-readiness.test.mjs",
  "apps/app/test/clerk-cutover-security-gates.test.mjs",
  "apps/app/test/clerk-principal-gate-contract.test.mjs",
  "apps/app/test/preview-clerk-api-session.test.mjs",
  "apps/app/test/identity-link.test.mjs",
  "apps/app/test/customer-auth-mode.test.mjs",
  "apps/api/test/clerk-jwt-verifier.test.mjs",
  "apps/api/test/clerk-token-boundary.test.mjs",
  "apps/api/test/clerk-preview-identity.test.mjs",
  "apps/api/test/clerk-preview-middleware.test.mjs"
];
for (const path of retired) assert.equal(existsSync(resolve(root,path)), false, 'Retired authentication path: ' + path);
for (const path of ['apps/app/package.json','apps/api/package.json','package.json']) {
  const pkg = JSON.parse(read(path));
  for (const name of Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies,...pkg.peerDependencies})) {
    assert.doesNotMatch(name, /^@clerk\//);
  }
}
assert.match(read('apps/app/app/auth/sign-in/page.tsx'), /SupabaseAuthForm/);
assert.match(read('apps/app/app/auth/sign-up/page.tsx'), /SupabaseAuthForm/);
assert.match(read('apps/app/proxy.ts'), /refreshSupabaseSession/);
assert.match(read('apps/api/src/authentication.ts'), /resolveActivePrincipal\('SUPABASE_AUTH', subject\)/);
assert.match(read('apps/api/src/identity-principal.ts'), /provider !== 'SUPABASE_AUTH'/);
console.log('Supabase-only authentication source contract: PASS (static checks only)');
