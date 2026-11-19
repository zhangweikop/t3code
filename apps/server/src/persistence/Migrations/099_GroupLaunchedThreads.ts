import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Before groupedUnderThreadId, t3_thread_launch recorded its caller only as the
// sender of the new thread's first message.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    UPDATE orchestration_v2_projection_threads
    SET payload_json = json_set(
      orchestration_v2_projection_threads.payload_json,
      '$.groupedUnderThreadId',
      launched.sender
    )
    FROM (
      SELECT thread.thread_id, (
        SELECT json_extract(message.payload_json, '$.senderThreadId')
        FROM orchestration_v2_projection_messages AS message
        WHERE message.thread_id = thread.thread_id AND message.role = 'user'
          AND json_valid(message.payload_json)
        ORDER BY message.created_at, message.message_id
        LIMIT 1
      ) AS sender
      FROM orchestration_v2_projection_threads AS thread
      WHERE json_valid(thread.payload_json)
        AND json_extract(thread.payload_json, '$.creationSource') = 'mcp'
        AND json_type(thread.payload_json, '$.lineage.relationshipToParent') = 'null'
        AND json_type(thread.payload_json, '$.groupedUnderThreadId') IS NULL
    ) AS launched
    JOIN orchestration_v2_projection_threads AS sender ON sender.thread_id = launched.sender
    WHERE orchestration_v2_projection_threads.thread_id = launched.thread_id
  `;
});
