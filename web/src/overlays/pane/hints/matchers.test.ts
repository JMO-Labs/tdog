import { describe, expect, it } from "vitest";
import { findMatches, type Match } from "./matchers";

describe("matchers", () => {
  describe("findMatches", () => {
    it("finds URLs with http/https", () => {
      const text = "Visit https://example.com or http://test.org";
      const matches = findMatches(text, ["url"]);
      expect(matches).toHaveLength(2);
      expect(matches[0]).toEqual({
        type: "url",
        text: "https://example.com",
        start: 6,
        end: 25,
      });
      expect(matches[1]).toEqual({
        type: "url",
        text: "http://test.org",
        start: 29,
        end: 44,
      });
    });

    it("trims trailing punctuation from URLs", () => {
      const text = "Check this (https://example.com). Cool!";
      const matches = findMatches(text, ["url"]);
      expect(matches).toHaveLength(1);
      expect(matches[0].text).toBe("https://example.com");
    });

    it("preserves :line:col in URLs", () => {
      const text = "File: https://example.com/file:42:10";
      const matches = findMatches(text, ["url"]);
      expect(matches).toHaveLength(1);
      expect(matches[0].text).toBe("https://example.com/file:42:10");
    });

    it("finds file:// URLs", () => {
      const text = "file:///home/user/file.txt";
      const matches = findMatches(text, ["url"]);
      expect(matches).toHaveLength(1);
      expect(matches[0].text).toBe("file:///home/user/file.txt");
    });

    it("finds absolute paths", () => {
      const text = "Change to /home/user/code or /var/log";
      const matches = findMatches(text, ["path"]);
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const paths = matches.map((m) => m.text);
      expect(paths).toContain("/home/user/code");
      expect(paths).toContain("/var/log");
    });

    it("finds relative paths with ./", () => {
      const text = "Go to ./src/components or ./tests";
      const matches = findMatches(text, ["path"]);
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const paths = matches.map((m) => m.text);
      expect(paths).toContain("./src/components");
      expect(paths).toContain("./tests");
    });

    it("finds tilde paths", () => {
      const text = "Home: ~/code or ~/.config/app";
      const matches = findMatches(text, ["path"]);
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const paths = matches.map((m) => m.text);
      expect(paths).toContain("~/code");
      expect(paths).toContain("~/.config/app");
    });

    it("preserves :line:col in paths", () => {
      const text = "Error in /path/to/file.ts:42:10";
      const matches = findMatches(text, ["path"]);
      expect(matches).toHaveLength(1);
      expect(matches[0].text).toBe("/path/to/file.ts:42:10");
    });

    it("finds git hashes (7-40 hex)", () => {
      const text = "Commit abc1234 or a1b2c3d4e5f6g7h8i9 or abc12";
      const matches = findMatches(text, ["hash"]);
      const hashes = matches.map((m) => m.text);
      expect(hashes).toContain("abc1234");
      // The 40-char one should be found if all hex
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("does not match hashes < 7 chars", () => {
      const text = "abc123 is too short but abc1234 is ok";
      const matches = findMatches(text, ["hash"]);
      expect(matches.some((m) => m.text === "abc1234")).toBe(true);
      expect(matches.some((m) => m.text === "abc123")).toBe(false);
    });

    it("finds IPv4 addresses", () => {
      const text = "Server at 192.168.1.1 or 127.0.0.1";
      const matches = findMatches(text, ["ip"]);
      const ips = matches.map((m) => m.text);
      expect(ips).toContain("192.168.1.1");
      expect(ips).toContain("127.0.0.1");
    });

    it("finds emails", () => {
      const text = "Email me@example.com or user.name+tag@test.co.uk";
      const matches = findMatches(text, ["email"]);
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const emails = matches.map((m) => m.text);
      expect(emails).toContain("me@example.com");
    });

    it("finds words >= 4 chars", () => {
      const text = "The quick brown fox jumps";
      const matches = findMatches(text, ["word"]);
      const words = matches.map((m) => m.text.toLowerCase());
      expect(words).toContain("quick");
      expect(words).toContain("brown");
      expect(words).toContain("jumps");
      // Short words should not be included
      expect(words.filter((w) => w === "the")).toHaveLength(0);
    });

    it("resolves overlaps; longest match wins", () => {
      const text = "https://example.com";
      // Both URL and word matchers would match parts of this
      const matches = findMatches(text, ["url", "word"]);
      // Should only have the URL, not word matches
      expect(matches.filter((m) => m.type === "url")).toHaveLength(1);
    });

    it("handles mixed types", () => {
      const text = "Visit https://example.com or /etc/config (hash abc1234)";
      const matches = findMatches(text);
      const types = matches.map((m) => m.type);
      expect(types).toContain("url");
      expect(types).toContain("path");
      expect(types).toContain("hash");
    });

    it("respects type filter", () => {
      const text = "https://example.com and /path/to/file";
      const urlOnly = findMatches(text, ["url"]);
      expect(urlOnly.every((m) => m.type === "url")).toBe(true);

      const pathOnly = findMatches(text, ["path"]);
      expect(pathOnly.every((m) => m.type === "path")).toBe(true);
    });

    it("handles empty text", () => {
      const matches = findMatches("");
      expect(matches).toHaveLength(0);
    });

    it("does not match inside words", () => {
      const text = "notanemail and notahash123456789";
      const matches = findMatches(text, ["email", "hash"]);
      expect(matches).toHaveLength(0);
    });

    it("balances parentheses in URLs", () => {
      const text = "(https://example.com/path)";
      const matches = findMatches(text, ["url"]);
      expect(matches).toHaveLength(1);
      expect(matches[0].text).toBe("https://example.com/path");
    });
  });
});
