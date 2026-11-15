import { createContext, useContext } from "react";
import type { Dir } from "./tree";

/** Layout actions a pane's terminal menu can trigger. */
export interface PaneOps {
  split: (dir: Dir) => void;
  rename?: () => void;
  close: () => void;
}

export const PaneOpsContext = createContext<PaneOps | null>(null);
export const usePaneOps = () => useContext(PaneOpsContext);
