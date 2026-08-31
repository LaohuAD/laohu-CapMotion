import * as fs from "node:fs/promises";
import path from "node:path";

const wait = (milliseconds) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function downloadFile(
	url,
	destination,
	{
		attempts = 3,
		retryDelayMs = 1_000,
		label = path.basename(destination),
		log = console.log,
	} = {},
) {
	if (!Number.isInteger(attempts) || attempts < 1)
		throw new Error("download attempts must be a positive integer");

	const partialPath = `${destination}.part`;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		await fs.rm(partialPath, { force: true });
		try {
			log(`Downloading ${label} (attempt ${attempt}/${attempts})`);
			const response = await fetch(url);
			if (!response.ok)
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			if (!response.body) throw new Error("response body is empty");

			const totalBytes = Number(response.headers.get("content-length")) || 0;
			let receivedBytes = 0;
			let lastReportedPercent = -10;
			const output = await fs.open(partialPath, "w");
			try {
				for await (const chunk of response.body) {
					await output.write(chunk);
					receivedBytes += chunk.byteLength;
					if (totalBytes > 0) {
						const percent = Math.floor((receivedBytes / totalBytes) * 10) * 10;
						if (percent >= lastReportedPercent + 10) {
							lastReportedPercent = Math.min(percent, 100);
							log(`Downloading ${label}: ${lastReportedPercent}%`);
						}
					}
				}
			} finally {
				await output.close();
			}

			if (totalBytes > 0 && receivedBytes !== totalBytes)
				throw new Error(
					`incomplete download: received ${receivedBytes} of ${totalBytes} bytes`,
				);

			await fs.rename(partialPath, destination);
			log(`Downloaded ${label}`);
			return;
		} catch (error) {
			await fs.rm(partialPath, { force: true });
			if (attempt === attempts)
				throw new Error(
					`Failed to download ${label} after ${attempts} attempts`,
					{
						cause: error,
					},
				);
			const detail = error instanceof Error ? error.message : String(error);
			log(`Download failed (${detail}); retrying ${label}`);
			if (retryDelayMs > 0) await wait(retryDelayMs);
		}
	}
}
