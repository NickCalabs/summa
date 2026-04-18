import { readFileSync, existsSync } from "fs";
import { NextResponse } from "next/server";

const certDir = process.env.CERT_DIR || "/opt/summa/certs";
const certPath = `${certDir}/ca.crt`;

export function GET() {
  if (!existsSync(certPath)) {
    return new NextResponse("CA certificate not configured", { status: 404 });
  }

  const cert = readFileSync(certPath);
  return new NextResponse(cert as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": 'attachment; filename="summa-ca.crt"',
    },
  });
}
