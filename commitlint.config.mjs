export default {
  extends: ["@commitlint/config-conventional"],
  // Subjects often start with acronyms (PTY, WS, TOTP); case is not worth failing CI over.
  rules: { "subject-case": [0] },
};
