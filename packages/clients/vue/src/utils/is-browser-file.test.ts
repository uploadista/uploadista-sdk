import { describe, expect, it } from "vitest";
import { createMockFile } from "../__tests__/setup";
import { isBrowserFile } from "./is-browser-file";

describe("isBrowserFile", () => {
  it("should return true for File instances", () => {
    const file = createMockFile("test.txt", 100, "text/plain");
    expect(isBrowserFile(file)).toBe(true);
  });

  it("should return false for null", () => {
    expect(isBrowserFile(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isBrowserFile(undefined)).toBe(false);
  });

  it("should return false for strings", () => {
    expect(isBrowserFile("file.txt")).toBe(false);
  });

  it("should return false for numbers", () => {
    expect(isBrowserFile(123)).toBe(false);
  });

  it("should return false for plain objects", () => {
    expect(isBrowserFile({ name: "file.txt", size: 100 })).toBe(false);
  });

  it("should return false for arrays", () => {
    expect(isBrowserFile([])).toBe(false);
  });

  it("should return false for Blob instances that are not Files", () => {
    const blob = new Blob(["content"], { type: "text/plain" });
    expect(isBrowserFile(blob)).toBe(false);
  });

  it("should return true for File created from Blob", () => {
    const blob = new Blob(["content"], { type: "text/plain" });
    const file = new File([blob], "test.txt", { type: "text/plain" });
    expect(isBrowserFile(file)).toBe(true);
  });
});
