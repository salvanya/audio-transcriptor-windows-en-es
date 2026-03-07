// i18n.js - Localization strings for AuraTranscribe

const translations = {
    es: {
        app_title: "AuraTranscribe",
        ram_warning_prefix: "Atencion:",
        ram_warning_text: "Se han detectado menos de 8GB de RAM. La transcripcion podria ser lenta o fallar.",

        // Onboarding / Download
        onboarding_title: "Bienvenido a AuraTranscribe",
        onboarding_desc: "Para comenzar, necesitamos descargar el modelo IA para la transcripcion",
        model_size_label: "Tamano",
        btn_start_download: "Descargar Modelo",
        downloading_status: "Descargando modelo...",
        download_ready: "Modelo listo. Iniciando...",
        welcome_title: "Bienvenido a AuraTranscribe",
        welcome_desc: "AuraTranscribe es una app para transcribir archivos de audio y video localmente en tu computadora.",
        btn_start_transcribing: "Comenazar a transcribir",

        // Upload Panel
        upload_title: "Transcribe audio o video",
        upload_drop_zone: "Arrastra tus archivos aqui o haz clic para buscar",
        upload_formats: "MP3, WAV, M4A, OGG, FLAC, MP4, MKV, MOV, AVI, WEBM",
        upload_files_selected: "archivos seleccionados",
        btn_clear_uploaded: "Cancelar",
        btn_keep_uploading: "Seguir subiendo",
        btn_start_transcribing_now: "Iniciar transcripcion",

        // Processing Panel
        processing_title: "Procesando Batch",
        processing_extracting: "Extrayendo audio...",
        processing_transcribing: "Transcribiendo archivo",
        processing_eta: "restante",
        btn_pause: "Pausar",
        btn_resume: "Reanudar",
        btn_cancel: "Cancelar",

        // Export Panel
        export_title: "Transcripcion Completada",
        export_count_prefix: "Se han procesado",
        export_count_suffix: "archivos con exito.",
        export_mode_label: "Modo de exportacion:",
        export_mode_separate: "Archivos individuales",
        export_mode_merged: "Un solo archivo combinado",
        export_select_title: "Selecciona los archivos para descargar",
        export_selected_count: "Seleccionados: {count}",
        btn_choose_folder: "Elegir carpeta",
        export_folder_default: "Carpeta por defecto (Documents/AuraTranscribe)",
        btn_copy_text: "Copiar texto",
        copy_success: "Texto copiado al portapapeles.",
        btn_export: "Descargar",
        btn_new_batch: "Nueva Transcripcion",
        export_success_single: "Exportado con exito.",
        export_success_batch: "Batch exportado con exito.",
        export_success_count: "Se han exportado {count} archivos.",

        // Model Selection Label
        audio_lang_label: "Idioma del Audio:",
        lang_auto: "Auto-detectar",
        lang_es: "Español",
        lang_en: "Inglés",
        lang_fr: "Frances",
        lang_de: "Aleman",
        lang_it: "Italiano",
        lang_pt: "Portugues",

        // Footer
        footer_created_by: "Aplicacion creada por",
        footer_license: "MIT License Copyright (c) 2026 Leandro Salvania",
        footer_model_credit: "AI Powered by OpenAI Whisper V3"
    },
    en: {
        app_title: "AuraTranscribe",
        ram_warning_prefix: "Warning:",
        ram_warning_text: "Less than 8GB of RAM detected. Transcription might be slow or fail.",

        // Onboarding / Download
        onboarding_title: "Welcome to AuraTranscribe",
        onboarding_desc: "To get started, we need to download the AI model for transcription",
        model_size_label: "Size",
        btn_start_download: "Download Model",
        downloading_status: "Downloading model...",
        download_ready: "Model ready. Starting...",
        welcome_title: "Welcome to AuraTranscribe",
        welcome_desc: "AuraTranscribe is an app to transcribe audio and video files locally on your computer.",
        btn_start_transcribing: "Start transcribing",

        // Upload Panel
        upload_title: "Transcribe audio or video",
        upload_drop_zone: "Drag your files here or click to browse",
        upload_formats: "MP3, WAV, M4A, OGG, FLAC, MP4, MKV, MOV, AVI, WEBM",
        upload_files_selected: "files selected",
        btn_clear_uploaded: "Cancel",
        btn_keep_uploading: "Keep uploading",
        btn_start_transcribing_now: "Start transcribing",

        // Processing Panel
        processing_title: "Batch Processing",
        processing_extracting: "Extracting audio...",
        processing_transcribing: "Transcribing file",
        processing_eta: "remaining",
        btn_pause: "Pause",
        btn_resume: "Resume",
        btn_cancel: "Cancel",

        // Export Panel
        export_title: "Transcription Completed!",
        export_count_prefix: "Successfully processed",
        export_count_suffix: "files.",
        export_mode_label: "Export mode:",
        export_mode_separate: "Individual files",
        export_mode_merged: "Single combined file",
        export_select_title: "Select files to download",
        export_selected_count: "Selected: {count}",
        btn_choose_folder: "Choose folder",
        export_folder_default: "Default folder (Documents/AuraTranscribe)",
        btn_copy_text: "Copy text",
        copy_success: "Text copied to clipboard.",
        btn_export: "Download",
        btn_new_batch: "New Transcription",
        export_success_single: "Exported successfully.",
        export_success_batch: "Batch exported successfully.",
        export_success_count: "Exported {count} files successfully.",

        // Model Selection Label
        audio_lang_label: "Audio Language:",
        lang_auto: "Auto-detect",
        lang_es: "Spanish",
        lang_en: "English",
        lang_fr: "French",
        lang_de: "German",
        lang_it: "Italian",
        lang_pt: "Portuguese",

        // Footer
        footer_created_by: "App created by",
        footer_license: "MIT License Copyright (c) 2026 Leandro Salvania",
        footer_model_credit: "AI Powered by OpenAI Whisper V3"
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

        document.body.setAttribute("lang", this.currentLang);
        window.dispatchEvent(new CustomEvent("languageChanged", { detail: this.currentLang }));
    }
}

window.i18n = new I18n();
document.addEventListener("DOMContentLoaded", () => window.i18n.updateUI());
