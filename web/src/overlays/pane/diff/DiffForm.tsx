import { useState, useCallback, useEffect } from "react";
import { resolvePath } from "./pathResolver";
import "./diff.css";

export interface DiffFormProps {
  cwd?: string;
  onDiff: (pathA: string, pathB: string) => void;
  onClose: () => void;
}

export function DiffForm({ cwd, onDiff, onClose }: DiffFormProps) {
  const [pathA, setPathA] = useState("");
  const [pathB, setPathB] = useState("");
  const [errorA, setErrorA] = useState("");
  const [errorB, setErrorB] = useState("");

  // Try to extract two paths from selection (via screen text passed in)
  useEffect(() => {
    // This could be filled by analyzing the screen, but for now we'll let the user enter paths
  }, []);

  const validatePaths = useCallback((): boolean => {
    const resultA = resolvePath(pathA, cwd);
    const resultB = resolvePath(pathB, cwd);

    let valid = true;
    if (resultA.error) {
      setErrorA(resultA.error);
      valid = false;
    } else {
      setErrorA("");
    }

    if (resultB.error) {
      setErrorB(resultB.error);
      valid = false;
    } else {
      setErrorB("");
    }

    return valid;
  }, [pathA, pathB, cwd]);

  const handleSubmit = useCallback(() => {
    if (!validatePaths()) return;

    const resultA = resolvePath(pathA, cwd);
    const resultB = resolvePath(pathB, cwd);

    onDiff(resultA.path, resultB.path);
  }, [pathA, pathB, cwd, validatePaths, onDiff]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="diff-overlay-container">
      <h2>Diff Two Files</h2>
      {cwd && <p className="diff-cwd">Current directory: {cwd}</p>}

      <div className="diff-form-group">
        <label htmlFor="path-a">
          File A:
          {errorA && <span className="diff-error">{errorA}</span>}
        </label>
        <input
          id="path-a"
          type="text"
          placeholder="Absolute path or relative to cwd"
          value={pathA}
          onChange={(e) => {
            setPathA(e.target.value);
            setErrorA("");
          }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>

      <div className="diff-form-group">
        <label htmlFor="path-b">
          File B:
          {errorB && <span className="diff-error">{errorB}</span>}
        </label>
        <input
          id="path-b"
          type="text"
          placeholder="Absolute path or relative to cwd"
          value={pathB}
          onChange={(e) => {
            setPathB(e.target.value);
            setErrorB("");
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="diff-form-actions">
        <button onClick={handleSubmit}>Compare</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
