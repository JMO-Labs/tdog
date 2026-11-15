# ADR-0005: Community plugins

Status: accepted · 2026-11-15 (owner chose sandbox, URL/file install, server-held AI keys)

## Context
Owner wants community-made plugins: e.g. warn before dangerous commands, AI help, and
kitten-style overlays (ADR builds on the per-pane overlay layer). Plugins are third-party code
running next to live shells, so the threat model is "a malicious plugin".

## Decision
- **Where it runs: browser sandbox only.** Each plugin runs in its own sandboxed iframe
  (`sandbox="allow-scripts"`, no same-origin, CSP `default-src 'none'`), talking to tdog only via
  `postMessage`. No DOM, cookies, storage, network or other panes unless a permission grants a
  brokered API. No server-side plugin code.
- **Manifest** (`tdog-plugin.json`): `id`, `name`, `version`, `author`, `description`, `entry`
  (one JS file), `permissions` (below), optional `commands` and `overlays` it contributes.
- **Permissions** (shown to the user at install; nothing granted silently):
  - `screen:read` — visible lines of the focused pane on request.
  - `input:observe` — the command line about to be sent (on Enter), read-only.
  - `input:gate` — may hold a command and ask tdog to confirm ("Run anyway" / "Cancel"); the
    plugin can never send or alter input itself. This is what the dangerous-command plugin uses.
  - `input:insert` — may insert text at the cursor, only from a user action in its overlay.
  - `overlay` — may show an overlay in the pane (rendered by tdog from a small declarative UI
    schema the plugin posts: text, list, buttons, input; no plugin HTML).
  - `ai` — may send a prompt to the server's AI proxy (see below).
  - `net:<host>` — fetch to listed hosts via a tdog broker that enforces the allowlist.
- **Install:** paste a URL or drop a file (zip or single manifest + JS). tdog shows name,
  author, permissions and a hash; on approve it stores the plugin in `/data/plugins/<id>/` and
  serves it from there (offline-safe). Updates re-prompt if permissions grow. Uninstall deletes.
  Per-plugin enable switch; global "Disable all plugins" and serious mode don't affect it.
- **AI keys:** the server holds provider keys in `/data` (settings → AI); plugins with `ai` call
  `POST /api/ai/complete` through the broker and never see keys. Server applies a per-plugin
  rate limit and logs each call to the audit log (plugin id, model, token counts, no prompt text
  unless the user enables it).
- **Audit:** install, permission grant, uninstall, `input:gate` holds and AI calls are logged.

## Consequences
Plugins can't read files or run commands on their own: anything powerful goes through a
brokered, permissioned API, so each new capability is a deliberate tdog change. The
declarative overlay UI limits how fancy plugin UIs can look, in exchange for no plugin HTML
inside tdog's origin. Server-side plugins can be revisited later as a separate, admin-only ADR.
