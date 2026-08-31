import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { downloadFile } from "./download-file.mjs";

export const CAPTION_FONTS = [
	{
		family: "Source Han Sans CN VF",
		fileName: "SourceHanSansCN-VF.ttf",
		url: "https://github.com/adobe-fonts/source-han-sans/raw/2.005R/Variable/TTF/Subset/SourceHanSansCN-VF.ttf",
		sha256: "25a01e41b5cc99893eb35a6cd2cc7611841dc19eb03cbaf7f0c1de8210f2ba0b",
	},
	{
		family: "Source Han Serif CN VF",
		fileName: "SourceHanSerifCN-VF.ttf",
		url: "https://github.com/adobe-fonts/source-han-serif/raw/2.003R/Variable/TTF/Subset/SourceHanSerifCN-VF.ttf",
		sha256: "8e052cbcdbd0f03496c9ad05da7d57901549286d5efd30f3caf66a393f6c389b",
	},
	{
		family: "LXGW WenKai",
		fileName: "LXGWWenKai-Regular.ttf",
		url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf",
		sha256: "39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009",
	},
];

async function digest(file) {
	return createHash("sha256")
		.update(await readFile(file))
		.digest("hex");
}

export async function ensureCaptionFont(
	entry,
	directory,
	{ log = console.log } = {},
) {
	if (!/^[a-f\d]{64}$/i.test(entry.sha256 ?? ""))
		throw new Error(`Invalid checksum for ${entry.fileName}`);

	await mkdir(directory, { recursive: true });
	const destination = path.join(directory, entry.fileName);
	try {
		if ((await digest(destination)) === entry.sha256) {
			log(`Using verified ${entry.fileName}`);
			return destination;
		}
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}

	await rm(destination, { force: true });
	await downloadFile(entry.url, destination, {
		label: entry.fileName,
		log,
	});
	const actual = await digest(destination);
	if (actual !== entry.sha256) {
		await rm(destination, { force: true });
		throw new Error(
			`Caption font checksum mismatch for ${entry.fileName}: expected ${entry.sha256}, received ${actual}`,
		);
	}
	return destination;
}

export async function setupCaptionFonts(root, options) {
	const directory = path.join(root, "crates/rendering/assets/caption-fonts");
	for (const entry of CAPTION_FONTS)
		await ensureCaptionFont(entry, directory, options);
}
