/** Resolve relative paths to absolute paths using the pane's cwd. */

export interface ResolvePathResult {
  path: string;
  error?: string;
}

/**
 * Resolve a path relative to cwd, or validate an absolute path.
 * Leaves `.`, `..`, and `~` as-is with an error message since the server needs absolute paths.
 * Returns the resolved absolute path or an error.
 */
export function resolvePath(input: string, cwd?: string): ResolvePathResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { path: "", error: "Path is empty" };
  }

  // Absolute path: use as-is
  if (trimmed.startsWith("/")) {
    return { path: trimmed };
  }

  // Relative paths starting with . or .. or ~ need an error since we can't resolve them
  if (trimmed.startsWith(".") || trimmed.startsWith("~")) {
    return {
      path: trimmed,
      error: `Relative paths like "${trimmed}" need absolute paths. Provide the full path or use the pane's current working directory.`,
    };
  }

  // Relative path with cwd: join them
  if (cwd) {
    // Simple path joining: handle trailing slashes
    if (cwd === "/") {
      return { path: `/${trimmed}` };
    }
    const base = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
    return { path: `${base}/${trimmed}` };
  }

  // Relative path without cwd: error
  return {
    path: trimmed,
    error: `Cannot resolve relative path without a current working directory. Provide an absolute path.`,
  };
}
