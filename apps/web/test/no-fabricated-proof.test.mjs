import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const infrastructure = readFileSync(new URL('../app/infrastructure/page.tsx', import.meta.url), 'utf8');
const productPages = readFileSync(new URL('../components/business-product-pages.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const capital = readFileSync(new URL('../app/capital/page.tsx', import.meta.url), 'utf8');

test('homepage credibility is architectural rather than synthetic scale proof', () => {
  assert.match(page, /Capital, intelligently managed\./);
  assert.match(page, /Illustrative model/);
  assert.match(page, /does not represent a live payment, settlement or customer account/);
  assert.match(page, /planned|verified product state|not a claim/i);
  assert.doesNotMatch(
    page,
    /\b[0-9]+ institutions\b|\b[0-9]+ countries\b|\b99\.9+%\b|\$[0-9]+[BMK]|\bAUM\b|guaranteed return/i,
  );
});


test('payment and treasury illustrations disclose their non-live status', () => {
  assert.match(infrastructure, /does not collect payments or perform settlement/);
  assert.match(productPages, /Illustrative treasury concepts only/);
  assert.match(productPages, /Illustrative payment workflow only/);
  assert.match(capital, /Capital overview · illustrative/);
  assert.match(productPages, /public Pay surface does not collect or settle payments/);
  assert.doesNotMatch(productPages, /Northstar Services/);
});


test('organization metadata does not publish unverified social destinations', () => {
  assert.doesNotMatch(layout, /sameAs|socialDestinations/);
});
