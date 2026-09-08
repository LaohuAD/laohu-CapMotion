import { describe, expect, it } from "vitest";
import {
	localizedAutomationRuleName,
	localizedAutomationRuleSummary,
} from "./automation-copy";
import type { AutomationRule } from "./utils/automations";

const zh: Record<string, string> = {
	"Screenshot taken": "截图完成",
	"Copy to clipboard": "复制到剪贴板",
	Screenshot: "截图",
	Clipboard: "剪贴板",
	automation: "自动化",
	"no actions yet": "尚未添加动作",
	"Auto-copy new screenshots to clipboard": "自动把新截图复制到剪贴板",
};

const text = (source: string) => zh[source] ?? source;

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
	return {
		id: "rule-1",
		name: "",
		enabled: true,
		trigger: "screenshotTaken",
		matchMode: "all",
		conditions: [],
		actions: [{ type: "copyToClipboard", source: "raw" }],
		...overrides,
	};
}

describe("automation interface copy", () => {
	it("localizes generated rule summaries", () => {
		expect(localizedAutomationRuleSummary(rule(), text)).toBe(
			"截图完成 → 复制到剪贴板",
		);
	});

	it("localizes generated names but preserves user-authored names", () => {
		expect(localizedAutomationRuleName(rule(), text)).toBe("截图 → 剪贴板");
		expect(
			localizedAutomationRuleName(rule({ name: "我的发布流程" }), text),
		).toBe("我的发布流程");
	});

	it("localizes known built-in template names stored on a rule", () => {
		expect(
			localizedAutomationRuleName(
				rule({ name: "Auto-copy new screenshots to clipboard" }),
				text,
			),
		).toBe("自动把新截图复制到剪贴板");
	});

	it("localizes the empty-action state", () => {
		expect(localizedAutomationRuleSummary(rule({ actions: [] }), text)).toBe(
			"截图完成 → 尚未添加动作",
		);
	});
});
