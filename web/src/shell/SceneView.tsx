import { useEffect, type ComponentProps } from "react";
import { SceneBackground } from "../backgrounds/SceneBackground";
import { SplitView } from "../layout/SplitView";
import { leaves } from "../layout/tree";
import { useLayout } from "../layout/useLayout";
import type { Scene } from "./scenes";
import { useCopy } from "../copy/copy";
import { useToast } from "../overlays/toast";
import { EmptyPresets } from "../presets/EmptyPresets";
import { preparePane } from "../presets/launch";
import { Mascot } from "./Mascot";
import { PaneSlot } from "./PaneSlot";
import { clearScene } from "../broadcast/store";

type SlotProps = Omit<
  ComponentProps<typeof PaneSlot>,
  "id" | "settled" | "state" | "sceneId"
>;

/** One scene's split tree. Stays mounted when inactive so shells keep flowing. */
export function SceneView({
  scene,
  active,
  paneOpen,
  onLeaves,
  onFocus,
  scenes,
  onMoveScene,
  ...slot
}: SlotProps & {
  scene: string;
  active: boolean;
  paneOpen: Record<string, ComponentProps<typeof PaneSlot>["state"]>;
  onLeaves: (scene: string, ids: string[]) => void;
  onFocus: (id: string) => void;
  scenes: Scene[];
  onMoveScene: (id: string, from: string, to: string) => void;
}) {
  const layout = useLayout(scene);
  const c = useCopy();
  const toast = useToast();
  const fromPreset = async (name: string) => {
    const id = await preparePane(name, toast);
    if (id) layout.open(id);
  };
  const ids = layout.tree ? leaves(layout.tree).join(",") : "";
  useEffect(
    () => onLeaves(scene, ids ? ids.split(",") : []),
    [scene, ids, onLeaves],
  );
  return (
    <div className="scene-view" data-active={active} aria-hidden={!active}>
      <SceneBackground scene={scene}>
        {layout.tree ? (
          <SplitView
            tree={layout.tree}
            sceneId={scene}
            onSplit={layout.split}
            onClose={layout.close}
            onRatio={layout.ratio}
            onSnap={layout.snap}
            onMove={layout.move}
            onSwap={layout.swap}
            onRename={layout.rename}
            onDuplicate={layout.duplicate}
            active={active}
            scenes={scenes.filter((x) => x.id !== scene)}
            onMoveToScene={(id, to) => onMoveScene(id, scene, to)}
            renderPane={(id, settled) => (
              <div
                style={{ height: "100%" }}
                onFocusCapture={() => onFocus(id)}
                onPointerDownCapture={() => onFocus(id)}
              >
                <PaneSlot
                  id={id}
                  sceneId={scene}
                  settled={settled}
                  visible={active}
                  state={paneOpen[id]}
                  {...slot}
                />
              </div>
            )}
          />
        ) : (
          <div className="empty" data-testid="empty-panes">
            <Mascot />
            <p className="empty-big">{c("empty.noPanes")}</p>
            <p className="muted">{c("empty.noPanesHint")}</p>
            <button className="btn reconnect" onClick={layout.reset}>
              {c("empty.newPane")}
            </button>
            <EmptyPresets onPick={(n) => void fromPreset(n)} />
          </div>
        )}
      </SceneBackground>
    </div>
  );
}
