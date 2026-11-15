import { describe, it, expect } from "vitest";
import { resolvePath } from "./pathResolver";

describe("resolvePath", () => {
  it("accepts absolute paths", () => {
    const result = resolvePath("/etc/passwd");
    expect(result.path).toBe("/etc/passwd");
    expect(result.error).toBeUndefined();
  });

  it("joins relative paths with cwd", () => {
    const result = resolvePath("file.txt", "/home/user");
    expect(result.path).toBe("/home/user/file.txt");
    expect(result.error).toBeUndefined();
  });

  it("handles cwd with trailing slash", () => {
    const result = resolvePath("file.txt", "/home/user/");
    expect(result.path).toBe("/home/user/file.txt");
    expect(result.error).toBeUndefined();
  });

  it("preserves root cwd trailing slash", () => {
    const result = resolvePath("file.txt", "/");
    expect(result.path).toBe("/file.txt");
    expect(result.error).toBeUndefined();
  });

  it("returns error for . without cwd", () => {
    const result = resolvePath(".");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Relative paths");
  });

  it("returns error for .. without cwd", () => {
    const result = resolvePath("..");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Relative paths");
  });

  it("returns error for ~ without cwd", () => {
    const result = resolvePath("~");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Relative paths");
  });

  it("returns error for relative path without cwd", () => {
    const result = resolvePath("file.txt");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("absolute path");
  });

  it("trims whitespace", () => {
    const result = resolvePath("  /etc/passwd  ");
    expect(result.path).toBe("/etc/passwd");
    expect(result.error).toBeUndefined();
  });

  it("returns error for empty path", () => {
    const result = resolvePath("");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("empty");
  });
});
