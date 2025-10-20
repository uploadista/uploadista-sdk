# React Client Example

This example demonstrates how to use the **@uploadista/react** library to build interactive file upload UIs that work with the Uploadista server examples.

## 🚀 Features

- **Basic Upload** - Single file upload with progress tracking
- **Flow Upload** - Upload files through processing flows (e.g., image optimization)
- **Multi Upload** - Upload multiple files concurrently with individual progress tracking
- **Drag & Drop** - Drag and drop interface with file validation

## 📦 Installation

From the project root:

```bash
# Install dependencies
pnpm install

# Navigate to this example
cd examples/react-client

# Install React client example dependencies
pnpm install
```

## 🏃 Running the Example

### 1. Start a Server

First, start one of the server examples:

**Express Server:**
```bash
cd examples/express-server
pnpm run dev
# Server runs on http://localhost:3000
```

**Hono Server:**
```bash
cd examples/hono-server
pnpm run dev
# Server runs on http://localhost:3000
```

### 2. Start the React Client

In a new terminal:

```bash
cd examples/react-client
pnpm run dev
# Client runs on http://localhost:5173
```

The React app will open automatically in your browser.

## 🎯 Usage

### Configuring the Server URL

The example includes a server URL input at the top. By default, it's set to `http://localhost:3000`. If your server is running on a different port, update this URL.

### Example Tabs

#### 1. Basic Upload
- Upload a single file
- View upload progress in real-time
- See success/error messages
- Retry failed uploads

#### 2. Flow Upload
- Upload images through the optimization flow
- The "optimize-flow" converts images to JPEG at 80% quality
- Monitor flow execution progress
- View job ID for tracking

#### 3. Multi Upload
- Upload multiple files at once
- Configure concurrent upload limit (default: 3)
- Track individual file progress
- Retry failed uploads
- Abort individual or all uploads

#### 4. Drag & Drop
- Drag and drop files into the upload zone
- File type validation (images, videos, PDFs)
- File size validation (max 50MB)
- Max 10 files at once

## 🏗️ Code Structure

```
react-client/
├── src/
│   ├── components/
│   │   ├── BasicUploadExample.tsx      # Single file upload
│   │   ├── FlowUploadExample.tsx       # Flow-based upload
│   │   ├── MultiUploadExample.tsx      # Multi-file upload
│   │   └── DragDropUploadExample.tsx   # Drag & drop interface
│   ├── App.tsx                         # Main application
│   ├── App.css                         # Styles
│   └── main.tsx                        # Entry point
├── index.html                          # HTML template
├── package.json                        # Dependencies
├── tsconfig.json                       # TypeScript config
├── vite.config.ts                      # Vite config
└── README.md                           # This file
```

## 📚 Key Hooks & Components Used

### Hooks

- **`useUploadistaClient`** - Creates the upload client with configuration
- **`useUpload`** - Manages single file upload
- **`useFlowUpload`** - Manages upload through a flow
- **`useMultiUpload`** - Manages multiple file uploads
- **`useDragDrop`** - Provides drag & drop functionality

### Configuration Options

```tsx
const client = useUploadistaClient({
  baseUrl: 'http://localhost:3000',
  uploadistaBasePath: 'uploadista',
  storageId: 'local',
  chunkSize: 1024 * 1024, // 1MB chunks
  storeFingerprintForResuming: true,
  onEvent: (event) => {
    console.log('Upload event:', event);
  },
});
```

## 🔧 Available Scripts

### `pnpm run dev`
Start the development server with hot reloading (port 5173)

### `pnpm run build`
Build the application for production

### `pnpm run preview`
Preview the production build locally

### `pnpm run format`
Format code with Biome

### `pnpm run lint`
Lint code with Biome

### `pnpm run check`
Run Biome checks (format + lint)

## 🎨 Customization

### Styling

The example uses plain CSS in `src/App.css`. You can customize:
- Colors and themes
- Layout and spacing
- Progress bar styles
- Button styles

### Upload Configuration

Modify the upload client configuration in each component:

```tsx
const client = useUploadistaClient({
  chunkSize: 2 * 1024 * 1024, // Change to 2MB chunks
  parallelUploads: 5,          // Increase concurrent uploads
  // ... other options
});
```

### Flow Configuration

Change the flow ID to use different processing flows:

```tsx
const flowUpload = useFlowUpload(client, {
  flowConfig: {
    flowId: 'simple-flow',  // or 'optimize-flow'
    storageId: 'local',
  },
});
```

## 🧪 Testing Different Scenarios

### Test Large Files

Upload large files to see chunked upload in action:

```tsx
const client = useUploadistaClient({
  chunkSize: 512 * 1024, // 512KB chunks (smaller = more chunks)
});
```

### Test Error Handling

1. Stop the server while uploading
2. Try uploading invalid file types
3. Test with very large files

### Test Concurrent Uploads

1. Go to the Multi Upload tab
2. Select 10+ files
3. Watch them upload in parallel (max 3 at a time by default)

## 🐛 Troubleshooting

### Server Connection Failed

**Problem:** Can't connect to the server
**Solution:**
- Verify the server is running (`pnpm run dev` in server directory)
- Check the server URL in the app matches your server's URL
- Ensure no firewall is blocking the connection

### Upload Fails Immediately

**Problem:** Uploads fail without progress
**Solution:**
- Check browser console for errors
- Verify the `storageId` matches what the server expects (default: `'local'`)
- Ensure the server's upload directory is writable

### TypeScript Errors

**Problem:** TypeScript compilation errors
**Solution:**
- Run `pnpm install` to ensure all dependencies are installed
- Check that workspace dependencies are built: `pnpm run build` from repo root

### CORS Errors

**Problem:** Browser shows CORS policy errors
**Solution:**
- The server examples have CORS enabled by default
- If using a custom server, ensure CORS headers are set
- Check that the server URL protocol matches (http vs https)

## 📖 Learn More

- [Uploadista React Library Documentation](../../packages/uploadista/clients/react/README.md)
- [Express Server Example](../express-server/README.md)
- [Hono Server Example](../hono-server/README.md)
- [Uploadista Core Documentation](../../packages/uploadista/core/README.md)

## 🤝 Contributing

Feel free to modify this example to test new features or demonstrate different use cases!

## 📝 License

MIT
