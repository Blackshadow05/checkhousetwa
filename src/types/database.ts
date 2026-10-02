import type { PantallaReport, PantallaStock } from "@/lib/pantallas";
import type { HorarioRow } from "@/lib/horarios";
import type { ConsejoDiario } from "@/lib/consejos-diarios";
type Table<Row, Insert = Partial<Row>> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: [] };
export type UsuarioProfile = { id: number; Usuario: string; Rol: string | null; metodo_login: string | null; totp_enrolled: boolean; auth_user_id: string | null; email: string | null; ultimo_login_at: string | null; ultimo_login_ip: string | null };
export type SesionUsuario = { id: number; nombre: string; rol: string | null };
export type UsuarioShell = { id: number; nombre: string; rol?: string | null };
export type NotaRevisionCasita = {
  id: string;
  revision_id: string;
  nota: string;
  usuario: string | null;
  imagen: string | null;
  hora: string | null;
  created_at: string | null;
};
export type NotaRevisionCasitaInsert = {
  id?: string;
  revision_id: string;
  nota: string;
  usuario?: string | null;
  imagen?: string | null;
  hora?: string | null;
  created_at?: string | null;
};
export type InventarioCasitaRow = {
  casita: number;
  chromecast: number;
  binoculares: number;
  trapo_binoculares: number;
  speaker: number;
  usb_speaker: number;
  controles_tv: number;
  secadora: number;
  accesorios_secadora: number;
  steamer: number;
  bolsa_vapor: number;
  plancha_cabello: number;
  bulto: number;
  sombrero: number;
  bolso_yute: number;
  cola_caballo: number;
};
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
      consejos_diarios: Table<ConsejoDiario>;
      horarios: Table<HorarioRow & { created_at: string | null }>;
      reporte_pantallas: Table<PantallaReport, Pick<PantallaReport, "nombre_usuario" | "fecha_hora" | "numero_casita" | "fotos" | "notas"> & Partial<Omit<PantallaReport, "id">>>;
      inventario_pantallas: Table<PantallaStock & { id: number; updated_at: string }>;
      inventario_casitas: Table<InventarioCasitaRow>;
      Usuarios: Table<UsuarioProfile & { password_hash: string | null }>;
      login_logs: Table<{ id: string; user_id: number; usuario: string; ip_address: string | null; user_agent: string | null; metodo: string; logged_at: string }>;
      notas_revisiones_casitas: Table<NotaRevisionCasita, NotaRevisionCasitaInsert>;
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
          registro_reconocimiento: Json | null;
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
          registro_reconocimiento?: Json | null;
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
          registro_reconocimiento?: Json | null;
          imagen_nota?: string | null;
          hora_nota?: string | null;
          update_at?: string | null;
          fecha_ingreso_casita?: string | null;
        };
        Relationships: [];
      };
      "Registro_ediciones": {
        Row: {
          id: number;
          created_at: string;
          "Usuario que Edito": string | null;
          Dato_anterior: string | null;
          Dato_nuevo: string | null;
        };
        Insert: {
          id?: number;
          created_at: string;
          "Usuario que Edito"?: string | null;
          Dato_anterior?: string | null;
          Dato_nuevo?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          "Usuario que Edito"?: string | null;
          Dato_anterior?: string | null;
          Dato_nuevo?: string | null;
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
      editar_campo_revision_casita: { Args: { p_id: string; p_editor_id: number; p_campo: string; p_esperado: string | null; p_nuevo: string | null }; Returns: RevisionCasita };
      verificar_credenciales_usuario: { Args: { p_usuario: string; p_password: string; p_ip?: string | null }; Returns: Json };
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
  | "nota_extra"
  | "room_move"
> & Partial<Pick<RevisionCasita, "registro_reconocimiento">>;

export type MenuRow = Database["public"]["Tables"]["menus"]["Row"];

export type MenuDelDia = {
  id: string;
  fecha: string;
  diaSemana: string;
  comidas: string[];
};

export type InicioRevisionRow = {
  reconocimiento?: import("@/lib/revision-recognition-detail").RecognitionDetailItem[];
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
  nota_extra?: string | null;
  room_move: string | null;
};
