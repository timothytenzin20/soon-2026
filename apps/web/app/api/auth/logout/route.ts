import { NextResponse } from "next/server";
import { assertSameOrigin, endSession, route } from "@/lib/server";

export const POST = route(async () => {
  await assertSameOrigin();
  await endSession();
  return NextResponse.json({ ok: true });
});
