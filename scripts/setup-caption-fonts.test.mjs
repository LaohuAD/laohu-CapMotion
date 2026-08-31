import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureCaptionFont } from "./setup-caption-fonts.mjs";

test("downloads, caches and verifies a caption font", async (t) => {
	const payload = Buffer.from("test-font-bytes");
	const sha256 = createHash("sha256").update(payload).digest("hex");
	let requests = 0;
	const server = createServer((_request, response) => {
		requests += 1;
		response.end(payload);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => server.close());
	const address = server.address();
	assert.equal(typeof address, "object");
	const directory = await mkdtemp(path.join(tmpdir(), "cap-font-test-"));
	const entry = {
		url: `http://127.0.0.1:${address.port}/font.ttf`,
		fileName: "font.ttf",
		sha256,
	};

	await ensureCaptionFont(entry, directory, { log: () => {} });
	assert.deepEqual(await readFile(path.join(directory, "font.ttf")), payload);
	await ensureCaptionFont(entry, directory, { log: () => {} });
	assert.equal(requests, 1);

	await writeFile(path.join(directory, "font.ttf"), "corrupted");
	await assert.rejects(
		ensureCaptionFont({ ...entry, sha256: "0".repeat(64) }, directory, {
			log: () => {},
		}),
		/checksum/i,
	);
});
