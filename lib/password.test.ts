import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, passwordProblem, verifyPassword } from "./password.ts";

test("a hash verifies only its own password", async () => {
  const stored = await hashPassword("đúng mật khẩu 123");
  assert.match(stored, /^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
  assert.equal(await verifyPassword(stored, "đúng mật khẩu 123"), true);
  assert.equal(await verifyPassword(stored, "đúng mật khẩu 124"), false);
  assert.equal(await verifyPassword(stored, ""), false);
});

test("the same password gets a different salt each time", async () => {
  const [a, b] = await Promise.all([hashPassword("cùng-một-mật-khẩu"), hashPassword("cùng-một-mật-khẩu")]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(a, "cùng-một-mật-khẩu"), true);
  assert.equal(await verifyPassword(b, "cùng-một-mật-khẩu"), true);
});

test("composed and decomposed Vietnamese letters are the same password", async () => {
  const stored = await hashPassword("Mật khẩu".normalize("NFC"));
  assert.equal(await verifyPassword(stored, "Mật khẩu".normalize("NFD")), true);
});

test("malformed stored values never verify", async () => {
  assert.equal(await verifyPassword("", "x"), false);
  assert.equal(await verifyPassword("bcrypt$whatever", "x"), false);
  assert.equal(await verifyPassword("scrypt$32768$8$1$$", "x"), false);
});

test("new passwords need a minimum length and a matching confirmation", () => {
  assert.match(passwordProblem("ngắn", "ngắn") ?? "", /ít nhất 8/);
  assert.match(passwordProblem("đủ dài rồi", "khác hẳn nhé") ?? "", /không khớp/);
  assert.equal(passwordProblem("đủ dài rồi", "đủ dài rồi"), null);
});
