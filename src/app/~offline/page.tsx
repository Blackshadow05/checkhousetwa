import { AppShell } from "@/components/shell/app-shell";
import { todayKey } from "@/lib/revisiones-display";

export default function OfflinePage() {
  return (
    <AppShell
      initialScreen="inicio"
      revisionesInicio={[]}
      revisionesError="offline"
      upsellsInicio={[]}
      menusInicio={[]}
      menusError="offline"
      initialDay={todayKey()}
    />
  );
}
