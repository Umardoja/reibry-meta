// Stage 12J-3: manual video upload and on-demand video analysis are an experimental, developer-only capability, OFF unless the server
// sets REIBRY_EXPERIMENTAL_VIDEO_UPLOAD=true. Existing video Memories, their stored analysis and the database stay untouched.
export function experimentalVideoUploadEnabled(env: Record<string, string | undefined> = process.env) {
  return env.REIBRY_EXPERIMENTAL_VIDEO_UPLOAD === "true";
}
