import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resumeSyntheticTask } from './checkpoint.mjs';

const [phase, path, revision] = process.argv.slice(2);
assert.ok(
  path && (phase === 'start' || phase === 'resume'),
  'Expected start or resume and a checkpoint path.',
);
assert.equal(
  existsSync(path),
  phase === 'resume',
  'Expected checkpoint availability to match the requested phase.',
);
assert.match(revision ?? '', /^[0-9a-f]{40}$/, 'Expected the checked-out Git revision.');

const checkpoint = await resumeSyntheticTask({
  path,
  task: 'runner-checkpoint-rehearsal',
  revision,
  maxSteps: 1,
  steps: [
    { id: 'inspect-source', run: () => assert.equal(phase, 'start') },
    { id: 'validate-source', run: () => assert.equal(phase, 'resume') },
  ],
});

assert.equal(checkpoint.steps[0].outcome, 'passed');
assert.equal(checkpoint.steps[0].attempts, 1);
assert.equal(checkpoint.review, phase === 'resume' ? 'ready_for_review' : 'pending');
console.log(JSON.stringify(checkpoint, null, 2));
