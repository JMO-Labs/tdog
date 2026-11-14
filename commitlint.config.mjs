export default {
  extends: ["@commitlint/config-conventional"],
  // Subjects often start with acronyms (PTY, WS, TOTP); case is not worth failing CI over.
  rules: { "subject-case": [0], "header-max-length": [2, "always", 120] },
  // Agents sync dev into PR branches; PRs are squash-merged so these never reach dev.
  ignores: [(m) => /^merge\b/i.test(m)],
};
