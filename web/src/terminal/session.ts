import { paneRecording } from "../presets/recording";
import {
  decodeFrame,
  encodeAck,
  encodeInput,
  encodeJournalAck,
  encodeJournalForget,
  encodeJournalRecord,
  encodeJournalRestore,
  encodePing,
  encodeResize,
} from "../protocol/frames";
import type { JournalEvent } from "../journal/types";
import type { JournalDB } from "../journal/db";
import { ingest } from "../journal/ingest";
import type { TerminalRenderer } from "./renderer";

/**
 * Flow control (spec §4). The server pauses PTY reads when unacked bytes exceed
 * HIGH_WATERMARK and resumes below LOW_WATERMARK. The client acks rendered bytes
 * (after `write` callback) in batches of ACK_BATCH_BYTES so acks stay cheap.
 * ACK_BATCH_BYTES must stay well below LOW_WATERMARK.
 */
export const HIGH_WATERMARK = 512 * 1024;
export const LOW_WATERMARK = 128 * 1024;
export const ACK_BATCH_BYTES = 32 * 1024;

/** Round-trip probe cadence for the status-bar latency chip. */
export const PING_INTERVAL_MS = 5000;

/** Input stays gated this long if an older server never sends `replayed`. */
export const REPLAY_TIMEOUT_MS = 3000;

export interface SocketLike {
  binaryType: string;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
}

export type SessionState =
  | { status: "connecting" }
  | { status: "open" }
  | { status: "closed"; exitCode?: number; killed?: true };

export interface SessionHooks {
  /** Raw output bytes of one frame. */
  onOutput?: (data: Uint8Array) => void;
  onSize?: (cols: number, rows: number) => void;
  /** Round-trip time in ms from a ping/pong on the control channel. */
  onLatency?: (ms: number) => void;
  /** Called when input is received (for broadcasting). */
  onBroadcast?: (data: Uint8Array) => void;
  /** Pane key (record state is sent per pane even without a journal db). */
  paneId?: string;
  /** Where this pane's journal events are saved (acked once stored). */
  journal?: { pane: string; db: JournalDB };
  /** May hold or drop user input; call `pass` to send (and broadcast) it. */
  interceptInput?: (data: Uint8Array, pass: (d: Uint8Array) => void) => void;
}

export class TerminalSession {
  private sock: SocketLike | null = null;
  /** True between onopen and onclose; WebSocket.send throws while CONNECTING. */
  private ready = false;
  private pending = 0;
  private exitCode: number | undefined;
  private killed = false;
  private warned = false;
  private sid: string | undefined;
  /** A save failed this connection: ingest/ack nothing until reconnect. */
  private journalFailed = false;
  private disposed = false;
  private forgetting = false;
  private pendingForget = false;
  /**
   * True while scrollback is replayed: xterm answers queries (DA, OSC colours)
   * found in old output, and those answers must not reach the shell.
   */
  private replaying = false;
  private replayTimer: ReturnType<typeof setTimeout> | undefined;
  private pinger: ReturnType<typeof setInterval> | undefined;

  constructor(
    private r: TerminalRenderer,
    private open: () => SocketLike,
    private onState: (s: SessionState) => void,
    private hooks: SessionHooks = {},
  ) {
    const pass = (d: Uint8Array) => {
      this.send(encodeInput(d));
      this.hooks.onBroadcast?.(d);
    };
    r.onInput((d) => {
      if (this.replaying) return;
      this.hooks.interceptInput ? this.hooks.interceptInput(d, pass) : pass(d);
    });
    r.onResize((c, rows) => {
      this.send(encodeResize(c, rows));
      this.hooks.onSize?.(c, rows);
    });
  }

