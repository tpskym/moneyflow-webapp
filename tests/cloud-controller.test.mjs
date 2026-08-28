import assert from "node:assert/strict";
import test from "node:test";
import { shouldConfirmCloudReplacement } from "../modules/cloud-controller.js";

test("читателю не показывается подтверждение замены облачными данными", () => {
  assert.equal(
    shouldConfirmCloudReplacement({
      accessMode: "reader",
      operationCount: 100,
      categoryCount: 20,
    }),
    false,
  );
});

test("редактор подтверждает замену непустых локальных данных", () => {
  assert.equal(
    shouldConfirmCloudReplacement({
      accessMode: "writer",
      operationCount: 1,
    }),
    true,
  );
  assert.equal(
    shouldConfirmCloudReplacement({
      accessMode: "writer",
      operationCount: 1,
      skipReplaceConfirmation: true,
    }),
    false,
  );
});
