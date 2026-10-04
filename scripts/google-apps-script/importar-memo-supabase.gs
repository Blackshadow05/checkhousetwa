/** Importa solo Check in, Check out e IN HOUSE a memo_script (hoja) y a Supabase (operaciones_memo).
 * Busca las pestañas de ayer, hoy y mañana, como el archivo de referencia.
 * Check out usa hoy en Costa Rica; las demás fechas provienen del memo.
 *
 * importarYSincronizar()      → actualiza la hoja memo_script y Supabase.
 * previsualizarImportacion()  → solo lee la fuente.
 * previsualizarSupabase()     → lee la fuente y pregunta a Supabase qué cambiaría, sin cambiar nada.
 *
 * SUPABASE: la fila se identifica por fecha + tipo + casita. Si algo cambia en la hoja, la fila se
 * actualiza; si una fila desaparece de la hoja (p. ej. la casita 26 pasó a ser la 29) se elimina; y
 * todo lo que quede fuera de ayer-hoy-mañana se borra, así la tabla no acumula datos. Todo ocurre en
 * una sola transacción dentro de la función public.sincronizar_operaciones_memo.
 * El token de sincronización NO va en el código: Configuración del proyecto → Propiedades del script →
 * MEMO_SYNC_TOKEN (se crea con prepararTokenSincronizacion; no se usa la service role).
 */
var SOURCE_ID       = '1YaJEur_cORTTHuUxtA_VlBX8rdGivNIx8HrScoEsKfE';
var DEST_ID = '1QZ0V5BNMu7KVCPgkBrF2__cty1a0MdEif6ify5K_FRE';
var DEST_SHEET_NAME = 'memo_script';
var TIME_ZONE       = 'America/Costa_Rica';

var SUPABASE_URL = 'https://snkyczysawxjrpmvtzqy.supabase.co';
var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FjOFsCjaG50aS0RuWMAgdw_lng4mr4N';
var SUPABASE_RPC = '/rest/v1/rpc/sincronizar_operaciones_memo_hoja';

var HEADERS = ['fecha_memo', 'tipo', 'casita', 'fecha_llegada', 'fecha_salida'];
var TIPOS = {"Today's Arrivals": 'Check in', "Today´s Departure": 'Check out', 'In house Guests': 'En casita'};

function importarYSincronizar() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ahora = new Date();
    var resultado = recopilarMemo_(ahora);
    if (!resultado.hojas.length || !resultado.filas.length) {
      throw new Error('No hay datos para importar. Se conservó memo_script sin cambios.');
    }
    escribirDestino_(resultado.filas);
    var supabase = sincronizarSupabase_(resultado, ahora, false);
    console.info(JSON.stringify(resumenMemo_(resultado, supabase)));
  } finally {
    lock.releaseLock();
  }
}

function previsualizarImportacion() {
  var resultado = recopilarMemo_(new Date());
  console.info(JSON.stringify(resumenMemo_(resultado)));
}

/** Muestra qué haría la sincronización con Supabase (insertar, actualizar, eliminar) sin cambiar nada. */
function previsualizarSupabase() {
  var ahora = new Date();
  var resultado = recopilarMemo_(ahora);
  var supabase = sincronizarSupabase_(resultado, ahora, true);
  console.info(JSON.stringify(resumenMemo_(resultado, supabase)));
}

function prepararTokenSincronizacion() {
  var propiedades = PropertiesService.getScriptProperties();
  var token = propiedades.getProperty('MEMO_SYNC_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    propiedades.setProperty('MEMO_SYNC_TOKEN', token);
  }
  console.info("insert into private.memo_sync_credencial (id, token_hash) values (1, '" + hashToken_(token) +
    "') on conflict (id) do update set token_hash = excluded.token_hash, rotado_at = now();");
}

function rotarTokenSincronizacion() {
  PropertiesService.getScriptProperties().deleteProperty('MEMO_SYNC_TOKEN');
  prepararTokenSincronizacion();
}

