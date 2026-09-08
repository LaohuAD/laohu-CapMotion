const punctuationOnly = /^[，。！？；：、,.!?;:\s]+$/u;
const hardBoundary = /[。！？!?；;]$/u;
const softBoundary = /[，,、：:]$/u;
const latinEdge = /[A-Za-z0-9]$/;
const latinStart = /^[A-Za-z0-9]/;
const hanPhraseSeparator = /(\p{Script=Han})[\t ]+(?=\p{Script=Han})/gu;

export const normalizeDisplayCaptionText = (text, language) => {
	const value = String(text ?? "").trim();
	return language === "zh-CN" ? value.replace(hanPhraseSeparator, "$1") : value;
};

export const validTimedWords = (utterance) =>
	(utterance.words ?? []).filter(
		(word) =>
			String(word.text ?? "").trim() &&
			Number.isFinite(word.globalStartMs) &&
			Number.isFinite(word.globalEndMs) &&
			word.globalStartMs >= 0 &&
			word.globalEndMs > word.globalStartMs,
	);

export const buildWordTightRanges = (
	utterance,
	{ maxGapSeconds = 0.22, paddingSeconds = 0.08 } = {},
) => {
	const words = validTimedWords(utterance).filter(
		(word) => !punctuationOnly.test(String(word.text)),
	);
	if (words.length === 0) return [];
	const clusters = [];
	let cluster = [words[0]];
	for (const word of words.slice(1)) {
		const gap = (word.globalStartMs - cluster.at(-1).globalEndMs) / 1000;
		if (gap > maxGapSeconds) {
			clusters.push(cluster);
			cluster = [word];
		} else {
			cluster.push(word);
		}
	}
	clusters.push(cluster);
	return clusters.map((items) => ({
		start: Math.max(0, items[0].globalStartMs / 1000 - paddingSeconds),
		end: items.at(-1).globalEndMs / 1000 + paddingSeconds,
		words: items,
	}));
};

const joinWords = (words) => {
	let text = "";
	for (const word of words) {
		const value = String(word.text ?? "").trim();
		if (!value) continue;
		if (text && latinEdge.test(text) && latinStart.test(value)) text += " ";
		text += value;
	}
	return text;
};

const visibleLength = (text) =>
	text.replace(/[\s，。！？；：、,.!?;:]/gu, "").length;

