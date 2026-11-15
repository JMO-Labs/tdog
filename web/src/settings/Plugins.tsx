import { useEffect, useState, useRef } from "react";
import {
  listPlugins,
  inspectPlugin,
  installPlugin,
  setPluginEnabled,
  deletePlugin,
  permissionDescription,
  type PluginInfo,
  type StagedManifest,
} from "../plugins/api";
import { Button } from "../components/ui/button";
import { useToast } from "../overlays/toast";
import { Dialog } from "../overlays/Dialog";
import { Switch } from "./Switch";
import "./plugins.css";
import { syncPlugins } from "../plugins/runtime";
import carefulManifest from "../../../plugins/careful-commands/tdog-plugin.json?raw";
import carefulEntry from "../../../plugins/careful-commands/index.js?raw";

const message = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

export function Plugins() {
  const toast = useToast();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [staged, setStaged] = useState<StagedManifest | null>(null);
  const [confirmInstall, setConfirmInstall] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      setLoading(true);
      const list = await listPlugins();
      setPlugins(list);
    } catch {
      toast("fail", "Failed to load plugins");
    } finally {
      setLoading(false);
    }
  };

  const handleInspectUrl = async () => {
    if (!urlInput.trim()) return;
    try {
      setInspecting(true);
      const manifest = await inspectPlugin({ url: urlInput });
      setStaged(manifest);
      setConfirmInstall(true);
      setUrlInput("");
    } catch (err) {
      toast("fail", message(err, "Could not inspect that plugin."));
    } finally {
      setInspecting(false);
    }
  };

  /** Pick the manifest (tdog-plugin.json) and the entry script together. */
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = [...(input.files ?? [])];
    input.value = "";
    const manifest = files.find((f) => f.name.endsWith(".json"));
    const entry = files.find((f) => f.name.endsWith(".js"));
    if (!manifest || !entry) {
      toast("fail", "Choose both files: tdog-plugin.json and its .js entry.");
      return;
    }
    try {
      setInspecting(true);
      setStaged(await inspectPlugin({ manifest, entry }));
      setConfirmInstall(true);
    } catch (err) {
      toast("fail", message(err, "Could not read that plugin."));
    } finally {
      setInspecting(false);
    }
  };

  const handleConfirmInstall = async () => {
    if (!staged) return;
    try {
      await installPlugin(staged.token, staged.manifest.permissions);
      toast("success", `Installed ${staged.manifest.name}`);
      setConfirmInstall(false);
      setStaged(null);
      await loadPlugins();
      await syncPlugins();
    } catch (err) {
      toast("fail", message(err, "Install failed."));
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await setPluginEnabled(id, enabled);
      setPlugins(plugins.map((p) => (p.id === id ? { ...p, enabled } : p)));
      await syncPlugins();
    } catch {
      toast("fail", "Failed to update plugin");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePlugin(id);
      setPlugins(plugins.filter((p) => p.id !== id));
      await syncPlugins();
      toast("success", "Plugin uninstalled");
    } catch {
      toast("fail", "Failed to uninstall plugin");
    }
  };

  /** Careful commands ships with tdog; it still goes through the same prompt. */
  const installBundledCarefulCommands = async () => {
    try {
      setStaged(
        await inspectPlugin({ manifest: carefulManifest, entry: carefulEntry }),
      );
      setConfirmInstall(true);
    } catch (err) {
      toast("fail", message(err, "Could not prepare Careful commands."));
    }
  };

  return (
    <div className="plugins-settings">
      <h3>Plugins</h3>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          {/* Careful commands suggestion */}
          {!plugins.some((p) => p.id === "careful-commands") && (
            <div
              className="plugin-suggestion"
              style={{
                padding: "16px",
                marginBottom: "16px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                backgroundColor: "var(--surface-2)",
              }}
            >
              <h4 style={{ margin: "0 0 8px 0" }}>Careful commands</h4>
              <p className="muted" style={{ margin: "0 0 12px 0" }}>
                Asks you to confirm before obviously destructive commands like
                rm -rf ~.
              </p>
              <Button
                onClick={() => void installBundledCarefulCommands()}
                variant="primary"
              >
                Install Careful commands
              </Button>
            </div>
          )}

          {plugins.length === 0 && !loading ? (
            <p className="muted">No plugins installed.</p>
          ) : (
            <div className="plugins-list">
              {plugins.map((p) => (
                <div key={p.id} className="plugin-item">
                  <div className="plugin-header">
                    <h4 id={`sw-${p.id}`}>{p.name || p.id}</h4>
                    <Switch
                      labelledBy={`sw-${p.id}`}
                      checked={p.enabled}
                      onChange={(enabled) => void handleToggle(p.id, enabled)}
                    />
                  </div>
                  <p className="muted">
                    v{p.version}
                    {p.author ? ` · by ${p.author}` : ""}
                  </p>
                  <ul className="plugin-permissions">
                    {p.permissions.map((perm) => (
                      <li key={perm} className="permission-chip">
                        {permissionDescription(perm)}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="danger-quiet"
                    onClick={() => void handleDelete(p.id)}
                    style={{ marginTop: "8px" }}
                  >
                    Uninstall
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <h4 style={{ marginTop: "24px" }}>Add plugin</h4>
      <div className="plugin-add">
        <input
          type="text"
          placeholder="https://example.com/plugin.zip"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          disabled={inspecting}
        />
        <Button
          onClick={() => void handleInspectUrl()}
          disabled={inspecting || !urlInput.trim()}
        >
          {inspecting ? "Inspecting..." : "Install from URL"}
        </Button>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={inspecting}
        >
          Upload files…
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label="Plugin files (tdog-plugin.json and its .js entry)"
          accept=".json,.js,application/json,text/javascript"
          onChange={(e) => void handleFileSelected(e)}
          style={{ display: "none" }}
        />
      </div>

      {/* Permission confirmation dialog */}
      <Dialog
        open={confirmInstall && !!staged}
        title={staged ? `Install ${staged.manifest.name}?` : ""}
        onClose={() => {
          setConfirmInstall(false);
          setStaged(null);
        }}
      >
        {staged && (
          <div className="dialog-content">
            <p>{staged.manifest.description}</p>
            <p className="muted">by {staged.manifest.author}</p>

            {staged.manifest.permissions.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <b>Permissions requested:</b>
                <ul style={{ marginTop: "8px" }}>
                  {staged.manifest.permissions.map((perm) => (
                    <li key={perm} style={{ marginBottom: "8px" }}>
                      <b>{perm}</b>
                      <br />
                      <span className="muted">
                        {permissionDescription(perm)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p
              className="muted"
              style={{ marginTop: "16px", fontSize: "0.9em" }}
            >
              SHA256: {staged.sha256.slice(0, 16)}...
            </p>

            <div className="dialog-actions" style={{ marginTop: "16px" }}>
              <Button
                onClick={() => {
                  setConfirmInstall(false);
                  setStaged(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleConfirmInstall()}
                variant="primary"
              >
                Install
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
