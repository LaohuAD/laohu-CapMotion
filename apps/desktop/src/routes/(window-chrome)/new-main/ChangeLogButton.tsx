import { makePersisted } from "@solid-primitives/storage";
import { getVersion } from "@tauri-apps/api/app";
import { createEffect, createResource } from "solid-js";
import { createStore } from "solid-js/store";
import { CAPMOTION_CHANGELOG } from "~/capmotion-changelog";
import Tooltip from "~/components/Tooltip";
import { useI18n } from "~/i18n";
import { hideCurrentWindow } from "~/utils/hide-window";
import { commands } from "~/utils/tauri";
import IconLucideBell from "~icons/lucide/bell";

const ChangelogButton = () => {
	const { t } = useI18n();
	const [changelogState, setChangelogState] = makePersisted(
		createStore({
			hasUpdate: false,
			lastOpenedVersion: "",
			changelogClicked: false,
		}),
		{ name: "changelogState" },
	);

	const [currentVersion] = createResource(() => getVersion());

	const handleChangelogClick = () => {
		commands.showWindow({ Settings: { page: "changelog" } });
		hideCurrentWindow();
		const version = currentVersion();
		if (version) {
			setChangelogState({
				hasUpdate: false,
				lastOpenedVersion: version,
				changelogClicked: true,
			});
		}
	};

	createEffect(() => {
		const version = currentVersion();
		if (
			version &&
			CAPMOTION_CHANGELOG.some((entry) => entry.version === version) &&
			changelogState.lastOpenedVersion !== version
		) {
			setChangelogState({
				hasUpdate: true,
				lastOpenedVersion: version,
				changelogClicked: false,
			});
		}
	});

	return (
		<Tooltip openDelay={0} content={t("capture.changelog")}>
			<button
				type="button"
				onClick={handleChangelogClick}
				class="flex relative justify-center items-center size-5"
			>
				<IconLucideBell class="transition-colors text-gray-11 size-4 hover:text-gray-12" />
				{changelogState.hasUpdate && (
					<div
						style={{ "background-color": "#FF4747" }}
						class="block z-10 absolute top-0 right-0 size-1.5 rounded-full animate-bounce"
					/>
				)}
			</button>
		</Tooltip>
	);
};

export default ChangelogButton;