function hashToken_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function resumenMemo_(resultado, supabase) {
  var conteos = {};
  resultado.filas.forEach(function(f) { conteos[TIPOS[f.tipo]] = (conteos[TIPOS[f.tipo]] || 0) + 1; });
  var incompletas = resultado.filas.filter(function(f) { return !f.fecha_llegada || !f.fecha_salida; });
  return { hojas: resultado.hojas, total: resultado.filas.length, por_tipo: conteos,
    advertencias: resultado.advertencias,
    fechas_incompletas: incompletas.length,
    filas_incompletas: incompletas.slice(0, 40).map(function(f) {
      return f.hoja_origen + ' fila ' + f.fila_origen + ' casita ' + f.casita + ' (' + TIPOS[f.tipo] + '): falta ' +
        [!f.fecha_llegada ? 'llegada' : '', !f.fecha_salida ? 'salida' : ''].filter(Boolean).join(' y ');
    }),
    supabase: supabase || null };
}

function recopilarMemo_(ahora) {
  var fuente = SpreadsheetApp.openById(SOURCE_ID);
  // fechasOk: fechas de pestañas cuya celda E1 coincide con el nombre de la pestaña. Solo esas se sincronizan con Supabase.
  var resultado = { filas: [], hojas: [], advertencias: [], fechasOk: [] };
  var mapa = {};
  fuente.getSheets().forEach(function(hoja) {
    var clave = normalizarNombre_(hoja.getName());
    if (mapa[clave]) throw new Error('Hay pestañas con nombres equivalentes: ' + hoja.getName());
    mapa[clave] = hoja;
  });
  [-1, 0, 1].forEach(function(desfase) {
    var objetivo = new Date(ahora.getTime() + desfase * 86400000);
    var nombre = nombreEsperado_(objetivo);
    var hoja = mapa[normalizarNombre_(nombre)];
    if (!hoja) {
      resultado.advertencias.push('Pestaña no encontrada: ' + nombre);
      return;
    }
    var rango = hoja.getDataRange();
    var datos = rango.getValues();
    rango.getMergedRanges().forEach(function(merge) {
      var r = merge.getRow() - 1, c = merge.getColumn() - 1;
      if ([22, 24, 26, 31].indexOf(c) < 0 || merge.getNumRows() < 2) return;
      for (var rr = r + 1; rr < r + merge.getNumRows() && rr < datos.length; rr++) {
        datos[rr][c] = datos[r][c];
      }
    });
    var fecha = parseFecha_(datos[0] && datos[0][4], objetivo) || fechaDia_(objetivo);
    var advertencia = '';
    if (isoFecha_(fecha) !== isoFecha_(objetivo)) {
      advertencia = 'La fecha de E1 no coincide con el nombre de la pestaña';
      resultado.advertencias.push(hoja.getName() + ': ' + advertencia);
    } else {
      resultado.fechasOk.push(isoFecha_(fecha));
    }
    var filas = extraerReservas_(datos, fecha, ahora);
    filas.forEach(function(f) {
      f.hoja_origen = hoja.getName();
      if (advertencia) f.observaciones = [f.observaciones, advertencia].filter(Boolean).join('; ');
    });
    resultado.hojas.push(hoja.getName());
    resultado.filas = resultado.filas.concat(filas);
  });
  var orden = { "Today's Arrivals": 0, "Today´s Departure": 1, 'In house Guests': 2 };
  resultado.filas.sort(function(a, b) {
    return isoFecha_(a.fecha).localeCompare(isoFecha_(b.fecha)) ||
      (orden[a.tipo] - orden[b.tipo]) ||
      String(a.casita).localeCompare(String(b.casita), 'en', { numeric: true }) ||
      a.hoja_origen.localeCompare(b.hoja_origen) || (a.fila_origen || 0) - (b.fila_origen || 0);
  });
  return resultado;
}

function normBloque_(texto) {
  return String(texto || '').toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .trim();
}

function tipoSeccion_(valor) {
  var t = normBloque_(valor).replace(/\s+/g, ' ');
  if (/^today.?s arrivals?$/.test(t)) return "Today's Arrivals";
  if (/^today.?s departures?$/.test(t)) return "Today´s Departure";
  if (/^in house(?: guests?)?$/.test(t)) return 'In house Guests';
  return '';
}

