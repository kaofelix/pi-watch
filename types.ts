/**
 * Type definitions for the comment watcher.
 */

export interface ParsedComment {
	filePath: string;
	lineNumber: number;
	rawLines: string[]; // Full comment lines including markers and AI
	hasTrigger: boolean; // true for AI!, false for AI
}

export interface CommentWatcherOptions {
	/** Patterns to ignore when watching files */
	ignoredPatterns?: RegExp[];
	/** Current working directory for relative paths */
	cwd?: string;
	/** Whether to ignore initial files when starting watch */
	ignoreInitial?: boolean;
	/** Stability threshold for file writes (ms) */
	stabilityThreshold?: number;
	/** Poll interval for file writes (ms) */
	pollInterval?: number;
}

export type CommentWatcherCallback = (comment: ParsedComment, allPending: ParsedComment[]) => void;

export type TriggerCallback = (comments: ParsedComment[]) => void;

export interface CommentWatcherCallbacks {
	/** Called when an AI comment (without trigger) is found */
	onAIComment?: CommentWatcherCallback;
	/** Called when an AI! comment (with trigger) is found */
	onAITrigger?: TriggerCallback;
	/** Called when the watcher is ready */
	onReady?: () => void;
	/** Called when an error occurs */
	onError?: (error: Error) => void;
}

export type WatcherFactory = (
	paths: string | string[],
	options?: Record<string, unknown>
) => FSWatcherLike;

export interface FSWatcherLike {
	/** Close the watcher */
	close(): Promise<void>;
	on(event: string, listener: (...args: unknown[]) => void): FSWatcherLike;
}
