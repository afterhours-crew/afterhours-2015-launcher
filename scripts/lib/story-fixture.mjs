// Constructed, disposable contract data. No game assets, captures or real saves.
// The schema mirrors the public nfs-storage v5 format. Only this test helper
// creates databases; the graphical launcher always delegates writes to the CLI.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STORY_ACCOUNT = "11".repeat(16);
export const STORY_STARTERS = ["01", "02", "03"].map((byte) => byte.repeat(16));
const build = "92aa6ff4b5f8d0f033ca7e88cb86cc64b42b1d2412c4294905eb22950616e4df";
function key(name) {
  let value = 5381;
  for (const byte of Buffer.from(name)) value = (Math.imul(value, 33) ^ byte) >>> 0;
  return value;
}
export function storyFixture(data) {
  const accounts = join(data, "artifacts", "account");
  const content = join(data, "content");
  mkdirSync(accounts, { recursive: true });
  mkdirSync(content);
  const database = join(accounts, `${STORY_ACCOUNT}.sqlite`);
  const db = new DatabaseSync(database);
  try {
    db.exec(`
      PRAGMA application_id=1313231684;
      PRAGMA user_version=5;
      CREATE TABLE meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        account BLOB NOT NULL CHECK(length(account)=16), generation INTEGER NOT NULL CHECK(generation>=0),
        updated_at INTEGER NOT NULL CHECK(updated_at>=0), garage BLOB CHECK(garage IS NULL OR length(garage)=40)) STRICT;
      CREATE TABLE item(id BLOB PRIMARY KEY CHECK(length(id)=8), definition BLOB NOT NULL CHECK(length(definition)=16),
        owner BLOB NOT NULL CHECK(length(owner)=8), state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 255),
        buy_price INTEGER NOT NULL CHECK(buy_price BETWEEN 0 AND 4294967295),
        sell_price INTEGER NOT NULL CHECK(sell_price BETWEEN 0 AND 4294967295),
        default_items BLOB NOT NULL CHECK(length(default_items)<=2048 AND length(default_items)%8=0),
        sub_items BLOB NOT NULL CHECK(length(sub_items)<=2048 AND length(sub_items)%8=0),
        derived BLOB NOT NULL CHECK(length(derived)<=4096)) STRICT;
      CREATE TABLE batch(id BLOB PRIMARY KEY CHECK(length(id)=8), generation INTEGER NOT NULL CHECK(generation>0),
        applied_at INTEGER NOT NULL CHECK(applied_at>=0)) STRICT;
      CREATE TABLE persistent(id INTEGER PRIMARY KEY CHECK(id BETWEEN 0 AND 4294967295),
        rows BLOB NOT NULL CHECK(length(rows)<=131072)) STRICT;
      CREATE TABLE livery_record(name TEXT PRIMARY KEY CHECK(length(name) BETWEEN 1 AND 128),
        content_type TEXT NOT NULL CHECK(length(content_type) BETWEEN 1 AND 128),
        value BLOB NOT NULL CHECK(length(value)<=524288), created INTEGER NOT NULL CHECK(created>0),
        updated INTEGER NOT NULL CHECK(updated>=created)) STRICT;
    `);
    for (const [table, limit] of [
      ["identity_state", 4096],
      ["entitlement_state", 524288],
      ["kickback_state", 65536],
      ["speedwall_state", 65536],
      ["user_settings", 524288],
    ]) {
      db.exec(
        `CREATE TABLE ${table}(singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL CHECK(revision>0), value BLOB NOT NULL CHECK(length(value)>0 AND length(value)<=${limit})) STRICT`,
      );
    }
    db.prepare("INSERT INTO meta VALUES(1,?,1,1,?)").run(
      Buffer.from(STORY_ACCOUNT, "hex"),
      Buffer.alloc(40),
    );
    const empty = Buffer.from("54424c3100000000", "hex");
    for (const name of ["ProgressionObjective", "ProgressionStats"]) {
      db.prepare("INSERT INTO persistent VALUES(?,?)").run(key(name), empty);
    }
  } finally {
    db.close();
  }
  writeFileSync(
    join(data, "account.json"),
    JSON.stringify({ version: 1, local_account: STORY_ACCOUNT, progression: "fresh" }),
  );
  writeFileSync(
    join(content, "progression-content.json"),
    JSON.stringify({
      format: "nfs-progression-entities",
      version: 1,
      build_sha256: build,
      restoration: {
        version: 1,
        build_sha256: build,
        source: { path: "constructed", sha256: "00".repeat(32) },
        branches: [
          {
            name: "intro",
            objectives: [
              { id: 101, label: "Opening", active: { constant: true } },
              { id: 102, label: "First car", active: { completed: 101 } },
              { id: 103, label: "Drive", active: { completed: 102 } },
            ],
            ints: [],
          },
          { name: "main", objectives: [{ id: 201, active: { completed: 103 } }], ints: [] },
        ],
      },
      settings: { consumer_beta: false },
      story_editor: { version: 1, selection: "102", starters: STORY_STARTERS },
    }),
  );
  writeFileSync(
    join(content, "item-content.json"),
    JSON.stringify({
      format: "nfs-item-definitions",
      version: 2,
      build_sha256: build,
      initial_definitions: [],
      definitions: STORY_STARTERS.map((guid) => ({
        guid,
        class: "RaceVehicleItemData",
        buy_price: 100,
        sell_price: 60,
        quantity: 4294967295,
        ownership_level: 0,
        flags: {
          deprecated: false,
          requires_owner: false,
          uses_scope: true,
          purchasable: false,
          optional: false,
        },
        sub_items: [],
        additional_items: [],
        default_derived_hex: "00".repeat(68),
      })),
    }),
  );
  const tables = [
    ["ProgressionObjective", "ObjectiveID", 2],
    ["PersistentDataTable", "ValueId", 3],
    ["CollectiblesTable", "CollectibleID", 1],
    ["RepValuesTable", null, 7],
    ["DynamicMessage", "Index", 3],
    ["StaticMessage", "Index", 2],
    ["GameplayStatsTable", null, 9],
    ["UgStaticMessages", "Index", 2],
    ["PoiIdTable", "PoiId", 1],
    ["GarageItemsTable", "GarageVehicles", 5],
    ["TutorialTable", "ValueId", 1],
    ["TicketTable", "Ticketd", 1],
    ["ProgressionStats", null, 1],
    ["ActivitiesTable", "ActivityID", 1],
    ["SpeedListStatsTable", null, 10],
    ["PrestigeMedalTable", null, 6],
  ].map(([name, secondary_key, count]) => ({
    name,
    key: key(name),
    secondary_key,
    using_stores: secondary_key === null,
    write_whole_rows: false,
    columns: Array.from({ length: count }, (_, i) => {
      const column =
        name === "GarageItemsTable"
          ? ["PrimaryVehicleItem", "Vehicle1", "Vehicle2", "Vehicle3", "Vehicle4"][i]
          : name === "ProgressionObjective"
            ? ["Active", "Completed"][i]
            : `Column${i}`;
      return {
        name: column,
        key: key(column),
        value_type: name === "GarageItemsTable" ? "string" : "int",
        default: "0",
      };
    }),
  }));
  writeFileSync(
    join(content, "persistent-content.json"),
    JSON.stringify({
      version: 1,
      build_sha256: build,
      source: { path: "constructed", sha256: "00".repeat(32) },
      tables,
    }),
  );
  return { database, content };
}

export function storyInventory(database) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT hex(id) AS id, hex(definition) AS definition, hex(derived) AS tuning FROM item ORDER BY id",
      )
      .all();
  } finally {
    db.close();
  }
}
