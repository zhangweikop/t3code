import { assert, it } from "@effect/vitest";
import { OrchestrationV2AppThreadJson, ThreadId } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

const decodeThread = Schema.decodeSync(Schema.fromJsonString(OrchestrationV2AppThreadJson));
const at = "2026-11-17T01:27:00.000Z";
const thread = (
  id: string,
  overrides: { readonly creationSource?: string; readonly subagentOf?: string } = {},
) => ({
  id,
  projectId: "project-1",
  title: id,
  providerInstanceId: "codex",
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdBy: overrides.creationSource === "mcp" ? "agent" : "user",
  creationSource: overrides.creationSource ?? "web",
  branch: null,
  worktreePath: null,
  activeProviderThreadId: null,
  lineage: {
    parentThreadId: overrides.subagentOf ?? null,
    relationshipToParent: overrides.subagentOf === undefined ? null : "subagent",
    rootThreadId: overrides.subagentOf ?? id,
  },
  forkedFrom: null,
  createdAt: at,
  updatedAt: at,
  archivedAt: null,
  deletedAt: null,
});

const layer = it.layer(NodeSqliteClient.layer({ filename: ":memory:" }));

layer("099_GroupLaunchedThreads", (it) => {
  it.effect("groups agent launches under the thread that sent their first message", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 98 });
      // [thread, senders of its user messages, oldest first]
      const fixtures = [
        [thread("lead"), []],
        [thread("worker", { creationSource: "mcp" }), ["lead", "other"]],
        [thread("scheduled-run", { creationSource: "mcp" }), [null]],
        [thread("sent-to-a-user-thread"), ["lead"]],
        [thread("subagent", { creationSource: "mcp", subagentOf: "lead" }), ["lead"]],
        [thread("sender-gone", { creationSource: "mcp" }), ["deleted-lead"]],
        [thread("idle-launch", { creationSource: "mcp" }), []],
      ] as const;
      for (const [fixture, senders] of fixtures) {
        const payload = JSON.stringify(fixture);
        yield* sql`
          INSERT INTO orchestration_v2_projection_threads (
            thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
            created_at, updated_at, payload_json
          ) VALUES (
            ${fixture.id}, 'project-1', ${fixture.title}, 'codex', 'full-access', 'default',
            ${at}, ${at}, ${payload}
          )
        `;
        for (const [ordinal, sender] of senders.entries()) {
          const message = { text: "Go", ...(sender === null ? {} : { senderThreadId: sender }) };
          yield* sql`
            INSERT INTO orchestration_v2_projection_messages (
              message_id, thread_id, run_id, node_id, role, streaming, created_at, updated_at,
              payload_json
            ) VALUES (
              ${`${fixture.id}:${ordinal}`}, ${fixture.id}, NULL, NULL, 'user', 0,
              ${`2026-11-17T01:2${7 + ordinal}:00.000Z`}, ${at}, ${JSON.stringify(message)}
            )
          `;
        }
      }

      // A malformed stored payload must not stop the server from starting.
      yield* sql`
        INSERT INTO orchestration_v2_projection_threads (
          thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
          created_at, updated_at, payload_json
        ) VALUES (
          'corrupt', 'project-1', 'corrupt', 'codex', 'full-access', 'default', ${at}, ${at},
          '{not json'
        )
      `;
      assert.deepEqual(yield* runMigrations({ toMigrationInclusive: 99 }), [
        [99, "GroupLaunchedThreads"],
      ]);
      const groupedUnder = Effect.fnUntraced(function* () {
        const rows = yield* sql<{ readonly thread_id: string; readonly payload_json: string }>`
          SELECT thread_id, payload_json FROM orchestration_v2_projection_threads
          WHERE thread_id <> 'corrupt'
          ORDER BY thread_id
        `;
        return Object.fromEntries(
          rows.flatMap((row) => {
            const grouped = decodeThread(row.payload_json).groupedUnderThreadId;
            return grouped === undefined ? [] : [[row.thread_id, grouped]];
          }),
        );
      });
      assert.deepEqual(yield* groupedUnder(), { worker: ThreadId.make("lead") });
    }),
  );
});
