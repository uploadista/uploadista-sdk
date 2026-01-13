# Contributing to Uploadista SDK

Thank you for your interest in contributing to Uploadista SDK! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/uploadista-sdk.git`
3. Add the upstream remote: `git remote add upstream https://github.com/uploadista/uploadista-sdk.git`

## Development Setup

### Prerequisites

- **Node.js**: v20 or later (we recommend using [Volta](https://volta.sh/) or [fnm](https://github.com/Schniz/fnm))
- **pnpm**: v10.26.2 or later

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development mode (watch)
pnpm dev
```

### Project Structure

```
uploadista-sdk/
├── packages/
│   ├── core/           # Flow engine and core types
│   ├── clients/        # Client SDKs
│   ├── servers/        # Upload and flow servers
│   ├── data-stores/    # Storage backends (S3, Azure, GCS, etc.)
│   ├── kv-stores/      # KV store implementations
│   ├── flow/           # Flow nodes (input, output, image, utility)
│   └── observability/  # Observability and monitoring
├── examples/           # Example applications
└── docs/               # Documentation
```

## Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/my-bugfix
   ```

2. Make your changes

3. Run linting and tests:
   ```bash
   pnpm check    # Run Biome linter
   pnpm build    # Ensure build passes
   pnpm test     # Run tests
   ```

4. Commit your changes following our commit guidelines

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This enables automatic changelog generation.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, etc.) |
| `refactor` | Code changes that neither fix bugs nor add features |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `chore` | Other changes that don't modify src or test files |

### Scope

The scope should be the package name without the `@uploadista/` prefix:

- `core`, `client`, `server`
- `s3`, `azure`, `gcs`, `filesystem`
- `redis`, `ioredis`, `memory`
- `flow`, `observability`

### Examples

```bash
feat(core): add support for parallel node execution
fix(s3): handle multipart upload errors correctly
docs: update README with new examples
chore: update dependencies
```

### Breaking Changes

For breaking changes, add `!` after the type/scope and include a `BREAKING CHANGE:` footer:

```bash
feat(core)!: change flow configuration API

BREAKING CHANGE: The `createFlow()` function now requires a configuration object instead of positional arguments.
```

## Pull Request Process

1. Ensure your branch is up to date with `main`:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Push your branch to your fork:
   ```bash
   git push origin feat/my-feature
   ```

3. Open a Pull Request against the `main` branch

4. Fill out the PR template completely

5. Wait for CI checks to pass

6. Address any review feedback

7. Once approved, a maintainer will merge your PR

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check for issues
pnpm check

# Format code
pnpm format
```

### Key Guidelines

- Use TypeScript for all code
- Export types explicitly
- Prefer named exports over default exports
- Keep functions small and focused
- Add JSDoc comments for public APIs

## Testing

We use [Vitest](https://vitest.dev/) for testing.

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @uploadista/core test

# Run tests in watch mode
pnpm --filter @uploadista/core test -- --watch
```

### Writing Tests

- Place tests in a `__tests__` directory or alongside the source file with `.test.ts` extension
- Test both success and error cases
- Use descriptive test names

## Questions?

If you have questions, feel free to:

- Open a [Discussion](https://github.com/uploadista/uploadista-sdk/discussions)
- Check existing [Issues](https://github.com/uploadista/uploadista-sdk/issues)

Thank you for contributing!
