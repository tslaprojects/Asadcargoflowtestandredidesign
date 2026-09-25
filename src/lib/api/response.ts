import { NextResponse } from "next/server";
import type { ErrorCode, FieldErrors } from "@/lib/errors";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: ErrorCode; message: string; fields?: FieldErrors };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, { status });
}

export function fail(code: ErrorCode, message: string, status: number, fields?: FieldErrors) {
  return NextResponse.json<ApiFailure>({ success: false, error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}
