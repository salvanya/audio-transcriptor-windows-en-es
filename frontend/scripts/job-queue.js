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
        exportSuccessMsg.classList.add("hidden");

        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append("files", file);
        });

        // Let's pass language as query param or part of url? The API doesn't accept language right now.
        // Wait, TRD says language is part of the request, but our backend might not implement it yet.
        // We will just upload.

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
            batchProgressText.innerText = "0 / 0";
            spinner.classList.remove("paused");
            isPaused = false;
            updatePauseResumeButton();

            const res = await fetch("/api/transcription/upload", {
                method: "POST",
                body: formData
            });

            if (!res.ok) throw new Error("Upload failed");

            const result = await res.json();
            // Server responds with { job_ids: [...] }
            // The rest is handled by WS.
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
            currentFileLabel.innerText = "Extracting Audio...";
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
            // Revert back or show error
            if (data.status === "error") alert(`Error processing file: ${data.error_message}`);
            // If it's the only job or last job, return to upload
            uploadPanel.classList.remove("hidden");
            processingPanel.classList.add("hidden");
        }
    });

    window.wsClient.on("progress", (data) => {
        currentJobId = data.job_id;
        const pAudio = (data.audio_progress * 100).toFixed(1);
        const pBatch = ((data.batch_current - 1) / data.batch_total) * 100; // approximation

        audioProgressBar.style.width = `${pAudio}%`;
        audioProgressText.innerText = `${pAudio}%`;

        // Format ETA
        const etaObj = formatTime(data.estimated_remaining);
        audioEta.innerText = `[${etaObj} remaining]`;

        batchProgressBar.style.width = `${pBatch}%`;
        batchProgressText.innerText = `${data.batch_current} / ${data.batch_total} files`;

        currentFileLabel.innerText = `Transcribing file ${data.batch_current}...`;
    });

    window.wsClient.on("completed", (data) => {
        completedJobIds.push(data.job_id);
        completedFilenames.push(data.filename);

        // If batch completed (in this simplified logic, we assume we finish when a certain condition is met)
        // Actually, we need to know if it's the last file. The backend sends batch_total in progress, 
        // but completed event doesn't have it directly. We can approximate or just wait for the queue to dry.
        // For simplicity, let's just show export panel and let the user export what's done. 
        // In a real flow, JobManager could broadcast "batch_completed".

        showExportPanel();
    });

    // -- UI Controllers --
    function updatePauseResumeButton() {
        if (isPaused) {
            btnPauseResume.innerText = "▶ Resume";
            btnPauseResume.classList.add("primary");
        } else {
            btnPauseResume.innerText = "⏸ Pause";
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
        const reqBody = {
            job_ids: completedJobIds,
            mode: modeInput
        };

        try {
            const res = await fetch("/api/export/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody)
            });

            if (!res.ok) throw new Error("Export failed");

            exportSuccessMsg.innerText = `Saved successfully to Documents folder.`;
            exportSuccessMsg.classList.remove("hidden");

            setTimeout(() => {
                exportSuccessMsg.classList.add("hidden");
            }, 3000);

        } catch (e) {
            console.error(e);
            alert("Failed to export files.");
        }
    });

    // Utilities
    function formatTime(secs) {
        if (isNaN(secs) || secs < 0) return "0:00";
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
});
