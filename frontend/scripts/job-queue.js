// job-queue.js

document.addEventListener("DOMContentLoaded", () => {
    // -- Elements --
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    const languageSelect = document.getElementById("language-select");
    const uploadSelection = document.getElementById("upload-selection");
    const uploadFileCount = document.getElementById("upload-file-count");
    const uploadFileList = document.getElementById("upload-file-list");
    const btnAddMoreFiles = document.getElementById("btn-add-more-files");
    const btnStartNow = document.getElementById("btn-start-now");
    const btnClearFiles = document.getElementById("btn-clear-files");

    const uploadPanel = document.getElementById("upload-panel");
    const processingPanel = document.getElementById("processing-panel");
    const exportPanel = document.getElementById("export-panel");

    const ramWarning = document.getElementById("ram-warning");
    const ramWarningText = document.getElementById("ram-warning-text");

    const spinner = document.getElementById("spinner");
    const currentFileLabel = document.getElementById("current-file-label");
    const audioProgressBar = document.getElementById("audio-progress-bar");
    const audioProgressText = document.getElementById("audio-progress-text");
    const audioEta = document.getElementById("audio-eta");

    const batchProgressBar = document.getElementById("batch-progress-bar");
    const batchProgressText = document.getElementById("batch-progress-text");

    const btnPauseResume = document.getElementById("btn-pause-resume");
    const btnCancelJob = document.getElementById("btn-cancel-job");

    const exportCompletedCount = document.getElementById("export-completed-count");
    const exportSuccessMsg = document.getElementById("export-success-msg");
    const btnExport = document.getElementById("btn-export");
    const btnNewBatch = document.getElementById("btn-new-batch");
    const exportModeGroup = document.getElementById("export-mode-group");
    const exportFileList = document.getElementById("export-file-list");
    const exportSelectedCount = document.getElementById("export-selected-count");
    const exportSelectionFrame = document.querySelector(".export-selection-frame");
    const exportSingleView = document.getElementById("export-single-view");
    const exportSingleFilename = document.getElementById("export-single-filename");
    const exportSingleText = document.getElementById("export-single-text");
    const btnCopyTranscript = document.getElementById("btn-copy-transcript");
    const btnChooseFolder = document.getElementById("btn-choose-folder");
    const exportFolderPath = document.getElementById("export-folder-path");

    // -- State --
    let currentJobId = null;
    let completedJobIds = [];
    let isPaused = false;
    let completedFilenames = [];
    let expectedBatchTotal = 0;
    let isSingleFileUpload = false;
    let queuedFiles = [];
    let renderedFileKeys = new Set();
    let selectedExportJobIds = new Set();
    const completedTextsByJobId = new Map();
    let selectedExportFolder = null;

    // -- Radio Group Selection --
    const radioCards = document.querySelectorAll(".radio-card");
    const exportModeInput = document.getElementById("export-mode-input");

    radioCards.forEach(card => {
        card.addEventListener("click", () => {
            radioCards.forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            exportModeInput.value = card.dataset.value;
        });
    });

    // -- Drag & Drop --
    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            addFilesToQueue(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            addFilesToQueue(e.target.files);
        }
    });

    btnAddMoreFiles.addEventListener("click", () => fileInput.click());
    btnStartNow.addEventListener("click", () => startQueuedTranscription());
    btnClearFiles.addEventListener("click", () => {
        queuedFiles = [];
        renderedFileKeys.clear();
        renderQueuedFiles();
    });

    function fileKey(file) {
        return `${file.name}::${file.size}::${file.lastModified}`;
    }

    function addFilesToQueue(files) {
        const existing = new Set(queuedFiles.map(fileKey));
        Array.from(files).forEach(file => {
            const key = fileKey(file);
            if (!existing.has(key)) {
                queuedFiles.push(file);
                existing.add(key);
            }
        });
        fileInput.value = "";
        renderQueuedFiles();
    }

    function renderQueuedFiles() {
        uploadFileList.innerHTML = "";
        queuedFiles.forEach((file, index) => {
            const key = fileKey(file);
            const li = document.createElement("li");
            li.className = "upload-file-item";

            if (renderedFileKeys.has(key)) {
                li.innerText = file.name;
            } else {
                li.classList.add("typing-line");
                const baseDelay = index * 120;
                Array.from(file.name).forEach((char, charIndex) => {
                    const span = document.createElement("span");
                    span.className = "type-char";
                    span.style.animationDelay = `${baseDelay + (charIndex * 24)}ms`;
                    span.textContent = char;
                    li.appendChild(span);
                });

                const cursor = document.createElement("span");
                cursor.className = "typing-cursor";
                cursor.style.animationDelay = `${baseDelay + (file.name.length * 24)}ms`;
                li.appendChild(cursor);

                const removeCursorDelay = baseDelay + (file.name.length * 24) + 350;
                setTimeout(() => {
                    if (cursor.parentElement) cursor.remove();
                }, removeCursorDelay);

                renderedFileKeys.add(key);
            }

            uploadFileList.appendChild(li);
        });

        const selectedSuffix = window.i18n.t("upload_files_selected");
        uploadFileCount.innerText = `${queuedFiles.length} ${selectedSuffix}`;
        uploadSelection.classList.toggle("hidden", queuedFiles.length === 0);
    }

    function startQueuedTranscription() {
        if (queuedFiles.length === 0) return;
        handleFiles([...queuedFiles]);
    }

    function renderExportSelection() {
        exportFileList.innerHTML = "";
        completedJobIds.forEach((jobId, index) => {
            const row = document.createElement("li");
            row.className = "export-file-item";

            const label = document.createElement("label");
            label.className = "export-file-label";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = selectedExportJobIds.has(jobId);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selectedExportJobIds.add(jobId);
                } else {
                    selectedExportJobIds.delete(jobId);
                }
                updateExportSelectionState();
            });

            const text = document.createElement("span");
            text.innerText = completedFilenames[index] || `File ${index + 1}`;

            label.appendChild(checkbox);
            label.appendChild(text);
            row.appendChild(label);
            exportFileList.appendChild(row);
        });
        updateExportSelectionState();
    }

    function updateExportSelectionState() {
        exportSelectedCount.innerText = window.i18n.t("export_selected_count", { count: selectedExportJobIds.size });
        btnExport.disabled = selectedExportJobIds.size === 0;
    }

    async function setSingleTranscriptView(jobId) {
        exportSingleFilename.innerText = completedFilenames[0] || "";
        let text = completedTextsByJobId.get(jobId) || "";
        if (!text) {
            try {
                const res = await fetch(`/api/transcription/${jobId}/text`);
                if (res.ok) {
                    const data = await res.json();
                    text = data.text || "";
                }
            } catch (_) {
                text = "";
            }
        }
        exportSingleText.value = text;
    }

    btnCopyTranscript.addEventListener("click", async () => {
        const text = exportSingleText.value || "";
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            exportSuccessMsg.innerText = window.i18n.t("copy_success");
            exportSuccessMsg.classList.remove("hidden");
            setTimeout(() => exportSuccessMsg.classList.add("hidden"), 2000);
        } catch (e) {
            console.error(e);
            alert("Failed to copy text.");
        }
    });

    btnChooseFolder.addEventListener("click", async () => {
        try {
            const res = await fetch("/api/export/select_folder");
            if (!res.ok) throw new Error("Failed to choose folder");
            const result = await res.json();
            if (result.status === "selected" && result.folder) {
                selectedExportFolder = result.folder;
                exportFolderPath.innerText = result.folder;
            }
        } catch (e) {
            console.error(e);
            alert("Failed to choose folder.");
        }
    });

    async function handleFiles(files) {
        // Prepare UI for processing
        completedJobIds = [];
        completedFilenames = [];
        expectedBatchTotal = files.length;
        isSingleFileUpload = expectedBatchTotal === 1;
        exportSuccessMsg.classList.add("hidden");

        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append("files", file);
        });

        try {
            uploadPanel.classList.add("hidden");
            processingPanel.classList.remove("hidden");
            exportPanel.classList.add("hidden");

            // Reset UI
            currentFileLabel.innerText = "Queued...";
            audioProgressBar.style.width = "0%";
            audioProgressText.innerText = "0%";
            audioEta.innerText = "Calculating...";
            batchProgressBar.style.width = "0%";
            batchProgressText.innerText = `0 / ${expectedBatchTotal} files`;
            spinner.classList.remove("paused");
            isPaused = false;
            updatePauseResumeButton();

            const res = await fetch("/api/transcription/upload", {
                method: "POST",
                body: formData
            });

            if (!res.ok) throw new Error("Upload failed");

            queuedFiles = [];
            renderedFileKeys.clear();
            renderQueuedFiles();
        } catch (e) {
            console.error(e);
            alert("Failed to upload files.");
            uploadPanel.classList.remove("hidden");
            processingPanel.classList.add("hidden");
        }
    }

    // -- WebSocket Event Handlers --
    window.wsClient.on("status_change", (data) => {
        if (data.status === "extracting") {
            currentJobId = data.job_id;
            currentFileLabel.innerText = window.i18n.t("processing_extracting");
        } else if (data.status === "transcribing") {
            currentJobId = data.job_id;
            isPaused = false;
            updatePauseResumeButton();
            spinner.classList.remove("paused");
        } else if (data.status === "paused") {
            isPaused = true;
            updatePauseResumeButton();
            spinner.classList.add("paused");
        } else if (data.status === "cancelled" || data.status === "error") {
            if (data.status === "error") alert(`Error processing file: ${data.error_message}`);
            uploadPanel.classList.remove("hidden");
            processingPanel.classList.add("hidden");
        }
    });

    window.wsClient.on("progress", (data) => {
        currentJobId = data.job_id;
        const pAudio = (data.audio_progress * 100).toFixed(1);

        audioProgressBar.style.width = `${pAudio}%`;
        audioProgressText.innerText = `${pAudio}%`;

        const etaObj = formatTime(data.estimated_remaining);
        const etaPrefix = window.i18n.t("processing_eta");
        audioEta.innerText = `[${etaObj} ${etaPrefix}]`;

        const pBatch = ((data.batch_current - 1) / data.batch_total) * 100;
        batchProgressBar.style.width = `${pBatch}%`;

        const filesLabel = window.i18n.t("export_count_suffix").split(" ")[0];
        batchProgressText.innerText = `${data.batch_current} / ${data.batch_total} ${filesLabel}`;

        currentFileLabel.innerText = `${window.i18n.t("processing_transcribing")} ${data.batch_current}...`;
    });

    window.wsClient.on("completed", (data) => {
        completedJobIds.push(data.job_id);
        completedFilenames.push(data.filename);
        completedTextsByJobId.set(data.job_id, data.text || "");

        if (completedJobIds.length >= expectedBatchTotal) {
            showExportPanel();
        } else {
            const pBatch = (completedJobIds.length / expectedBatchTotal) * 100;
            batchProgressBar.style.width = `${pBatch}%`;
            const filesLabel = window.i18n.t("export_count_suffix").split(" ")[0];
            batchProgressText.innerText = `${completedJobIds.length} / ${expectedBatchTotal} ${filesLabel} completed`;
        }
    });

    // -- UI Controllers --
    function updatePauseResumeButton() {
        if (isPaused) {
            btnPauseResume.innerText = window.i18n.t("btn_resume");
            btnPauseResume.classList.add("primary");
        } else {
            btnPauseResume.innerText = window.i18n.t("btn_pause");
            btnPauseResume.classList.remove("primary");
        }
    }

    btnPauseResume.addEventListener("click", () => {
        if (!currentJobId) return;
        const endpoint = isPaused ? "resume" : "pause";
        fetch(`/api/transcription/${currentJobId}/${endpoint}`, { method: "POST" }).catch(console.error);
    });

    btnCancelJob.addEventListener("click", () => {
        if (!currentJobId) return;
        if (confirm("Are you sure you want to cancel the current job?")) {
            fetch(`/api/transcription/${currentJobId}/cancel`, { method: "POST" }).catch(console.error);
        }
    });

    async function showExportPanel() {
        const singleExportMode = isSingleFileUpload || expectedBatchTotal === 1 || completedJobIds.length === 1;
        processingPanel.classList.add("hidden");
        exportPanel.classList.remove("hidden");
        exportCompletedCount.innerText = completedJobIds.length;
        exportFolderPath.innerText = selectedExportFolder || window.i18n.t("export_folder_default");
        selectedExportJobIds = new Set(completedJobIds);
        exportSelectionFrame.classList.toggle("hidden", singleExportMode);
        exportSingleView.classList.toggle("hidden", !singleExportMode);
        if (singleExportMode && completedJobIds.length > 0) {
            await setSingleTranscriptView(completedJobIds[0]);
        } else {
            renderExportSelection();
        }
        if (exportModeGroup) {
            exportModeGroup.classList.toggle("hidden", singleExportMode);
        }
        radioCards.forEach(c => c.classList.toggle("hidden", singleExportMode));
        exportModeInput.value = "separate";
        radioCards.forEach(c => c.classList.toggle("active", c.dataset.value === "separate"));
    }

    btnNewBatch.addEventListener("click", () => {
        exportPanel.classList.add("hidden");
        uploadPanel.classList.remove("hidden");
        queuedFiles = [];
        renderedFileKeys.clear();
        selectedExportJobIds.clear();
        completedTextsByJobId.clear();
        exportSingleText.value = "";
        selectedExportFolder = null;
        exportFolderPath.innerText = window.i18n.t("export_folder_default");
        renderQueuedFiles();
    });

    btnExport.addEventListener("click", async () => {
        const singleExportMode = isSingleFileUpload || expectedBatchTotal === 1 || completedJobIds.length === 1;
        const modeInput = singleExportMode ? "separate" : document.getElementById("export-mode-input").value;
        const selectedIds = completedJobIds.filter(jobId => selectedExportJobIds.has(jobId));

        try {
            if (selectedIds.length === 0) return;
            btnExport.disabled = true;

            if (modeInput === "separate") {
                // Export each file separately
                const res = await fetch("/api/export/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        job_ids: selectedIds,
                        mode: "separate",
                        folder_path: selectedExportFolder
                    })
                });

                if (!res.ok) throw new Error("Export failed");
                const result = await res.json();

                exportSuccessMsg.innerText = window.i18n.t("export_success_count", { count: result.files.length });
                exportSuccessMsg.classList.remove("hidden");

                // Open the export folder
                await fetch(`/api/export/open_folder?folder=${encodeURIComponent(result.folder || "")}`);

            } else {
                // Merged export
                const res = await fetch("/api/export/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        job_ids: selectedIds,
                        mode: "merged",
                        folder_path: selectedExportFolder
                    })
                });

                if (!res.ok) throw new Error("Export failed");
                const result = await res.json();

                exportSuccessMsg.innerText = window.i18n.t("export_success_batch");
                exportSuccessMsg.classList.remove("hidden");

                // Open the export folder
                await fetch(`/api/export/open_folder?folder=${encodeURIComponent(result.folder || "")}`);
            }

            setTimeout(() => exportSuccessMsg.classList.add("hidden"), 5000);

        } catch (e) {
            console.error(e);
            alert("Failed to export files.");
        } finally {
            btnExport.disabled = false;
        }
    });

    // -- Language Sync --
    window.addEventListener("languageChanged", (e) => {
        const lang = e.detail;
        if (lang === "es" || lang === "en") {
            if (window.audioLangDropdown) {
                window.audioLangDropdown.setValue(lang);
            } else {
                languageSelect.value = lang;
            }
            if (queuedFiles.length > 0) {
                renderQueuedFiles();
            }
            if (!exportPanel.classList.contains("hidden") && completedJobIds.length > 0) {
                updateExportSelectionState();
            }
        }
    });

    function formatTime(secs) {
        if (isNaN(secs) || secs < 0) return "0:00";
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
});
