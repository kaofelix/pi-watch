/**
 * Tests for core watch extension functions.
 */

import { describe, expect, it } from "vitest";
import {
	createAIMessage,
	filterTriggerComments,
	getCommentKey,
	getRelativePath,
	hasTriggerComment,
	parseCommentsInFile,
	shouldIgnorePath,
} from "./core.js";

describe("parseCommentsInFile", () => {
	it("should parse AI! at start of comment", () => {
		const comments = parseCommentsInFile("/path/to/file.ts", "// AI! Add error handling");
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 1,
			rawLines: ["// AI! Add error handling"],
			hasTrigger: true,
		});
	});

	it("should parse AI! at end of comment", () => {
		const comments = parseCommentsInFile("/path/to/file.ts", "// Add error handling AI!");
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 1,
			rawLines: ["// Add error handling AI!"],
			hasTrigger: true,
		});
	});

	it("should parse AI (no trigger) at start", () => {
		const comments = parseCommentsInFile("/path/to/file.ts", "// AI refactor this");
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 1,
			rawLines: ["// AI refactor this"],
			hasTrigger: false,
		});
	});

	it("should parse AI (no trigger) at end", () => {
		const comments = parseCommentsInFile("/path/to/file.ts", "// refactor this AI");
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 1,
			rawLines: ["// refactor this AI"],
			hasTrigger: false,
		});
	});

	it("should handle # comment style", () => {
		const comments = parseCommentsInFile("/path/to/file.py", "# AI! Implement this");
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			rawLines: ["# AI! Implement this"],
			hasTrigger: true,
		});
	});

	it("should handle -- comment style", () => {
		const comments = parseCommentsInFile("/path/to/file.sql", "-- AI! Add constraint");
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			rawLines: ["-- AI! Add constraint"],
			hasTrigger: true,
		});
	});

	it("should be case insensitive", () => {
		const comments = parseCommentsInFile("/path/to/file.ts", "// ai! lowercase");
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			rawLines: ["// ai! lowercase"],
			hasTrigger: true,
		});
	});

	it("should group consecutive AI comments", () => {
		const content = [
			"# AI: add a new thing",
			"# please implement it with care AI!",
			"function foo() {}",
		].join("\n");

		const comments = parseCommentsInFile("/path/to/file.py", content);
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 1,
			rawLines: ["# AI: add a new thing", "# please implement it with care AI!"],
			hasTrigger: true,
		});
	});

	it("should NOT group comments where only some lines have AI markers", () => {
		// Only the second line has AI!, first line is a regular comment
		const content = [
			"// This function processes user data",
			"// but it has a race condition AI!",
			"function foo() {}",
		].join("\n");

		const comments = parseCommentsInFile("/path/to/file.ts", content);
		// Only the line with AI! should be detected
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 2,
			rawLines: ["// but it has a race condition AI!"],
			hasTrigger: true,
		});
	});

	it("should group only when ALL consecutive lines have AI markers", () => {
		// All lines have AI markers
		const content = [
			"// This function needs work AI",
			"// fix the race condition AI!",
			"function foo() {}",
		].join("\n");

		const comments = parseCommentsInFile("/path/to/file.ts", content);
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 1,
			rawLines: ["// This function needs work AI", "// fix the race condition AI!"],
			hasTrigger: true,
		});
	});

	it("should handle multiple separate comment groups", () => {
		const content = [
			"// AI! first group",
			"function foo() {}",
			"// AI! second group",
			"function bar() {}",
		].join("\n");

		const comments = parseCommentsInFile("/path/to/file.ts", content);
		expect(comments).toHaveLength(2);
		expect(comments[0].lineNumber).toBe(1);
		expect(comments[1].lineNumber).toBe(3);
	});

	it("should handle mixed AI and AI! in group", () => {
		const content = ["# AI: refactor this function", "# to be more efficient AI!"].join("\n");

		const comments = parseCommentsInFile("/path/to/file.py", content);
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			rawLines: ["# AI: refactor this function", "# to be more efficient AI!"],
			hasTrigger: true,
		});
	});

	it("should ignore non-AI comments", () => {
		const comments = parseCommentsInFile("/path/to/file.ts", "// regular comment");
		expect(comments).toHaveLength(0);
	});

	it("should handle comments in middle of code", () => {
		const content = ["function foo() {", "  // AI! Add validation", "  return x;", "}"].join("\n");

		const comments = parseCommentsInFile("/path/to/file.ts", content);
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			lineNumber: 2,
			rawLines: ["  // AI! Add validation"],
			hasTrigger: true,
		});
	});

	it("should preserve whitespace in raw lines", () => {
		const comments = parseCommentsInFile("/path/to/file.ts", "  //    AI!    indented    ");
		expect(comments[0].rawLines).toEqual(["  //    AI!    indented    "]);
	});
});

