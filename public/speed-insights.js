/**
 * Vercel Speed Insights
 * Official implementation using @vercel/speed-insights package
 */
import { injectSpeedInsights } from '/@vercel/speed-insights/dist/index.mjs';

// Initialize Speed Insights
injectSpeedInsights({
  framework: 'express'
});
