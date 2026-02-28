// job-queue.js

document.addEventListener("DOMContentLoaded", () => {
    // -- Elements --
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    const languageSelect = document.getElementById("language-select");

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
    const exportSeparateDesc = document.getElementById("export-separate-desc");
    const exportSuccessMsg = document.getElementById("export-success-msg");
    const btnExport = document.getElementById("btn-export");
    const btnNewBatch = document.getElementById("btn-new-batch");

    // -- State --
    let currentJobId = null;
    let completedJobIds = [];
    let isPaused = false;
    let completedFilenames = [];
    let expectedBatchTotal = 0;

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
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });

    async function handleFiles(files) {
        // Prepare UI for processing
        completedJobIds = [];
        completedFilenames = [];
        expectedBatchTotal = files.length;
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

            // Reset input so the same file can be selected again
            fileInput.value = "";
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

        const filesLabel = window.i18n.t("export_count_suffix").split(" ")[0]; // Just "files" or "archivos"
        batchProgressText.innerText = `${data.batch_current} / ${data.batch_total} ${filesLabel}`;

        currentFileLabel.innerText = `${window.i18n.t("processing_transcribing")} ${data.batch_current}...`;
    });

    window.wsClient.on("completed", (data) => {
        completedJobIds.push(data.job_id);
        completedFilenames.push(data.filename);

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

    function showExportPanel() {
        processingPanel.classList.add("hidden");
        exportPanel.classList.remove("hidden");
        exportCompletedCount.innerText = completedJobIds.length;
        exportSeparateDesc.innerText = completedFilenames.join(" | ");
    }

    btnNewBatch.addEventListener("click", () => {
        exportPanel.classList.add("hidden");
        uploadPanel.classList.remove("hidden");
    });

    btnExport.addEventListener("click", async () => {
        const modeInput = document.querySelector('input[name="export-mode"]:checked').value;
        const totalToExport = completedJobIds.length;
        let successCount = 0;

        try {
            if (modeInput === "separate") {
                for (let i = 0; i < totalToExport; i++) {
                    const jobId = completedJobIds[i];
                    const filename = completedFilenames[i].replace(/\.[^/.]+$/, "") + ".txt";

                    const pickerRes = await fetch(`/api/ui/save_dialog?filename=${encodeURIComponent(filename)}`);
                    const pickerData = await pickerRes.json();

                    if (pickerData.path) {
                        const exportRes = await fetch(`/api/export/single?job_id=${jobId}&target_path=${encodeURIComponent(pickerData.path)}`, {
                            method: "POST"
                        });
                        if (exportRes.ok) successCount++;
                    }
                    // Delay between dialogs
                    await new Promise(r => setTimeout(r, 400));
                }
            } else {
                const dateStr = new Date().toISOString().split('T')[0];
                const defaultName = `auratranscribe_batch_${dateStr}.txt`;

                const pickerRes = await fetch(`/api/ui/save_dialog?filename=${encodeURIComponent(defaultName)}`);
                const pickerData = await pickerRes.json();

                if (pickerData.path) {
                    const res = await fetch("/api/export/batch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            job_ids: completedJobIds,
                            mode: "merged",
                            target_path: pickerData.path
                        })
                    });
                    if (res.ok) successCount = 1;
                }
            }

            if (successCount > 0) {
                exportSuccessMsg.innerText = modeInput === "separate"
                    ? window.i18n.t("export_success_count", { count: successCount })
                    : window.i18n.t("export_success_batch");
                exportSuccessMsg.classList.remove("hidden");
                setTimeout(() => exportSuccessMsg.classList.add("hidden"), 5000);
            }

        } catch (e) {
            console.error(e);
            alert("Failed to export files.");
        }
    });

    // -- Language Sync --
    window.addEventListener("languageChanged", (e) => {
        const lang = e.detail;
        // Sync audio language selector with UI language if it's one of the primary ones
        if (lang === "es" || lang === "en") {
            languageSelect.value = lang;
        }
    });

    function formatTime(secs) {
        if (isNaN(secs) || secs < 0) return "0:00";
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
});
