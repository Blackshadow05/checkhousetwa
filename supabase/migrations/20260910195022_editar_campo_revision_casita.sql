-- Atomic per-field edit: lock the row, persist in one transaction with Registro_ediciones.
-- Idempotent retry: if the locked value already matches the desired persist, return without a new log.
-- Stale expected: conflict only when current differs from expected AND from the desired value.
-- Audit created_at is America/Costa_Rica. revisiones_casitas.created_at is unchanged.
-- update_at stays on trg_revisiones_casitas_set_update_at (UTC). Evidence columns are not editable.
-- p_editor_id is resolved against public."Usuarios" like getUsuarioSession.

DROP FUNCTION IF EXISTS public.editar_campo_revision_casita(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.editar_campo_revision_casita(uuid, smallint, text, text, text);

CREATE OR REPLACE FUNCTION public.editar_campo_revision_casita(
  p_id uuid,
  p_editor_id smallint,
  p_campo text,
  p_esperado text,
  p_nuevo text
)
RETURNS public.revisiones_casitas
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campo text := btrim(COALESCE(p_campo, ''));
  v_editor text;
  v_old public.revisiones_casitas;
  v_row public.revisiones_casitas;
  v_old_val text;
  v_nuevo text;
  v_audit_at timestamp without time zone;
  v_bool text[] := ARRAY['trapo_binoculares', 'bolsa_vapor', 'camas_ordenadas', 'cola_caballo', 'bulto', 'sombrero'];
  v_qty text[] := ARRAY['chromecast', 'speaker', 'usb_speaker', 'controles_tv', 'binoculares', 'secadora', 'accesorios_secadora', 'steamer', 'plancha_cabello', 'bolso_yute'];
  v_caja text[] := ARRAY['Check in', 'Check out', 'Si', 'No', 'Upsell', 'Guardar Upsell', 'Back to Back', 'Room Move', 'Show Room'];
  v_max integer;
  v_fotos integer;
  v_room text;
BEGIN
  SELECT u."Usuario" INTO v_editor
  FROM public."Usuarios" AS u
  WHERE u.id = p_editor_id
    AND COALESCE(u."Rol", '') IS DISTINCT FROM 'inactivo'
    AND u.metodo_login IS DISTINCT FROM 'google'
    AND u.totp_enrolled IS NOT TRUE;

  IF v_editor IS NULL OR btrim(v_editor) = '' THEN
    RAISE EXCEPTION 'editor_no_autorizado' USING ERRCODE = '42501';
  END IF;

  IF v_campo <> ALL (ARRAY[
    'casita', 'quien_revisa', 'caja_fuerte', 'puertas_ventanas', 'room_move', 'notas',
    'chromecast', 'speaker', 'usb_speaker', 'controles_tv',
    'binoculares', 'trapo_binoculares', 'secadora', 'accesorios_secadora',
    'steamer', 'bolsa_vapor', 'plancha_cabello', 'bulto', 'sombrero', 'bolso_yute',
    'camas_ordenadas', 'cola_caballo'
  ]::text[]) THEN
    RAISE EXCEPTION 'campo_no_editable' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.revisiones_casitas
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  EXECUTE format(
    'SELECT ($1::public.revisiones_casitas).%I',
    v_campo
  ) INTO v_old_val USING v_old;

  IF p_nuevo IS NULL OR btrim(p_nuevo) = '' THEN
    v_nuevo := NULL;
  ELSE
    v_nuevo := p_nuevo;
  END IF;

  IF v_campo = 'casita' THEN
    IF v_nuevo IS NULL OR v_nuevo !~ '^\d{1,2}$' OR v_nuevo::integer < 1 OR v_nuevo::integer > 50 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_old_val IS NOT NULL AND v_old_val ~ '^\d{1,2}$' AND v_old_val::integer = v_nuevo::integer THEN
      RETURN v_old;
    END IF;
  ELSIF v_campo = 'quien_revisa' THEN
    v_nuevo := NULLIF(btrim(COALESCE(v_nuevo, '')), '');
    IF v_nuevo IS NULL OR char_length(v_nuevo) > 100 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_campo = 'caja_fuerte' THEN
    IF v_nuevo IS NULL OR v_nuevo <> ALL (v_caja) THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_campo = 'puertas_ventanas' THEN
    IF v_nuevo IS NOT NULL AND char_length(v_nuevo) > 500 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_campo = 'room_move' THEN
    IF v_nuevo IS NOT NULL AND char_length(v_nuevo) > 120 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_campo = 'notas' THEN
    IF v_nuevo IS NOT NULL AND char_length(v_nuevo) > 2000 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_campo = ANY (v_bool) THEN
    IF v_nuevo IS NOT NULL AND v_nuevo NOT IN ('Si', 'No') THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_old_val IS NOT NULL AND v_nuevo IS NOT NULL
      AND lower(v_old_val) IN ('si', 'sí') AND lower(v_nuevo) IN ('si', 'sí') THEN
      RETURN v_old;
    END IF;
    IF v_old_val IS NOT NULL AND v_nuevo IS NOT NULL
      AND lower(v_old_val) = 'no' AND lower(v_nuevo) = 'no' THEN
      RETURN v_old;
    END IF;
  ELSIF v_campo = ANY (v_qty) THEN
    v_max := CASE v_campo
      WHEN 'chromecast' THEN 4
      WHEN 'speaker' THEN 3
      WHEN 'usb_speaker' THEN 3
      WHEN 'controles_tv' THEN 3
      WHEN 'binoculares' THEN 3
      WHEN 'secadora' THEN 3
      WHEN 'accesorios_secadora' THEN 8
      WHEN 'steamer' THEN 3
      WHEN 'plancha_cabello' THEN 2
      WHEN 'bolso_yute' THEN 3
    END;
    IF v_nuevo IS NOT NULL AND (v_nuevo !~ '^\d{1,2}$' OR v_nuevo::integer > v_max) THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_old_val IS NOT NULL AND v_nuevo IS NOT NULL
      AND v_old_val ~ '^\d{1,2}$' AND v_nuevo ~ '^\d{1,2}$'
      AND v_old_val::integer = v_nuevo::integer THEN
      RETURN v_old;
    END IF;
  END IF;

  IF v_old_val IS NOT DISTINCT FROM v_nuevo THEN
    RETURN v_old;
  END IF;

  IF v_old_val IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'dato_esperado_desactualizado' USING ERRCODE = 'P0001';
  END IF;

  IF v_campo = 'caja_fuerte' THEN
    v_room := NULLIF(btrim(COALESCE(v_old.room_move, '')), '');
    v_fotos :=
      (CASE WHEN NULLIF(btrim(COALESCE(v_old.evidencia_01, '')), '') IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN NULLIF(btrim(COALESCE(v_old.evidencia_02, '')), '') IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN NULLIF(btrim(COALESCE(v_old.evidencia_03, '')), '') IS NULL THEN 0 ELSE 1 END);
    IF v_nuevo = 'Room Move' AND v_room IS NULL THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_nuevo IN ('Si', 'No') THEN
      IF v_fotos <> 0 THEN
        RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
      END IF;
    ELSIF v_nuevo IN ('Check out', 'Guardar Upsell') THEN
      IF NULLIF(btrim(COALESCE(v_old.evidencia_01, '')), '') IS NULL OR v_fotos <> 1 THEN
        RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF NULLIF(btrim(COALESCE(v_old.evidencia_01, '')), '') IS NULL OR v_fotos < 1 OR v_fotos > 3 THEN
        RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF v_campo = 'room_move' THEN
    IF v_old.caja_fuerte = 'Room Move' AND v_nuevo IS NULL THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  EXECUTE format(
    'UPDATE public.revisiones_casitas SET %I = $1 WHERE id = $2 RETURNING *',
    v_campo
  ) INTO STRICT v_row USING v_nuevo, p_id;

  v_audit_at := (timezone('America/Costa_Rica', clock_timestamp()))::timestamp;

  INSERT INTO public."Registro_ediciones" (
    created_at,
    "Usuario que Edito",
    "Dato_anterior",
    "Dato_nuevo"
  ) VALUES (
    v_audit_at,
    v_editor,
    '[' || v_old.id::text || '] casita ' || CASE WHEN v_old.casita IS NULL THEN 'null' ELSE v_old.casita END
      || ' ' || v_campo || ': ' || CASE WHEN v_old_val IS NULL THEN 'null' ELSE v_old_val END,
    '[' || v_row.id::text || '] casita ' || CASE WHEN v_row.casita IS NULL THEN 'null' ELSE v_row.casita END
      || ' ' || v_campo || ': ' || CASE WHEN v_nuevo IS NULL THEN 'null' ELSE v_nuevo END
  );

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.editar_campo_revision_casita(uuid, smallint, text, text, text) IS
  'Edita un campo de revisiones_casitas y registra Registro_ediciones en la misma transacción. p_editor_id se resuelve en Usuarios (activo, no google, sin totp). Reintento idempotente si el valor deseado ya está. created_at de auditoría es America/Costa_Rica. No cambia created_at ni evidencias; update_at lo deja el trigger UTC.';

REVOKE EXECUTE ON FUNCTION public.editar_campo_revision_casita(uuid, smallint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_campo_revision_casita(uuid, smallint, text, text, text) TO anon, authenticated;