function columnasReserva_(datos, inicio, tipo) {
  var cols = { llegada: tipo === 'In house Guests' ? 24 : 22,
    salida: tipo === 'In house Guests' ? 26 : 31,
    noches: tipo === 'In house Guests' ? 22 : 20 };
  for (var r = inicio + 1; r < Math.min(datos.length, inicio + 5); r++) {
    if (tipoSeccion_(datos[r][0]) || parseCasitas_(datos[r][0]).length) break;
    datos[r].forEach(function(v, c) {
      var t = normBloque_(v);
      if (t === 'arrival') cols.llegada = c;
      if (t === 'departure' || t === 'dpt') cols.salida = c;
      if (t === 'nights') cols.noches = c;
    });
  }
  return cols;
}

function extraerReservas_(datos, fecha, ahora) {
  var registros = [], tipo = '', cols = {};
  for (var r = 0; r < datos.length; r++) {
    var titulo = tipoSeccion_(datos[r][0]);
    if (titulo) {
      tipo = titulo;
      cols = columnasReserva_(datos, r, tipo);
      continue;
    }
    if (!tipo || esOutsideGuest_(datos[r][0])) continue;
    var fila = datos[r];
    parseCasitas_(fila[0]).forEach(function(casita) {
      registros.push({ casita: casita, tipo: tipo, fila: fila, numero: r + 1,
        cols: cols, nombreClave: normBloque_(fila[4]).replace(/\s+/g, ' ') });
    });
  }
  var inHouse = {};
  registros.filter(function(r) { return r.tipo === 'In house Guests'; }).forEach(function(r) {
    if (!inHouse[r.casita]) inHouse[r.casita] = [];
    inHouse[r.casita].push(r);
  });
  return registros.map(function(r) {
    var llegada = parseFecha_(r.fila[24], fecha);
    var salida = parseFecha_(r.fila[26], fecha);
    // Evita vincular huéspedes distintos que ocupen la misma casita ese día.
    var coincidencias = (inHouse[r.casita] || []).filter(function(h) {
      return r.nombreClave && h.nombreClave === r.nombreClave;
    });
    if (r.tipo !== 'In house Guests' && coincidencias.length === 1) {
      llegada = llegada || parseFecha_(coincidencias[0].fila[24], fecha);
      salida = salida || parseFecha_(coincidencias[0].fila[26], llegada || fecha);
    }
    llegada = llegada || parseFecha_(r.fila[r.cols.llegada], fecha);
    salida = salida || parseFecha_(r.fila[r.cols.salida], llegada || fecha);
    if (r.tipo === "Today's Arrivals") llegada = llegada || fechaDia_(fecha);
    if (r.tipo === "Today´s Departure") salida = fechaDia_(ahora);
    var notas = [];
    // Si el memo no trae la llegada pero sí la salida y las noches, se calcula (y se deja constancia).
    if (!llegada && salida) {
      var noches = Number(String(r.fila[r.cols.noches]).trim());
      if (noches >= 1 && noches <= 60 && noches % 1 === 0) {
        llegada = fechaDia_(new Date(salida.getTime() - noches * 86400000));
        notas.push('Llegada calculada como salida menos ' + noches + ' noches (no figura en el memo)');
      }
    }
    if (!llegada) notas.push('Fecha de llegada ausente o no válida');
    if (!salida) notas.push('Fecha de salida ausente o no válida');
    if (llegada && salida && isoFecha_(salida) < isoFecha_(llegada)) notas.push('Salida anterior a llegada en la fuente');
    return { fecha: fecha, tipo: r.tipo, casita: r.casita,
      fecha_llegada: llegada, fecha_salida: salida, fila_origen: r.numero,
      observaciones: notas.join('; ') };
  });
}

// =====================  Supabase  =====================

/** Envía a Supabase el estado actual del memo (ayer, hoy y mañana). Con simular=true solo calcula qué cambiaría.
 *  Es idempotente: repetir la llamada con los mismos datos no cambia nada, así que reintentar es seguro. */
