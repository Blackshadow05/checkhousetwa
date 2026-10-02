import type { RetornoGoogle } from "@/components/auth/login-form";
import { AppShell } from "@/components/shell/app-shell";
import { getSesionUsuario } from "@/lib/auth/session";
import { getInicioMenus } from "@/lib/db/menus";
import { getInicioRevisiones } from "@/lib/db/revisiones-casitas";
import { screenFromSlug } from "@/lib/navigation/screens";
import { todayKey } from "@/lib/revisiones-display";

type PageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const RETORNOS_GOOGLE: Record<string, RetornoGoogle> = {
  authenticator: "continuar",
  unauthorized: "unauthorized",
  error: "error",
};

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: PageProps) {
  const [{ slug }, { auth }] = await Promise.all([params, searchParams]);
  const initialDay = todayKey();
  const user = await getSesionUsuario();
  const retornoGoogle = !user && typeof auth === "string" ? RETORNOS_GOOGLE[auth] : undefined;
  const [{ revisiones, upsells, revisionActivity, activityError, error }, menusResult] = await Promise.all([
    user ? getInicioRevisiones(initialDay) : Promise.resolve({ revisiones: [], upsells: [], revisionActivity: null, activityError: null, error: null }),
    getInicioMenus(),
  ]);

  return (
    <AppShell
      initialUser={user}
      initialScreen={screenFromSlug(slug)}
      revisionesInicio={revisiones}
      revisionesError={error}
      upsellsInicio={upsells}
      revisionActivityInicio={revisionActivity}
      activityError={activityError}
      menusInicio={menusResult.menus}
      menusError={menusResult.error}
      initialDay={initialDay}
      retornoGoogle={retornoGoogle}
    />
  );
}
