/**
 * Bare React Native file system provider for Uploadista
 *
 * This package provides the bare React Native implementation of the FileSystemProvider interface,
 * using native modules for file access in non-Expo React Native environments.
 *
 * Usage:
 * ```ts
 * import { NativeFileSystemProvider } from '@uploadista/clients-react-native-bare'
 *
 * const provider = new NativeFileSystemProvider()
 * const file = await provider.pickImage()
 * ```
 */

export { NativeFileSystemProvider } from "./services/native-file-system-provider";