function sincronizarSupabase_(resultado, ahora, simular) {
  var token = PropertiesService.getScriptProperties().getProperty('MEMO_SYNC_TOKEN');
  if (!token) throw new Error('Falta MEMO_SYNC_TOKEN en las propiedades del script. Ejecuta prepararTokenSincronizacion.');
  var desde = isoFecha_(new Date(ahora.getTime() - 86400000));
  var hasta = isoFecha_(new Date(ahora.getTime() + 86400000));
  // Solo pestañas cuya E1 coincide con su nombre: un memo pegado en la pestaña equivocada no debe borrar datos buenos.
  var fechas = resultado.fechasOk.filter(function(f) { return f >= desde && f <= hasta; });
  var filas = resultado.filas.filter(function(f) {
    return fechas.indexOf(isoFecha_(f.fecha)) >= 0;
  }).map(function(f) {
    return { fecha_memo: isoFecha_(f.fecha), fecha: fechaTexto_(f.fecha), tipo: f.tipo, casita: String(f.casita),
      llegada: f.fecha_llegada ? isoFecha_(f.fecha_llegada) : null,
      salida: f.fecha_salida ? isoFecha_(f.fecha_salida) : null, orden: f.fila_origen };
  });
  if (!filas.length) {
    resultado.advertencias.push('Supabase: no hay filas de pestañas válidas; no se tocó la tabla.');
    return { omitida: true };
  }
  var opciones = { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    payload: JSON.stringify({ p_token: token, p_filas: filas, p_fechas: fechas, p_simular: !!simular }) };
  for (var intento = 0; intento < 4; intento++) {
    var resp = UrlFetchApp.fetch(SUPABASE_URL + SUPABASE_RPC, opciones);
    var codigo = resp.getResponseCode();
    var texto = resp.getContentText();
    if (codigo >= 200 && codigo < 300) return JSON.parse(texto);
    if (codigo === 429 || codigo >= 500) { Utilities.sleep(2000 * Math.pow(2, intento)); continue; }
    throw new Error('Supabase HTTP ' + codigo + ': ' + texto.slice(0, 300));
  }
  throw new Error('Supabase no respondió tras 4 intentos.');
}

/** Texto de fecha que leen las funciones del módulo de montajes, ej. "Saturday, October 03rd". */
function fechaTexto_(fecha) {
  var d = parseInt(Utilities.formatDate(fecha, TIME_ZONE, 'd'), 10);
  return Utilities.formatDate(fecha, TIME_ZONE, 'EEEE') + ', ' + Utilities.formatDate(fecha, TIME_ZONE, 'MMMM') + ' ' +
    ('0' + d).slice(-2) + ordinal_(d);
}

// =====================  utilidades originales  =====================

function isoFecha_(fecha) {
  return fecha ? Utilities.formatDate(fecha, TIME_ZONE, 'yyyy-MM-dd') : '';
}

function fechaDia_(fecha) {
  return Utilities.parseDate(isoFecha_(fecha) + ' 12:00', TIME_ZONE, 'yyyy-MM-dd HH:mm');
}

function parseFecha_(valor, referencia) {
  if (valor === '' || valor == null) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return isNaN(valor.getTime()) || Number(Utilities.formatDate(valor, TIME_ZONE, 'yyyy')) < 1900 ? '' : fechaDia_(valor);
  }
  if (typeof valor === 'number') {
    if (valor < 20000 || valor > 100000) return '';
    var serial = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000);
    valor = serial.toISOString().slice(0, 10);
  }
  var t = String(valor).trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  var m, anio, mes, dia;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    anio = +m[1]; mes = +m[2]; dia = +m[3];
  } else if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) {
    dia = +m[1]; mes = +m[2]; anio = +m[3];
  } else {
    var meses = ['january|jan|enero', 'february|feb|febrero', 'march|mar|marzo',
      'april|apr|abril', 'may|mayo', 'june|jun|junio', 'july|jul|julio',
      'august|aug|agosto', 'september|sept|sep|septiembre|setiembre',
      'october|oct|octubre', 'november|nov|noviembre', 'december|dec|diciembre'];
    t = t.replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?\s+/, '');
    for (var i = 0; i < meses.length; i++) {
      var re1 = new RegExp('^(?:' + meses[i] + ')\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?$');
      var re2 = new RegExp('^(\\d{1,2})\\s+(?:de\\s+)?(?:' + meses[i] + ')(?:\\s+(?:de\\s+)?(\\d{4}))?$');
      m = t.match(re1) || t.match(re2);
      if (m) { dia = +m[1]; mes = i + 1; anio = m[2] ? +m[2] : null; break; }
    }
  }
  if (!mes || !dia || mes > 12 || dia > 31) return '';
  var base = Number(Utilities.formatDate(referencia, TIME_ZONE, 'yyyy'));
  var candidatos = anio ? [anio] : [base - 1, base, base + 1];
  var fechas = candidatos.map(function(y) {
    var prueba = new Date(Date.UTC(y, mes - 1, dia));
    if (prueba.getUTCFullYear() !== y || prueba.getUTCMonth() !== mes - 1 || prueba.getUTCDate() !== dia) return null;
    var iso = y + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
    return Utilities.parseDate(iso + ' 12:00', TIME_ZONE, 'yyyy-MM-dd HH:mm');
  }).filter(Boolean);
  fechas.sort(function(a, b) { return Math.abs(a - referencia) - Math.abs(b - referencia); });
  return fechas[0] || '';
}

