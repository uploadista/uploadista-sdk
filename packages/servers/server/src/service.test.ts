import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  AuthContextService,
  AuthContextServiceLive,
  NoAuthContextServiceLive,
} from "./service";
import type { AuthContext } from "./types";

describe("AuthContextService", () => {
  describe("AuthContextServiceLive", () => {
    it("should return userId when auth context is provided", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
        metadata: { role: "admin" },
        permissions: ["upload:create", "flow:execute"],
      };

      const layer = AuthContextServiceLive(authContext);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getClientId();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toBe("user-123");
    });

    it("should return null when auth context is null", async () => {
      const layer = AuthContextServiceLive(null);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getClientId();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toBeNull();
    });

    it("should return metadata when auth context is provided", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
        metadata: { role: "admin", tier: "premium" },
        permissions: [],
      };

      const layer = AuthContextServiceLive(authContext);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getMetadata();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toEqual({ role: "admin", tier: "premium" });
    });

    it("should return empty object when auth context has no metadata", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
      };

      const layer = AuthContextServiceLive(authContext);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getMetadata();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toEqual({});
    });

    it("should return empty object when auth context is null", async () => {
      const layer = AuthContextServiceLive(null);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getMetadata();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toEqual({});
    });

    it("should return true for existing permission", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
        permissions: ["upload:create", "flow:execute", "admin:read"],
      };

      const layer = AuthContextServiceLive(authContext);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.hasPermission("flow:execute");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toBe(true);
    });

    it("should return false for non-existing permission", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
        permissions: ["upload:create", "flow:execute"],
      };

      const layer = AuthContextServiceLive(authContext);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.hasPermission("admin:write");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toBe(false);
    });

    it("should return false for permission check when no permissions array", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
      };

      const layer = AuthContextServiceLive(authContext);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.hasPermission("upload:create");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toBe(false);
    });

    it("should return false for permission check when auth context is null", async () => {
      const layer = AuthContextServiceLive(null);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.hasPermission("upload:create");
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toBe(false);
    });

    it("should return full auth context when provided", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
        metadata: { role: "admin" },
        permissions: ["upload:create"],
      };

      const layer = AuthContextServiceLive(authContext);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getAuthContext();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toEqual(authContext);
    });

    it("should return null auth context when not provided", async () => {
      const layer = AuthContextServiceLive(null);
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getAuthContext();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );
      expect(result).toBeNull();
    });
  });

  describe("NoAuthContextServiceLive", () => {
    it("should return null for getUserId", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getClientId();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(NoAuthContextServiceLive)),
      );
      expect(result).toBeNull();
    });

    it("should return empty object for getMetadata", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getMetadata();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(NoAuthContextServiceLive)),
      );
      expect(result).toEqual({});
    });

    it("should return false for any permission check", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        const result1 = yield* service.hasPermission("upload:create");
        const result2 = yield* service.hasPermission("admin:write");
        return { result1, result2 };
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(NoAuthContextServiceLive)),
      );
      expect(result.result1).toBe(false);
      expect(result.result2).toBe(false);
    });

    it("should return null for getAuthContext", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        return yield* service.getAuthContext();
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(NoAuthContextServiceLive)),
      );
      expect(result).toBeNull();
    });
  });

  describe("Effect Layer composition", () => {
    it("should work in composed effect programs", async () => {
      const authContext: AuthContext = {
        clientId: "user-456",
        metadata: { department: "engineering" },
        permissions: ["flow:execute"],
      };

      const layer = AuthContextServiceLive(authContext);

      const program = Effect.gen(function* () {
        const service = yield* AuthContextService;
        const clientId = yield* service.getClientId();
        const metadata = yield* service.getMetadata();
        const hasPermission = yield* service.hasPermission("flow:execute");

        return { clientId, metadata, hasPermission };
      });

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );

      expect(result).toEqual({
        clientId: "user-456",
        metadata: { department: "engineering" },
        hasPermission: true,
      });
    });
  });
});
