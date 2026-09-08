import changelog from "./capmotion-changelog.json";
import type { AppLanguage } from "./i18n";

type LocalizedCopy = Record<AppLanguage, string>;

export type CapMotionChangelogEntry = {
	version: string;
	publishedAt: string;
	title: LocalizedCopy;
	content: LocalizedCopy;
};

export type LocalizedChangelogEntry = {
	version: string;
	publishedAt: string;
	title: string;
	content: string;
};

export const CAPMOTION_CHANGELOG =
	changelog as readonly CapMotionChangelogEntry[];

export function localizeChangelogEntry(
	entry: CapMotionChangelogEntry,
	language: AppLanguage,
): LocalizedChangelogEntry {
	return {
		version: entry.version,
		publishedAt: entry.publishedAt,
		title: entry.title[language],
		content: entry.content[language],
	};
}
