import { Button } from "@cap/ui-solid";

import type { ComponentProps } from "solid-js";
import { useI18n } from "~/i18n";
import { createSignInMutation } from "~/utils/auth";

export function SignInButton(
	props: Omit<ComponentProps<typeof Button>, "onClick">,
) {
	const { text } = useI18n();
	const signIn = createSignInMutation();

	return (
		<Button
			size="md"
			class="flex grow justify-center items-center"
			{...props}
			variant={signIn.isPending ? "gray" : "primary"}
			onClick={() => {
				if (signIn.isPending) {
					signIn.variables.abort();
					signIn.reset();
				} else {
					signIn.mutate(new AbortController());
				}
			}}
		>
			{signIn.isPending
				? text("Cancel Sign In")
				: (props.children ?? text("Sign In"))}
		</Button>
	);
}
