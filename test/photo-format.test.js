import test from "node:test";
import fs from "node:fs/promises";
import prettier from "prettier";

test("print formatted photo transfer css", async () => {
  const source = await fs.readFile("src/photo-transfer-polish.css", "utf8");
  const formatted = await prettier.format(source, { parser: "css" });
  console.log("===PHOTO_TRANSFER_FORMATTED===\n" + formatted + "===END_PHOTO_TRANSFER_FORMATTED===");
  throw new Error("formatted output captured");
});
