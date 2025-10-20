# Azure Blob Storage Data Store

Cross-platform Azure Blob Storage implementation for Uploadista.

## Authentication Options

### 1. SAS URL (Recommended for browsers and edge environments)

```typescript
import { azureStore } from "@uploadista/data-store-azure";
import { kvStoreMemory } from "@uploadista/kv-store-memory";

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  sasUrl: "https://myaccount.blob.core.windows.net?sv=2022-11-02&ss=b&srt=sco&sp=rwdlacupx&se=2024-12-31T23:59:59Z&st=2024-01-01T00:00:00Z&spr=https&sig=...",
  containerName: "uploads",
  kvStore: kvStoreMemory(),
});
```

### 2. OAuth Token Credential (Recommended for production)

```typescript
import { DefaultAzureCredential } from "@azure/identity";
import { azureStore } from "@uploadista/data-store-azure";
import { kvStoreMemory } from "@uploadista/kv-store-memory";

const credential = new DefaultAzureCredential();

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  accountName: "myaccount", // Used to construct the URL
  credential,
  containerName: "uploads",
  kvStore: kvStoreMemory(),
});
```

### 3. Connection String

```typescript
import { azureStore } from "@uploadista/data-store-azure";
import { kvStoreMemory } from "@uploadista/kv-store-memory";

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  connectionString: "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=...;EndpointSuffix=core.windows.net",
  containerName: "uploads",
  kvStore: kvStoreMemory(),
});
```

### 4. Shared Key Authentication (Node.js only, deprecated)

```typescript
import { azureStore } from "@uploadista/data-store-azure";
import { kvStoreMemory } from "@uploadista/kv-store-memory";

// ⚠️ Only works in Node.js environments
const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  accountName: "myaccount",
  accountKey: "your-account-key",
  containerName: "uploads",
  kvStore: kvStoreMemory(),
});
```

## Cross-Platform Compatibility

The new authentication methods solve the issue where `StorageSharedKeyCredential` is only available in Node.js environments:

- **SAS URL**: Works in all environments (Node.js, browsers, Cloudflare Workers, etc.)
- **OAuth Token Credential**: Works in all environments and provides better security
- **Connection String**: Works in all environments
- **Shared Key**: Only works in Node.js (legacy support)

## Migration from Shared Key

If you're currently using `accountName` and `accountKey`, consider migrating to one of the cross-platform options:

1. **For development/testing**: Use SAS URL
2. **For production**: Use OAuth token credentials with proper Azure AD setup
3. **For simple cases**: Use connection string

The legacy shared key authentication is still supported in Node.js environments but is deprecated.