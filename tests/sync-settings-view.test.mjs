import assert from "node:assert/strict";
import test from "node:test";
import { getCloudAccessState } from "../modules/sync-settings-view.js";

test("читатель не может выгружать, а редактор может", () => {
  assert.equal(getCloudAccessState({ googleClientId: "id", googleFileId: "file", accessMode: "reader" }).canUpload, false);
  assert.equal(getCloudAccessState({ googleClientId: "id", googleFileId: "file", accessMode: "writer" }).canUpload, true);
});
