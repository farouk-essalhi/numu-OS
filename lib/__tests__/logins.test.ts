import { describe, expect, it } from "vitest";
import { authPasswordError, normalizeUsername, passwordProblem, usernameProblem } from "../logins";

describe("choosing a username", () => {
  it("follows the database's rule: 3-30 characters, starts with a letter, no spaces", () => {
    expect(usernameProblem("farouk")).toBeNull();
    expect(usernameProblem("  Rand.A ")).toBeNull();
    expect(normalizeUsername("  Rand.A ")).toBe("rand.a");
    expect(usernameProblem("ab")).toMatch(/3/);
    expect(usernameProblem("9lives")).toMatch(/letter/);
    expect(usernameProblem("rand aziz")).toMatch(/spaces/);
    expect(usernameProblem("x".repeat(31))).toMatch(/30/);
    // The same pattern the database checks.
    const db = /^[a-z][a-z0-9._-]{2,29}$/;
    for (const u of ["farouk", "ali_k", "busafen-1", "a.b"]) expect(db.test(normalizeUsername(u))).toBe(usernameProblem(u) === null);
  });
});

describe("choosing a password", () => {
  it("needs 8+ characters with a letter and a number, and not the username", () => {
    expect(passwordProblem("short1")).toMatch(/8/);
    expect(passwordProblem("onlyletters")).toMatch(/number/);
    expect(passwordProblem("farouk2026!", "farouk")).toMatch(/username/);
    expect(passwordProblem("password123")).toMatch(/guess/);
    expect(passwordProblem("Shoot-day-7")).toBeNull();
  });

  it("explains Supabase's refusals in plain words", () => {
    expect(authPasswordError("New password should be different from the old password.")).toMatch(/different/);
    expect(authPasswordError("Password should be at least 6 characters.")).toMatch(/short/);
  });
});
