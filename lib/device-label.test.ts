import assert from "node:assert/strict";
import { test } from "node:test";

import { deviceLabel } from "./device-label.ts";

test("names the browser and the operating system", () => {
  assert.equal(
    deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"),
    "Chrome trên macOS",
  );
  assert.equal(
    deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    "Safari trên iPhone",
  );
  assert.equal(
    deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0"),
    "Edge trên Windows",
  );
});

test("falls back when the User-Agent is missing or unknown", () => {
  assert.equal(deviceLabel(null), "Thiết bị không rõ");
  assert.equal(deviceLabel("curl/8.0"), "Thiết bị không rõ");
});
