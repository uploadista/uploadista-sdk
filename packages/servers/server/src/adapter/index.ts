/**
 * Adapter module for framework-agnostic server implementation.
 *
 * This module defines the ServerAdapter interface that allows the core
 * Uploadista server to work with any HTTP framework (Hono, Express, Fastify, etc.)
 * by providing a thin translation layer between framework-specific types
 * and standard request/response representations.
 */

export * from "./types";
