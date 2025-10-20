# Smart Chunking Feature

The smart chunking feature provides adaptive chunk size optimization for file uploads based on network conditions and performance metrics.

## Overview

Instead of using fixed chunk sizes, smart chunking dynamically adjusts chunk sizes based on:
- Network speed and latency
- Upload success rates
- Bandwidth utilization
- Connection stability

## Configuration

Smart chunking works out of the box without any configuration:

```typescript
// Smart chunking is enabled by default
const client = createUploadClient({
  baseUrl: 'https://your-api.com',
  storageId: 'your-storage-id',
  chunkSize: 1024 * 1024, // Fallback size if smart chunking needs to be disabled
});
```

For advanced configuration, you can customize the behavior:

```typescript
import { createUploadClient } from '@uploadista/client/create-upload-client';

const client = createUploadClient({
  baseUrl: 'https://your-api.com',
  storageId: 'your-storage-id',
  chunkSize: 1024 * 1024, // Fallback chunk size (1MB)
  smartChunking: {
    enabled: true, // Enable smart chunking (enabled by default)
    minChunkSize: 64 * 1024, // 64KB minimum
    maxChunkSize: 32 * 1024 * 1024, // 32MB maximum
    initialChunkSize: 512 * 1024, // 512KB initial size
    targetUtilization: 0.85, // Target 85% bandwidth utilization
    conservativeMode: false, // Use aggressive chunking when possible
  },
  networkMonitoring: {
    maxSamples: 100, // Keep last 100 upload samples
    slowThreshold: 50 * 1024, // 50 KB/s considered slow
    fastThreshold: 5 * 1024 * 1024, // 5 MB/s considered fast
  },
  uploadMetrics: {
    enableDetailedMetrics: true, // Track detailed performance data
  },
});
```

## Network Conditions

The system automatically detects and adapts to different network conditions:

### Slow Networks
- **Threshold**: < 50 KB/s average speed
- **Strategy**: Conservative chunking with smaller, more reliable chunks
- **Chunk Range**: 64KB - 2MB

### Fast Networks  
- **Threshold**: > 5 MB/s average speed
- **Strategy**: Aggressive chunking with larger chunks for efficiency
- **Chunk Range**: 256KB - 32MB

### Unstable Networks
- **Detection**: High variability in upload speeds (coefficient of variation > 50%)
- **Strategy**: Conservative chunking with quick recovery on failures
- **Chunk Range**: 64KB - 2MB

## Adaptive Behavior

### Success-Based Adaptation
- **Consecutive Successes**: Gradually increase chunk size to improve efficiency
- **Consecutive Failures**: Immediately reduce chunk size for reliability

### Throughput Optimization
- **Target Duration**: Aims for 2-5 seconds per chunk based on network condition
- **Bandwidth Utilization**: Targets 85% bandwidth usage for optimal performance
- **Real-time Adjustment**: Adapts chunk size based on actual vs. expected throughput

## Performance Monitoring

Access performance insights and metrics:

```typescript
// Get current network metrics
const networkMetrics = client.getNetworkMetrics();
console.log(`Average speed: ${networkMetrics.averageSpeed / 1024} KB/s`);
console.log(`Success rate: ${networkMetrics.successRate * 100}%`);

// Get network condition assessment
const condition = client.getNetworkCondition();
console.log(`Network type: ${condition.type}, confidence: ${condition.confidence}`);

// Get performance insights and recommendations
const insights = client.getChunkingInsights();
console.log('Recommendations:', insights.recommendations);
console.log('Optimal chunk size range:', insights.optimalChunkSizeRange);

// Export detailed metrics for analysis
const metrics = client.exportMetrics();
```

## Backwards Compatibility

Smart chunking is fully backwards compatible:

- **Default Behavior**: Smart chunking is enabled by default with sensible defaults
- **Disable Option**: Set `smartChunking.enabled: false` to use fixed chunking
- **Fallback Support**: If smart chunking fails, automatically falls back to the configured `chunkSize`
- **No Config Required**: Works out of the box without any configuration

## Benefits

1. **Improved Performance**: Optimizes chunk sizes for network conditions
2. **Better Reliability**: Reduces failures on unstable connections  
3. **Bandwidth Efficiency**: Maximizes upload throughput while maintaining stability
4. **Adaptive Recovery**: Quickly adjusts to changing network conditions
5. **Detailed Analytics**: Provides insights for performance optimization

## Algorithm Details

### Chunk Size Calculation
```
targetSize = currentSize * (1 - adaptationRate) + theoreticalOptimalSize * adaptationRate
finalSize = clamp(targetSize, minChunkSize, maxChunkSize)
```

### Network Condition Detection
- **Speed Classification**: Based on average throughput over recent samples
- **Stability Assessment**: Using coefficient of variation of upload speeds
- **Confidence Scoring**: Based on sample size and consistency

### Performance Metrics
- **Efficiency Score**: Combination of speed and success rate
- **Chunking Effectiveness**: How well chunk sizes correlate with performance
- **Network Stability**: Inverse of upload speed variability