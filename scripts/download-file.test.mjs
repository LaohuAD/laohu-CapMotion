import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { downloadFile } from "./download-file.mjs";

test("retries an interrupted download without keeping a partial archive", async () => {
	const payload = Buffer.from("complete native dependency");
	let requestCount = 0;
	const server = createServer((_request, response) => {
		requestCount += 1;
		response.writeHead(200, { "content-length": payload.length });
		if (requestCount === 1) {
			response.write(payload.subarray(0, 8));
			response.socket?.destroy();
			return;
		}
		response.end(payload);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

	const directory = await mkdtemp(path.join(tmpdir(), "cap-download-test-"));
	const destination = path.join(directory, "native-deps.tgz");
	try {
		const address = server.address();
		assert.notEqual(address, null);
		assert.equal(typeof address, "object");
		await downloadFile(
			`http://127.0.0.1:${address.port}/native-deps.tgz`,
			destination,
			{ attempts: 2, retryDelayMs: 0, log: () => {} },
		);

		assert.equal(requestCount, 2);
		assert.deepEqual(await readFile(destination), payload);
		assert.deepEqual(await readdir(directory), ["native-deps.tgz"]);
	} finally {
		server.close();
		await rm(directory, { recursive: true, force: true });
	}
});
