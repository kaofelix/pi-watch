/**
 * Tests for CommentWatcher.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs module using factory without external variables
let mockReadFileSync: ReturnType<typeof vi.fn>;
vi.mock("node:fs", () => ({
	readFileSync: vi.fn((path: string) => {
		return mockReadFileSync(path);
	}),
}));

import type {
	CommentWatcherCallbacks,
	CommentWatcherOptions,
	FSWatcherLike,
	ParsedComment,
} from "./types.js";
// Import after mocking
import { CommentWatcher } from "./watcher.js";

// Mock FSWatcher for testing
class MockFSWatcher implements FSWatcherLike {
	private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
	private closed = false;

	async close(): Promise<void> {
		this.closed = true;
		this.listeners.clear();
	}

	on(event: string, listener: (...args: unknown[]) => void): this {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)?.add(listener);
		return this;
	}

	// Helper to emit events for testing
	emit(event: string, ...args: unknown[]): void {
		const eventListeners = this.listeners.get(event);
		if (eventListeners) {
			for (const listener of eventListeners) {
				listener(...args);
			}
		}
	}

	isClosed(): boolean {
		return this.closed;
	}
}

describe("CommentWatcher", () => {
	let mockWatcher: MockFSWatcher;
	let contentMap: Map<string, string>;

	beforeEach(() => {
		// Initialize the mock function
		mockReadFileSync = vi.fn();

		mockWatcher = new MockFSWatcher();
		contentMap = new Map([
			["trigger.ts", "// AI! Do something"],
			["collect.ts", "// AI: collect this"],
			["collect2.ts", "// AI: collect this too"],
			["mixed.ts", ["// AI: first line", "// AI! trigger"].join("\n")],
			["none.ts", "// regular comment"],
		]);

		mockReadFileSync.mockImplementation((path: string) => {
			for (const [key, content] of contentMap) {
				if (path.includes(key)) {
					return content;
				}
			}
			if (path.includes("error.ts")) {
				throw new Error("File not found");
			}
			return "";
		});
	});

	// Helper to create a CommentWatcher with a mock factory
	function createWatcher(
		callbacks: CommentWatcherCallbacks = {},
		options: CommentWatcherOptions = {}
	) {
		return new CommentWatcher((_paths, _options) => mockWatcher, callbacks, options);
	}

	afterEach(() => {
		mockReadFileSync.mockReset();
	});

	describe("watching", () => {
		it("should start watching when watch() is called", () => {
			const watcher = createWatcher();
			watcher.watch("/test/path");
			expect(mockWatcher.isClosed()).toBe(false);
		});

		it("should close previous watcher when watch() is called again", () => {
			const watcher = createWatcher();
			watcher.watch("/test/path1");
			watcher.watch("/test/path2");
			// Should have closed the first watcher
			expect(mockWatcher.isClosed()).toBe(true);
		});

		it("should close watcher when close() is called", () => {
			const watcher = createWatcher();
			watcher.watch("/test/path");
			watcher.close();
			expect(mockWatcher.isClosed()).toBe(true);
		});
	});

	describe("comment parsing", () => {
		it("should detect AI! comment and call onAITrigger", () => {
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAITrigger });

			watcher.watch("/test");
			mockWatcher.emit("change", "/test/trigger.ts");

			expect(onAITrigger).toHaveBeenCalledTimes(1);
			const comments = onAITrigger.mock.calls[0][0] as ParsedComment[];
			expect(comments).toHaveLength(1);
			expect(comments[0].hasTrigger).toBe(true);
			expect(comments[0].filePath).toBe("/test/trigger.ts");
		});

		it("should detect AI comment (no trigger) and call onAIComment", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");
			mockWatcher.emit("change", "/test/collect.ts");

			expect(onAIComment).toHaveBeenCalledTimes(1);
			expect(onAITrigger).not.toHaveBeenCalled();

			const comment = onAIComment.mock.calls[0][0] as ParsedComment;
			expect(comment.hasTrigger).toBe(false);
			expect(comment.filePath).toBe("/test/collect.ts");
		});

		it("should ignore non-AI comments", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");
			mockWatcher.emit("change", "/test/none.ts");

			expect(onAIComment).not.toHaveBeenCalled();
			expect(onAITrigger).not.toHaveBeenCalled();
		});

		it("should handle files that cannot be read", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");
			mockWatcher.emit("change", "/test/error.ts");

			expect(onAIComment).not.toHaveBeenCalled();
			expect(onAITrigger).not.toHaveBeenCalled();
		});

		it("should handle mixed AI and AI! comments", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");
			mockWatcher.emit("change", "/test/mixed.ts");

			// Mixed comments form one group with hasTrigger=true
			// onAIComment is only called for comments WITHOUT triggers
			// Since the group has a trigger, it's sent to onAITrigger directly
			expect(onAIComment).toHaveBeenCalledTimes(0);
			expect(onAITrigger).toHaveBeenCalledTimes(1);

			const comments = onAITrigger.mock.calls[0][0] as ParsedComment[];
			expect(comments).toHaveLength(1); // One group containing both lines
			expect(comments[0].rawLines).toEqual(["// AI: first line", "// AI! trigger"]);
		});
	});

	describe("pending comments", () => {
		it("should collect pending comments across files", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");

			// First file has AI comment (no trigger)
			mockWatcher.emit("change", "/test/collect.ts");

			expect(onAIComment).toHaveBeenCalledTimes(1);
			expect(onAITrigger).not.toHaveBeenCalled();

			// Check pending comments
			const pending = watcher.getPendingComments();
			expect(pending).toHaveLength(1);

			// Second file has AI! trigger
			mockWatcher.emit("change", "/test/trigger.ts");

			expect(onAITrigger).toHaveBeenCalledTimes(1);
			const comments = onAITrigger.mock.calls[0][0] as ParsedComment[];
			expect(comments).toHaveLength(2); // Comments from both files
		});

		it("should clear pending comments after trigger", () => {
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAITrigger });

			watcher.watch("/test");

			mockWatcher.emit("change", "/test/trigger.ts");
			expect(onAITrigger).toHaveBeenCalledTimes(1);

			// Pending should be cleared
			expect(watcher.getPendingComments()).toHaveLength(0);
		});

		it("should remove pending comments for files with no AI comments", () => {
			const onAIComment = vi.fn();
			const watcher = createWatcher({ onAIComment });

			watcher.watch("/test");

			// First file with AI comment
			mockWatcher.emit("change", "/test/collect.ts");
			expect(watcher.getPendingComments()).toHaveLength(1);
			expect(onAIComment).toHaveBeenCalledTimes(1);

			// Change content to have no AI comments
			contentMap.set("collect.ts", "// regular comment");
			mockWatcher.emit("change", "/test/collect.ts");
			expect(watcher.getPendingComments()).toHaveLength(0);
		});

		it("should allow manually clearing pending comments", () => {
			const onAIComment = vi.fn();
			const watcher = createWatcher({ onAIComment });

			watcher.watch("/test");
			mockWatcher.emit("change", "/test/collect.ts");

			expect(watcher.getPendingComments()).toHaveLength(1);

			watcher.clearPending();
			expect(watcher.getPendingComments()).toHaveLength(0);
		});
	});

	describe("pause/resume", () => {
		it("should not process file changes when paused", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");

			// Pause the watcher
			watcher.pause();
			expect(watcher.isWatcherPaused()).toBe(true);

			// File changes while paused - should not trigger
			mockWatcher.emit("change", "/test/trigger.ts");
			expect(onAIComment).not.toHaveBeenCalled();
			expect(onAITrigger).not.toHaveBeenCalled();
		});

		it("should process file changes after resume", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");

			// Pause the watcher
			watcher.pause();

			// File changes while paused - should not trigger
			mockWatcher.emit("change", "/test/trigger.ts");
			expect(onAITrigger).not.toHaveBeenCalled();

			// Resume the watcher
			watcher.resume();
			expect(watcher.isWatcherPaused()).toBe(false);

			// New file changes - should now trigger
			mockWatcher.emit("change", "/test/collect.ts");
			expect(onAIComment).toHaveBeenCalledTimes(1);
		});

		it("should toggle pause state", () => {
			const watcher = createWatcher();

			expect(watcher.isWatcherPaused()).toBe(false);

			watcher.pause();
			expect(watcher.isWatcherPaused()).toBe(true);

			watcher.resume();
			expect(watcher.isWatcherPaused()).toBe(false);

			watcher.pause();
			expect(watcher.isWatcherPaused()).toBe(true);
		});
	});

	describe("callbacks", () => {
		it("should call onReady when watcher is ready", () => {
			const onReady = vi.fn();
			const watcher = createWatcher({ onReady });

			watcher.watch("/test");
			mockWatcher.emit("ready");

			expect(onReady).toHaveBeenCalledTimes(1);
		});

		it("should call onError when watcher encounters error", () => {
			const onError = vi.fn();
			const watcher = createWatcher({ onError });

			watcher.watch("/test");
			const testError = new Error("Test error");
			mockWatcher.emit("error", testError);

			expect(onError).toHaveBeenCalledTimes(1);
			expect(onError).toHaveBeenCalledWith(testError);
		});

		it("should pass all pending comments to onAIComment callback", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher({ onAIComment, onAITrigger });

			watcher.watch("/test");

			// First file
			mockWatcher.emit("change", "/test/collect.ts");

			expect(onAIComment).toHaveBeenCalledTimes(1);
			const comment = onAIComment.mock.calls[0][0] as ParsedComment;
			const allPending = onAIComment.mock.calls[0][1] as ParsedComment[];

			expect(comment.filePath).toBe("/test/collect.ts");
			expect(allPending).toHaveLength(1);

			// Add second file
			mockWatcher.emit("change", "/test/collect2.ts");

			expect(onAIComment).toHaveBeenCalledTimes(2);
			const comment2 = onAIComment.mock.calls[1][0] as ParsedComment;
			const allPending2 = onAIComment.mock.calls[1][1] as ParsedComment[];

			expect(comment2.filePath).toBe("/test/collect2.ts");
			expect(allPending2).toHaveLength(2); // Both files
		});
	});

	describe("ignore patterns", () => {
		it("should ignore paths matching ignore patterns", () => {
			const onAIComment = vi.fn();
			const onAITrigger = vi.fn();
			const watcher = createWatcher(
				{ onAIComment, onAITrigger },
				{
					ignoredPatterns: [/.git/, /node_modules/],
				}
			);

			watcher.watch("/test");

			// These should be ignored even if they would match trigger.ts pattern
			mockWatcher.emit("change", "/test/.git/trigger.ts");
			mockWatcher.emit("change", "/test/node_modules/trigger.ts");

			expect(onAIComment).not.toHaveBeenCalled();
			expect(onAITrigger).not.toHaveBeenCalled();
		});

		it("should not ignore paths not matching ignore patterns", () => {
			const onAITrigger = vi.fn();
			const watcher = createWatcher(
				{ onAITrigger },
				{
					ignoredPatterns: [/.git/, /node_modules/],
				}
			);

			watcher.watch("/test");

			// Make sure we have content for this path
			contentMap.set("src/file.ts", "// AI! Do something");
			mockWatcher.emit("change", "/test/src/file.ts");

			expect(onAITrigger).toHaveBeenCalled();
		});
	});
});
