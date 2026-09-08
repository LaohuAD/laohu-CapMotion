import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { downloadFile } from "./download-file.mjs";

export const CAPTION_FONTS = [
	{
		family: "Source Han Sans CN VF",
		weight: 400,
		fileName: "SourceHanSansSC-Regular.otf",
		url: "https://github.com/adobe-fonts/source-han-sans/raw/2.005R/OTF/SimplifiedChinese/SourceHanSansSC-Regular.otf",
		sha256: "f1d8611151880c6c336aabeac4640ef434fa13cbfbf1ffe82d0a71b2a5637256",
	},
	{
		family: "Source Han Sans CN VF",
		weight: 500,
		fileName: "SourceHanSansSC-Medium.otf",
		url: "https://github.com/adobe-fonts/source-han-sans/raw/2.005R/OTF/SimplifiedChinese/SourceHanSansSC-Medium.otf",
		sha256: "1df61d31687d04fd2f928a3bb6ca6cd61f0e988cc267cf317f32406edbb49f70",
	},
	{
		family: "Source Han Sans CN VF",
		weight: 700,
		fileName: "SourceHanSansSC-Bold.otf",
		url: "https://github.com/adobe-fonts/source-han-sans/raw/2.005R/OTF/SimplifiedChinese/SourceHanSansSC-Bold.otf",
		sha256: "df2b90f5bcc6d01dfc964cec5f6d535d6b6aebd26ed7fd79a9c1b3f2112fcb6b",
	},
	{
		family: "Source Han Serif CN VF",
		weight: 400,
		fileName: "SourceHanSerifSC-Regular.otf",
		url: "https://github.com/adobe-fonts/source-han-serif/raw/2.003R/OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf",
		sha256: "78aa7a328fd974df2d688c8a9fd74a33d8334dfa84ab24d9d11efb2ffc464117",
	},
	{
		family: "Source Han Serif CN VF",
		weight: 500,
		fileName: "SourceHanSerifSC-Medium.otf",
		url: "https://github.com/adobe-fonts/source-han-serif/raw/2.003R/OTF/SimplifiedChinese/SourceHanSerifSC-Medium.otf",
		sha256: "1d4dc4b757c07034e2412d6edf48f54f94ec7172d4deb3b90a3e4fc9dcb94f5d",
	},
	{
		family: "Source Han Serif CN VF",
		weight: 700,
		fileName: "SourceHanSerifSC-Bold.otf",
		url: "https://github.com/adobe-fonts/source-han-serif/raw/2.003R/OTF/SimplifiedChinese/SourceHanSerifSC-Bold.otf",
		sha256: "706b8c0de2deff6cbc0c87e2cdedfd33a78b7ffd76cebb4549012f197ba611fe",
	},
	{
		family: "LXGW WenKai",
		weight: 300,
		fileName: "LXGWWenKai-Light.ttf",
		url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Light.ttf",
		sha256: "526ec70cbb0118e871d481f8179e03ff045f0e4d72d080dcca87950c4ab27cca",
	},
	{
		family: "LXGW WenKai",
		weight: 400,
		fileName: "LXGWWenKai-Regular.ttf",
		url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf",
		sha256: "39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009",
	},
	{
		family: "LXGW WenKai",
		weight: 500,
		fileName: "LXGWWenKai-Medium.ttf",
		url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Medium.ttf",
		sha256: "d4bdeb38a39151d74d084cba5090f8cb7d20bf83eedb78c35939ae70b9f4e3f6",
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
