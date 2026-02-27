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
            warningText.innerText = `Your system has ${data.ram_check.available_gb} GB of RAM available. At least ${data.ram_check.required_gb} GB is recommended. Close other applications for best results.`;
            warningEl.classList.remove("hidden");
        }
    } catch (e) {
        console.error(e);
        // Fallback or handle error
    }

    function showMainView() {
        onboardingView.classList.add("hidden-view");
        setTimeout(() => {
            onboardingView.classList.add("hidden");
            mainView.classList.remove("hidden");
            // Allow display:flex block to render before removing opacity
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
        onboardActionDiv.classList.add("hidden");
        onboardProgressDiv.classList.remove("hidden");
        onboardError.classList.add("hidden");

        // Listen for WS events
        window.wsClient.on("model_download", (data) => {
            dlPercent.innerText = `${Math.round(data.percent)}%`;
            dlSpeed.innerText = `${data.speed_mbps.toFixed(1)} MB/s`;
            dlBar.style.width = `${Math.min(100, Math.max(0, data.percent))}%`;
            dlEta.innerText = `Estimated time remaining: ${Math.round(data.estimated_remaining_seconds)} seconds`;

            if (data.percent >= 100) {
                setTimeout(showMainView, 1000); // Wait 1s then fade to main
            }
        });

        window.wsClient.on("model_download_complete", () => {
            dlPercent.innerText = `100%`;
            dlBar.style.width = `100%`;
            dlEta.innerText = `Validation complete.`;
            setTimeout(showMainView, 1000);
        });

        // Trigger HTTP download
        try {
            const res = await fetch("/api/model/download", { method: "POST" });
            if (!res.ok) throw new Error("Download failed");
            // Actual completion is tracked via WS or polling if WS disconnects, 
            // but the backend `download` endpoint is synchronous, taking time to respond.
            // Wait, if it's async in the backend, it returns status immediately.
            // Let's assume the endpoint handles it or we rely entirely on WS.
            const result = await res.json();
            if (result.status === "already_downloaded" || result.status === "completed") {
                showMainView();
            }
        } catch (e) {
            console.error(e);
            onboardError.innerText = "Error starting download. See logs.";
            onboardError.classList.remove("hidden");
            btnDownload.disabled = false;
            onboardActionDiv.classList.remove("hidden");
        }
    });
});
