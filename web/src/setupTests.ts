import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";
import { timing } from "./auth/signon";

// Sign-on gags run instantly in tests unless a test sets real timings.
Object.assign(timing, { step: 0, reducedStep: 0, hold: 0, nono: 0 });

// Motion animations finish instantly in jsdom; exit animations otherwise never resolve.
MotionGlobalConfig.skipAnimations = true;

// Vitest globals are off, so RTL does not auto-register cleanup.
afterEach(() => cleanup());