  connect(): void {
    this.stopPing();
    this.pending = 0;
    this.exitCode = undefined;
    this.killed = false;
    this.sid = undefined;
    this.journalFailed = false;
    this.endReplay();
    if (this.forgetting) this.pendingForget = true; // reply lost with the socket
    this.onState({ status: "connecting" });
    const s = this.open();
    this.sock = s;
    this.ready = false;
    s.binaryType = "arraybuffer";
    s.onopen = () => {
      this.ready = true;
      const { cols, rows } = this.r.size();
      s.send(encodeResize(cols, rows));
      this.hooks.onSize?.(cols, rows);
      this.onState({ status: "open" });
      this.ping();
      this.pinger = setInterval(() => this.ping(), PING_INTERVAL_MS);
    };
    s.onmessage = (e) => this.onMessage(e.data);
    s.onclose = () => {
      if (this.sock === s) {
        this.sock = null;
        this.ready = false;
        this.stopPing();
      }
      this.endReplay();
      this.onState(
        this.killed
          ? { status: "closed", killed: true }
          : { status: "closed", exitCode: this.exitCode },
      );
    };
  }

  /** Raw input from elsewhere (broadcast): sent as typed, not re-broadcast. */
  input(d: Uint8Array): void {
    this.send(encodeInput(d));
  }

  dispose(): void {
    this.disposed = true;
    this.stopPing();
    this.endReplay();
    const s = this.sock;
    this.sock = null;
    if (s) {
      s.onclose = null;
      s.close();
    }
    this.r.dispose();
  }

  /** Ask the server to start/stop journaling this session. */
  setRecording(on: boolean): void {
    this.send(encodeJournalRecord(on));
  }

  /** Ask the server to drop its journal copy. */
  forget(): void {
    // Drop in-flight journal frames until the server confirms the wipe.
    this.forgetting = true;
    if (this.ready && this.sid) this.send(encodeJournalForget());
    else this.pendingForget = true; // sent after the next session frame
  }

  /** Ask the server to restore a disconnect gap from the host's scrollback. */
  restore(rec: number): void {
    this.send(encodeJournalRestore(rec));
  }

  private journaled(f: JournalEvent[]): void {
    const j = this.hooks.journal;
    if (!j || !this.sid || this.journalFailed || this.disposed) return;
    if (this.forgetting) return;
    // On failure stop acking: the server resends from its last ack on reconnect.
    ingest(j.db, j.pane, this.sid, f).then(
      (seq) =>
        seq > 0 && !this.journalFailed && this.send(encodeJournalAck(seq)),
      () => {
        this.journalFailed = true;
        if (!this.warned) console.warn("journal: save failed, not acking");
        this.warned = true;
      },
    );
  }

  private endReplay(): void {
    clearTimeout(this.replayTimer);
    this.replayTimer = undefined;
    this.replaying = false;
  }

  private ping(): void {
    this.send(encodePing(performance.now()));
  }

  private stopPing(): void {
    clearInterval(this.pinger);
    this.pinger = undefined;
  }

  private send(f: Uint8Array<ArrayBuffer>): void {
    if (this.ready) this.sock?.send(f);
  }

  private onMessage(buf: ArrayBuffer): void {
    const f = decodeFrame(buf);
    if (f.kind === "exit") {
      this.exitCode = f.code;
    } else if (f.kind === "killed") {
      this.killed = true;
    } else if (f.kind === "session") {
      this.sid = f.id;
      this.replaying = true;
      clearTimeout(this.replayTimer);
      this.replayTimer = setTimeout(() => this.endReplay(), REPLAY_TIMEOUT_MS);
      const pane = this.hooks.paneId;
      if (pane) this.setRecording(paneRecording(pane));
      if (this.pendingForget) {
        this.pendingForget = false;
        this.send(encodeJournalForget());
      }
    } else if (f.kind === "replayed") {
      // Replies are generated while parsing: clear once xterm has drained.
      this.r.write(new Uint8Array(0), () => this.endReplay());
    } else if (f.kind === "forgotten") {
      this.forgetting = false;
    } else if (f.kind === "journal") {
      this.journaled(f.events);
    } else if (f.kind === "pong") {
      this.hooks.onLatency?.(Math.round(performance.now() - f.t));
    } else if (f.kind === "output") {
      const n = f.data.length;
      this.hooks.onOutput?.(f.data);
      this.r.write(f.data, () => this.acked(n));
    }
  }

  private acked(n: number): void {
    this.pending += n;
    if (this.pending >= ACK_BATCH_BYTES) {
      this.send(encodeAck(this.pending));
      this.pending = 0;
    }
  }
}
