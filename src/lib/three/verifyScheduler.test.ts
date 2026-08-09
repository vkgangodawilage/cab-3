import { test } from "node:test";
import assert from "node:assert/strict";
import { createDebouncedRunner } from "./verifyScheduler.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("request runs the callback once after the delay", async () => {
  let count = 0;
  const runner = createDebouncedRunner(() => count++, 10);
  runner.request();
  assert.equal(runner.pending, true);
  await sleep(40);
  assert.equal(count, 1);
  assert.equal(runner.pending, false);
});

test("multiple rapid requests coalesce into one run (trailing window)", async () => {
  let count = 0;
  const runner = createDebouncedRunner(() => count++, 10);
  runner.request();
  await sleep(2);
  runner.request();
  await sleep(2);
  runner.request();
  await sleep(40);
  assert.equal(count, 1);
});

test("cancel prevents the run and clears the pending flag", async () => {
  let count = 0;
  const runner = createDebouncedRunner(() => count++, 10);
  runner.request();
  runner.cancel();
  await sleep(40);
  assert.equal(count, 0);
  assert.equal(runner.pending, false);
});

test("flush runs immediately, even while a run is scheduled", () => {
  let count = 0;
  const runner = createDebouncedRunner(() => count++, 1000);
  runner.request();
  runner.flush();
  assert.equal(count, 1);
  assert.equal(runner.pending, false);
});

test("pending flag reflects the scheduled state", () => {
  let count = 0;
  const runner = createDebouncedRunner(() => count++, 1000);
  assert.equal(runner.pending, false);
  runner.request();
  assert.equal(runner.pending, true);
  runner.cancel();
  assert.equal(runner.pending, false);
});

test("determinism: same schedule sequence yields the same run count", async () => {
  const mk = () => {
    let count = 0;
    const runner = createDebouncedRunner(() => count++, 10);
    return { runner, get: () => count };
  };
  const a = mk();
  const b = mk();
  a.runner.request();
  a.runner.request();
  a.runner.request();
  b.runner.request();
  b.runner.request();
  b.runner.request();
  await sleep(40);
  assert.equal(a.get(), b.get());
  assert.equal(a.get(), 1);
});