export const buildDisplayCaptionSegments = (
	utterances,
	{
		correctText = (text) => text,
		minChars = 6,
		maxChars = 18,
		maxDurationSeconds = 4,
	} = {},
) => {
	const result = [];
	let id = 0;
	for (const utterance of utterances) {
		const utteranceResultStart = result.length;
		const words = validTimedWords(utterance);
		let group = [];
		const flush = () => {
			const timed = group.filter(
				(word) => !punctuationOnly.test(String(word.text)),
			);
			if (timed.length === 0) {
				group = [];
				return;
			}
			const text = correctText(joinWords(group))
				.replace(/^[，。！？；：、,.!?;:\s]+|[，。！？；：、,.!?;:\s]+$/gu, "")
				.trim();
			if (text) {
				id += 1;
				result.push({
					id: `display-${id}`,
					start: timed[0].globalStartMs / 1000,
					end: timed.at(-1).globalEndMs / 1000,
					text,
					words: timed.map((word) => ({
						text: String(word.text).trim(),
						start: word.globalStartMs / 1000,
						end: word.globalEndMs / 1000,
					})),
				});
			}
			group = [];
		};

		for (const word of words) {
			if (
				group.length > 0 &&
				word.globalStartMs - group.at(-1).globalEndMs > 220
			)
				flush();
			const candidate = [...group, word];
			const text = joinWords(candidate);
			const duration =
				group.length === 0
					? 0
					: (word.globalEndMs - group[0].globalStartMs) / 1000;
			if (
				group.length > 0 &&
				(visibleLength(text) > maxChars || duration > maxDurationSeconds)
			)
				flush();
			group.push(word);
			const currentText = joinWords(group);
			if (
				hardBoundary.test(currentText) ||
				(softBoundary.test(currentText) &&
					visibleLength(currentText) >= minChars)
			)
				flush();
		}
		flush();

		const localSegments = result.slice(utteranceResultStart);
		const refresh = (segment) => {
			segment.start = segment.words[0].start;
			segment.end = segment.words.at(-1).end;
			segment.text = correctText(joinWords(segment.words)).trim();
		};
		for (let index = localSegments.length - 1; index > 0; index -= 1) {
			const current = localSegments[index];
			const previous = localSegments[index - 1];
			if (visibleLength(current.text) >= minChars) continue;
			const combinedLength =
				visibleLength(previous.text) + visibleLength(current.text);
			const combinedDuration = current.end - previous.start;
			if (
				combinedLength <= maxChars &&
				combinedDuration <= maxDurationSeconds
			) {
				previous.words.push(...current.words);
				refresh(previous);
				localSegments.splice(index, 1);
				continue;
			}
			while (
				visibleLength(current.text) < minChars &&
				previous.words.length > 1 &&
				visibleLength(previous.text) > minChars
			) {
				current.words.unshift(previous.words.pop());
				refresh(previous);
				refresh(current);
			}
		}
		result.splice(
			utteranceResultStart,
			result.length - utteranceResultStart,
			...localSegments,
		);
	}

	// 识别引擎会把一个完整意群切成多个 utterance。对孤立短片段再做一次
	// 跨 utterance 的语义方向合并，避免“他 / 把锤子收回”这类断裂字幕。
	const forwardFragment =
		/^(?:然后|所以|但是|如果|他|她|它|我拿|放到|参考图|正常的)/u;
	const refreshGlobal = (segment) => {
		segment.start = segment.words[0].start;
		segment.end = segment.words.at(-1).end;
		segment.text = correctText(joinWords(segment.words)).trim();
	};
	for (let index = 0; index < result.length; index += 1) {
		const current = result[index];
		if (visibleLength(current.text) >= minChars) continue;
		const previous = result[index - 1];
		const next = result[index + 1];
		const canMerge = (left, right) =>
			left &&
			right &&
			right.start - left.end <= 1.2 &&
			visibleLength(left.text) + visibleLength(right.text) <= maxChars &&
			right.end - left.start <= maxDurationSeconds + 1.2;
		if (
			(forwardFragment.test(current.text) || !previous) &&
			canMerge(current, next)
		) {
			current.words.push(...next.words);
			refreshGlobal(current);
			result.splice(index + 1, 1);
			index -= 1;
		} else if (canMerge(previous, current)) {
			previous.words.push(...current.words);
			refreshGlobal(previous);
			result.splice(index, 1);
			index -= 2;
		} else if (canMerge(current, next)) {
			current.words.push(...next.words);
			refreshGlobal(current);
			result.splice(index + 1, 1);
			index -= 1;
		}
	}
	result.forEach((segment, index) => {
		segment.id = `display-${index + 1}`;
	});
	return result;
};

export const buildBilingualCapCaptionTracks = (
	bilingual,
	{
		chinese = {
			fontSize: 64,
			position: "manual",
			manualPosition: { x: 0.5, y: 0.865 },
		},
		english = {
			fontSize: 34,
			position: "manual",
			manualPosition: { x: 0.5, y: 0.93 },
		},
	} = {},
) => {
	if (!Array.isArray(bilingual?.segments))
		throw new Error("bilingual captions must contain segments");
	const makeSegments = (language) =>
		bilingual.segments.map((segment, index) => {
			const pairId = String(segment.id ?? `caption-${index + 1}`);
			const text = normalizeDisplayCaptionText(
				language === "zh-CN" ? segment.text : (segment.en ?? ""),
				language,
			);
			if (!text) throw new Error(`${pairId} is missing ${language} text`);
			const start = Number(segment.targetStart ?? segment.start);
			const end = Number(segment.targetEnd ?? segment.end);
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
				throw new Error(`${pairId} has an invalid target range`);
			}
			return {
				id: language === "zh-CN" ? pairId : `${pairId}-en`,
				pairId,
				start,
				end,
				text,
				words: [],
			};
		});

	return {
		schema: "laohu.cap-caption-tracks/1",
		tracks: [
			{
				id: "zh-CN",
				label: "中文字幕",
				language: "zh-CN",
				style: chinese,
				segments: makeSegments("zh-CN"),
			},
			{
				id: "en",
				label: "English Captions",
				language: "en",
				style: english,
				segments: makeSegments("en"),
			},
		],
	};
};
