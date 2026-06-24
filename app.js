/* ══════════════════════════════════════════════════════════════
   EasyPDF — Application Logic
   ══════════════════════════════════════════════════════════════ */

(() => {
    "use strict";

    // ── Configure PDF.js worker ──
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    // ── DOM References ──
    const $          = (sel) => document.querySelector(sel);
    const uploadZone = $("#upload-zone");
    const dropArea   = $("#drop-area");
    const fileInput  = $("#file-input");
    const fileInputMore = $("#file-input-more");
    const pagesSection = $("#pages-section");
    const pagesGrid  = $("#pages-grid");
    const pageCount  = $("#page-count");
    const btnMakePdf = $("#btn-make-pdf");
    const btnClear   = $("#btn-clear");
    const btnAddMore = $("#btn-add-more");
    const filenameInput = $("#filename-input");
    const overlay    = $("#processing-overlay");
    const overlayText = $("#processing-text");
    const toastContainer = $("#toast-container");

    // ── State ──
    // Each item: { id, type: 'pdf-page'|'image'|'docx', blob, thumbDataUrl, label, pdfBytes?, pageIndex? }
    let pages = [];
    let idCounter = 0;
    let sortable = null;

    // ══════════════════════════════════════════════════════════════
    //  Utilities
    // ══════════════════════════════════════════════════════════════

    function uid() { return ++idCounter; }

    function showToast(message, type = "success") {
        const t = document.createElement("div");
        t.className = `toast toast-${type}`;
        t.textContent = message;
        toastContainer.appendChild(t);
        setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(12px)"; setTimeout(() => t.remove(), 300); }, 3500);
    }

    function showOverlay(text) { overlayText.textContent = text; overlay.classList.remove("hidden"); }
    function hideOverlay()     { overlay.classList.add("hidden"); }

    function updateUI() {
        const hasPages = pages.length > 0;
        uploadZone.classList.toggle("hidden", hasPages);
        pagesSection.classList.toggle("hidden", !hasPages);
        pageCount.textContent = `${pages.length} page${pages.length !== 1 ? "s" : ""}`;
        btnMakePdf.disabled = !hasPages;
        btnClear.disabled   = !hasPages;
        btnAddMore.disabled = !hasPages;
    }

    function renderPages() {
        pagesGrid.innerHTML = "";
        pages.forEach((p, i) => {
            const card = document.createElement("div");
            card.className = "page-card";
            card.dataset.id = p.id;
            card.style.animationDelay = `${i * .04}s`;

            const thumb = document.createElement("div");
            thumb.className = "page-thumb";

            if (p.type === "docx") {
                const div = document.createElement("div");
                div.className = "docx-preview";
                div.innerHTML = p.htmlContent || "<p>DOCX</p>";
                thumb.appendChild(div);
            } else {
                const img = document.createElement("img");
                img.src = p.thumbDataUrl;
                img.alt = p.label;
                img.draggable = false;
                thumb.appendChild(img);
            }

            const info = document.createElement("div");
            info.className = "page-info";
            const label = document.createElement("span");
            label.className = "page-label";
            label.textContent = p.label;
            label.title = p.label;
            const num = document.createElement("span");
            num.className = "page-number";
            num.textContent = i + 1;
            info.appendChild(label);
            info.appendChild(num);

            const del = document.createElement("button");
            del.className = "page-delete";
            del.title = "Remove page";
            del.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
            del.addEventListener("click", (e) => { e.stopPropagation(); removePage(p.id); });

            card.appendChild(del);
            card.appendChild(thumb);
            card.appendChild(info);
            pagesGrid.appendChild(card);
        });

        initSortable();
        updateUI();
    }

    function removePage(id) {
        pages = pages.filter(p => p.id !== id);
        renderPages();
    }

    // ══════════════════════════════════════════════════════════════
    //  Sortable
    // ══════════════════════════════════════════════════════════════

    function initSortable() {
        if (sortable) sortable.destroy();
        sortable = new Sortable(pagesGrid, {
            animation: 200,
            ghostClass: "sortable-ghost",
            chosenClass: "sortable-chosen",
            easing: "cubic-bezier(.4,0,.2,1)",
            onEnd(evt) {
                const [moved] = pages.splice(evt.oldIndex, 1);
                pages.splice(evt.newIndex, 0, moved);
                // Update page numbers without full re-render
                pagesGrid.querySelectorAll(".page-number").forEach((el, i) => el.textContent = i + 1);
            },
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  File Processing
    // ══════════════════════════════════════════════════════════════

    async function processFiles(files) {
        if (!files.length) return;
        showOverlay("Processing files…");

        const allowed = [
            "application/pdf",
            "image/jpeg", "image/png", "image/jpg",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];

        for (const file of files) {
            const ext = file.name.split(".").pop().toLowerCase();
            const isAllowed = allowed.includes(file.type) ||
                              ["pdf","jpg","jpeg","png","doc","docx"].includes(ext);
            if (!isAllowed) {
                showToast(`Skipped "${file.name}" — unsupported format.`, "error");
                continue;
            }

            try {
                overlayText.textContent = `Processing "${file.name}"…`;

                if (file.type === "application/pdf" || ext === "pdf") {
                    await processPdf(file);
                } else if (file.type.startsWith("image/") || ["jpg","jpeg","png"].includes(ext)) {
                    await processImage(file);
                } else if (ext === "docx" || ext === "doc") {
                    await processDocx(file);
                }
            } catch (err) {
                console.error(err);
                showToast(`Error processing "${file.name}".`, "error");
            }
        }

        hideOverlay();
        renderPages();
        showToast(`${pages.length} page${pages.length !== 1 ? "s" : ""} ready.`);
    }

    // ── PDF ──
    async function processPdf(file) {
        const arrayBuf = await file.arrayBuffer();
        const pdfBytes = new Uint8Array(arrayBuf);
        // Use a sliced copy to prevent PDF.js from detaching the arrayBuffer
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
        const totalPages = pdf.numPages;

        for (let i = 1; i <= totalPages; i++) {
            overlayText.textContent = `Rendering "${file.name}" — page ${i}/${totalPages}`;
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1 });

            // Render at a reasonable thumbnail size
            const thumbScale = 300 / viewport.width;
            const thumbVP = page.getViewport({ scale: thumbScale });

            const canvas = document.createElement("canvas");
            canvas.width  = thumbVP.width;
            canvas.height = thumbVP.height;
            const ctx = canvas.getContext("2d");
            await page.render({ canvasContext: ctx, viewport: thumbVP }).promise;

            pages.push({
                id: uid(),
                type: "pdf-page",
                pdfBytes: pdfBytes,
                pageIndex: i - 1,  // 0-indexed for pdf-lib
                thumbDataUrl: canvas.toDataURL("image/jpeg", 0.8),
                label: totalPages > 1 ? `${file.name} p.${i}` : file.name,
            });
        }
    }

    // ── Image ──
    async function processImage(file) {
        const dataUrl = await readAsDataUrl(file);

        // Create a small thumbnail
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });

        const MAX = 400;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
            const ratio = Math.min(MAX / w, MAX / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);

        pages.push({
            id: uid(),
            type: "image",
            blob: await file.arrayBuffer(),
            mimeType: file.type || "image/png",
            originalWidth: img.width,
            originalHeight: img.height,
            thumbDataUrl: canvas.toDataURL("image/jpeg", 0.8),
            label: file.name,
        });
    }

    // ── DOCX ──
    async function processDocx(file) {
        const arrayBuf = await file.arrayBuffer();
        let htmlContent = "<p>DOCX document</p>";

        try {
            const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
            htmlContent = result.value || htmlContent;
        } catch (err) {
            console.warn("mammoth conversion failed", err);
            showToast(`Partial support for "${file.name}" — DOCX preview may be limited.`, "error");
        }

        // We need to render the DOCX HTML to an image for the PDF output
        // Create a hidden container, render HTML, capture to canvas
        const thumbDataUrl = await renderHtmlToThumb(htmlContent);

        pages.push({
            id: uid(),
            type: "docx",
            htmlContent,
            thumbDataUrl,
            blob: arrayBuf,
            label: file.name,
        });
    }

    // Render HTML string to a thumbnail image
    async function renderHtmlToThumb(html) {
        const container = document.createElement("div");
        container.style.cssText = `
            position: fixed; left: -9999px; top: 0;
            width: 595px; min-height: 842px;
            background: #fff; color: #111;
            font-family: 'Inter', sans-serif; font-size: 14px;
            padding: 40px; line-height: 1.6;
            overflow: hidden;
        `;
        container.innerHTML = html;
        document.body.appendChild(container);

        // Use canvas rendering
        const canvas = document.createElement("canvas");
        const scale = 0.5;
        canvas.width  = 595 * scale;
        canvas.height = 842 * scale;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#333";
        ctx.font = "7px Inter, sans-serif";

        // Simple text extraction for thumbnail
        const text = container.innerText || "DOCX Document";
        const lines = text.split("\n").slice(0, 80);
        lines.forEach((line, i) => {
            ctx.fillText(line.substring(0, 80), 20, 20 + i * 9);
        });

        document.body.removeChild(container);
        return canvas.toDataURL("image/jpeg", 0.75);
    }

    function readAsDataUrl(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  PDF Creation (pdf-lib)
    // ══════════════════════════════════════════════════════════════

    async function makePdf() {
        if (!pages.length) return;

        const filename = (filenameInput.value.trim() || "my-document") + ".pdf";
        showOverlay("Building your PDF…");

        try {
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                overlayText.textContent = `Adding page ${i + 1} of ${pages.length}…`;

                if (p.type === "pdf-page") {
                    const srcDoc = await PDFDocument.load(p.pdfBytes);
                    const [copiedPage] = await mergedPdf.copyPages(srcDoc, [p.pageIndex]);
                    mergedPdf.addPage(copiedPage);

                } else if (p.type === "image") {
                    let embeddedImg;
                    const bytes = new Uint8Array(p.blob);
                    if (p.mimeType === "image/png") {
                        embeddedImg = await mergedPdf.embedPng(bytes);
                    } else {
                        embeddedImg = await mergedPdf.embedJpg(bytes);
                    }

                    // Fit image to A4 with padding
                    const A4_W = 595.28, A4_H = 841.89;
                    const PAD = 36;
                    const maxW = A4_W - PAD * 2;
                    const maxH = A4_H - PAD * 2;
                    const imgW = embeddedImg.width;
                    const imgH = embeddedImg.height;
                    const ratio = Math.min(maxW / imgW, maxH / imgH, 1);
                    const drawW = imgW * ratio;
                    const drawH = imgH * ratio;

                    const page = mergedPdf.addPage([A4_W, A4_H]);
                    page.drawImage(embeddedImg, {
                        x: (A4_W - drawW) / 2,
                        y: (A4_H - drawH) / 2,
                        width: drawW,
                        height: drawH,
                    });

                } else if (p.type === "docx") {
                    // Render DOCX HTML to a full-size canvas, then embed as image
                    const imgDataUrl = await renderDocxToFullImage(p.htmlContent);
                    const imgBytes = dataUrlToUint8Array(imgDataUrl);
                    const embeddedImg = await mergedPdf.embedJpg(imgBytes);

                    const A4_W = 595.28, A4_H = 841.89;
                    const page = mergedPdf.addPage([A4_W, A4_H]);
                    page.drawImage(embeddedImg, {
                        x: 0, y: 0,
                        width: A4_W,
                        height: A4_H,
                    });
                }
            }

            const pdfBytes = await mergedPdf.save();
            downloadBlob(pdfBytes, filename, "application/pdf");
            showToast(`"${filename}" downloaded!`);
        } catch (err) {
            console.error(err);
            showToast("Error creating PDF. Check console for details.", "error");
        }

        hideOverlay();
    }

    async function renderDocxToFullImage(html) {
        const container = document.createElement("div");
        container.style.cssText = `
            position: fixed; left: -9999px; top: 0;
            width: 595px; min-height: 842px;
            background: #fff; color: #111;
            font-family: 'Inter', sans-serif; font-size: 13px;
            padding: 50px; line-height: 1.7;
            overflow: hidden;
        `;
        container.innerHTML = html;
        document.body.appendChild(container);

        // Render to canvas manually (simpler than html2canvas dependency)
        const canvas = document.createElement("canvas");
        canvas.width = 595 * 2;
        canvas.height = 842 * 2;
        const ctx = canvas.getContext("2d");
        ctx.scale(2, 2);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 595, 842);
        ctx.fillStyle = "#111";
        ctx.font = "13px Inter, sans-serif";

        const text = container.innerText || "";
        const words = text.split(/\s+/);
        const maxWidth = 495; // 595 - 2*50 padding
        let line = "";
        let y = 60;
        const lineHeight = 20;

        for (const word of words) {
            const test = line + (line ? " " : "") + word;
            if (ctx.measureText(test).width > maxWidth) {
                ctx.fillText(line, 50, y);
                line = word;
                y += lineHeight;
                if (y > 800) break;
            } else {
                line = test;
            }
        }
        if (line && y <= 800) ctx.fillText(line, 50, y);

        document.body.removeChild(container);
        return canvas.toDataURL("image/jpeg", 0.9);
    }

    function dataUrlToUint8Array(dataUrl) {
        const base64 = dataUrl.split(",")[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function downloadBlob(data, filename, type) {
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ══════════════════════════════════════════════════════════════
    //  Event Listeners
    // ══════════════════════════════════════════════════════════════

    // Upload zone click
    dropArea.addEventListener("click", () => fileInput.click());

    // File input change
    fileInput.addEventListener("change", (e) => {
        processFiles(Array.from(e.target.files));
        fileInput.value = "";
    });

    // Add more files
    btnAddMore.addEventListener("click", () => fileInputMore.click());
    fileInputMore.addEventListener("change", (e) => {
        processFiles(Array.from(e.target.files));
        fileInputMore.value = "";
    });

    // Drag & drop onto upload zone
    ["dragenter", "dragover"].forEach(evt => {
        dropArea.addEventListener(evt, (e) => { e.preventDefault(); dropArea.classList.add("drag-over"); });
    });
    ["dragleave", "drop"].forEach(evt => {
        dropArea.addEventListener(evt, () => dropArea.classList.remove("drag-over"));
    });
    dropArea.addEventListener("drop", (e) => {
        e.preventDefault();
        processFiles(Array.from(e.dataTransfer.files));
    });

    // Also allow dropping files onto the pages grid area
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length && pages.length > 0) {
            processFiles(Array.from(e.dataTransfer.files));
        }
    });

    // Clear all
    btnClear.addEventListener("click", () => {
        pages = [];
        renderPages();
        updateUI();
        showToast("All pages cleared.");
    });

    // Make PDF
    btnMakePdf.addEventListener("click", makePdf);

    // Initial state
    updateUI();
})();
