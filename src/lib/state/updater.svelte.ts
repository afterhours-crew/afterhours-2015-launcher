// Carries out the update rules in updates.ts: background checks, the Ask
// banner, automatic installs, waiting for sessions to end, and the save
// backup before a server change. Every check is bounded and fails quietly
// unless the user asked for it; nothing here ever blocks Play, except the
// few seconds of the install itself, when the app is about to close.

import { api, checkForUpdate, inTauri, type FoundUpdate } from "$lib/api/tauri";
import type { BackupReport, UpdateMode } from "$lib/api/types";
import { session } from "./session.svelte";
import {
  CHECK_INTERVAL_MS,
  CHECK_TIMEOUT_MS,
  FIRST_CHECK_DELAY_MS,
  WAIT_RETRY_MS,
  backgroundChecks,
  backupPlan,
  candidateServer,
  evaluateCandidate,
  installGate,
  nextStep,
  type Candidate,
  type Gate,
  type Offer,
  type Step,
} from "./updates";

export type Phase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "refused"
  | "waiting"
  | "downloading"
  | "installing"
  | "error";

function text(e: unknown): string {
  return String(e instanceof Error ? e.message : e);
}

export class Updater {
  phase = $state<Phase>("idle");
  candidate = $state<Candidate | null>(null);
  offer = $state<Offer | null>(null);
  gate = $state<Gate | null>(null);
  step = $state<Step>("nothing");
  message = $state<string | null>(null);
  checkedAt = $state<Date | null>(null);
  progress = $state<{ downloaded: number; total: number | null } | null>(null);
  backup = $state<BackupReport | null>(null);
  /** Later: no banner for this candidate until the next check the user asks for. */
  dismissed = $state(false);

  private found: FoundUpdate | null = null;
  private downloaded = false;
  private wantInstall = false;
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  get busy(): boolean {
    return ["checking", "downloading", "installing"].includes(this.phase);
  }

  /** Play is held only while the installer is about to take over. */
  get holdsPlay(): boolean {
    return this.phase === "installing";
  }

  get bannerVisible(): boolean {
    return (
      this.step === "banner" ||
      this.step === "wait" ||
      this.phase === "downloading" ||
      this.phase === "installing" ||
      (this.wantInstall && this.phase === "error")
    );
  }

  /** Begin background checks; called once the window has loaded. */
  start(): void {
    if (this.started || !inTauri) return;
    this.started = true;
    this.scheduleCheck(FIRST_CHECK_DELAY_MS);
  }

  private scheduleCheck(ms: number): void {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => void this.background(), ms);
  }

  private async background(): Promise<void> {
    if (backgroundChecks(session.settings.updates.mode) && !this.busy && !this.wantInstall) {
      await this.check(false);
    }
    this.scheduleCheck(CHECK_INTERVAL_MS);
  }

  /** Ask the update endpoint. Errors are shown only when `manual`. */
  async check(manual: boolean): Promise<void> {
    if (this.busy) return;
    this.phase = "checking";
    if (manual) {
      this.message = null;
      this.dismissed = false;
    }
    try {
      const found = await checkForUpdate(CHECK_TIMEOUT_MS);
      this.checkedAt = new Date();
      if (this.found && this.found !== found) await this.found.close().catch(() => {});
      this.found = found;
      this.downloaded = false;
      if (!found) {
        this.reset("current");
        return;
      }
      const info = session.info;
      this.candidate = {
        version: found.version,
        notes: found.notes,
        date: found.date,
        server: candidateServer(found.rawJson),
      };
      this.offer = evaluateCandidate({
        currentVersion: info?.launcher_version ?? found.currentVersion,
        currentServerTag: info?.server.pinned_tag ?? "",
        candidate: this.candidate,
        skippedVersion: session.settings.updates.skipped_version,
      });
      if (this.offer.kind === "refused") {
        this.phase = "refused";
        this.step = "nothing";
        this.message = this.offer.message;
        return;
      }
      if (this.offer.kind === "none") {
        this.reset("current");
        return;
      }
      this.phase = "available";
      this.message = null;
      await this.decide(manual);
    } catch (e) {
      // Offline, or the endpoint is unreachable: quiet unless asked.
      this.phase = manual ? "error" : "idle";
      if (manual) this.message = `Could not check for updates: ${text(e)}`;
    }
  }

  private reset(phase: Phase): void {
    this.phase = phase;
    this.candidate = null;
    this.offer = null;
    this.step = "nothing";
    this.wantInstall = false;
  }

  private async readGate(): Promise<Gate> {
    try {
      return installGate(await api.sessionActivity());
    } catch (e) {
      return {
        allowed: false,
        reason: "unverified-session",
        message: `The update waits: could not check for a running session (${text(e)}).`,
      };
    }
  }

  private async decide(manual: boolean): Promise<void> {
    if (!this.offer) return;
    const mode = session.settings.updates.mode;
    if (mode === "auto") this.gate = await this.readGate();
    this.step = nextStep({
      mode,
      offer: this.offer,
      gate: this.gate,
      dismissed: this.dismissed,
      manual,
    });
    if (this.step === "install") await this.install();
    else if (this.step === "wait") this.waitForSession();
  }

  private waitForSession(): void {
    this.wantInstall = true;
    this.phase = "waiting";
    this.message = this.gate && !this.gate.allowed ? this.gate.message : null;
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.waitTimer = setTimeout(() => void this.install(), WAIT_RETRY_MS);
  }

  /**
   * Update: download, then with Play held re-check that no session runs,
   * copy the saves if the server changes, and hand over to the installer.
   * A running session makes it wait and try again every minute.
   */
  async install(): Promise<void> {
    if (!this.found || this.offer?.kind !== "offer" || !this.candidate?.server) return;
    if (this.phase === "downloading" || this.phase === "installing") return;
    this.wantInstall = true;
    this.step = "banner";
    const found = this.found;
    const server = this.candidate.server;
    try {
      if (!this.downloaded) {
        this.phase = "downloading";
        this.progress = { downloaded: 0, total: null };
        await found.download((downloaded, total) => (this.progress = { downloaded, total }));
        this.downloaded = true;
      }
      this.phase = "installing";
      this.gate = await this.readGate();
      if (!this.gate.allowed) {
        this.waitForSession();
        return;
      }
      const plan = backupPlan(session.serverTag ?? "", server);
      if (plan.required) {
        try {
          this.backup = await api.backupSaves(plan.from, plan.to);
        } catch (e) {
          this.phase = "error";
          this.message = `Your saves could not be copied, so the update did not install: ${text(e)}`;
          return;
        }
      }
      await found.install();
    } catch (e) {
      this.phase = "error";
      this.message = this.downloaded
        ? `The update did not install: ${text(e)}`
        : `The update could not be downloaded: ${text(e)}`;
    }
  }

  /** Later: hide the banner and cancel a pending install until the next check. */
  later(): void {
    this.dismissed = true;
    this.wantInstall = false;
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.step = "nothing";
    if (this.phase === "waiting" || this.phase === "error") this.phase = "available";
  }

  async skip(): Promise<void> {
    if (!this.candidate) return;
    await session.save({
      updates: { ...session.settings.updates, skipped_version: this.candidate.version },
    });
    this.later();
    if (this.offer?.kind === "offer") this.offer = { ...this.offer, skipped: true };
  }

  async setMode(mode: UpdateMode): Promise<void> {
    await session.save({ updates: { ...session.settings.updates, mode } });
    if (mode === "auto" && this.phase === "available") await this.decide(false);
  }
}

export const updater = new Updater();
