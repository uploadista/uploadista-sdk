import { describe, expect, it, vi } from "vitest";
import {
  createMockDragEvent,
  createMockFile,
  createMockInputChangeEvent,
} from "../__tests__/setup";
import { useDragDrop } from "./useDragDrop";

describe("useDragDrop", () => {
  describe("initial state", () => {
    it("should have correct initial state", () => {
      const { state } = useDragDrop();

      expect(state.value.isDragging).toBe(false);
      expect(state.value.isOver).toBe(false);
      expect(state.value.isValid).toBe(true);
      expect(state.value.errors).toEqual([]);
    });
  });

  describe("drag events", () => {
    it("should set isDragging and isOver on dragenter", () => {
      const onDragStateChange = vi.fn();
      const { state, onDragEnter } = useDragDrop({ onDragStateChange });

      onDragEnter(createMockDragEvent("dragenter"));

      expect(state.value.isDragging).toBe(true);
      expect(state.value.isOver).toBe(true);
      expect(onDragStateChange).toHaveBeenCalledWith(true);
    });

    it("should not trigger multiple times for nested elements", () => {
      const onDragStateChange = vi.fn();
      const { state, onDragEnter } = useDragDrop({ onDragStateChange });

      // Multiple dragenter events (simulating nested elements)
      onDragEnter(createMockDragEvent("dragenter"));
      onDragEnter(createMockDragEvent("dragenter"));
      onDragEnter(createMockDragEvent("dragenter"));

      expect(state.value.isDragging).toBe(true);
      // onDragStateChange should only be called once
      expect(onDragStateChange).toHaveBeenCalledTimes(1);
    });

    it("should reset state on dragleave when counter reaches 0", () => {
      const onDragStateChange = vi.fn();
      const { state, onDragEnter, onDragLeave } = useDragDrop({
        onDragStateChange,
      });

      // Enter twice (nested elements)
      onDragEnter(createMockDragEvent("dragenter"));
      onDragEnter(createMockDragEvent("dragenter"));

      // Leave once - should still be dragging
      onDragLeave(createMockDragEvent("dragleave"));
      expect(state.value.isDragging).toBe(true);

      // Leave again - now should be reset
      onDragLeave(createMockDragEvent("dragleave"));
      expect(state.value.isDragging).toBe(false);
      expect(state.value.isOver).toBe(false);
      expect(onDragStateChange).toHaveBeenLastCalledWith(false);
    });

    it("should set dropEffect on dragover", () => {
      const { onDragOver } = useDragDrop();
      const event = createMockDragEvent("dragover");

      onDragOver(event);

      expect(event.dataTransfer?.dropEffect).toBe("copy");
    });
  });

  describe("drop handling", () => {
    it("should process files on drop", () => {
      const onFilesReceived = vi.fn();
      const { state, onDragEnter, onDrop } = useDragDrop({ onFilesReceived });

      const file = createMockFile("test.txt", 100, "text/plain");

      onDragEnter(createMockDragEvent("dragenter"));
      onDrop(createMockDragEvent("drop", [file]));

      expect(state.value.isDragging).toBe(false);
      expect(state.value.isOver).toBe(false);
      expect(onFilesReceived).toHaveBeenCalledWith([file]);
    });

    it("should not call onFilesReceived when no files dropped", () => {
      const onFilesReceived = vi.fn();
      const { onDrop } = useDragDrop({ onFilesReceived });

      onDrop(createMockDragEvent("drop", []));

      expect(onFilesReceived).not.toHaveBeenCalled();
    });
  });

  describe("file validation", () => {
    it("should validate file type with extension", () => {
      const onFilesReceived = vi.fn();
      const onValidationError = vi.fn();
      const { state, onDrop } = useDragDrop({
        accept: [".txt"],
        onFilesReceived,
        onValidationError,
      });

      const validFile = createMockFile("test.txt", 100, "text/plain");
      onDrop(createMockDragEvent("drop", [validFile]));

      expect(onFilesReceived).toHaveBeenCalledWith([validFile]);
      expect(onValidationError).not.toHaveBeenCalled();
      expect(state.value.isValid).toBe(true);
    });

    it("should reject invalid file types", () => {
      const onFilesReceived = vi.fn();
      const onValidationError = vi.fn();
      const { state, onDrop } = useDragDrop({
        accept: [".txt"],
        onFilesReceived,
        onValidationError,
      });

      const invalidFile = createMockFile("test.pdf", 100, "application/pdf");
      onDrop(createMockDragEvent("drop", [invalidFile]));

      expect(onFilesReceived).not.toHaveBeenCalled();
      expect(onValidationError).toHaveBeenCalled();
      expect(state.value.isValid).toBe(false);
      expect(state.value.errors.length).toBeGreaterThan(0);
    });

    it("should validate file type with MIME wildcard", () => {
      const onFilesReceived = vi.fn();
      const { onDrop } = useDragDrop({
        accept: ["image/*"],
        onFilesReceived,
      });

      const jpgFile = createMockFile("photo.jpg", 100, "image/jpeg");
      const pngFile = createMockFile("photo.png", 100, "image/png");

      onDrop(createMockDragEvent("drop", [jpgFile]));
      expect(onFilesReceived).toHaveBeenCalledWith([jpgFile]);

      onDrop(createMockDragEvent("drop", [pngFile]));
      expect(onFilesReceived).toHaveBeenCalledWith([pngFile]);
    });

    it("should validate max file count", () => {
      const onValidationError = vi.fn();
      const { state, onDrop } = useDragDrop({
        maxFiles: 2,
        onValidationError,
      });

      const files = [
        createMockFile("file1.txt", 100, "text/plain"),
        createMockFile("file2.txt", 100, "text/plain"),
        createMockFile("file3.txt", 100, "text/plain"),
      ];

      onDrop(createMockDragEvent("drop", files));

      expect(onValidationError).toHaveBeenCalled();
      expect(
        state.value.errors.some((e) => e.includes("Maximum 2 files")),
      ).toBe(true);
    });

    it("should validate max file size", () => {
      const onValidationError = vi.fn();
      const { state, onDrop } = useDragDrop({
        maxFileSize: 1024, // 1KB
        onValidationError,
      });

      const largeFile = createMockFile("large.txt", 2048, "text/plain"); // 2KB

      onDrop(createMockDragEvent("drop", [largeFile]));

      expect(onValidationError).toHaveBeenCalled();
      expect(
        state.value.errors.some((e) => e.includes("exceeds maximum size")),
      ).toBe(true);
    });

    it("should run custom validator", () => {
      const onValidationError = vi.fn();
      const customValidator = vi.fn((files: File[]) => {
        if (files.some((f) => f.name.includes("bad"))) {
          return ["File name contains 'bad'"];
        }
        return null;
      });

      const { state, onDrop } = useDragDrop({
        validator: customValidator,
        onValidationError,
      });

      const badFile = createMockFile("bad-file.txt", 100, "text/plain");
      onDrop(createMockDragEvent("drop", [badFile]));

      expect(customValidator).toHaveBeenCalledWith([badFile]);
      expect(onValidationError).toHaveBeenCalled();
      expect(state.value.errors).toContain("File name contains 'bad'");
    });
  });

  describe("input change handling", () => {
    it("should process files from input change", () => {
      const onFilesReceived = vi.fn();
      const { onInputChange } = useDragDrop({ onFilesReceived });

      const file = createMockFile("test.txt", 100, "text/plain");
      const event = createMockInputChangeEvent([file]);

      onInputChange(event);

      expect(onFilesReceived).toHaveBeenCalledWith([file]);
    });

    it("should reset input value after processing", () => {
      const { onInputChange } = useDragDrop();

      const file = createMockFile("test.txt", 100, "text/plain");
      const event = createMockInputChangeEvent([file]);
      const input = event.target as HTMLInputElement;

      onInputChange(event);

      expect(input.value).toBe("");
    });
  });

  describe("inputProps", () => {
    it("should provide correct input props", () => {
      const { inputProps } = useDragDrop({
        multiple: true,
        accept: ["image/*", ".pdf"],
      });

      expect(inputProps.value.type).toBe("file");
      expect(inputProps.value.multiple).toBe(true);
      expect(inputProps.value.accept).toBe("image/*, .pdf");
    });

    it("should default multiple to true", () => {
      const { inputProps } = useDragDrop();

      expect(inputProps.value.multiple).toBe(true);
    });

    it("should handle undefined accept", () => {
      const { inputProps } = useDragDrop();

      expect(inputProps.value.accept).toBeUndefined();
    });
  });

  describe("reset", () => {
    it("should reset state to initial values", () => {
      const onValidationError = vi.fn();
      const { state, onDrop, reset } = useDragDrop({
        accept: [".txt"],
        onValidationError,
      });

      // Trigger validation error
      const invalidFile = createMockFile("test.pdf", 100, "application/pdf");
      onDrop(createMockDragEvent("drop", [invalidFile]));

      expect(state.value.isValid).toBe(false);
      expect(state.value.errors.length).toBeGreaterThan(0);

      // Reset
      reset();

      expect(state.value.isDragging).toBe(false);
      expect(state.value.isOver).toBe(false);
      expect(state.value.isValid).toBe(true);
      expect(state.value.errors).toEqual([]);
    });
  });

  describe("processFiles", () => {
    it("should allow direct file processing", () => {
      const onFilesReceived = vi.fn();
      const { processFiles } = useDragDrop({ onFilesReceived });

      const files = [createMockFile("test.txt", 100, "text/plain")];
      processFiles(files);

      expect(onFilesReceived).toHaveBeenCalledWith(files);
    });
  });
});
