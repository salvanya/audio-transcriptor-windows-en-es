# AuraTranscribe — Decisiones de Arquitectura + Mitigación de Riesgos

## Decisiones Tomadas por el Arquitecto (1.1 & 1.2)

**1.1 → PyWebView + FastAPI local**

El Aura-Minimalism que describes es CSS nativo. Forzarlo en Qt sería construir un avión con piezas de tren. PyWebView embebe Chromium — backdrop-blur, radial gradients que siguen el cursor, cubic-bezier, anti-aliasing forzado: todo funciona sin hacks. El backend Python (FastAPI) se comunica con el frontend vía WebSocket para streaming de progreso en tiempo real. La separación frontend/backend también hace el código mantenible y testeable de forma independiente.

**1.2 → `concurrent.futures.ProcessPoolExecutor` + WebSocket**

Whisper corre en un proceso completamente separado (no hilo), eliminando el GIL por completo. El proceso hijo emite eventos de progreso que viajan por WebSocket hacia el frontend. Esto también habilita de forma nativa el **pause/resume/cancel**: el proceso puede recibir señales de control desde el backend principal. `faster-whisper` libera el GIL durante la inferencia C++ — combinado con ProcessPoolExecutor, la UI es quirúrgicamente responsiva.

---

## Documento de Especificaciones Técnicas (TRD)
### AuraTranscribe v1.0

---

## SECCIÓN 1 — Stack Tecnológico Definitivo

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                 │
│         HTML5 / CSS3 / Vanilla JS (ES2022+)             │
│         Font: Inter Variable (self-hosted)              │
│         Sin frameworks JS — cero dependencias front     │
└──────────────────────┬──────────────────────────────────┘
                       │ pywebview.create_window()
                       │ window.pywebviewready
