// Careful commands plugin: flags potentially dangerous commands for confirmation.
// NOTE: This is a helper tool, not a security boundary. Always apply principle of least privilege.

/**
 * Normalize and parse a shell command line into segments.
 * Handles: pipes |, logical operators && ||, command separators ;, leading prefixes
 */
function parseCommand(line) {
  // Split on logical operators, pipes, and semicolons
  const segments = line
    .split(/[;&|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return segments.map((segment) => {
    // Strip leading privilege escalation commands and env vars
    let cmd = segment
      .replace(/^(sudo|doas|env\s+\w+=\S+|command|nice)\s+/, "")
      .trim();

    // Parse into parts: strip quotes and split
    const parts = cmd.split(/\s+/);
    const exe = parts[0] || "";

    // Normalize flags: -r -f becomes -rf
    let flags = "";
    const args = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith("-")) {
        // Collect short flags, deduplicate, sort
        const shortFlags = part
          .substring(1)
          .split("")
          .filter((f) => f !== "-");
        flags = Array.from(new Set([...flags.split(""), ...shortFlags]))
          .sort()
          .join("");
      } else {
        args.push(part);
      }
    }

    return { exe, flags, args, original: segment };
  });
}

/**
 * Check if command is dangerous
 */
function isDangerous(line) {
  const segments = parseCommand(line);

  for (const seg of segments) {
    const { exe, flags, args } = seg;

    // rm with -r (recursive) on critical paths
    if (exe === "rm" && flags.includes("r")) {
      for (const arg of args) {
        // Paths that shouldn't be deleted recursively
        if (
          arg === "/" ||
          arg === "~" ||
          arg === "$HOME" ||
          arg === "*" ||
          arg.match(/^\/[a-z]+\/?$/) // /home, /etc, /var, etc
        ) {
          return {
            dangerous: true,
            reason: `rm -${flags} ${arg} would recursively delete critical path`,
          };
        }
      }
    }

    // dd writes to disk devices
    if (exe === "dd") {
      const ofArg = args.find((a) => a.startsWith("of="));
      if (ofArg) {
        const device = ofArg.substring(3);
        if (
          device.match(/^\/dev\/(sd[a-z]|nvme[0-9]|vd[a-z]|hd[a-z]|mmcblk[0-9])/i)
        ) {
          return { dangerous: true, reason: `dd writing to disk device: ${device}` };
        }
      }
    }

    // mkfs formats filesystems
    if (exe === "mkfs" || exe.match(/^mkfs\./)) {
      return { dangerous: true, reason: "mkfs formats filesystem" };
    }

    // git force push to main branches
    if (exe === "git" && args.join(" ").match(/push\s+(-f|--force).*\s(main|master)\b/)) {
      return { dangerous: true, reason: "git push --force to main/master" };
    }

    // chmod 777 on root
    if (exe === "chmod") {
      for (const arg of args) {
        if ((arg === "777" || arg === "7777") && args.includes("/")) {
          return { dangerous: true, reason: "chmod 777 on root filesystem" };
        }
      }
    }

    // Pipe to shell
    if (exe === "curl" || exe === "wget") {
      if (line.includes("|") && (line.includes("sh") || line.includes("bash"))) {
        return {
          dangerous: true,
          reason: `${exe} piped to shell (arbitrary code execution)`,
        };
      }
    }

    // Fork bomb
    if (line.match(/:\(\)\s*{\s*:\|\:&\s*};\s*:/)) {
      return { dangerous: true, reason: "Fork bomb detected" };
    }
  }

  return { dangerous: false };
}

// Initialize plugin via the worker's postMessage API
// The sandbox provides a global way to communicate with the host
let requestId = 0;

function onLine(line) {
  const check = isDangerous(line);
  if (check.dangerous) {
    const id = `gate-${++requestId}`;
    // Send gate request through worker postMessage
    self.postMessage({
      type: "input:gate:request",
      id,
      line: line.trim(),
    });
  }
}

// Register with the host through worker initialization
if (typeof self !== "undefined" && self.postMessage) {
  // Signal readiness with permissions
  self.postMessage({
    type: "ready",
    permissions: ["input:gate", "input:observe"],
  });

  // Listen for messages from host
  self.onmessage = (event) => {
    const msg = event.data;

    // Observe lines for potential danger checking
    if (msg.type === "input:observe:line") {
      onLine(msg.line);
    }

    // Could also handle other message types here
  };
}
