import { AppShell } from "@/components/shell/app-shell";
import { getInicioMenus } from "@/lib/db/menus";
import { getInicioRevisiones } from "@/lib/db/revisiones-casitas";
import { screenFromSlug } from "@/lib/navigation/screens";
import { todayKey } from "@/lib/revisiones-display";

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const initialDay = todayKey();
  const [{ revisiones, upsells, revisionActivity, activityError, error }, menusResult] = await Promise.all([
    getInicioRevisiones(initialDay),
    getInicioMenus(),
  ]);

  return (
    <AppShell
      initialScreen={screenFromSlug(slug)}
      revisionesInicio={revisiones}
      revisionesError={error}
      upsellsInicio={upsells}
      revisionActivityInicio={revisionActivity}
      activityError={activityError}
      menusInicio={menusResult.menus}
      menusError={menusResult.error}
      initialDay={initialDay}
    />
  );
}
