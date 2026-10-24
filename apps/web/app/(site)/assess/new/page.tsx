import type { Metadata } from "next";
import { readFlags } from "@mb/domain";
import { IntakeWizard } from "@/components/IntakeWizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start a screening" };

export default async function NewAssessment({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  // Dev-only sample button: requires local dev login AND a configured sample file.
  const devSample = readFlags().devLogin && !!process.env.SAMPLE_VIDEO_PATH;
  return <IntakeWizard resumeId={id && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined} devSample={devSample} />;
}
