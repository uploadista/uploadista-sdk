import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDragDrop } from "../hooks/use-drag-drop";

// Helper to create mock files
function createMockFile(
  name: string,
  size: number,
  type: string,
): File {
  const file = new File(["x".repeat(size)], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

// Helper to create mock DragEvent
function createDragEvent(files: File[]): React.DragEvent {
  const dataTransfer = {
    items: files.map((file) => ({
      kind: "file",
      getAsFile: () => file,
    })),
    files,
    dropEffect: "none" as DataTransfer["dropEffect"],
  };

  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer,
  } as unknown as React.DragEvent;
}

describe("useDragDrop", () => {
  describe("initial state", () => {
    it("should have correct initial state", () => {
      const { result } = renderHook(() => useDragDrop());

      expect(result.current.state).toEqual({
        isDragging: false,
        isOver: false,
        isValid: true,
        errors: [],
      });
    });

    it("should return dragHandlers object", () => {
      const { result } = renderHook(() => useDragDrop());

      expect(result.current.dragHandlers).toHaveProperty("onDragEnter");
      expect(result.current.dragHandlers).toHaveProperty("onDragOver");
      expect(result.current.dragHandlers).toHaveProperty("onDragLeave");
      expect(result.current.dragHandlers).toHaveProperty("onDrop");
    });

    it("should return inputProps with correct values", () => {
      const { result } = renderHook(() => useDragDrop({ multiple: true }));

      expect(result.current.inputProps.type).toBe("file");
      expect(result.current.inputProps.multiple).toBe(true);
      expect(result.current.inputProps.style).toEqual({ display: "none" });
    });

    it("should set accept attribute on inputProps", () => {
      const { result } = renderHook(() =>
        useDragDrop({ accept: ["image/*", ".pdf"] }),
      );

      expect(result.current.inputProps.accept).toBe("image/*, .pdf");
    });
  });

  describe("drag state management", () => {
    it("should set isDragging to true on dragEnter", () => {
      const { result } = renderHook(() => useDragDrop());
      const event = createDragEvent([]);

      act(() => {
        result.current.dragHandlers.onDragEnter(event);
      });

      expect(result.current.state.isDragging).toBe(true);
      expect(result.current.state.isOver).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it("should call onDragStateChange when drag starts", () => {
      const onDragStateChange = vi.fn();
      const { result } = renderHook(() => useDragDrop({ onDragStateChange }));
      const event = createDragEvent([]);

      act(() => {
        result.current.dragHandlers.onDragEnter(event);
      });

      expect(onDragStateChange).toHaveBeenCalledWith(true);
    });

    it("should set isDragging to false on dragLeave", () => {
      const { result } = renderHook(() => useDragDrop());
      const enterEvent = createDragEvent([]);
      const leaveEvent = createDragEvent([]);

      act(() => {
        result.current.dragHandlers.onDragEnter(enterEvent);
      });

      expect(result.current.state.isDragging).toBe(true);

      act(() => {
        result.current.dragHandlers.onDragLeave(leaveEvent);
      });

      expect(result.current.state.isDragging).toBe(false);
      expect(result.current.state.isOver).toBe(false);
    });

    it("should track nested drag events correctly", () => {
      const { result } = renderHook(() => useDragDrop());
      const event = createDragEvent([]);

      // Simulate entering parent, then child
      act(() => {
        result.current.dragHandlers.onDragEnter(event);
        result.current.dragHandlers.onDragEnter(event);
      });

      expect(result.current.state.isDragging).toBe(true);

      // Leave child, should still be dragging
      act(() => {
        result.current.dragHandlers.onDragLeave(event);
      });

      expect(result.current.state.isDragging).toBe(true);

      // Leave parent, should stop dragging
      act(() => {
        result.current.dragHandlers.onDragLeave(event);
      });

      expect(result.current.state.isDragging).toBe(false);
    });

    it("should set dropEffect to copy on dragOver", () => {
      const { result } = renderHook(() => useDragDrop());
      const event = createDragEvent([]);

      act(() => {
        result.current.dragHandlers.onDragOver(event);
      });

      expect(event.dataTransfer?.dropEffect).toBe("copy");
    });
  });

  describe("file drop handling", () => {
    it("should call onFilesReceived when valid files are dropped", () => {
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() => useDragDrop({ onFilesReceived }));

      const file = createMockFile("test.txt", 1000, "text/plain");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onFilesReceived).toHaveBeenCalledWith([file]);
      expect(result.current.state.isDragging).toBe(false);
      expect(result.current.state.errors).toEqual([]);
    });

    it("should reset drag state on drop", () => {
      const { result } = renderHook(() => useDragDrop());
      const enterEvent = createDragEvent([]);
      const dropEvent = createDragEvent([createMockFile("test.txt", 100, "text/plain")]);

      act(() => {
        result.current.dragHandlers.onDragEnter(enterEvent);
      });

      expect(result.current.state.isDragging).toBe(true);

      act(() => {
        result.current.dragHandlers.onDrop(dropEvent);
      });

      expect(result.current.state.isDragging).toBe(false);
      expect(result.current.state.isOver).toBe(false);
    });
  });

  describe("file validation - maxFiles", () => {
    it("should reject when files exceed maxFiles limit", () => {
      const onValidationError = vi.fn();
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ maxFiles: 2, onValidationError, onFilesReceived }),
      );

      const files = [
        createMockFile("file1.txt", 100, "text/plain"),
        createMockFile("file2.txt", 100, "text/plain"),
        createMockFile("file3.txt", 100, "text/plain"),
      ];
      const event = createDragEvent(files);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onValidationError).toHaveBeenCalled();
      expect(onFilesReceived).not.toHaveBeenCalled();
      expect(result.current.state.errors).toContain(
        "Maximum 2 files allowed. You selected 3 files.",
      );
      expect(result.current.state.isValid).toBe(false);
    });

    it("should accept files within maxFiles limit", () => {
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ maxFiles: 3, onFilesReceived }),
      );

      const files = [
        createMockFile("file1.txt", 100, "text/plain"),
        createMockFile("file2.txt", 100, "text/plain"),
      ];
      const event = createDragEvent(files);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onFilesReceived).toHaveBeenCalledWith(files);
      expect(result.current.state.errors).toEqual([]);
    });
  });

  describe("file validation - maxFileSize", () => {
    it("should reject files exceeding maxFileSize", () => {
      const onValidationError = vi.fn();
      const onFilesReceived = vi.fn();
      const maxFileSize = 1024 * 1024; // 1MB
      const { result } = renderHook(() =>
        useDragDrop({ maxFileSize, onValidationError, onFilesReceived }),
      );

      const file = createMockFile("large.txt", 2 * 1024 * 1024, "text/plain"); // 2MB
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onValidationError).toHaveBeenCalled();
      expect(onFilesReceived).not.toHaveBeenCalled();
      expect(result.current.state.isValid).toBe(false);
      expect(result.current.state.errors[0]).toContain("exceeds maximum size");
    });

    it("should accept files within maxFileSize", () => {
      const onFilesReceived = vi.fn();
      const maxFileSize = 1024 * 1024; // 1MB
      const { result } = renderHook(() =>
        useDragDrop({ maxFileSize, onFilesReceived }),
      );

      const file = createMockFile("small.txt", 512 * 1024, "text/plain"); // 512KB
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onFilesReceived).toHaveBeenCalledWith([file]);
      expect(result.current.state.errors).toEqual([]);
    });
  });

  describe("file validation - accept types", () => {
    it("should accept files matching MIME type", () => {
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ accept: ["image/png"], onFilesReceived }),
      );

      const file = createMockFile("image.png", 100, "image/png");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onFilesReceived).toHaveBeenCalledWith([file]);
    });

    it("should accept files matching wildcard MIME type", () => {
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ accept: ["image/*"], onFilesReceived }),
      );

      const file = createMockFile("photo.jpeg", 100, "image/jpeg");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onFilesReceived).toHaveBeenCalledWith([file]);
    });

    it("should accept files matching file extension", () => {
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ accept: [".pdf"], onFilesReceived }),
      );

      const file = createMockFile("document.pdf", 100, "application/pdf");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onFilesReceived).toHaveBeenCalledWith([file]);
    });

    it("should reject files not matching accept types", () => {
      const onValidationError = vi.fn();
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ accept: ["image/*"], onValidationError, onFilesReceived }),
      );

      const file = createMockFile("doc.txt", 100, "text/plain");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onValidationError).toHaveBeenCalled();
      expect(onFilesReceived).not.toHaveBeenCalled();
      expect(result.current.state.errors[0]).toContain("not accepted");
    });

    it("should accept all files with wildcard accept", () => {
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ accept: ["*"], onFilesReceived }),
      );

      const file = createMockFile("any.xyz", 100, "application/octet-stream");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(onFilesReceived).toHaveBeenCalledWith([file]);
    });
  });

  describe("custom validator", () => {
    it("should call custom validator and handle errors", () => {
      const onValidationError = vi.fn();
      const validator = vi.fn().mockReturnValue(["Custom error message"]);
      const { result } = renderHook(() =>
        useDragDrop({ validator, onValidationError }),
      );

      const file = createMockFile("test.txt", 100, "text/plain");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(validator).toHaveBeenCalledWith([file]);
      expect(onValidationError).toHaveBeenCalled();
      expect(result.current.state.errors).toContain("Custom error message");
    });

    it("should pass validation when custom validator returns null", () => {
      const onFilesReceived = vi.fn();
      const validator = vi.fn().mockReturnValue(null);
      const { result } = renderHook(() =>
        useDragDrop({ validator, onFilesReceived }),
      );

      const file = createMockFile("test.txt", 100, "text/plain");
      const event = createDragEvent([file]);

      act(() => {
        result.current.dragHandlers.onDrop(event);
      });

      expect(validator).toHaveBeenCalledWith([file]);
      expect(onFilesReceived).toHaveBeenCalledWith([file]);
    });
  });

  describe("processFiles", () => {
    it("should process files manually", () => {
      const onFilesReceived = vi.fn();
      const { result } = renderHook(() => useDragDrop({ onFilesReceived }));

      const files = [createMockFile("test.txt", 100, "text/plain")];

      act(() => {
        result.current.processFiles(files);
      });

      expect(onFilesReceived).toHaveBeenCalledWith(files);
    });

    it("should validate files when processing manually", () => {
      const onValidationError = vi.fn();
      const { result } = renderHook(() =>
        useDragDrop({ maxFiles: 1, onValidationError }),
      );

      const files = [
        createMockFile("file1.txt", 100, "text/plain"),
        createMockFile("file2.txt", 100, "text/plain"),
      ];

      act(() => {
        result.current.processFiles(files);
      });

      expect(onValidationError).toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset state to initial values", () => {
      const { result } = renderHook(() => useDragDrop());
      const event = createDragEvent([]);

      act(() => {
        result.current.dragHandlers.onDragEnter(event);
      });

      expect(result.current.state.isDragging).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toEqual({
        isDragging: false,
        isOver: false,
        isValid: true,
        errors: [],
      });
    });
  });

  describe("multiple option", () => {
    it("should set multiple to true by default", () => {
      const { result } = renderHook(() => useDragDrop());
      expect(result.current.inputProps.multiple).toBe(true);
    });

    it("should respect multiple option when set to false", () => {
      const { result } = renderHook(() => useDragDrop({ multiple: false }));
      expect(result.current.inputProps.multiple).toBe(false);
    });
  });
});
