export default {
  extends: ["@commitlint/config-conventional"],
  // Squash bodies repeat sub-commit headers, so body lines follow the header limit, not 100.
  // Subjects often start with acronyms (PTY, WS, TOTP); case is not worth failing CI over.
  // Squash-merge bodies embed PR commit subjects (bullets > 100 chars), so body line length is not enforced.
  rules: {
    "subject-case": [0],
    "header-max-length": [2, "always", 120],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
  // Agents sync dev into PR branches; PRs are squash-merged so these never reach dev.
  ignores: [(m) => /^merge\b/i.test(m)],
};
