import assert from "node:assert/strict";
import test from "node:test";
import { createAppContext } from "../modules/app-context.js";

test("контекст связывает состояние, storage и именованные действия", () => {
  const context = createAppContext({ elements: { button: {} }, state: { count: 1 }, storage: { keys: { data: "key" }, read: () => 1, write: () => {} } });
  context.actions.register("increment", (value) => value + 1);
  assert.equal(context.actions.call("increment", 4), 5);
  assert.equal(context.storage.keys.data, "key");
  assert.equal(context.state.count, 1);
});

test("контекст не допускает неизвестное действие", () => {
  const context = createAppContext({ elements: {}, state: {}, storage: { keys: {}, read: () => null, write: () => {} } });
  assert.throws(() => context.actions.call("missing"), /Не зарегистрировано/);
});
