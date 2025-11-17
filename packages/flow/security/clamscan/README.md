# @uploadista/flow-security-clamscan

ClamAV virus scanning plugin for Uploadista Flow. Provides virus and malware detection using the industry-standard ClamAV antivirus engine.

## Installation

```bash
npm install @uploadista/flow-security-clamscan
# or
pnpm add @uploadista/flow-security-clamscan
# or
yarn add @uploadista/flow-security-clamscan
```

## System Requirements

This plugin requires ClamAV to be installed on your system. ClamAV can run in two modes:

1. **clamd daemon** (recommended): Faster, persistent scanning service
2. **clamscan binary**: Slower but works without daemon

### Installing ClamAV

#### macOS

```bash
brew install clamav
# Start the daemon
brew services start clamav
```

#### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install clamav clamav-daemon
# Update virus definitions
sudo freshclam
# Start daemon
sudo systemctl start clamav-daemon
```

#### Fedora/RHEL

```bash
sudo yum install clamav clamav-update
sudo freshclam
sudo systemctl start clamd
```

#### Docker

Add to your Dockerfile:

```dockerfile
RUN apt-get update && apt-get install -y clamav clamav-daemon
RUN freshclam
```

## Usage

### Basic Usage

```typescript
import { createScanVirusNode } from "@uploadista/flow-security-nodes";
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  // Create virus scan node
  const scanNode = yield* createScanVirusNode("scan-1", {
    action: "fail",
  });

  // Use the node in your flow...
}).pipe(
  // Provide ClamAV plugin
  Effect.provide(ClamScanPluginLayer()),
);
```

### Custom Configuration

```typescript
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";

// Configure ClamAV plugin
const clamavLayer = ClamScanPluginLayer({
  preference: "clamdscan", // Use daemon (faster)
  clamdscan_socket: "/var/run/clamd.scan/clamd.sock", // Custom socket path
  debug_mode: false,
});

// Or use TCP connection
const tcpLayer = ClamScanPluginLayer({
  preference: "clamdscan",
  clamdscan_host: "localhost",
  clamdscan_port: 3310,
});
```

### Configuration Options

```typescript
interface ClamScanConfig {
  // Scanning method preference
  preference?: "clamdscan" | "clamscan"; // Default: "clamdscan"

  // Daemon socket path (Unix)
  clamdscan_socket?: string; // Default: system default

  // TCP connection (alternative to socket)
  clamdscan_host?: string;
  clamdscan_port?: number; // Default: 3310

  // Whether to remove infected files (not recommended in flows)
  remove_infected?: boolean; // Default: false

  // Debug mode
  debug_mode?: boolean; // Default: false
}
```

## How It Works

1. **Initialization**: Plugin initializes ClamAV connection (daemon or binary) on first use
2. **Temp File**: Input bytes are written to a temporary file
3. **Scanning**: ClamAV scans the temporary file for viruses
4. **Cleanup**: Temporary file is deleted after scanning (success or failure)
5. **Result**: Returns scan results with detected virus names (if any)

### Performance Characteristics

- **Daemon mode (clamdscan)**: ~100-500ms for small files (<1MB)
- **Binary mode (clamscan)**: ~1-3s per scan (slower, requires process startup)
- **Large files**: Time increases linearly with file size
- **Memory**: Efficient stream-based scanning, low memory footprint

## Virus Definitions

ClamAV uses virus definition databases that must be kept up-to-date.

### Update Virus Definitions

```bash
# Update manually
sudo freshclam

# Set up automatic updates (cron)
# Add to crontab:
0 */6 * * * /usr/bin/freshclam --quiet
```

### Docker

In your Dockerfile, update definitions at build time:

```dockerfile
RUN freshclam
```

For production, set up a cron job or scheduled task to run `freshclam` regularly.

## Testing

You can test virus detection using the EICAR test file - a harmless file that all antivirus software detects as malware:

```typescript
// EICAR test string (safe, not actual malware)
const eicarTest = new TextEncoder().encode(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
);

const result = yield* virusScanPlugin.scan(eicarTest);
// result.isClean === false
// result.detectedViruses === ["Eicar-Test-Signature"]
```

## Troubleshooting

### "ClamAV is not installed or not available"

- Verify ClamAV is installed: `clamscan --version`
- Check daemon is running: `systemctl status clamav-daemon` (Linux)
- Try using binary mode: `preference: "clamscan"`

### "Connection refused" / Daemon not responding

- Ensure daemon is running: `sudo systemctl start clamav-daemon`
- Check socket path matches your system's configuration
- Try TCP connection instead of socket

### Scan timeout

- Increase timeout in scan virus node parameters
- Consider using daemon mode (faster than binary)
- Check system resources (CPU, memory)

### Outdated virus definitions

```bash
# Check definitions age
freshclam --version

# Update definitions
sudo freshclam
```

## Examples

### Basic File Scan

```typescript
import { Effect } from "effect";
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";
import { VirusScanPlugin } from "@uploadista/core/flow";

const scanFile = (fileBytes: Uint8Array) =>
  Effect.gen(function* () {
    const scanner = yield* VirusScanPlugin;

    const result = yield* scanner.scan(fileBytes);

    if (!result.isClean) {
      console.log("⚠️  Viruses detected:", result.detectedViruses);
    } else {
      console.log("✅ File is clean");
    }

    return result;
  }).pipe(Effect.provide(ClamScanPluginLayer()));
```

### Secure Upload Flow

```typescript
import { createFlow } from "@uploadista/core/flow";
import { createScanVirusNode } from "@uploadista/flow-security-nodes";
import { ClamScanPluginLayer } from "@uploadista/flow-security-clamscan";

const secureFlow = createFlow({
  nodes: [
    createInputNode("input"),
    createScanVirusNode("virus-scan", { action: "fail" }),
    createStorageNode("storage", { storageId: "uploads" }),
  ],
  edges: [
    { source: "input", target: "virus-scan" },
    { source: "virus-scan", target: "storage" },
  ],
}).pipe(Effect.provide(ClamScanPluginLayer()));
```

## License

MIT
