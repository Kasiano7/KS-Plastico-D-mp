export function shouldAllowDemoFallback(
  remoteConfigured: boolean,
  explicitFlag = process.env.AI_DEMO_FALLBACK_ENABLED,
): boolean {
  return !remoteConfigured || explicitFlag === 'true';
}
