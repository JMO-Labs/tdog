import { useEffect, useMemo } from "react";
import { PetEngine } from "./petEngine";

const TICK_MS = 250;

/** Owns the pet engine for the workspace: clock, keystrokes, and output from every pane. */
export function usePetEngine() {
  const pet = useMemo(() => new PetEngine(), []);
  useEffect(() => {
    const id = setInterval(() => pet.tick(), TICK_MS);
    const key = () => pet.key();
    addEventListener("keydown", key, true);
    return () => {
      clearInterval(id);
      removeEventListener("keydown", key, true);
    };
  }, [pet]);
  return useMemo(() => {
    const dec = new TextDecoder();
    return {
      pet,
      feed: (data?: Uint8Array) =>
        pet.output(data ? dec.decode(data, { stream: false }) : ""),
    };
  }, [pet]);
}
