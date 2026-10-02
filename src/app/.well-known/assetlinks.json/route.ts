import { NextResponse } from "next/server";
import { ANDROID_PACKAGE_NAME } from "@/lib/constants";

export function GET() {
  const fingerprints = (process.env.TWA_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);
  const statements = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: ANDROID_PACKAGE_NAME,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];
  return NextResponse.json(statements, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
