/** Real-number connection is off unless explicitly switched on (go-live). */
export function isRealChannelConnectAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ALLOW_REAL_CHANNEL_CONNECT === "true";
}
