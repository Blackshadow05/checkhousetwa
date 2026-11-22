import { AppShell } from "@/components/shell/app-shell";
import { todayKey } from "@/lib/revisiones-display";

export default function OfflinePage() {
  return (
    <AppShell
      offlineFallback
      initialScreen="inicio"
      revisionesInicio={[]}
      revisionesError="offline"
      upsellsInicio={[]}
      revisionActivityInicio={null}
      activityError="offline"
      menusInicio={[]}
      menusError="offline"
      initialDay={todayKey()}
    />
  );
}
