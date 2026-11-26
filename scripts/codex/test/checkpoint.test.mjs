import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resumeSyntheticTask } from '../checkpoint.mjs';

test('synthetic handoff resumes only unfinished steps at the same source revision', async () => {
  let firstRuns = 0;
  let secondRuns = 0;
  const args = {
    path: join(mkdtempSync(join(tmpdir(), 'codex-checkpoint-')), 'resume.json'),
    task: 'synthetic-recovery',
    revision: 'a'.repeat(40),
    steps: [
      {
        id: 'inspect',
        run: () => {
          firstRuns += 1;
        },
      },
      {
        id: 'validate',
        run: () => {
          secondRuns += 1;
        },
      },
    ],
  };
  const interrupted = await resumeSyntheticTask({ ...args, maxSteps: 1 });
  assert.equal(interrupted.review, 'pending');
  await assert.rejects(resumeSyntheticTask({ ...args, revision: 'b'.repeat(40) }), /revision/);
  const resumed = await resumeSyntheticTask(args);
  assert.equal(resumed.review, 'ready_for_review');
  assert.equal(firstRuns, 1);
  assert.equal(secondRuns, 1);
  assert.deepEqual(JSON.parse(readFileSync(args.path, 'utf8')), resumed);
});

test('synthetic retry attempts are bounded across resumes', async () => {
  let calls = 0;
  const args = {
    path: join(mkdtempSync(join(tmpdir(), 'codex-checkpoint-')), 'retry.json'),
    task: 'synthetic-failure',
    revision: 'a'.repeat(40),
    steps: [
      {
        id: 'validate',
        run: () => {
          calls += 1;
          throw new Error('synthetic');
        },
      },
    ],
  };
  for (let run = 0; run < 5; run += 1) await resumeSyntheticTask(args);
  assert.equal(calls, 3);
  const record = JSON.parse(readFileSync(args.path, 'utf8'));
  assert.equal(record.review, 'pending');
  assert.equal(record.steps[0].outcome, 'failed');
});
