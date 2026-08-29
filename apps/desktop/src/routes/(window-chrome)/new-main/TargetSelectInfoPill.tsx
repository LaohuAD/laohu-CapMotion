import type { Component, ComponentProps } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useI18n } from "~/i18n";
import type { InfoPillVariant } from "./InfoPill";

export default function TargetSelectInfoPill<T>(props: {
	value: T | null;
	permissionGranted: boolean;
	disconnected?: boolean;
	requestPermission: () => void;
	onClick: (e: MouseEvent) => void;
	PillComponent: Component<
		ComponentProps<"button"> & { variant: InfoPillVariant }
	>;
}) {
	const { t } = useI18n();
	const variant = (): InfoPillVariant => {
		if (!props.permissionGranted) return "red";
		if (props.disconnected) return "gray";
		return props.value !== null ? "blue" : "gray";
	};

	return (
		<Dynamic
			component={props.PillComponent}
			variant={variant()}
			onPointerDown={(e) => {
				if (!props.permissionGranted || props.value === null) return;

				e.stopPropagation();
			}}
			onClick={(e) => {
				if (!props.permissionGranted) {
					e.stopPropagation();
					props.requestPermission();
					return;
				}

				props.onClick(e);
			}}
		>
			{!props.permissionGranted
				? t("common.allow")
				: props.disconnected
					? t("common.notConnected")
					: props.value !== null
						? t("common.on")
						: t("common.off")}
		</Dynamic>
	);
}
