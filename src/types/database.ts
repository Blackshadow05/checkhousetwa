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
      [_ in never]: never;
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
