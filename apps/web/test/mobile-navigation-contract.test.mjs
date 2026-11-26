import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const header = readFileSync(new URL('../components/site-header.tsx', import.meta.url), 'utf8');
const mobile = readFileSync(
  new URL('../components/mobile-navigation.tsx', import.meta.url),
  'utf8',
);
const footer = readFileSync(new URL('../components/site-footer.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('mobile navigation is portaled, modal, scroll-contained and focus-restoring', () => {
  assert.match(header, /import \{ createPortal \} from 'react-dom'/);
  assert.match(
    header,
    /mounted && mobileOpen[\s\S]*createPortal\([\s\S]*<MobileNavigation[\s\S]*document\.body/,
  );
  assert.match(mobile, /role="dialog"/);
  assert.match(mobile, /aria-modal="true"/);
  assert.match(mobile, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(mobile, /triggerRef\.current\?\.focus\(\)/);
  assert.match(mobile, /event\.target === event\.currentTarget/);
  assert.match(mobile, /aria-label="Back to main navigation"/);
});

test('desktop navigation supports hover, touch, keyboard dismissal and outside click', () => {
  assert.match(header, /onPointerEnter/);
  assert.match(header, /event\.pointerType === 'mouse'/);
  assert.match(header, /lastPointerType\.current !== 'touch'/);
  assert.match(header, /aria-expanded=\{openMenu === item\.label\}/);
  assert.match(header, /event\.key !== 'Escape'/);
  assert.match(header, /addEventListener\('pointerdown'/);
  assert.match(css, /\.command-nav-menu\[data-open='true'\]/);
});

test('mobile menu exposes canonical product discovery and commercial contact', () => {
  assert.match(mobile, /NAVIGATION\.map/);
  assert.match(mobile, /className="mobile-nav-grid"/);
  assert.match(mobile, /href=\{SITE\.personalSignInUrl\}>Sign in/);
  assert.match(mobile, /href=\{SITE\.personalSignUpUrl\}>Get started/);
  assert.match(mobile, /mobile-nav-back/);
  assert.match(mobile, /setActiveSection/);
  assert.match(mobile, /mobile-contact-action/);
  assert.match(mobile, /SITE\.businessAppUrl/);
  assert.match(footer, /\['Trust', '\/trust'\]/);
  assert.doesNotMatch(mobile, /Socials/);
  assert.doesNotMatch(mobile, /Open Neptlium Treasury/);
});

test('navigation preserves safe-area, viewport fallback, forced-colors and accessible targets', () => {
  assert.match(css, /--header-marketing:4\.75rem/);
  assert.match(css, /\.elite-header-entry\{min-height:3\.25rem/);
  assert.match(css, /\.elite-menu-trigger\{width:3\.25rem;height:3\.25rem/);
  assert.match(css, /var\(--color-accent-primary\)/);
  assert.match(css, /height:100vh;height:100dvh/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
