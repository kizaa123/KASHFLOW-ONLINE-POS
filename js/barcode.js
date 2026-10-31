/* Camera + typed barcode capture. Used on Products (save the real code) and POS (add to the order). */
(function () {
  window.KFUI = window.KFUI || {};
  const ZXING_SRC = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'itf', 'qr_code'];

  let overlay = null;
  let inlineHost = null;
  let stream = null;
  let raf = 0;
  let zxing = null;
  let zxingReader = null;
  let detector = null;
  let closed = true;
  let activeScanOpts = null;
  let lastCode = '';
  let lastAt = 0;
  let zxingPromise = null;
  let canvas = null;
  let ctx = null;
  let torchOn = false;

  function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (zxingPromise) return zxingPromise;
    zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = ZXING_SRC;
      s.async = true;
      s.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error('Scanner library failed to load.')));
      s.onerror = () => {
        zxingPromise = null;
        reject(new Error('Could not load the scanner library. Type the barcode or use a USB scanner.'));
      };
      document.head.appendChild(s);
    });
    return zxingPromise;
  }

  let audioCtx = null;
  function scanAudio() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try { audioCtx = new Ctx(); } catch (e) { audioCtx = null; }
    return audioCtx;
  }

  function playScanTone(kind) {
    const ctx = scanAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (kind === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.setValueAtTime(1175, t0 + 0.07);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      osc.start(t0);
      osc.stop(t0 + 0.15);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.setValueAtTime(165, t0 + 0.1);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    }
  }

  function stopStream() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (zxing) {
      try { zxing.reset(); } catch (e) { /* ignore */ }
      zxing = null;
    }
    zxingReader = null;
    detector = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    canvas = null;
    ctx = null;
    torchOn = false;
  }

  function onEsc(e) {
    if (e.key === 'Escape' && overlay) {
      e.preventDefault();
      e.stopPropagation();
      closeScanner();
    }
  }

  function closeScanner() {
    closed = true;
    stopStream();
    document.removeEventListener('keydown', onEsc, true);
    if (inlineHost) {
      inlineHost.innerHTML = '';
      inlineHost.hidden = true;
      inlineHost.setAttribute('aria-hidden', 'true');
      inlineHost = null;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.body.classList.remove('scan-lock');
    const done = activeScanOpts;
    activeScanOpts = null;
    if (done && typeof done.onClose === 'function') done.onClose();
  }

  function emit(code, opts) {
    const cleaned = KF.barcodeKey(code);
    if (!cleaned) return;
    const now = Date.now();
    const dedupeMs = typeof opts.dedupeMs === 'number'
      ? opts.dedupeMs
      : (opts.continuous ? 5000 : 900);
    if (cleaned === lastCode && now - lastAt < dedupeMs) {
      playScanTone('error');
      return;
    }
    lastCode = cleaned;
    lastAt = now;
    let ok = true;
    if (typeof opts.onCode === 'function') {
      const result = opts.onCode(String(code).trim());
      ok = result !== false;
    }
    playScanTone(ok ? 'success' : 'error');
    if (!opts.continuous) closeScanner();
  }

  function zxingHints() {
    const hints = new Map();
    const T = window.ZXing && ZXing.DecodeHintType;
    const F = window.ZXing && ZXing.BarcodeFormat;
    if (!T) return hints;
    if (T.TRY_HARDER) hints.set(T.TRY_HARDER, true);
    if (T.ALSO_INVERTED) hints.set(T.ALSO_INVERTED, true);
    if (T.ASSUME_GS1) hints.set(T.ASSUME_GS1, true);
    if (T.PURE_BARCODE) hints.set(T.PURE_BARCODE, true);
    if (T.POSSIBLE_FORMATS && F) {
      hints.set(T.POSSIBLE_FORMATS, [
        F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39,
        F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX, F.RSS_14, F.RSS_EXPANDED,
      ].filter(Boolean));
    }
    return hints;
  }

  function decodeWithZXing(sourceCanvas) {
    if (!window.ZXing || !zxingReader) return '';
    try {
      if (ZXing.HTMLCanvasElementLuminanceSource && ZXing.HybridBinarizer && ZXing.BinaryBitmap) {
        try { zxingReader.reset(); } catch (e) { /* ignore */ }
        zxingReader.setHints(zxingHints());
        const src = new ZXing.HTMLCanvasElementLuminanceSource(sourceCanvas);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
        const result = zxingReader.decode(bitmap);
        if (result && result.getText) return result.getText();
      }
    } catch (e) { /* not found this frame */ }
    return '';
  }

  async function detectOnSource(source) {
    if (!detector || !source) return '';
    try {
      const codes = await detector.detect(source);
      if (codes && codes.length) {
        const best = codes.find((c) => c.rawValue) || codes[0];
        if (best && best.rawValue) return best.rawValue;
      }
    } catch (e) { /* next */ }
    return '';
  }

  async function grabCode(video) {
    if (video.readyState < 2) return '';
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw < 32 || vh < 32) return '';

    const fromVideo = await detectOnSource(video);
    if (fromVideo) return fromVideo;

    if (!canvas) {
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    }

    const readCanvas = async () => {
      let code = await detectOnSource(canvas);
      if (code) return code;
      const fromZxing = decodeWithZXing(canvas);
      if (fromZxing) return fromZxing;
      if (zxing && typeof zxing.decodeFromCanvas === 'function') {
        try {
          const result = await zxing.decodeFromCanvas(canvas);
          if (result && result.getText()) return result.getText();
        } catch (e) { /* next */ }
      }
      return '';
    };

    const crops = [
      { w: 0.96, h: 0.58, y: 0.5 },
      { w: 0.88, h: 0.42, y: 0.5 },
      { w: 1, h: 1, y: 0.5 },
    ];
    const filters = [
      'grayscale(1) contrast(1.85) brightness(1.1) saturate(0)',
      'grayscale(1) contrast(2.05) brightness(1.14) saturate(0)',
      'grayscale(1) contrast(1.7) brightness(1.08) invert(1)',
      'grayscale(1) contrast(2.2) brightness(1.18) saturate(0)',
    ];
    const maxW = 1920;

    for (const crop of crops) {
      const cropW = vw * crop.w;
      const cropH = vh * crop.h;
      const sx = (vw - cropW) / 2;
      const sy = (vh * crop.y) - cropH / 2;
      const scale = Math.min(1.35, maxW / cropW);
      canvas.width = Math.max(360, Math.round(cropW * scale));
      canvas.height = Math.max(140, Math.round(cropH * scale));
      for (const filter of filters) {
        ctx.filter = filter;
        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
        const code = await readCanvas();
        if (code) return code;
      }
    }
    return '';
  }

  async function detectLoop(video, opts) {
    let busy = false;
    const tick = async () => {
      if (closed) return;
      if (!busy) {
        busy = true;
        try {
          const code = await grabCode(video);
          if (!closed && code) emit(code, opts);
        } catch (e) { /* keep trying */ }
        busy = false;
      }
      if (!closed) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  async function decodePhoto(file, opts, statusEl) {
    if (!file) return;
    statusEl.textContent = 'Reading photo…';
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
      if ('BarcodeDetector' in window) {
        try {
          const bmp = await createImageBitmap(img);
          const detector = new BarcodeDetector({ formats: FORMATS });
          const codes = await detector.detect(bmp);
          bmp.close();
          if (codes && codes[0] && codes[0].rawValue) {
            emit(codes[0].rawValue, opts);
            return;
          }
        } catch (e) { /* try ZXing */ }
      }
      const ZXing = await loadZXing();
      const reader = new ZXing.BrowserMultiFormatReader();
      const result = typeof reader.decodeFromImageUrl === 'function'
        ? await reader.decodeFromImageUrl(url)
        : await reader.decodeFromImageElement(img);
      if (result && result.getText()) emit(result.getText(), opts);
      else {
        statusEl.textContent = 'No barcode found in that photo. Try again or type it.';
        playScanTone('error');
      }
    } catch (e) {
      statusEl.textContent = 'No barcode found in that photo. Try again or type it.';
      playScanTone('error');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function sharpenTrack(track) {
    if (!track || typeof track.getCapabilities !== 'function') return;
    try {
      const caps = track.getCapabilities() || {};
      const advanced = {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) advanced.focusMode = 'continuous';
      else if (caps.focusMode && caps.focusMode.includes('single-shot')) advanced.focusMode = 'single-shot';
      if (caps.exposureMode && caps.exposureMode.includes('continuous')) advanced.exposureMode = 'continuous';
      if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('continuous')) advanced.whiteBalanceMode = 'continuous';
      if (caps.zoom && typeof caps.zoom.min === 'number') {
        const span = (caps.zoom.max || caps.zoom.min) - caps.zoom.min;
        advanced.zoom = caps.zoom.min + span * 0.2;
      }
      if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced] });
    } catch (e) { /* device may ignore */ }
    try { track.contentHint = 'detail'; } catch (e) { /* ignore */ }
  }

  async function startCamera(video, statusEl, opts) {
    if (!window.isSecureContext) {
      statusEl.textContent = 'Camera scanning needs HTTPS. Type the barcode below, or plug in a USB scanner.';
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = 'This device has no camera access. Type the barcode or use a USB scanner.';
      return;
    }

    const zxingReady = loadZXing().catch(() => null);

    const tryStream = (videoOpts) => navigator.mediaDevices.getUserMedia({ audio: false, video: videoOpts });
    try {
      stream = await tryStream({
        facingMode: { ideal: 'environment' },
        width: { min: 640, ideal: 1920, max: 3840 },
        height: { min: 360, ideal: 1080, max: 2160 },
        frameRate: { ideal: 30, max: 60 },
        focusMode: { ideal: 'continuous' },
      });
    } catch (e) {
      try {
        stream = await tryStream({ facingMode: { ideal: 'environment' } });
      } catch (e2) {
        statusEl.textContent = 'Camera was blocked or is in use. Allow the camera, type the barcode, or use a USB scanner.';
        return;
      }
    }

    const track = stream.getVideoTracks()[0];
    await sharpenTrack(track);

    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    video.setAttribute('playsinline', '');
    try { await video.play(); } catch (e) { /* autoplay quirks */ }
    statusEl.textContent = opts.continuous
      ? 'Hold the barcode in the box — it should read as soon as it is sharp.'
      : 'Hold the barcode inside the frame.';

    if ('BarcodeDetector' in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter((f) => supported.includes(f));
        detector = new BarcodeDetector({ formats: formats.length ? formats : undefined });
      } catch (e) { detector = null; }
    }

    const scanRoot = opts.scanRoot || overlay || inlineHost;
    const torchBtn = scanRoot && scanRoot.querySelector('#scanTorchBtn');
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    if (torchBtn && caps.torch) {
      torchBtn.hidden = false;
      torchBtn.addEventListener('click', async () => {
        torchOn = !torchOn;
        try {
          await track.applyConstraints({ advanced: [{ torch: torchOn }] });
          torchBtn.classList.toggle('on', torchOn);
        } catch (e) {
          torchOn = false;
        }
      });
    }

    detectLoop(video, opts);

    zxingReady.then((ZXingLib) => {
      if (closed || !ZXingLib) return;
      if (ZXingLib.MultiFormatReader) {
        try {
          zxingReader = new ZXingLib.MultiFormatReader();
          zxingReader.setHints(zxingHints());
        } catch (e) { zxingReader = null; }
      }
      if (ZXingLib.BrowserMultiFormatReader) {
        try { zxing = new ZXingLib.BrowserMultiFormatReader(zxingHints(), 0); } catch (e) { zxing = null; }
      }
    });
  }

  function buildScanCardHtml(o) {
    return `
      <div class="scan-card">
        <header class="scan-head">
          <h2>${o.title || 'Scan barcode'}</h2>
          <div class="scan-head-actions">
            <button type="button" class="scan-torch" id="scanTorchBtn" hidden title="Torch" aria-label="Toggle torch"><i class="fa-solid fa-bolt"></i></button>
            <button type="button" class="scan-close" aria-label="Close">&times;</button>
          </div>
        </header>
        <div class="scan-video-wrap">
          <video muted playsinline autoplay></video>
          <div class="scan-frame" aria-hidden="true"></div>
          <p class="scan-status">Starting camera…</p>
        </div>
        <div class="scan-manual">
          <label for="scanTyped">Or type the barcode</label>
          <div class="input-with-btn">
            <input id="scanTyped" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. 5449000000996" />
            <button type="button" class="gen-btn" id="scanUseBtn">Use</button>
          </div>
          <button type="button" class="scan-photo-btn" id="scanPhotoBtn"><i class="fa-solid fa-image"></i> Use a photo of the barcode</button>
          <input id="scanPhotoFile" type="file" accept="image/*" capture="environment" hidden />
        </div>
      </div>`;
  }

  function wireScanCard(root, o, inline) {
    const video = root.querySelector('video');
    const statusEl = root.querySelector('.scan-status');
    const typed = root.querySelector('#scanTyped');
    const useBtn = root.querySelector('#scanUseBtn');
    const photoBtn = root.querySelector('#scanPhotoBtn');
    const photoFile = root.querySelector('#scanPhotoFile');

    const useTyped = () => {
      const v = typed.value.trim();
      if (!v) {
        typed.focus();
        playScanTone('error');
        return;
      }
      emit(v, o);
    };

    if (!inline) {
      root.addEventListener('click', (e) => { if (e.target === root) closeScanner(); });
    }
    root.querySelector('.scan-close').addEventListener('click', closeScanner);
    useBtn.addEventListener('click', useTyped);
    typed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); useTyped(); }
    });
    photoBtn.addEventListener('click', () => photoFile.click());
    photoFile.addEventListener('change', () => decodePhoto(photoFile.files[0], o, statusEl));
    document.addEventListener('keydown', onEsc, true);

    startCamera(video, statusEl, { ...o, scanRoot: root });
  }

  KFUI.openScanner = function (opts) {
    const o = opts || {};
    if (overlay || inlineHost) closeScanner();
    activeScanOpts = o;
    closed = false;
    lastCode = '';
    lastAt = 0;

    const inlineSelector = o.inline;
    const inlineEl = inlineSelector
      ? (typeof inlineSelector === 'string' ? document.querySelector(inlineSelector) : inlineSelector)
      : null;

    if (inlineEl) {
      inlineHost = inlineEl;
      inlineHost.hidden = false;
      inlineHost.setAttribute('aria-hidden', 'false');
      inlineHost.innerHTML = buildScanCardHtml(o);
      wireScanCard(inlineHost, o, true);
      return { close: closeScanner };
    }

    overlay = document.createElement('div');
    overlay.className = 'scan-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = buildScanCardHtml(o);
    document.body.appendChild(overlay);
    document.body.classList.add('scan-lock');
    wireScanCard(overlay, o, false);
    return { close: closeScanner };
  };

  KFUI.playScanTone = playScanTone;
  KFUI.unlockScanAudio = function unlockScanAudio() {
    const ctx = scanAudio();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };

  KFUI.closeScanner = closeScanner;
  KFUI.scannerOpen = () => !closed && (!!overlay || !!inlineHost);
})();
