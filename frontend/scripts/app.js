// app.js

document.addEventListener("DOMContentLoaded", async () => {
    const onboardingView = document.getElementById("onboarding-view");
    const mainView = document.getElementById("main-view");
    const onboardProgressDiv = document.getElementById("onboarding-progress");
    const onboardActionDiv = document.getElementById("onboarding-action");
    const btnDownload = document.getElementById("btn-download");
    const onboardError = document.getElementById("onboarding-error");

    const dlPercent = document.getElementById("dl-percent");
    const dlSpeed = document.getElementById("dl-speed");
    const dlBar = document.getElementById("dl-bar");
    const dlEta = document.getElementById("dl-eta");

    // Initialize WebSockets
    window.wsClient.connect();

    // 1. Check model status
    try {
        const res = await fetch("/api/model/status");
        if (!res.ok) throw new Error("Failed to check model status");
        const data = await res.json();

        if (data.downloaded) {
            showMainView();
        } else {
            showOnboardingView();
        }

        // Show RAM warning if insufficient
        if (data.ram_check && !data.ram_check.sufficient) {
            const warningEl = document.getElementById("ram-warning");
            const warningText = document.getElementById("ram-warning-text");
            warningText.innerText = window.i18n.t("ram_warning_text");
            warningEl.classList.remove("hidden");
        }
    } catch (e) {
        console.error(e);
    }

    function showMainView() {
        onboardingView.classList.add("hidden-view");
        setTimeout(() => {
            onboardingView.classList.add("hidden");
            mainView.classList.remove("hidden");
            setTimeout(() => {
                mainView.classList.remove("hidden-view");
            }, 50);
        }, 400);
    }

    function showOnboardingView() {
        onboardingView.classList.remove("hidden", "hidden-view");
    }

    // --- Onboarding Logic ---
    btnDownload.addEventListener("click", async () => {
        btnDownload.disabled = true;
        btnDownload.innerText = window.i18n.t("downloading_status");
        onboardActionDiv.classList.add("hidden");
        onboardProgressDiv.classList.remove("hidden");
        onboardError.classList.add("hidden");

        // Listen for WS events
        window.wsClient.on("model_download", (data) => {
            dlPercent.innerText = `${Math.round(data.percent)}%`;
            dlSpeed.innerText = `${data.speed_mbps.toFixed(1)} MB/s`;
            dlBar.style.width = `${Math.min(100, Math.max(0, data.percent))}%`;

            const etaSuffix = window.i18n.t("processing_eta");
            dlEta.innerText = `${Math.round(data.estimated_remaining_seconds)}s ${etaSuffix}`;

            if (data.percent >= 100) {
                btnDownload.innerText = window.i18n.t("download_ready");
            }
        });

        window.wsClient.on("model_download_complete", () => {
            dlPercent.innerText = `100%`;
            dlBar.style.width = `100%`;
            dlEta.innerText = window.i18n.t("download_ready");
            btnDownload.innerText = window.i18n.t("download_ready");
            setTimeout(showMainView, 1500);
        });

        // Trigger HTTP download
        try {
            const res = await fetch("/api/model/download", { method: "POST" });
            if (!res.ok) throw new Error("Download failed");
            const result = await res.json();
            if (result.status === "already_downloaded" || result.status === "completed") {
                showMainView();
            }
        } catch (e) {
            console.error(e);
            onboardError.innerText = "Error starting download.";
            onboardError.classList.remove("hidden");
            btnDownload.disabled = false;
            onboardActionDiv.classList.remove("hidden");
        }
    });
});
