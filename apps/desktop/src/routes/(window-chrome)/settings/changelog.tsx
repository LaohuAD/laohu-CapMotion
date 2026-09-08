import { For, Show } from "solid-js";
import { SolidMarkdown } from "solid-markdown";

import {
	CAPMOTION_CHANGELOG,
	localizeChangelogEntry,
} from "~/capmotion-changelog";
import { useI18n } from "~/i18n";
import { SettingsPageContent } from "./Setting";

export default function Page() {
	const { text, language } = useI18n();
	const entries = () =>
		CAPMOTION_CHANGELOG.map((entry) =>
			localizeChangelogEntry(entry, language()),
		);

	return (
		<div class="cap-settings-page flex flex-col h-full custom-scroll">
			<SettingsPageContent class="max-w-none">
				<div class="flex flex-col gap-6 text-sm font-normal">
					<ul class="space-y-8">
						<For each={entries()}>
							{(entry, i) => (
								<li class="border-b-2 border-(--gray-200) pb-8 last:border-b-0">
									<div class="flex mb-2">
										<Show when={i() === 0}>
											<div class="bg-(--blue-400) text-(--text-primary) px-2 py-1 rounded-md uppercase font-bold">
												<span style="color: #fff" class="text-xs">
													{text("New")}
												</span>
											</div>
										</Show>
									</div>
									<h3 class="text-sm font-semibold tracking-tight text-gray-12 mb-2">
										{entry.title}
									</h3>
									<div class="text-xs leading-relaxed text-gray-10 mb-4">
										{text("Version")} {entry.version} -{" "}
										{new Date(entry.publishedAt).toLocaleDateString(language())}
									</div>
									<SolidMarkdown
										components={{
											a: (props) => <a {...props} target="_blank" />,
										}}
										class="prose dark:prose-invert prose-sm max-w-none text-(--text-tertiary)"
									>
										{entry.content}
									</SolidMarkdown>
								</li>
							)}
						</For>
					</ul>
				</div>
			</SettingsPageContent>
		</div>
	);
}
