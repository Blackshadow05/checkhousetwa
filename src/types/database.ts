import type { PantallaReport, PantallaStock } from "@/lib/pantallas";
type Table<Row, Insert = Partial<Row>> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: [] };
export type UsuarioProfile = { id: number; Usuario: string; Rol: string | null; metodo_login: string | null; totp_enrolled: boolean; auth_user_id: string | null };
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      reporte_pantallas: Table<PantallaReport, Pick<PantallaReport, "nombre_usuario" | "fecha_hora" | "numero_casita" | "fotos" | "notas"> & Partial<Omit<PantallaReport, "id">>>;
      inventario_pantallas: Table<PantallaStock & { id: number; updated_at: string }>;
      Usuarios: Table<UsuarioProfile & { password_hash: string | null }>;
      revisiones_casitas: {
        Row: {
          id: string;
          casita: string;
          quien_revisa: string;
          caja_fuerte: string | null;
          puertas_ventanas: string | null;
          chromecast: string | null;
          binoculares: string | null;
          trapo_binoculares: string | null;
          speaker: string | null;
          usb_speaker: string | null;
          controles_tv: string | null;
          secadora: string | null;
          accesorios_secadora: string | null;
          faltantes: string | null;
          steamer: string | null;
          bolsa_vapor: string | null;
          plancha_cabello: string | null;
          bulto: string | null;
          sombrero: string | null;
          bolso_yute: string | null;
          evidencia_01: string | null;
          evidencia_02: string | null;
          evidencia_03: string | null;
          camas_ordenadas: string | null;
          cola_caballo: string | null;
          notas: string | null;
          notas_count: string | null;
          created_at: string | null;
          room_move: string | null;
          nota_extra: string | null;
          usuario_nota: string | null;
          se_movio: Json | null;
          imagen_nota: string | null;
          hora_nota: string | null;
          update_at: string | null;
          fecha_ingreso_casita: string | null;
        };
        Insert: {
          id?: string;
          casita: string;
          quien_revisa: string;
          caja_fuerte?: string | null;
          puertas_ventanas?: string | null;
          chromecast?: string | null;
          binoculares?: string | null;
          trapo_binoculares?: string | null;
          speaker?: string | null;
          usb_speaker?: string | null;
          controles_tv?: string | null;
          secadora?: string | null;
          accesorios_secadora?: string | null;
          faltantes?: string | null;
          steamer?: string | null;
          bolsa_vapor?: string | null;
          plancha_cabello?: string | null;
          bulto?: string | null;
          sombrero?: string | null;
          bolso_yute?: string | null;
          evidencia_01?: string | null;
          evidencia_02?: string | null;
          evidencia_03?: string | null;
          camas_ordenadas?: string | null;
          cola_caballo?: string | null;
          notas?: string | null;
          notas_count?: string | null;
          created_at?: string | null;
          room_move?: string | null;
          nota_extra?: string | null;
          usuario_nota?: string | null;
          se_movio?: Json | null;
          imagen_nota?: string | null;
          hora_nota?: string | null;
          update_at?: string | null;
          fecha_ingreso_casita?: string | null;
        };
        Update: {
          id?: string;
          casita?: string;
          quien_revisa?: string;
          caja_fuerte?: string | null;
          puertas_ventanas?: string | null;
          chromecast?: string | null;
          binoculares?: string | null;
          trapo_binoculares?: string | null;
          speaker?: string | null;
          usb_speaker?: string | null;
          controles_tv?: string | null;
          secadora?: string | null;
          accesorios_secadora?: string | null;
          faltantes?: string | null;
          steamer?: string | null;
          bolsa_vapor?: string | null;
          plancha_cabello?: string | null;
          bulto?: string | null;
          sombrero?: string | null;
          bolso_yute?: string | null;
          evidencia_01?: string | null;
          evidencia_02?: string | null;
          evidencia_03?: string | null;
          camas_ordenadas?: string | null;
          cola_caballo?: string | null;
          notas?: string | null;
          notas_count?: string | null;
          created_at?: string | null;
          room_move?: string | null;
          nota_extra?: string | null;
          usuario_nota?: string | null;
          se_movio?: Json | null;
          imagen_nota?: string | null;
          hora_nota?: string | null;
          update_at?: string | null;
          fecha_ingreso_casita?: string | null;
        };
        Relationships: [];
      };
      menus: {
        Row: {
          id: string;
          fecha_menu: string;
          contenido_menu: string;
        };
        Insert: {
          id?: string;
          fecha_menu: string;
          contenido_menu: string;
        };
        Update: {
          id?: string;
          fecha_menu?: string;
          contenido_menu?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ajustar_inventario_pantalla: { Args: { p_ubicacion: string; p_habitacion: string; p_delta: number }; Returns: undefined };
      set_inventario_pantalla: { Args: { p_ubicacion: string; p_habitacion: string; p_cantidad: number }; Returns: undefined };
      registrar_movimiento_pantalla: { Args: { p_nombre_usuario: string; p_fecha_hora: string; p_notas: string; p_origen_ubicacion: string; p_origen_habitacion: string; p_destino_ubicacion: string; p_destino_habitacion: string }; Returns: PantallaReport };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type RevisionCasita =
  Database["public"]["Tables"]["revisiones_casitas"]["Row"];
export type RevisionCasitaInsert =
  Database["public"]["Tables"]["revisiones_casitas"]["Insert"];
export type RevisionCasitaUpdate =
  Database["public"]["Tables"]["revisiones_casitas"]["Update"];
export type RevisionCasitaInicio = Pick<
  RevisionCasita,
  | "id"
  | "casita"
  | "quien_revisa"
  | "caja_fuerte"
  | "created_at"
  | "puertas_ventanas"
  | "chromecast"
  | "binoculares"
  | "trapo_binoculares"
  | "speaker"
  | "usb_speaker"
  | "controles_tv"
  | "secadora"
  | "accesorios_secadora"
  | "steamer"
  | "bolsa_vapor"
  | "plancha_cabello"
  | "bulto"
  | "sombrero"
  | "bolso_yute"
  | "evidencia_01"
  | "evidencia_02"
  | "evidencia_03"
  | "camas_ordenadas"
  | "cola_caballo"
  | "notas"
  | "room_move"
>;

export type MenuRow = Database["public"]["Tables"]["menus"]["Row"];

export type MenuDelDia = {
  id: string;
  fecha: string;
  diaSemana: string;
  comidas: string[];
};

export type InicioRevisionRow = {
  id: string;
  casita: string;
  quien_revisa: string;
  caja_fuerte: string;
  created_at: string;
  puertas_ventanas: string | null;
  chromecast: string | null;
  binoculares: string | null;
  trapo_binoculares: string | null;
  speaker: string | null;
  usb_speaker: string | null;
  controles_tv: string | null;
  secadora: string | null;
  accesorios_secadora: string | null;
  steamer: string | null;
  bolsa_vapor: string | null;
  plancha_cabello: string | null;
  bulto: string | null;
  sombrero: string | null;
  bolso_yute: string | null;
  evidencia_01: string | null;
  evidencia_02: string | null;
  evidencia_03: string | null;
  camas_ordenadas: string | null;
  cola_caballo: string | null;
  notas: string | null;
  room_move: string | null;
};
