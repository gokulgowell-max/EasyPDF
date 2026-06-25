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
    const compressionSelect = $("#compression-select");

    // Editor DOM References
    const editorModal = $("#editor-modal");
    const editorCloseBtn = $("#editor-btn-close");
    const editorDoneBtn = $("#editor-btn-done");
    const editorPageLabel = $("#editor-page-label");
    const editorCanvasContainer = $("#editor-canvas-container");
    const editorOverlaysLayer = $("#editor-overlays-layer");
    const editorBtnAddText = $("#editor-btn-add-text");
    const editorBtnAddShape = $("#editor-btn-add-shape");
    const editorPropertiesPanel = $("#editor-properties-panel");
    const editorNoSelection = $("#editor-no-selection");
    const editorBtnDeleteEl = $("#editor-btn-delete-el");
    
    // Properties panels
    const propTextInput = $("#prop-text-input");
    const propFontFamily = $("#prop-font-family");
    const propFontSize = $("#prop-font-size");
    const propFontSizeVal = $("#prop-font-size-val");
    const propShapeType = $("#prop-shape-type");
    const propTextGroup = $("#prop-text-group");
    const propShapeGroup = $("#prop-shape-group");
    const colorSwatches = document.querySelectorAll(".color-swatch");

    // ── State ──
    // Each item: { id, type: 'pdf-page'|'image'|'docx', blob, thumbDataUrl, label, pdfBytes?, pageIndex?, width, height, rotation, edits[] }
    let pages = [];
    let idCounter = 0;
    let sortable = null;

    // Editor State
    let activePage = null;
    let activeElement = null;
    let overlayIdCounter = 0;

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

    function rotatePage(id, diff) {
        const p = pages.find(page => page.id === id);
        if (p) {
            p.rotation = (p.rotation + diff + 360) % 360;
            renderPages();
        }
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
            if (p.rotation) {
                thumb.classList.add(`rotate-${p.rotation}`);
            }

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
            
            // Edit Badge (pencil icon) if the page has text overlays or shapes
            if (p.edits && p.edits.length > 0) {
                const editBadge = document.createElement("span");
                editBadge.className = "page-edit-badge";
                editBadge.title = "Page has text/overlay edits";
                editBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
                info.appendChild(editBadge);
            }

            const label = document.createElement("span");
            label.className = "page-label";
            label.textContent = p.label;
            label.title = p.label;
            const num = document.createElement("span");
            num.className = "page-number";
            num.textContent = i + 1;
            info.appendChild(label);
            info.appendChild(num);

            // Hover actions overlay
            const actions = document.createElement("div");
            actions.className = "page-actions";

            const btnRotL = document.createElement("button");
            btnRotL.className = "page-action-btn btn-rotate";
            btnRotL.title = "Rotate counter-clockwise";
            btnRotL.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M2.15 2v6h6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
            btnRotL.addEventListener("click", (e) => { e.stopPropagation(); rotatePage(p.id, -90); });

            const btnRotR = document.createElement("button");
            btnRotR.className = "page-action-btn btn-rotate";
            btnRotR.title = "Rotate clockwise";
            btnRotR.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21.85 2v6h-6M2.66 15.57a10 10 0 1 0 .57-8.38l-5.67-5.67"/></svg>`;
            btnRotR.addEventListener("click", (e) => { e.stopPropagation(); rotatePage(p.id, 90); });

            const btnEdit = document.createElement("button");
            btnEdit.className = "page-action-btn btn-edit";
            btnEdit.title = "Edit page text/redactions";
            btnEdit.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
            btnEdit.addEventListener("click", (e) => { e.stopPropagation(); openEditor(p.id); });

            const btnDel = document.createElement("button");
            btnDel.className = "page-action-btn btn-delete";
            btnDel.title = "Remove page";
            btnDel.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
            btnDel.addEventListener("click", (e) => { e.stopPropagation(); removePage(p.id); });

            actions.appendChild(btnRotL);
            actions.appendChild(btnRotR);
            actions.appendChild(btnEdit);
            actions.appendChild(btnDel);

            card.appendChild(actions);
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
                width: viewport.width,
                height: viewport.height,
                rotation: 0,
                edits: []
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
            width: 595.28,
            height: 841.89,
            rotation: 0,
            edits: []
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
            width: 595.28,
            height: 841.89,
            rotation: 0,
            edits: []
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

    // Helper to convert hex to RGB for pdf-lib
    function hexToRgb(hex) {
        const cleanHex = hex.replace("#", "");
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
        const { rgb } = PDFLib;
        return rgb(r, g, b);
    }

    // Helper to compress image arrayBuffer
    async function compressImageBlob(arrayBuf, mimeType, quality, maxDim) {
        const blob = new Blob([arrayBuf], { type: mimeType });
        const dataUrl = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(blob);
        });
        
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
        
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
        }
        
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        return dataUrlToUint8Array(compressedDataUrl);
    }

    // Helper to rasterize PDF page for compression
    async function rasterizePdfPage(pdfBytes, pageIndex, quality, scale) {
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
        const page = await pdf.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const imgDataUrl = canvas.toDataURL("image/jpeg", quality);
        return dataUrlToUint8Array(imgDataUrl);
    }

    // Helper to apply edits and rotation to a page
    async function applyEditsAndRotation(page, p, mergedPdf, fontCache) {
        const { degrees, StandardFonts, rgb } = PDFLib;
        const W = page.getWidth();
        const H = page.getHeight();

        // 1. Apply Edits
        if (p.edits && p.edits.length > 0) {
            for (const edit of p.edits) {
                const x = (edit.x_pct / 100) * W;
                const y_top = (edit.y_pct / 100) * H;
                
                if (edit.type === "shape") {
                    const w = (edit.w_pct / 100) * W;
                    const h = (edit.h_pct / 100) * H;
                    const pdf_x = x;
                    const pdf_y = H - y_top - h;
                    
                    let fillCol = rgb(1, 1, 1); // white
                    let opacity = 1.0;
                    
                    if (edit.fillType === "black") {
                        fillCol = rgb(0, 0, 0);
                    } else if (edit.fillType === "highlight") {
                        fillCol = rgb(1, 1, 0);
                        opacity = 0.45;
                    }
                    
                    page.drawRectangle({
                        x: pdf_x,
                        y: pdf_y,
                        width: w,
                        height: h,
                        color: fillCol,
                        opacity: opacity,
                    });
                } else if (edit.type === "text") {
                    let fontName = StandardFonts.Helvetica;
                    if (edit.fontFamily === "TimesRoman") fontName = StandardFonts.TimesRoman;
                    if (edit.fontFamily === "Courier") fontName = StandardFonts.Courier;
                    
                    if (!fontCache[fontName]) {
                        fontCache[fontName] = await mergedPdf.embedFont(fontName);
                    }
                    const embeddedFont = fontCache[fontName];
                    const textCol = hexToRgb(edit.color || "#000000");
                    
                    // Scale font size from HTML editor dimensions to PDF points
                    const workspaceHeight = p.editWorkspaceHeight || 600;
                    const pdf_font_size = (edit.fontSize / workspaceHeight) * H;
                    
                    const lines = edit.text.split("\n");
                    const lineHeight = pdf_font_size * 1.25;
                    
                    const pdf_x = x;
                    const start_pdf_y = H - y_top - pdf_font_size;
                    
                    for (let l = 0; l < lines.length; l++) {
                        page.drawText(lines[l], {
                            x: pdf_x,
                            y: start_pdf_y - l * lineHeight,
                            size: pdf_font_size,
                            font: embeddedFont,
                            color: textCol,
                        });
                    }
                }
            }
        }

        // 2. Apply Rotation
        if (p.rotation) {
            let currentRotation = 0;
            try {
                currentRotation = page.getRotation().angle;
            } catch (e) {}
            page.setRotation(degrees((currentRotation + p.rotation) % 360));
        }
    }

    async function makePdf() {
        if (!pages.length) return;

        const filename = (filenameInput.value.trim() || "my-document") + ".pdf";
        showOverlay("Building your PDF…");

        try {
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();
            const fontCache = {};
            const compressionLevel = compressionSelect.value; // 'none', 'medium', 'high'

            for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                overlayText.textContent = `Processing page ${i + 1} of ${pages.length}…`;

                if (p.type === "pdf-page") {
                    if (compressionLevel === "none") {
                        const srcDoc = await PDFDocument.load(p.pdfBytes);
                        const [copiedPage] = await mergedPdf.copyPages(srcDoc, [p.pageIndex]);
                        await applyEditsAndRotation(copiedPage, p, mergedPdf, fontCache);
                        mergedPdf.addPage(copiedPage);
                    } else {
                        // Compress by rasterizing PDF page to compressed JPEG
                        const scale = compressionLevel === "medium" ? 1.8 : 1.1;
                        const quality = compressionLevel === "medium" ? 0.75 : 0.50;
                        const imgBytes = await rasterizePdfPage(p.pdfBytes, p.pageIndex, quality, scale);
                        const embeddedImg = await mergedPdf.embedJpg(imgBytes);
                        
                        const page = mergedPdf.addPage([p.width, p.height]);
                        page.drawImage(embeddedImg, {
                            x: 0,
                            y: 0,
                            width: p.width,
                            height: p.height,
                        });
                        await applyEditsAndRotation(page, p, mergedPdf, fontCache);
                    }

                } else if (p.type === "image") {
                    let embeddedImg;
                    let bytes;
                    
                    if (compressionLevel === "none") {
                        bytes = new Uint8Array(p.blob);
                        if (p.mimeType === "image/png") {
                            embeddedImg = await mergedPdf.embedPng(bytes);
                        } else {
                            embeddedImg = await mergedPdf.embedJpg(bytes);
                        }
                    } else {
                        // Compress image quality and downscale if too large
                        const quality = compressionLevel === "medium" ? 0.75 : 0.50;
                        const maxDim = compressionLevel === "medium" ? 1200 : 800;
                        bytes = await compressImageBlob(p.blob, p.mimeType, quality, maxDim);
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
                    
                    await applyEditsAndRotation(page, p, mergedPdf, fontCache);

                } else if (p.type === "docx") {
                    // Render DOCX HTML to canvas with appropriate compression
                    const quality = compressionLevel === "none" ? 0.9 : (compressionLevel === "medium" ? 0.75 : 0.50);
                    const imgDataUrl = await renderDocxToFullImage(p.htmlContent, quality);
                    const imgBytes = dataUrlToUint8Array(imgDataUrl);
                    const embeddedImg = await mergedPdf.embedJpg(imgBytes);

                    const A4_W = 595.28, A4_H = 841.89;
                    const page = mergedPdf.addPage([A4_W, A4_H]);
                    page.drawImage(embeddedImg, {
                        x: 0, y: 0,
                        width: A4_W,
                        height: A4_H,
                    });
                    
                    await applyEditsAndRotation(page, p, mergedPdf, fontCache);
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

    async function renderDocxToFullImage(html, quality = 0.9) {
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
        return canvas.toDataURL("image/jpeg", quality);
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
    //  Page Text & Overlay Editor Modal
    // ══════════════════════════════════════════════════════════════

    function getFontFamilyCss(fontFamily) {
        if (fontFamily === "TimesRoman") return "'Times New Roman', Times, serif";
        if (fontFamily === "Courier") return "'Courier New', Courier, monospace";
        return "Inter, Helvetica, sans-serif";
    }

    async function openEditor(pageId) {
        const p = pages.find(page => page.id === pageId);
        if (!p) return;
        
        activePage = p;
        activeElement = null;
        
        editorPageLabel.textContent = p.label;
        editorOverlaysLayer.innerHTML = "";
        editorPropertiesPanel.classList.add("hidden");
        editorNoSelection.classList.remove("hidden");
        
        showOverlay("Loading page editor…");
        
        try {
            const aspect = p.width / p.height;
            const workspaceHeight = Math.min(window.innerHeight * 0.65, 600);
            const workspaceWidth = workspaceHeight * aspect;
            
            editorCanvasContainer.style.height = `${workspaceHeight}px`;
            editorCanvasContainer.style.width = `${workspaceWidth}px`;
            
            // Clean previous background content (keep overlays layer)
            Array.from(editorCanvasContainer.children).forEach(child => {
                if (child.id !== "editor-overlays-layer") child.remove();
            });
            
            // Store workspace height on page for scaling edits on compile
            p.editWorkspaceHeight = workspaceHeight;
            
            if (p.type === "pdf-page") {
                const pdf = await pdfjsLib.getDocument({ data: p.pdfBytes.slice(0) }).promise;
                const page = await pdf.getPage(p.pageIndex + 1);
                
                const canvas = document.createElement("canvas");
                const scale = (workspaceHeight * window.devicePixelRatio) / p.height;
                const viewport = page.getViewport({ scale: scale });
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");
                
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                canvas.style.width = "100%";
                canvas.style.height = "100%";
                editorCanvasContainer.insertBefore(canvas, editorOverlaysLayer);
                
            } else if (p.type === "image") {
                const img = document.createElement("img");
                img.src = p.thumbDataUrl;
                img.style.width = "100%";
                img.style.height = "100%";
                editorCanvasContainer.insertBefore(img, editorOverlaysLayer);
                
            } else if (p.type === "docx") {
                const div = document.createElement("div");
                div.className = "docx-preview";
                div.innerHTML = p.htmlContent || "<p>DOCX Document</p>";
                div.style.width = "100%";
                div.style.height = "100%";
                editorCanvasContainer.insertBefore(div, editorOverlaysLayer);
            }
            
            // Render existing edits
            if (!activePage.edits) activePage.edits = [];
            activePage.edits.forEach(edit => renderEditElement(edit));
            
            editorModal.classList.remove("hidden");
        } catch (err) {
            console.error(err);
            showToast("Failed to load editor.", "error");
        } finally {
            hideOverlay();
        }
    }

    function renderEditElement(edit) {
        const el = document.createElement("div");
        el.className = `editor-overlay-item type-${edit.type}`;
        el.dataset.id = edit.id;
        
        el.style.left = `${edit.x_pct}%`;
        el.style.top = `${edit.y_pct}%`;
        el.style.width = edit.w_pct ? `${edit.w_pct}%` : "auto";
        el.style.height = edit.h_pct ? `${edit.h_pct}%` : "auto";
        
        if (edit.type === "text") {
            el.textContent = edit.text || "Double click to edit";
            el.style.fontSize = `${edit.fontSize}px`;
            el.style.fontFamily = getFontFamilyCss(edit.fontFamily);
            el.style.color = edit.color;
        } else if (edit.type === "shape") {
            el.classList.add(`shape-${edit.fillType}`);
            
            const handle = document.createElement("div");
            handle.className = "resize-handle";
            el.appendChild(handle);
        }
        
        setupInteractiveElement(el, edit);
        editorOverlaysLayer.appendChild(el);
    }

    function setupInteractiveElement(el, edit) {
        // Selection on click/mousedown
        el.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("resize-handle")) return;
            e.stopPropagation();
            selectElement(edit, el);
            
            // Dragging
            const containerRect = editorCanvasContainer.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = el.offsetLeft;
            const startTop = el.offsetTop;
            
            function onMouseMove(moveEvt) {
                const deltaX = moveEvt.clientX - startX;
                const deltaY = moveEvt.clientY - startY;
                
                let newLeft = startLeft + deltaX;
                let newTop = startTop + deltaY;
                
                newLeft = Math.max(0, Math.min(newLeft, containerRect.width - el.offsetWidth));
                newTop = Math.max(0, Math.min(newTop, containerRect.height - el.offsetHeight));
                
                el.style.left = `${newLeft}px`;
                el.style.top = `${newTop}px`;
                
                edit.x_pct = (newLeft / containerRect.width) * 100;
                edit.y_pct = (newTop / containerRect.height) * 100;
            }
            
            function onMouseUp() {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            }
            
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });

        // Touch support for dragging
        el.addEventListener("touchstart", (e) => {
            if (e.target.classList.contains("resize-handle")) return;
            e.stopPropagation();
            selectElement(edit, el);
            
            const touch = e.touches[0];
            const containerRect = editorCanvasContainer.getBoundingClientRect();
            const startX = touch.clientX;
            const startY = touch.clientY;
            const startLeft = el.offsetLeft;
            const startTop = el.offsetTop;
            
            function onTouchMove(moveEvt) {
                const moveTouch = moveEvt.touches[0];
                const deltaX = moveTouch.clientX - startX;
                const deltaY = moveTouch.clientY - startY;
                
                let newLeft = startLeft + deltaX;
                let newTop = startTop + deltaY;
                
                newLeft = Math.max(0, Math.min(newLeft, containerRect.width - el.offsetWidth));
                newTop = Math.max(0, Math.min(newTop, containerRect.height - el.offsetHeight));
                
                el.style.left = `${newLeft}px`;
                el.style.top = `${newTop}px`;
                
                edit.x_pct = (newLeft / containerRect.width) * 100;
                edit.y_pct = (newTop / containerRect.height) * 100;
            }
            
            function onTouchEnd() {
                document.removeEventListener("touchmove", onTouchMove);
                document.removeEventListener("touchend", onTouchEnd);
            }
            
            document.addEventListener("touchmove", onTouchMove, { passive: true });
            document.addEventListener("touchend", onTouchEnd);
        });
        
        // Shape resizer
        if (edit.type === "shape") {
            const handle = el.querySelector(".resize-handle");
            
            const startResize = (clientX, clientY) => {
                const containerRect = editorCanvasContainer.getBoundingClientRect();
                const startWidth = el.offsetWidth;
                const startHeight = el.offsetHeight;
                const startX = clientX;
                const startY = clientY;
                
                const onResizeMove = (moveEvt) => {
                    const currentX = moveEvt.touches ? moveEvt.touches[0].clientX : moveEvt.clientX;
                    const currentY = moveEvt.touches ? moveEvt.touches[0].clientY : moveEvt.clientY;
                    
                    const deltaX = currentX - startX;
                    const deltaY = currentY - startY;
                    
                    let newWidth = startWidth + deltaX;
                    let newHeight = startHeight + deltaY;
                    
                    newWidth = Math.max(15, Math.min(newWidth, containerRect.width - el.offsetLeft));
                    newHeight = Math.max(15, Math.min(newHeight, containerRect.height - el.offsetTop));
                    
                    el.style.width = `${newWidth}px`;
                    el.style.height = `${newHeight}px`;
                    
                    edit.w_pct = (newWidth / containerRect.width) * 100;
                    edit.h_pct = (newHeight / containerRect.height) * 100;
                };
                
                const onResizeUp = () => {
                    document.removeEventListener("mousemove", onResizeMove);
                    document.removeEventListener("mouseup", onResizeUp);
                    document.removeEventListener("touchmove", onResizeMove);
                    document.removeEventListener("touchend", onResizeUp);
                };
                
                document.addEventListener("mousemove", onResizeMove);
                document.addEventListener("mouseup", onResizeUp);
                document.addEventListener("touchmove", onResizeMove, { passive: true });
                document.addEventListener("touchend", onResizeUp);
            };
            
            handle.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                startResize(e.clientX, e.clientY);
            });
            
            handle.addEventListener("touchstart", (e) => {
                e.stopPropagation();
                const touch = e.touches[0];
                startResize(touch.clientX, touch.clientY);
            }, { passive: true });
        }
    }

    function selectElement(edit, el) {
        activeElement = edit;
        
        editorOverlaysLayer.querySelectorAll(".editor-overlay-item").forEach(item => {
            item.classList.remove("selected");
        });
        el.classList.add("selected");
        
        editorNoSelection.classList.add("hidden");
        editorPropertiesPanel.classList.remove("hidden");
        
        if (edit.type === "text") {
            propTextGroup.classList.remove("hidden");
            propShapeGroup.classList.add("hidden");
            
            propTextInput.value = edit.text || "";
            propFontFamily.value = edit.fontFamily || "Helvetica";
            propFontSize.value = edit.fontSize || 16;
            propFontSizeVal.textContent = edit.fontSize || 16;
            
            colorSwatches.forEach(swatch => {
                if (swatch.dataset.color === edit.color) {
                    swatch.classList.add("active");
                } else {
                    swatch.classList.remove("active");
                }
            });
        } else if (edit.type === "shape") {
            propTextGroup.classList.add("hidden");
            propShapeGroup.classList.remove("hidden");
            propShapeType.value = edit.fillType || "white";
        }
    }

    // Editor control event listeners
    editorBtnAddText.addEventListener("click", () => {
        if (!activePage) return;
        
        const newEdit = {
            id: ++overlayIdCounter,
            type: "text",
            x_pct: 10,
            y_pct: 10,
            w_pct: null,
            h_pct: null,
            text: "Text here",
            fontSize: 16,
            fontFamily: "Helvetica",
            color: "#000000"
        };
        
        activePage.edits.push(newEdit);
        renderEditElement(newEdit);
        
        const el = editorOverlaysLayer.querySelector(`[data-id="${newEdit.id}"]`);
        if (el) selectElement(newEdit, el);
    });

    editorBtnAddShape.addEventListener("click", () => {
        if (!activePage) return;
        
        const newEdit = {
            id: ++overlayIdCounter,
            type: "shape",
            x_pct: 20,
            y_pct: 20,
            w_pct: 25,
            h_pct: 10,
            fillType: "white"
        };
        
        activePage.edits.push(newEdit);
        renderEditElement(newEdit);
        
        const el = editorOverlaysLayer.querySelector(`[data-id="${newEdit.id}"]`);
        if (el) selectElement(newEdit, el);
    });

    propTextInput.addEventListener("input", () => {
        if (activeElement && activeElement.type === "text") {
            activeElement.text = propTextInput.value;
            const el = editorOverlaysLayer.querySelector(`[data-id="${activeElement.id}"]`);
            if (el) el.textContent = propTextInput.value || " ";
        }
    });

    propFontFamily.addEventListener("change", () => {
        if (activeElement && activeElement.type === "text") {
            activeElement.fontFamily = propFontFamily.value;
            const el = editorOverlaysLayer.querySelector(`[data-id="${activeElement.id}"]`);
            if (el) el.style.fontFamily = getFontFamilyCss(activeElement.fontFamily);
        }
    });

    propFontSize.addEventListener("input", () => {
        if (activeElement && activeElement.type === "text") {
            const sz = parseInt(propFontSize.value, 10);
            activeElement.fontSize = sz;
            propFontSizeVal.textContent = sz;
            const el = editorOverlaysLayer.querySelector(`[data-id="${activeElement.id}"]`);
            if (el) el.style.fontSize = `${sz}px`;
        }
    });

    colorSwatches.forEach(swatch => {
        swatch.addEventListener("click", () => {
            if (activeElement && activeElement.type === "text") {
                colorSwatches.forEach(s => s.classList.remove("active"));
                swatch.classList.add("active");
                
                const color = swatch.dataset.color;
                activeElement.color = color;
                const el = editorOverlaysLayer.querySelector(`[data-id="${activeElement.id}"]`);
                if (el) el.style.color = color;
            }
        });
    });

    propShapeType.addEventListener("change", () => {
        if (activeElement && activeElement.type === "shape") {
            const prevType = activeElement.fillType;
            const newType = propShapeType.value;
            activeElement.fillType = newType;
            
            const el = editorOverlaysLayer.querySelector(`[data-id="${activeElement.id}"]`);
            if (el) {
                el.classList.remove(`shape-${prevType}`);
                el.classList.add(`shape-${newType}`);
            }
        }
    });

    editorBtnDeleteEl.addEventListener("click", () => {
        if (activeElement && activePage) {
            activePage.edits = activePage.edits.filter(item => item.id !== activeElement.id);
            const el = editorOverlaysLayer.querySelector(`[data-id="${activeElement.id}"]`);
            if (el) el.remove();
            
            activeElement = null;
            editorPropertiesPanel.classList.add("hidden");
            editorNoSelection.classList.remove("hidden");
        }
    });

    editorCloseBtn.addEventListener("click", () => {
        editorModal.classList.add("hidden");
        activePage = null;
        activeElement = null;
    });

    editorDoneBtn.addEventListener("click", () => {
        editorModal.classList.add("hidden");
        activePage = null;
        activeElement = null;
        renderPages();
    });

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
