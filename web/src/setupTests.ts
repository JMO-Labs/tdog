import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals are off, so RTL does not auto-register cleanup.
afterEach(() => cleanup());
