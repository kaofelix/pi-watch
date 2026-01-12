/**
 * Watch Extension
 *
 * Watches for file changes in the current directory and scans for AI comments.
 * Collects AI comments until an AI! trigger is found, then sends all comments to the agent.
 *
 * Comment styles supported: #, //, --
 * Position: AI can be at start or end of comment line
 * Case insensitive: ai, AI both work
 *
 * AI - collects comment, doesn't trigger
 * AI! - triggers action with all collected comments
 *
 * Consecutive AI comments are grouped together.
 * Comments can span multiple files until an AI! is found.
 *
 * Usage:
 *   pi --watch
 *
 * Examples:
 *   // AI! Add error handling
 *   // Add error handling AI!
 *   # ai refactor to be cleaner
 *   -- make this faster AI!
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import chokidar from "chokidar";
import { createAIMessage, getRelativePath } from "./core.js";
import type { ParsedComment } from "./types.js";
import { CommentWatcher } from "./watcher.js";

export default function (pi: ExtensionAPI) {
	// Register the --watch flag
	pi.registerFlag("watch", {
		description: "Watch current directory for file changes with AI comments",
		type: "boolean",
		default: false,
	});

	let commentWatcher: CommentWatcher | null = null;
	let watchCwd: string | null = null;
	let watchCtx: { hasUI: boolean; ui: { notify: (message: string, type: string) => void } } | null = null;

	// Pause watching while agent is editing files to avoid re-triggering
	pi.on("agent_start", async () => {
		commentWatcher?.pause();
	});

	pi.on("agent_end", async () => {
		commentWatcher?.resume();
		if (watchCtx && watchCtx.hasUI && watchCwd) {
			watchCtx.ui.notify(`Watching ${watchCwd} for AI comments...`, "info");
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (!pi.getFlag("watch")) {
			return;
		}

		const cwd = ctx.cwd;
		watchCwd = cwd;
		watchCtx = { hasUI: ctx.hasUI, ui: ctx.ui };
		const ignoredPatterns = [/.git/, /node_modules/, /dist/, /build/, /.pi/];

		// Create comment watcher with Chokidar factory
		commentWatcher = new CommentWatcher(
			(paths, options) => chokidar.watch(paths, options),
			{
				onAIComment: (comment: ParsedComment, allPending: ParsedComment[]) => {
					if (!ctx.hasUI) return;
					const uniqueFiles = new Set(allPending.map((c) => c.filePath));
					ctx.ui.notify(
						`${allPending.length} AI comment${allPending.length > 1 ? "s" : ""} collected from ${uniqueFiles.size} file${uniqueFiles.size > 1 ? "s" : ""}.`,
						"info"
					);
				},

				onAITrigger: (comments: ParsedComment[]) => {
					if (comments.length === 0) return;

					// Send the message
					const message = createAIMessage(comments);

					try {
						pi.sendUserMessage(message, { deliverAs: "followUp" });

						if (ctx.hasUI) {
							const uniqueFiles = new Set(comments.map((c) => c.filePath));
							ctx.ui.notify(
								`AI! comment found (sending ${comments.length} comment${comments.length > 1 ? "s" : ""} from ${uniqueFiles.size} file${uniqueFiles.size > 1 ? "s" : ""})`,
								"info"
							);
						}
					} catch (error) {
						if (ctx.hasUI) {
							ctx.ui.notify(`Error sending message: ${error}`, "error");
						}
					}
				},

				onReady: () => {
					if (ctx.hasUI) {
						ctx.ui.notify(`Watching ${cwd} for AI comments...`, "info");
					}
				},

				onError: (error: Error) => {
					if (ctx.hasUI) {
						ctx.ui.notify(`Watcher error: ${error.message}`, "error");
					}
				},
			},
			{
				cwd,
				ignoredPatterns,
				ignoreInitial: true,
				stabilityThreshold: 500,
				pollInterval: 50,
			}
		);

		// Start watching
		commentWatcher.watch(cwd);
	});

	pi.on("session_shutdown", async () => {
		if (commentWatcher) {
			commentWatcher.close();
			commentWatcher = null;
		}
		watchCwd = null;
		watchCtx = null;
	});
}
