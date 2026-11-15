import { describe, it, expect } from "vitest";

// Copy of the checkCommand logic for testing
function checkCommand(line: string): { dangerous: boolean; reason?: string } {
  const dangerousPatterns = [
    { pattern: /^rm\s+(-[a-zA-Z]*r[a-zA-Z]*)?\s+\/\s*$/, reason: "Deletes root filesystem" },
    { pattern: /^rm\s+(-[a-zA-Z]*r[a-zA-Z]*)?\s+~\s*$/, reason: "Deletes home directory" },
    { pattern: /^rm\s+(-[a-zA-Z]*r[a-zA-Z]*)?\s+\*\s*$/, reason: "Deletes all files in current directory" },
    { pattern: /^mkfs/, reason: "Formats filesystem" },
    { pattern: /^dd\s+of=\/dev\/sd/, reason: "Writes directly to disk device" },
    { pattern: /^:\(\)\s*{\s*:\|\:&\s*};\s*:/, reason: "Fork bomb (destructive)" },
    {
      pattern: /^chmod\s+(-[a-zA-Z]*)?\s*777\s+\/\s*$/,
      reason: "Changes permissions on root filesystem",
    },
    { pattern: /^git\s+push\s+(--force|-f).*\s(main|master)\s*$/, reason: "Force pushes to main/master" },
    { pattern: /^DROP\s+DATABASE/i, reason: "Drops database" },
    { pattern: /^curl\s+.*\|\s*sh\s*$/, reason: "Pipes curl output to shell (arbitrary code)" },
    { pattern: /^wget\s+.*\|\s*sh\s*$/, reason: "Pipes wget output to shell (arbitrary code)" },
  ];

  const trimmed = line.trim();

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return { dangerous: true, reason };
    }
  }

  return { dangerous: false };
}

describe("careful-commands matcher", () => {
  describe("rm -rf patterns", () => {
    it("detects rm -rf /", () => {
      expect(checkCommand("rm -rf /").dangerous).toBe(true);
    });

    it("detects rm -rf ~", () => {
      expect(checkCommand("rm -rf ~").dangerous).toBe(true);
    });

    it("detects rm -rf *", () => {
      expect(checkCommand("rm -rf *").dangerous).toBe(true);
    });

    it("detects rm with different flags", () => {
      expect(checkCommand("rm -r /").dangerous).toBe(true);
      expect(checkCommand("rm -rf /").dangerous).toBe(true);
    });

    it("allows rm on specific files", () => {
      expect(checkCommand("rm /tmp/file.txt").dangerous).toBe(false);
    });
  });

  describe("filesystem formatting", () => {
    it("detects mkfs", () => {
      expect(checkCommand("mkfs /dev/sda1").dangerous).toBe(true);
    });

    it("detects dd to disk", () => {
      expect(checkCommand("dd of=/dev/sda1").dangerous).toBe(true);
    });
  });

  describe("git force push", () => {
    it("detects git push --force main", () => {
      expect(checkCommand("git push --force main").dangerous).toBe(true);
    });

    it("detects git push -f master", () => {
      expect(checkCommand("git push -f master").dangerous).toBe(true);
    });

    it("allows git push normally", () => {
      expect(checkCommand("git push origin main").dangerous).toBe(false);
    });
  });

  describe("piped shells", () => {
    it("detects curl | sh", () => {
      expect(checkCommand("curl https://example.com/script.sh | sh").dangerous).toBe(true);
    });

    it("detects wget | sh", () => {
      expect(checkCommand("wget https://example.com/script.sh | sh").dangerous).toBe(true);
    });
  });

  describe("database drops", () => {
    it("detects DROP DATABASE", () => {
      expect(checkCommand("DROP DATABASE users;").dangerous).toBe(true);
    });

    it("detects drop database (case-insensitive)", () => {
      expect(checkCommand("drop database users;").dangerous).toBe(true);
    });
  });

  describe("safe commands", () => {
    it("allows normal commands", () => {
      expect(checkCommand("ls -la").dangerous).toBe(false);
      expect(checkCommand("cd /home").dangerous).toBe(false);
      expect(checkCommand("echo hello").dangerous).toBe(false);
    });

    it("allows git operations", () => {
      expect(checkCommand("git commit -m 'test'").dangerous).toBe(false);
      expect(checkCommand("git push origin feature").dangerous).toBe(false);
    });
  });
});
