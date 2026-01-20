/**
 * Core utilities for the watch extension.
 * Separated for testability.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ParsedComment } from "./types.js";

/**
 * Create a unique key for a comment.
 */
export function getCommentKey(comment: ParsedComment): string {
	const hash = crypto.createHash("md5").update(comment.rawLines.join("\n")).digest("hex");
	return `${comment.filePath}:${comment.lineNumber}:${hash}`;
}

export const DEFAULT_IGNORED_PATTERNS = [/\.git/, /node_modules/, /dist/, /build/, /\.pi/];

// Comment styles: #, //, --
// Position: start OR end of line
// Case insensitive
// Variants: AI!, AI:, AI (with or without punctuation)
const COMMENT_PATTERNS = [
	// AI at end: // do this ai!, # implement this AI!, // text AI:
	/^(?:#|\/\/|--)\s*(.+?)\s*(?:ai!|ai)\s*[:\s]*$/i,
	// AI at start: // ai! do this, # AI implement this, // AI: do this
	/^(?:#|\/\/|--)\s*(?:ai!|ai)[:\s]*\s*(.+)$/i,
];

/**
 * Check if a line contains an AI comment.
 * Returns the hasTrigger flag.
 */
export function parseAIComment(line: string): boolean | null {
	const trimmedLine = line.trim();

	for (const pattern of COMMENT_PATTERNS) {
		if (pattern.test(trimmedLine)) {
			return trimmedLine.toLowerCase().includes("ai!");
		}
	}
	return null;
}

/**
 * Check if a path should be ignored based on ignore patterns.
 */
export function shouldIgnorePath(filePath: string, ignoredPatterns: RegExp[]): boolean {
	return ignoredPatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Find all AI comments in file content with grouping.
 * Consecutive AI comment lines are grouped together.
 */
export function parseCommentsInFile(filePath: string, content: string): ParsedComment[] {
	const lines = content.split("\n");
	const comments: ParsedComment[] = [];
	let currentGroup: string[] = [];
	let groupStartLine = 0;
	let groupHasTrigger = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const hasTrigger = parseAIComment(line);

		if (hasTrigger !== null) {
			if (currentGroup.length === 0) {
				groupStartLine = i + 1;
			}
			currentGroup.push(line); // Store raw line with whitespace preserved
			if (hasTrigger) {
				groupHasTrigger = true;
			}
		} else {
			// End of group
			if (currentGroup.length > 0) {
				comments.push({
					filePath,
					lineNumber: groupStartLine,
					rawLines: [...currentGroup],
					hasTrigger: groupHasTrigger,
				});
				currentGroup = [];
				groupHasTrigger = false;
			}
		}
	}

	// Handle group at end of file
	if (currentGroup.length > 0) {
		comments.push({
			filePath,
			lineNumber: groupStartLine,
			rawLines: [...currentGroup],
			hasTrigger: groupHasTrigger,
		});
	}

	return comments;
}

/**
 * Read a file and parse AI comments.
 */
export function readFileAndParseComments(filePath: string): {
	content: string;
	comments: ParsedComment[];
} | null {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const comments = parseCommentsInFile(filePath, content);
		return { content, comments };
	} catch {
		return null;
	}
}

/**
 * Get relative path from cwd.
 */
export function getRelativePath(filePath: string, cwd: string): string {
	return path.relative(cwd, filePath);
}

/**
 * Create the user message for the AI agent.
 */
export function createAIMessage(comments: ParsedComment[]): string {
	if (comments.length === 0) {
		return "";
	}

	let message = "The AI comments below can be found in the code files.\n";
	message += "They contain your instructions.\n";
	message += "Line numbers are provided for reference.\n";
	message += "Rules:\n";
	message += "- Only make changes to files and lines that have AI comments.\n";
	message += "- Do not modify any other files or areas of files.\n";
	message += "- Follow the instructions in the AI comments strictly.\n";
	message += "- Be sure to remove all AI comments from the code during or after the changes.\n";
	message += '- After changes are finised say just "Done" and nothing else.\n\n';

	for (const comment of comments) {
		const relativePath = getRelativePath(comment.filePath, process.cwd());
		message += `${relativePath}:\n`;
		for (let i = 0; i < comment.rawLines.length; i++) {
			const lineNumber = comment.lineNumber + i;
			message += `${lineNumber}: ${comment.rawLines[i]}\n`;
		}
		message += "\n";
	}

	return message.trim();
}

/**
 * Filter comments to only those with AI! trigger.
 */
export function filterTriggerComments(comments: ParsedComment[]): ParsedComment[] {
	return comments.filter((c) => c.hasTrigger);
}

/**
 * Check if any comment has a trigger.
 */
export function hasTriggerComment(comments: ParsedComment[]): boolean {
	return comments.some((c) => c.hasTrigger);
}
