// Careful commands plugin: flags potentially dangerous commands for confirmation.

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

/**
 * Check if a command matches any dangerous pattern.
 * Returns { dangerous: true, reason: string } or { dangerous: false }
 */
function checkCommand(line) {
  const trimmed = line.trim();

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return { dangerous: true, reason };
    }
  }

  return { dangerous: false };
}

// Main plugin function
(function (tdog) {
  "use strict";

  // Signal readiness
  tdog.ready(["input:gate"]);

  // Listen for commands
  let gateRequestId = 0;

  function onCommandEntered(line) {
    const check = checkCommand(line);
    if (check.dangerous) {
      // Request gate confirmation with reason
      const id = `gate_${++gateRequestId}`;
      tdog.inputGate(id, line);
      // Note: we don't wait for response; the host handles this
    }
  }

  // Hook into input observation
  // In a real plugin, this would be set up by the host after ready
  // For now, we just define the handler
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "input:observe:line") {
      onCommandEntered(e.data.line);
    }
  });
});