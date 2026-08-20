import { Bytes, dataSource, json, BigInt, JSONValueKind, log } from "@graphprotocol/graph-ts";
import { EducationModuleMetadata } from "../generated/schema";

/**
 * Handler for IPFS file data source that parses education module content JSON.
 *
 * Expected JSON structure:
 * {
 *   description: "Module description",
 *   link: "https://external-resource.com",
 *   quiz: ["What is X?", "What is Y?"],
 *   answers: [["a", "b", "c"], ["d", "e", "f"]]
 * }
 *
 * The `answers` field is a 2D array that cannot be stored natively in the subgraph,
 * so it is serialized to a JSON string for the frontend to parse.
 */
export function handleEducationModuleMetadata(content: Bytes): void {
  let ipfsCid = dataSource.stringParam();
  let context = dataSource.context();
  let moduleEntityId = context.getString("moduleEntityId");

  // The id is module-scoped, matching educationModuleMetadataId() in education-hub.ts and the
  // context key above — this row carries a `module` pointer, so a bare-CID id could only ever
  // point at one of the modules sharing that CID (and, being immutable, the second insert would
  // halt indexing). File data sources have no block context, so indexedAt is fixed at 0.
  let entityId = moduleEntityId + "-" + ipfsCid;

  let existing = EducationModuleMetadata.load(entityId);
  if (existing != null) {
    return;
  }

  let metadata = new EducationModuleMetadata(entityId);
  metadata.module = moduleEntityId;
  metadata.indexedAt = BigInt.fromI32(0);

  // Try to parse the JSON content
  let jsonResult = json.try_fromBytes(content);
  if (jsonResult.isError) {
    log.warning("[EducationModuleMetadata] Failed to parse JSON for CID: {}", [ipfsCid]);
    metadata.save();
    return;
  }

  let jsonValue = jsonResult.value;
  if (jsonValue.isNull() || jsonValue.kind != JSONValueKind.OBJECT) {
    metadata.save();
    return;
  }

  let jsonObject = jsonValue.toObject();

  // Parse description
  let descriptionValue = jsonObject.get("description");
  if (descriptionValue != null && !descriptionValue.isNull() && descriptionValue.kind == JSONValueKind.STRING) {
    metadata.description = descriptionValue.toString();
  }

  // Parse link
  let linkValue = jsonObject.get("link");
  if (linkValue != null && !linkValue.isNull() && linkValue.kind == JSONValueKind.STRING) {
    metadata.link = linkValue.toString();
  }

  // Parse quiz (array of question strings)
  let quizValue = jsonObject.get("quiz");
  if (quizValue != null && !quizValue.isNull() && quizValue.kind == JSONValueKind.ARRAY) {
    let quizArray = quizValue.toArray();
    let questions: string[] = [];
    for (let i = 0; i < quizArray.length; i++) {
      let q = quizArray[i];
      if (!q.isNull() && q.kind == JSONValueKind.STRING) {
        questions.push(q.toString());
      } else {
        questions.push("");
      }
    }
    metadata.quiz = questions;
  }

  // Parse answers (2D array) — serialize to JSON string
  // Input: [["opt1","opt2","opt3"], ["opt4","opt5","opt6"]]
  // Output: JSON string representation
  let answersValue = jsonObject.get("answers");
  if (answersValue != null && !answersValue.isNull() && answersValue.kind == JSONValueKind.ARRAY) {
    let outerArray = answersValue.toArray();
    let parts: string[] = [];

    for (let i = 0; i < outerArray.length; i++) {
      let innerValue = outerArray[i];
      if (!innerValue.isNull() && innerValue.kind == JSONValueKind.ARRAY) {
        let innerArray = innerValue.toArray();
        let innerParts: string[] = [];
        for (let j = 0; j < innerArray.length; j++) {
          let item = innerArray[j];
          if (!item.isNull() && item.kind == JSONValueKind.STRING) {
            // Escape quotes in the string value
            let val = item.toString();
            let escaped = "";
            for (let k = 0; k < val.length; k++) {
              let ch = val.charAt(k);
              if (ch == '"') {
                escaped += '\\"';
              } else if (ch == "\\") {
                escaped += "\\\\";
              } else {
                escaped += ch;
              }
            }
            innerParts.push('"' + escaped + '"');
          } else {
            innerParts.push('""');
          }
        }
        parts.push("[" + innerParts.join(",") + "]");
      }
    }

    metadata.answersJson = "[" + parts.join(",") + "]";
  }

  metadata.save();
}