┌──────────────────────▼──────────────────────────────────┐
│                   CAPA DE APLICACIÓN                    │
│              FastAPI (uvicorn, async)                   │
│         WebSocket /ws/progress  │  REST /api/*          │
│              Gestión de Jobs (JobManager)               │
└──────────────────────┬──────────────────────────────────┘
                       │ ProcessPoolExecutor
┌──────────────────────▼──────────────────────────────────┐
│                  CAPA DE PROCESAMIENTO                  │
│         faster-whisper (CTranslate2 backend)            │
│         FFmpeg estático (static-ffmpeg)                 │
│         tempfile + AppData/tmp para intermedios         │
└─────────────────────────────────────────────────────────┘
```

**Dependencias Python core:**

```
pywebview>=4.4
fastapi>=0.111
uvicorn[standard]>=0.29
faster-whisper>=1.0
static-ffmpeg>=2.5
httpx>=0.27          # Para descargar modelo con progress
rich>=13.0           # Logging de desarrollo
```

---

## SECCIÓN 2 — Arquitectura de Módulos

```
auratranscribe/
│
├── main.py                    # Entry point: lanza uvicorn + pywebview
│
├── api/
│   ├── router.py              # Monta todos los routers FastAPI
│   ├── transcription.py       # Endpoints: /upload, /start, /pause, /resume, /cancel
│   ├── model.py               # Endpoints: /model/status, /model/download
│   └── websocket.py           # WebSocket /ws/progress
│
├── core/
│   ├── job_manager.py         # Clase JobManager: cola, estados, control de procesos
│   ├── transcriber.py         # Worker que corre en ProcessPoolExecutor (faster-whisper)
│   ├── media_processor.py     # FFmpeg: extrae audio, detecta duración, limpia tmp
│   └── model_manager.py       # Descarga, verifica hash, almacena modelo
│
├── schemas/
│   └── models.py              # Pydantic models: JobRequest, JobStatus, ProgressEvent
│
├── frontend/
│   ├── index.html             # SPA única
│   ├── styles/
│   │   ├── tokens.css         # Variables CSS del Design System Aura
│   │   ├── components.css     # Botones, cards, inputs, modals
│   │   └── animations.css     # keyframes, transitions
│   └── scripts/
│       ├── app.js             # Inicialización, router de vistas
│       ├── ws-client.js       # WebSocket manager con auto-reconnect
│       ├── job-queue.js       # Estado local de jobs en el frontend
│       └── ui-effects.js      # Radial gradient follow, micro-interactions
│
├── assets/
│   └── Inter-Variable.woff2   # Fuente self-hosted (no Google Fonts)
│
└── config.py                  # Paths: AppData, modelo, tmp, puerto uvicorn
```

---

## SECCIÓN 3 — Máquina de Estados de un Job

```
                    ┌─────────┐
              ──────►  IDLE   │
                    └────┬────┘
                         │ Usuario carga archivo(s)
                    ┌────▼────┐
                    │ QUEUED  │ (múltiples jobs posibles)
                    └────┬────┘
                         │ JobManager toma el job
                    ┌────▼──────────┐
              ┌─────► EXTRACTING   │  FFmpeg extrae audio → tmp/
              │     │    AUDIO     │
              │     └────┬─────────┘
              │          │
              │     ┌────▼──────────┐
              │     │ TRANSCRIBING  │◄──────────────────┐
              │     │  [0% → 100%] │                   │
              │     └──┬──────┬─────┘                   │
              │        │      │ Usuario pausa            │
              │    done│  ┌───▼────┐                    │
              │        │  │PAUSED │  Usuario reanuda ───┘
              │        │  └───────┘
              │   ┌────▼──────────┐
              │   │   COMPLETED   │ → Texto disponible para export
              │   └───────────────┘
              │
              │   ┌───────────────┐
              └───│  CANCELLED    │ ← Usuario cancela en cualquier estado
                  └───────────────┘
                  ┌───────────────┐
                  │    ERROR      │ ← Con mensaje y stack trace en log
                  └───────────────┘
```

---

## SECCIÓN 4 — Especificación del JobManager

```python
# core/job_manager.py — Pseudocódigo de referencia

class JobStatus(str, Enum):
    QUEUED = "queued"
    EXTRACTING = "extracting"
    TRANSCRIBING = "transcribing"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ERROR = "error"

@dataclass
class Job:
    id: str                         # UUID4
    original_filename: str
    tmp_audio_path: Path            # WAV extraído en AppData/tmp/
    status: JobStatus
    progress_audio: float           # 0.0 → 1.0 (posición en el audio)
    index_in_batch: int             # ej. 1
    total_in_batch: int             # ej. 3
    result_text: str | None
    error: str | None
    # Control de proceso
    _process_future: Future | None
    _pause_event: multiprocessing.Event   # set = correr, clear = pausar
    _cancel_event: multiprocessing.Event  # set = cancelar
```

**Flujo de pausa:** El proceso worker consulta `pause_event.is_set()` cada N segmentos. Si está en pausa, entra en `pause_event.wait()` (bloqueante en el proceso hijo, sin consumir CPU). La UI recibe el evento `PAUSED` vía WebSocket y habilita el botón "Reanudar".

**Flujo de cancelación:** Se dispara `cancel_event.set()`. El worker lo detecta en el próximo ciclo, limpia el archivo temporal y termina el proceso. El JobManager actualiza el estado a `CANCELLED`.

---

## SECCIÓN 5 — Protocolo WebSocket (Frontend ↔ Backend)

Todos los mensajes son JSON. El frontend abre una única conexión WebSocket al iniciar la app.

**Eventos del servidor → frontend:**

```jsonc
// Progreso de transcripción
{
  "event": "progress",
  "job_id": "uuid",
  "status": "transcribing",
  "audio_progress": 0.47,          // 47% del audio actual
  "batch_current": 2,              // "Audio 2 de 3"
  "batch_total": 3,
  "elapsed_seconds": 34,
  "estimated_remaining": 38
}

// Job completado
{
  "event": "completed",
  "job_id": "uuid",
  "filename": "entrevista.mp3",
  "detected_language": "es",       // "es" | "en"
  "duration_seconds": 183,
  "text": "Texto completo..."
}

// Cambio de estado
{
  "event": "status_change",
  "job_id": "uuid",
  "status": "paused" | "cancelled" | "error",
  "error_message": null | "string"
}

// Progreso de descarga del modelo
{
  "event": "model_download",
  "bytes_downloaded": 245000000,
  "bytes_total": 465000000,
  "percent": 52.7,
  "speed_mbps": 8.4
}
```

**Comandos del frontend → servidor (REST, no WebSocket):**

```
POST /api/transcription/upload     → { job_ids: ["uuid1", "uuid2"] }
POST /api/transcription/{id}/pause
POST /api/transcription/{id}/resume
POST /api/transcription/{id}/cancel
GET  /api/transcription/{id}/text  → { text: "...", filename: "..." }
POST /api/export/batch             → { job_ids: [], mode: "separate"|"merged" }
GET  /api/model/status             → { downloaded: bool, model: "small", size_mb: 465 }
POST /api/model/download           → inicia descarga, progreso vía WS
```

---

## SECCIÓN 6 — Configuración y Paths por OS

```python
# config.py

import platformdirs

APP_NAME = "AuraTranscribe"
APP_AUTHOR = "AuraTranscribe"

BASE_DIR      = Path(platformdirs.user_data_dir(APP_NAME, APP_AUTHOR))
MODEL_DIR     = BASE_DIR / "models" / "small"
TMP_DIR       = BASE_DIR / "tmp"
EXPORTS_DIR   = Path.home() / "Documents" / APP_NAME   # Visible al usuario
LOG_FILE      = BASE_DIR / "auratranscribe.log"

FASTAPI_PORT  = 47821   # Puerto fijo, poco común para evitar colisiones
WHISPER_MODEL = "small"
LANGUAGES     = {"es": "Spanish", "en": "English"}
```

---

## SECCIÓN 7 — Especificación del Spinner y UI de Progreso

El overlay durante el procesamiento contiene tres capas visuales simultáneas:

**Capa 1 — Spinner "Aura Orbit":**
Tres arcos SVG concéntricos rotando a velocidades distintas (1.2s, 2s, 3.4s) con `stroke-dasharray` animado. El color del arco exterior pulsa entre `#5856D6` y transparente con una animación de 2s en `ease-in-out`. Esto crea un efecto orbital que comunica actividad sin nerviosismo.

**Capa 2 — Barra de progreso dual:**
```
Audio 2 de 3                              58%
████████████████████░░░░░░░░░░░░░░░░░   [0:34 restante]

Batch total:  ██████████░░░░░░░░░░░░░░   3 archivos
```
La barra de audio usa el acento `#5856D6`. La barra de batch usa un gris tenue `rgba(255,255,255,0.15)` para jerarquía visual clara.

**Capa 3 — Botones de control:**
```
[  ⏸  Pausar  ]     [  ✕  Cancelar  ]
```
Botones con `border-radius: 8px`, stroke definition `rgba(255,255,255,0.1)`. Al pausar, el spinner se desacelera con `animation-play-state: paused` y el botón cambia a `▶ Reanudar` con transición de 200ms.

---

## SECCIÓN 8 — Diseño del Sistema de Exportación Batch

Cuando se completan múltiples archivos, la UI presenta:

```
✓  3 transcripciones completadas

  ◉  Guardar por separado
     entrevista.txt  |  podcast_ep12.txt  |  reunion.txt

  ○  Unir en un archivo
     [auratranscribe_batch_2025-01-15.txt]
     Separador entre archivos: [── entrevista.mp3 ──────────]

                    [ Exportar ]
```

El modo "unido" genera un `.txt` con separadores legibles:

```
══════════════════════════════════════════════════
Archivo: entrevista.mp3
Duración: 3:04  |  Idioma: Español
══════════════════════════════════════════════════

[texto de la transcripción...]


══════════════════════════════════════════════════
Archivo: podcast_ep12.mp3
...
```

---

## SECCIÓN 9 — Pantalla de Onboarding (Primera Descarga del Modelo)

**Flujo único, no salteable:**

```
┌─────────────────────────────────────────────────┐
│                                                 │
│         ◈  AuraTranscribe                       │
│                                                 │
│    Para comenzar, necesitamos descargar         │
│    el modelo de inteligencia artificial.        │
│    Esto solo ocurre una vez.                    │
│                                                 │
│    Modelo: Whisper Small                        │
│    Tamaño: 465 MB                               │
│    Precisión: Muy alta en ES/EN                 │
│                                                 │
│    ████████████░░░░░░░░░░░  52% — 8.4 MB/s     │
│    Tiempo estimado: 40 segundos                 │
│                                                 │
│    [  Cancelar instalación  ]                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

Al completarse: transición de fade-out (400ms) hacia la pantalla principal. El modelo se verifica con SHA256 antes de marcar la descarga como exitosa. Si falla la verificación, se elimina el archivo parcial y se reintenta.

---

## SECCIÓN 10 — Mitigación de Riesgos

**Riesgo 1 — Backdrop-blur en GPU básica → ELIMINADO**
Al usar PyWebView con Chromium, la composición de efectos CSS es 100% responsabilidad de Chromium/Skia. Funciona correctamente incluso en GPUs integradas Intel de generaciones antiguas. No hay dependencia del compositor del OS.

**Riesgo 2 — Ejecutable de 3–4 GB → MITIGADO AL MÁXIMO**
El ejecutable PyInstaller no incluye el modelo. Estrategia:
- Ejecutable base: ~180MB (Python runtime + PyWebView + Chromium embebido + FastAPI + ffmpeg estático).
- Modelo Small: 465MB, descargado en primer uso desde Hugging Face con verificación SHA256.
- Total en disco tras setup: ~650MB. Perfectamente distribuible en GitHub Releases.
- El ejecutable base SÍ cabe en el límite de 2GB de GitHub Releases.

**Riesgo 3 — GIL con Whisper → ELIMINADO**
`faster-whisper` + `ProcessPoolExecutor` = proceso separado + CTranslate2 libera el GIL. La UI corre en el proceso principal de Chromium, completamente aislada.

**Riesgo 4 — Windows Defender / SmartScreen → MITIGADO**
Sin firma de código EV, SmartScreen mostrará advertencia en el primer launch. Estrategia de mitigación sin costo:
- El instalador se distribuye también como `.zip` extraíble (no solo `.exe`). Los `.zip` no activan SmartScreen de la misma forma.
- El `README` incluye instrucciones explícitas: "Si Windows muestra una advertencia, haz clic en 'Más información' → 'Ejecutar de todas formas'".
- A medida que crezcan las descargas, la reputación SmartScreen mejora automáticamente.
- Ruta futura: certificado OV (~$80/año con Certum) cuando el proyecto tenga usuarios.

**Riesgo 5 — RAM insuficiente para el modelo → MITIGADO**
En `model_manager.py`, antes de iniciar la descarga y antes de cada transcripción:

```python
import psutil

def check_ram_availability() -> dict:
    available = psutil.virtual_memory().available
    required = 2_200_000_000  # 2.2 GB para Whisper Small con overhead
    return {
        "sufficient": available > required,
        "available_gb": round(available / 1e9, 1),
        "required_gb": 2.2
    }
```

Si RAM insuficiente, la UI muestra un warning no bloqueante:
> ⚠️ Tu sistema tiene 1.8 GB disponibles. Se recomienda cerrar otras aplicaciones para evitar lentitud. ¿Continuar de todas formas?

**Riesgo 6 — Licencia → CUMPLIDO BY DESIGN**
- El `About` de la app incluye: "Powered by OpenAI Whisper (MIT License)" con link al repo.
- `faster-whisper` es MIT. `static-ffmpeg` distribuye binarios LGPL de FFmpeg — esto requiere que el `About` también mencione FFmpeg y su licencia LGPL. Esto es suficiente para cumplimiento legal en distribución gratuita.

---

## SECCIÓN 11 — Plan de Implementación por Fases

```
FASE 1 — Core funcional (sin estética)          ~3 sesiones
├── config.py + estructura de carpetas
├── model_manager.py (descarga + verificación SHA256)
├── media_processor.py (FFmpeg + extracción audio)
├── transcriber.py (faster-whisper + pause/cancel events)
├── job_manager.py (cola + ProcessPoolExecutor)
└── API REST + WebSocket básicos (FastAPI)

FASE 2 — Integración PyWebView                  ~2 sesiones
├── main.py (uvicorn + pywebview en threads separados)
├── index.html esqueleto
├── ws-client.js (WebSocket + reconexión)
└── Verificación end-to-end: cargar archivo → transcribir → exportar

FASE 3 — UI Aura-Minimalism                     ~3 sesiones
├── tokens.css (paleta, tipografía, radios, sombras)
├── components.css (todos los componentes)
├── animations.css (spinner Aura Orbit, transiciones)
├── ui-effects.js (radial gradient follow, scale(0.98))
└── Pantalla de onboarding completa

FASE 4 — Features completas                     ~2 sesiones
├── Batch upload (drag & drop múltiple)
├── UI de progreso dual (audio + batch)
├── Sistema de exportación (separado / unido)
└── Detección de RAM + warnings

FASE 5 — Packaging                              ~1 sesión
├── PyInstaller spec file configurado
├── GitHub Actions CI para build automático en push a main
└── Generación de release con ejecutable + checksum SHA256
```
