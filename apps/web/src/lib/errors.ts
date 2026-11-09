import { isAxiosError } from 'axios';

/** The API's error envelope: { success: false, error: { code, message, details } }. */
interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
}

/** A message that is safe and useful to show the user, whatever went wrong. */
export function errorMessage(err: unknown): string {
  if (isAxiosError<ApiErrorBody>(err)) {
    const body = err.response?.data?.error;
    const firstDetail = body?.details?.[0];
    if (body?.code === 'VALIDATION_ERROR' && firstDetail) {
      return `${firstDetail.path}: ${firstDetail.message}`;
    }
    if (body?.message) return body.message;
    if (!err.response) return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

export function errorCode(err: unknown): string | undefined {
  return isAxiosError<ApiErrorBody>(err) ? err.response?.data?.error?.code : undefined;
}
