/** Helpers for recognizing renderable media in run output.
 *
 * The executor used to emit generated media as base64 `data:` URLs. It now
 * uploads to Supabase Storage and emits an https URL instead (a data URL blows
 * past the ~256 KB Realtime message limit, so the editor never received it), so
 * anything that renders run output has to recognize both forms.
 */

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isImageValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.startsWith("data:image/")) return true;
  return isHttpUrl(value) && IMAGE_EXTENSIONS.test(value);
}

export function isAudioValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.startsWith("data:audio/")) return true;
  return isHttpUrl(value) && AUDIO_EXTENSIONS.test(value);
}