describe("createAIMessage", () => {
	it("should create message for single comment", () => {
		const comments = [
			{
				filePath: "/path/to/file.ts",
				lineNumber: 5,
				rawLines: ["// AI! Add error handling"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		expect(message).not.toBe("");
		expect(message).toContain("file.ts");
		expect(message).toContain("// AI! Add error handling");
	});

	it("should create message for multiple comments in one file", () => {
		const comments = [
			{
				filePath: "/path/to/file.ts",
				lineNumber: 1,
				rawLines: ["// AI: first change"],
				hasTrigger: false,
			},
			{
				filePath: "/path/to/file.ts",
				lineNumber: 10,
				rawLines: ["// AI! second change"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		expect(message).toContain("// AI: first change");
		expect(message).toContain("// AI! second change");
	});

	it("should handle multiline raw lines", () => {
		const comments = [
			{
				filePath: "/path/to/file.py",
				lineNumber: 1,
				rawLines: ["# line 1", "# line 2", "# line 3 AI!"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		expect(message).toContain("# line 1");
		expect(message).toContain("# line 2");
		expect(message).toContain("# line 3 AI!");
	});

	it("should use relative paths", () => {
		const comments = [
			{
				filePath: "/Users/kaofelix/project/src/file.ts",
				lineNumber: 1,
				rawLines: ["// AI! fix this"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		// Message should not contain the full absolute path
		expect(message).not.toContain("/Users/kaofelix/project/src/file.ts");
		expect(message).toContain("src/file.ts");
	});

	it("should return empty string for no comments", () => {
		expect(createAIMessage([])).toBe("");
	});

	it("should output line numbers before each comment line", () => {
		const comments = [
			{
				filePath: "/path/to/file.ts",
				lineNumber: 12,
				rawLines: ["// AI! Add error handling"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		expect(message).toContain("12: // AI! Add error handling");
	});

	it("should output line numbers for each line in a multiline comment block", () => {
		const comments = [
			{
				filePath: "/path/to/file.py",
				lineNumber: 45,
				rawLines: ["# Another thing here", "# Now with multiple lines, AI"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		expect(message).toContain("45: # Another thing here");
		expect(message).toContain("46: # Now with multiple lines, AI");
	});

	it("should handle multiple comment groups with correct line numbers", () => {
		const comments = [
			{
				filePath: "/path/to/file.ext",
				lineNumber: 12,
				rawLines: ["# Here's something to do, AI"],
				hasTrigger: true,
			},
			{
				filePath: "/path/to/file.ext",
				lineNumber: 45,
				rawLines: ["# Another thing here", "# Now with multiple lines, AI"],
				hasTrigger: true,
			},
			{
				filePath: "/path/to/file.ext",
				lineNumber: 70,
				rawLines: ["# And finally a trigger, AI!"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		expect(message).toContain("12: # Here's something to do, AI");
		expect(message).toContain("45: # Another thing here");
		expect(message).toContain("46: # Now with multiple lines, AI");
		expect(message).toContain("70: # And finally a trigger, AI!");
	});

	it("should include line numbers in the prompt instructions", () => {
		const comments = [
			{
				filePath: "/path/to/file.ts",
				lineNumber: 1,
				rawLines: ["// AI! test"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		expect(message).toMatch(/line number/i);
	});

	it("should match expected format exactly", () => {
		const comments = [
			{
				filePath: "/Users/test/project/src/file.ext",
				lineNumber: 12,
				rawLines: ["# Here's something to do, AI"],
				hasTrigger: true,
			},
			{
				filePath: "/Users/test/project/src/file.ext",
				lineNumber: 45,
				rawLines: ["# Another thing here", "# Now with multiple lines, AI"],
				hasTrigger: true,
			},
			{
				filePath: "/Users/test/project/src/file.ext",
				lineNumber: 70,
				rawLines: ["# And finally a trigger, AI!"],
				hasTrigger: true,
			},
		];

		const message = createAIMessage(comments);
		const expected = [
			"src/file.ext:",
			"12: # Here's something to do, AI",
			"45: # Another thing here",
			"46: # Now with multiple lines, AI",
			"70: # And finally a trigger, AI!",
		];

		for (const line of expected) {
			expect(message).toContain(line);
		}
	});
});

describe("shouldIgnorePath", () => {
	it("should ignore .git directories", () => {
		const patterns = [/.git/, /node_modules/];
		expect(shouldIgnorePath("/path/.git/file.txt", patterns)).toBe(true);
	});

	it("should ignore node_modules directories", () => {
		const patterns = [/.git/, /node_modules/];
		expect(shouldIgnorePath("/path/node_modules/file.txt", patterns)).toBe(true);
	});

	it("should not ignore regular files", () => {
		const patterns = [/.git/, /node_modules/];
		expect(shouldIgnorePath("/path/src/file.ts", patterns)).toBe(false);
	});
});

describe("hasTriggerComment", () => {
	it("should return true when AI! is present", () => {
		const comments = [
			{
				filePath: "/path",
				lineNumber: 1,
				rawLines: ["// test"],
				hasTrigger: true,
			},
		];
		expect(hasTriggerComment(comments)).toBe(true);
	});

	it("should return false when only AI (no trigger) is present", () => {
		const comments = [
			{
				filePath: "/path",
				lineNumber: 1,
				rawLines: ["// test"],
				hasTrigger: false,
			},
		];
		expect(hasTriggerComment(comments)).toBe(false);
	});

	it("should return true when mix of AI and AI! is present", () => {
		const comments = [
			{
				filePath: "/path",
				lineNumber: 1,
				rawLines: ["// test1"],
				hasTrigger: false,
			},
			{
				filePath: "/path",
				lineNumber: 2,
				rawLines: ["// test2"],
				hasTrigger: true,
			},
		];
		expect(hasTriggerComment(comments)).toBe(true);
	});

	it("should return false for empty array", () => {
		expect(hasTriggerComment([])).toBe(false);
	});
});

describe("getCommentKey", () => {
	it("should create unique key for comment", () => {
		const comment = {
			filePath: "/path/to/file.ts",
			lineNumber: 5,
			rawLines: ["// AI! test"],
			hasTrigger: true,
		};

		const key = getCommentKey(comment);
		expect(key).toContain("/path/to/file.ts");
		expect(key).toContain("5");
		// Should contain md5 hash
		expect(key).toMatch(/[a-f0-9]{32}/);
	});

	it("should create different keys for different comments", () => {
		const comment1 = {
			filePath: "/path/file.ts",
			lineNumber: 1,
			rawLines: ["// test1"],
			hasTrigger: true,
		};
		const comment2 = {
			filePath: "/path/file.ts",
			lineNumber: 1,
			rawLines: ["// test2"],
			hasTrigger: true,
		};

		const key1 = getCommentKey(comment1);
		const key2 = getCommentKey(comment2);
		expect(key1).not.toBe(key2);
	});

	it("should create same key for identical comments", () => {
		const comment1 = {
			filePath: "/path/file.ts",
			lineNumber: 1,
			rawLines: ["// AI! test"],
			hasTrigger: true,
		};
		const comment2 = {
			filePath: "/path/file.ts",
			lineNumber: 1,
			rawLines: ["// AI! test"],
			hasTrigger: true,
		};

		const key1 = getCommentKey(comment1);
		const key2 = getCommentKey(comment2);
		expect(key1).toBe(key2);
	});
});

describe("filterTriggerComments", () => {
	it("should filter to only AI! comments", () => {
		const comments = [
			{
				filePath: "/path",
				lineNumber: 1,
				rawLines: ["// no trigger"],
				hasTrigger: false,
			},
			{
				filePath: "/path",
				lineNumber: 2,
				rawLines: ["// with trigger"],
				hasTrigger: true,
			},
			{
				filePath: "/path",
				lineNumber: 3,
				rawLines: ["// also no trigger"],
				hasTrigger: false,
			},
		];
		const result = filterTriggerComments(comments);
		expect(result).toHaveLength(1);
		expect(result[0].hasTrigger).toBe(true);
	});

	it("should return empty array when no triggers", () => {
		const comments = [
			{
				filePath: "/path",
				lineNumber: 1,
				rawLines: ["// test"],
				hasTrigger: false,
			},
		];
		expect(filterTriggerComments(comments)).toEqual([]);
	});
});

describe("getRelativePath", () => {
	it("should get relative path from cwd", () => {
		const result = getRelativePath("/Users/test/project/src/file.ts", "/Users/test/project");
		expect(result).toBe("src/file.ts");
	});

	it("should return filename if same directory as cwd", () => {
		const result = getRelativePath("/Users/test/project/file.ts", "/Users/test/project");
		expect(result).toBe("file.ts");
	});
});