function esOutsideGuest_(valor) {
  return /outside\s*guest/i.test(String(valor || '').trim());
}

function parseCasitas_(valor) {
  var v = String(valor).trim();
  if (!v || v === '#') return [];
  if (esOutsideGuest_(v)) return [v];
  if (/^\d{1,3}$/.test(v)) return [v];
  if (/^\d{4}$/.test(v)) return [v.slice(0, 2), v.slice(2)];

  var m = v.match(/^(\d{1,3})\s*(?:[\/,&-]|y)\s*(\d{1,3})$/i);
  if (m) return [m[1], m[2]];

  return [];
}

function nombreEsperado_(date) {
  var dia = Utilities.formatDate(date, TIME_ZONE, 'EEEE');
  var mes = Utilities.formatDate(date, TIME_ZONE, 'MMMM');
  var d   = parseInt(Utilities.formatDate(date, TIME_ZONE, 'd'), 10);
  return dia + ' ' + mes + ' ' + d + ordinal_(d);
}

function ordinal_(d) {
  if (d >= 11 && d <= 13) return 'th';
  switch (d % 10) {
    case 1: return 'st'; case 2: return 'nd';
    case 3: return 'rd'; default: return 'th';
  }
}

function normalizarNombre_(nombre) {
  return String(nombre)
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\b0+(\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function escribirDestino_(filas) {
  if (!filas.length) throw new Error('No se reemplaza el destino con una importación vacía.');
  var ss = SpreadsheetApp.openById(DEST_ID);
  var hoja = ss.getSheetByName(DEST_SHEET_NAME) || ss.insertSheet(DEST_SHEET_NAME);
  var filasAnteriores = hoja.getLastRow(), columnasAnteriores = hoja.getLastColumn();
  var matriz = [HEADERS].concat(filas.map(function(f) {
    return [f.fecha, TIPOS[f.tipo], f.casita, f.fecha_llegada, f.fecha_salida];
  }));
  if (hoja.getMaxRows() < matriz.length) hoja.insertRowsAfter(hoja.getMaxRows(), matriz.length - hoja.getMaxRows());
  if (hoja.getMaxColumns() < HEADERS.length) hoja.insertColumnsAfter(hoja.getMaxColumns(), HEADERS.length - hoja.getMaxColumns());
  // Primero escribe el resultado y después retira los datos antiguos sobrantes.
  hoja.getRange(1, 1, matriz.length, HEADERS.length).setValues(matriz);
  if (filasAnteriores > matriz.length) hoja.getRange(matriz.length + 1, 1,
    filasAnteriores - matriz.length, Math.max(columnasAnteriores, HEADERS.length)).clearContent();
  if (columnasAnteriores > HEADERS.length) hoja.getRange(1, HEADERS.length + 1,
    matriz.length, columnasAnteriores - HEADERS.length).clearContent();
  hoja.getRange(2, 1, filas.length, 1).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(2, 2, filas.length, 2).setNumberFormat('@');
  hoja.getRange(2, 4, filas.length, 2).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#173e45').setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(3);
  hoja.setColumnWidths(1, HEADERS.length, 145);
  hoja.setColumnWidth(3, 80);
  var filtro = hoja.getFilter();
  if (filtro) filtro.remove();
  hoja.getRange(1, 1, matriz.length, HEADERS.length).createFilter();
  SpreadsheetApp.flush();
}
