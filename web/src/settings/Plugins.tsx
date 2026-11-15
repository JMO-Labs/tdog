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
    } catch (err) {
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
    } catch (err: any) {
      toast("fail", err.message || "Failed to inspect plugin");
    } finally {
      setInspecting(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    try {
      setInspecting(true);
      const manifest = await inspectPlugin({ file });
      setStaged(manifest);
      setConfirmInstall(true);
      e.currentTarget.value = "";
    } catch (err: any) {
      toast("fail", err.message || "Failed to inspect plugin");
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
    } catch (err: any) {
      toast("fail", err.message || "Failed to install plugin");
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await setPluginEnabled(id, enabled);
      setPlugins(plugins.map((p) => (p.id === id ? { ...p, enabled } : p)));
    } catch (err: any) {
      toast("fail", "Failed to update plugin");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePlugin(id);
      setPlugins(plugins.filter((p) => p.id !== id));
      toast("success", "Plugin uninstalled");
    } catch (err: any) {
      toast("fail", "Failed to uninstall plugin");
    }
  };

  const installBundledCarefulCommands = async () => {
    try {
      // Install the bundled careful-commands plugin
      // The server provides it at /api/plugins/bundled/careful-commands
      const response = await fetch("/api/plugins/bundled/careful-commands");
      if (!response.ok) {
        throw new Error("Failed to load bundled plugin");
      }

      // The response should be a zip file
      const blob = await response.blob();
      const file = new File([blob], "careful-commands.zip", {
        type: "application/zip",
      });

      // Use the inspect and install flow
      const staged = await inspectPlugin({ file });
      setStaged(staged);
      setConfirmInstall(true);
    } catch (err: any) {
      toast("fail", err.message || "Failed to install Careful Commands");
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
                backgroundColor: "var(--bg-2)",
              }}
            >
              <h4 style={{ margin: "0 0 8px 0" }}>Careful Commands</h4>
              <p className="muted" style={{ margin: "0 0 12px 0" }}>
                Review and confirm dangerous commands before execution.
              </p>
              <Button
                onClick={() => void installBundledCarefulCommands()}
                variant="primary"
              >
                Install Careful Commands
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
                    <h4>{p.id}</h4>
                    <Switch
                      labelledBy={`sw-${p.id}`}
                      checked={p.enabled}
                      onChange={(enabled) => void handleToggle(p.id, enabled)}
                    />
                  </div>
                  <p className="muted">v{p.version}</p>
                  <div className="plugin-permissions">
                    {p.permissions.map((perm) => (
                      <span key={perm} className="permission-chip">
                        {perm}
                      </span>
                    ))}
                  </div>
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
          Upload file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
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
