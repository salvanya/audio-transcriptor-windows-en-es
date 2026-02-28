// i18n.js - Localization strings for AuraTranscribe

const translations = {
    es: {
        app_title: "AuraTranscribe",
        ram_warning_prefix: "⚠️ Atención:",
        ram_warning_text: "Se han detectado menos de 8GB de RAM. La transcripción podría ser lenta o fallar.",

        // Onboarding / Download
        onboarding_title: "Bienvenido a AuraTranscribe",
        onboarding_desc: "Para comenzar, necesitamos descargar el modelo de transcripción (aprox. 150MB).",
        btn_start_download: "Descargar Modelo",
        downloading_status: "Descargando modelo...",
        download_ready: "Modelo listo. Iniciando...",

        // Upload Panel
        upload_title: "Transcribe tus audios",
        upload_drop_zone: "Arrastra tus archivos aquí o haz clic para buscar",
        upload_formats: "Formatos soportados: MP3, WAV, M4A, OGG",

        // Processing Panel
        processing_title: "Procesando Batch",
        processing_extracting: "Extrayendo audio...",
        processing_transcribing: "Transcribiendo archivo",
        processing_eta: "restante",
        btn_pause: "⏸ Pausar",
        btn_resume: "▶ Reanudar",
        btn_cancel: "✖ Cancelar",

        // Export Panel
        export_title: "¡Transcripción Completada!",
        export_count_prefix: "Se han procesado",
        export_count_suffix: "archivos con éxito.",
        export_mode_label: "Modo de exportación:",
        export_mode_separate: "Archivos individuales (.txt)",
        export_mode_merged: "Un solo archivo combinado",
        btn_export: "Exportar",
        btn_new_batch: "Nueva Transcripción",
        export_success_single: "Exportado con éxito.",
        export_success_batch: "Batch exportado con éxito.",
        export_success_count: "Se han exportado {count} archivos.",

        // Model Selection Label
        audio_lang_label: "Idioma del Audio:",
        lang_auto: "⚡ Auto-detectar",
        lang_es: "Español",
        lang_en: "Inglés",
        lang_fr: "Francés",
        lang_de: "Alemán",
        lang_it: "Italiano",
        lang_pt: "Portugués"
    },
    en: {
        app_title: "AuraTranscribe",
        ram_warning_prefix: "⚠️ Warning:",
        ram_warning_text: "Less than 8GB of RAM detected. Transcription might be slow or fail.",

        // Onboarding / Download
        onboarding_title: "Welcome to AuraTranscribe",
        onboarding_desc: "To start, we need to download the transcription model (approx. 150MB).",
        btn_start_download: "Download Model",
        downloading_status: "Downloading model...",
        download_ready: "Model ready. Starting...",

        // Upload Panel
        upload_title: "Transcribe your audio",
        upload_drop_zone: "Drag your files here or click to browse",
        upload_formats: "Supported formats: MP3, WAV, M4A, OGG",

        // Processing Panel
        processing_title: "Batch Processing",
        processing_extracting: "Extracting audio...",
        processing_transcribing: "Transcribing file",
        processing_eta: "remaining",
        btn_pause: "⏸ Pause",
        btn_resume: "▶ Resume",
        btn_cancel: "✖ Cancel",

        // Export Panel
        export_title: "Transcription Completed!",
        export_count_prefix: "Successfully processed",
        export_count_suffix: "files.",
        export_mode_label: "Export mode:",
        export_mode_separate: "Individual files (.txt)",
        export_mode_merged: "Single combined file",
        btn_export: "Export",
        btn_new_batch: "New Transcription",
        export_success_single: "Exported successfully.",
        export_success_batch: "Batch exported successfully.",
        export_success_count: "Exported {count} files successfully.",

        // Model Selection Label
        audio_lang_label: "Audio Language:",
        lang_auto: "⚡ Auto-detect",
        lang_es: "Spanish",
        lang_en: "English",
        lang_fr: "French",
        lang_de: "German",
        lang_it: "Italian",
        lang_pt: "Portuguese"
    }
};

class I18n {
    constructor() {
        this.currentLang = localStorage.getItem("ui_lang") || "es";
    }

    setLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem("ui_lang", lang);
        this.updateUI();
    }

    t(key, variables = {}) {
        let text = translations[this.currentLang][key] || key;
        for (const [vK, vV] of Object.entries(variables)) {
            text = text.replace(`{${vK}}`, vV);
        }
        return text;
    }

    updateUI() {
        const elements = document.querySelectorAll("[data-i18n]");
        elements.forEach(el => {
            const key = el.getAttribute("data-i18n");
            if (translations[this.currentLang][key]) {
                if (el.tagName === "INPUT" && el.type === "placeholder") {
                    el.placeholder = this.t(key);
                } else {
                    el.innerText = this.t(key);
                }
            }
        });

        // Update body class for potential RTL or specific styles
        document.body.setAttribute("lang", this.currentLang);

        // Dispatch event for specialized components
        window.dispatchEvent(new CustomEvent("languageChanged", { detail: this.currentLang }));
    }
}

window.i18n = new I18n();
document.addEventListener("DOMContentLoaded", () => window.i18n.updateUI());
