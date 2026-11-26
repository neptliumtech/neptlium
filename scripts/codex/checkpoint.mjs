import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const MAX_ATTEMPTS = 3;

function saveCheckpoint(path, checkpoint) {
  const temporary = path + '.' + randomUUID();
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(checkpoint, null, 2) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}

/** The caller supplies reviewed, idempotent synthetic steps and owns exclusive checkpoint access. */
export async function resumeSyntheticTask({
  path,
  task,
  revision,
  steps,
  maxSteps = steps.length,
}) {
  const ids = steps.map((step) => step.id);
  let checkpoint = {
    version: 1,
    mode: 'synthetic',
    task,
    revision,
    steps: ids.map((id) => ({ id, attempts: 0, outcome: 'pending' })),
    review: 'pending',
  };
  try {
    checkpoint = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    checkpoint.version !== 1 ||
    checkpoint.mode !== 'synthetic' ||
    checkpoint.task !== task ||
    checkpoint.revision !== revision ||
    JSON.stringify(checkpoint.steps.map((step) => step.id)) !== JSON.stringify(ids)
  ) {
    throw new Error('Checkpoint task, revision, or step order differs from the requested run.');
  }

  let executed = 0;
  for (const [index, step] of steps.entries()) {
    const record = checkpoint.steps[index];
    if (record.outcome === 'passed') continue;
    if (executed >= maxSteps || record.attempts >= MAX_ATTEMPTS) break;

    record.attempts += 1;
    record.outcome = 'started';
    saveCheckpoint(path, checkpoint);
    try {
      await step.run();
      record.outcome = 'passed';
    } catch {
      record.outcome = 'failed';
    }
    saveCheckpoint(path, checkpoint);
    executed += 1;
    if (record.outcome === 'failed') break;
  }

  if (checkpoint.steps.every((step) => step.outcome === 'passed')) {
    checkpoint.review = 'ready_for_review';
    saveCheckpoint(path, checkpoint);
  }
  return checkpoint;
}
