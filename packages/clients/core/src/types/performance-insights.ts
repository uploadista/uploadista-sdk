export interface PerformanceInsights {
  overallEfficiency: number; // 0-1 score
  chunkingEffectiveness: number; // 0-1 score
  networkStability: number; // 0-1 score
  recommendations: string[];
  optimalChunkSizeRange: { min: number; max: number };
}
