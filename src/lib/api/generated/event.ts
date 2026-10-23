// Generated from schemas/event.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * One line of the event stream.
 */
export type Event = {
  /**
   * When the event was written, UTC.
   */
  utc: string;
  version: 1;
} & (
  | {
      action: Action;
      data_directory: string;
      event: "session";
      /**
       * Session ID: 32 lowercase hexadecimal characters.
       */
      id: string;
      /**
       * `artifacts/launcher/<id>/` with this session's logs and records.
       */
      session_directory: string;
    }
  | {
      event: "status";
      status: Status;
    }
  | {
      event: "diagnostic";
      source: DiagnosticSource;
      text: string;
    }
  | {
      event: "map-feed";
      /**
       * The server's frame number: one more for every frame it wrote,
       * so frames only move forward.
       */
      frame: number;
      /**
       * Frames the server wrote since the previous `map-feed` event that
       * were not delivered: a newer one arrived before the supervisor's
       * next poll, or one could not be read.
       */
      skipped: number;
      /**
       * Every world session, by `connection`.
       */
      worlds: MapWorld[];
    }
  | {
      event: "final";
      /**
       * The process exit code; see the exit code table in `--help`.
       */
      exit_code: number;
      /**
       * Why the command failed; `null` on success.
       */
      message: string | null;
      /**
       * The session's final status; `null` when the command was refused
       * before the supervisor recorded one.
       */
      status: Status | null;
    }
);
/**
 * What a session was asked to do.
 */
export type Action = "setup" | "serve" | "start";
/**
 * Session states, in the order a successful session passes through them.
 */
export type State =
  | "preparing"
  | "starting"
  | "activation"
  | "ready"
  | "stopping"
  | "finished"
  | "failed"
  | "interrupted";
/**
 * The child that wrote a diagnostic line.
 */
export type DiagnosticSource = "prepare" | "create-account" | "server" | "game";

/**
 * `artifacts/launcher/<id>/status.json`: the supervisor's latest state.
 * Also the final record of `setup`, `serve` and `start` with `--json`.
 */
export interface Status {
  /**
   * What the session was started as. `serve` hosts the server and may
   * start the game on request; `null` only in records written before
   * this field existed.
   */
  action: Action | null;
  game_pid: number | null;
  /**
   * Whether the session's game process is running: from its start until
   * it exits. With `action` `serve` this tells hosting from playing.
   * Always `false` for an interrupted session.
   */
  game_running: boolean;
  /**
   * Session ID: 32 lowercase hexadecimal characters.
   */
  id: string;
  /**
   * What the session is doing or why it ended, for a person to read.
   */
  message: string;
  server_pid: number | null;
  state: State;
  /**
   * When this state was recorded, UTC. Records written by the old
   * PowerShell launcher use a longer ISO 8601 form with an offset.
   */
  utc: string;
  version: 1;
  /**
   * Supervisor process ID when recorded. Process IDs may be reused after
   * the process exits; verify identity before acting on one.
   */
  worker_pid: number;
}
/**
 * One world session: the server's view of one game client.
 */
export interface MapWorld {
  /**
   * The server's control connection of this game client; one world
   * session each. Unique and ascending within a frame.
   */
  connection: number;
  /**
   * The players' cars driving in the world, by `participant`.
   */
  drivers: MapDriver[];
  /**
   * Cars the server left out of this frame: no usable position, state
   * that could not be read, or beyond a bound.
   */
  omitted: number;
  /**
   * The player's persona: `persona_id` in `profile` for the same driver.
   */
  persona_id: string;
  /**
   * Roaming rivals, by `id`: the car while the game drives it, otherwise
   * the server's simulation of the racer on the road network.
   */
  rivals: MapCar[];
  /**
   * Ambient traffic cars, by `id`.
   */
  traffic: MapCar[];
  /**
   * The radii the native traffic policy uses around each driver; `null`
   * without traffic or while it is off.
   */
  traffic_ring: TrafficRing | null;
  /**
   * Milliseconds since this world session started, when it was observed.
   */
  world_ms: number;
}
/**
 * A player's car.
 */
export interface MapDriver {
  /**
   * Degrees clockwise from up the map, `0 <= heading < 360`, to a tenth;
   * `null` when unknown.
   */
  heading: number | null;
  /**
   * The player's participant in its world session. Unique within it.
   */
  participant: number;
  /**
   * Metres per second.
   */
  speed: number;
  /**
   * World x in metres, to the centimetre: +x points right on the map.
   */
  x: number;
  /**
   * Height in metres, to the centimetre.
   */
  y: number;
  /**
   * World z in metres, to the centimetre: +z points down the map.
   */
  z: number;
}
/**
 * A traffic car or a roaming rival.
 */
export interface MapCar {
  /**
   * Degrees clockwise from up the map, `0 <= heading < 360`, to a tenth;
   * `null` when unknown.
   */
  heading: number | null;
  /**
   * Unique within its list for the world session, never reused there.
   */
  id: number;
  /**
   * World x in metres, to the centimetre: +x points right on the map.
   */
  x: number;
  /**
   * Height in metres, to the centimetre.
   */
  y: number;
  /**
   * World z in metres, to the centimetre: +z points down the map.
   */
  z: number;
}
/**
 * Horizontal metres around each driver. Cars are created between `inner`
 * and a little more than `outer` ahead of where the driver will be in about
 * three seconds (a quarter of that to the sides), and kept while within
 * `outer` of the driver.
 */
export interface TrafficRing {
  /**
   * Metres; cars are created beyond this.
   */
  inner: number;
  /**
   * Metres; cars are kept within this.
   */
  outer: number;
}
