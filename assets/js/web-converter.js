// web-converter.js — 纯前端本地 GIF 制作与调参引擎 (零服务器成本，支持视频转GIF与多张图片拼GIF)
(function() {
  console.log("GIF Maker Web Converter Initializing...");

  let currentMode = "video"; // "video" | "images"
  let currentVideoFile = null;
  let videoBlobUrl = null;
  let videoDuration = 0;
  let videoWidth = 0;
  let videoHeight = 0;

  let imageFiles = []; // 存储上传的图片 dataURL 列表
  let isGenerating = false;

  function initUI() {
    const appContainer = document.getElementById("web-gif-studio");
    if (!appContainer) return;

    // 模式切换 Tab
    const tabVideo = document.getElementById("tab-mode-video");
    const tabImages = document.getElementById("tab-mode-images");

    // 绑定元素
    const dropzone = document.getElementById("studio-dropzone");
    const fileInput = document.getElementById("studio-file-input");
    const dropTextTitle = document.getElementById("drop-title");
    const dropTextSub = document.getElementById("drop-sub");

    const workspaceVideo = document.getElementById("studio-workspace");
    const workspaceImages = document.getElementById("studio-workspace-images");
    const imgListContainer = document.getElementById("studio-img-list");
    const addMoreImgsBtn = document.getElementById("studio-btn-add-more");
    const imgDelayInput = document.getElementById("studio-img-delay");

    const previewVideo = document.getElementById("studio-video");
    const trimStartInput = document.getElementById("studio-trim-start");
    const trimEndInput = document.getElementById("studio-trim-end");
    const startValDisplay = document.getElementById("studio-start-val");
    const endValDisplay = document.getElementById("studio-end-val");
    const durationDisplay = document.getElementById("studio-duration-val");

    const fpsSelect = document.getElementById("studio-fps");
    const resSelect = document.getElementById("studio-resolution");
    const speedSelect = document.getElementById("studio-speed");
    const reverseCheck = document.getElementById("studio-reverse");
    const boomerangCheck = document.getElementById("studio-boomerang");

    const btnGenerate = document.getElementById("studio-btn-generate");
    const progressBox = document.getElementById("studio-progress-box");
    const progressBar = document.getElementById("studio-progress-bar");
    const progressText = document.getElementById("studio-progress-text");

    const resultBox = document.getElementById("studio-result-box");
    const resultImg = document.getElementById("studio-result-img");
    const resultSize = document.getElementById("studio-result-size");
    const btnDownload = document.getElementById("studio-btn-download");
    const btnReset = document.getElementById("studio-btn-reset");
    const btnResetImgs = document.getElementById("studio-btn-reset-imgs");

    // Tab 切换逻辑
    function switchMode(mode) {
      currentMode = mode;
      resetAll();
      if (mode === "video") {
        tabVideo.className = "px-4 py-1.5 rounded-full text-xs font-bold transition-all bg-primary text-white shadow-sm";
        tabImages.className = "px-4 py-1.5 rounded-full text-xs font-semibold text-gray-600 hover:text-gray-900 transition-all";
        fileInput.accept = "video/*";
        fileInput.removeAttribute("multiple");
        if (dropTextTitle) dropTextTitle.textContent = "选择或拖拽视频到这里";
        if (dropTextSub) dropTextSub.textContent = "支持 MP4、MOV、WebM，100% 浏览器本地离线转换，不消耗流量";
      } else {
        tabImages.className = "px-4 py-1.5 rounded-full text-xs font-bold transition-all bg-primary text-white shadow-sm";
        tabVideo.className = "px-4 py-1.5 rounded-full text-xs font-semibold text-gray-600 hover:text-gray-900 transition-all";
        fileInput.accept = "image/*";
        fileInput.setAttribute("multiple", "multiple");
        if (dropTextTitle) dropTextTitle.textContent = "选择多张照片制作动态图";
        if (dropTextSub) dropTextSub.textContent = "支持选择 2~50 张照片（JPG、PNG、WEBP），按顺序合成连环画动图";
      }
    }

    if (tabVideo) tabVideo.addEventListener("click", () => switchMode("video"));
    if (tabImages) tabImages.addEventListener("click", () => switchMode("images"));

    // 上传与拖拽
    dropzone.addEventListener("click", () => fileInput.click());
    if (addMoreImgsBtn) addMoreImgsBtn.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("border-primary", "bg-primary/5");
    });
    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropzone.classList.remove("border-primary", "bg-primary/5");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("border-primary", "bg-primary/5");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
      }
    });

    function handleFiles(files) {
      if (currentMode === "video") {
        const file = files[0];
        if (!file.type.startsWith("video/")) {
          alert("当前为视频模式，请上传视频文件（或点击上方切换为「多图拼动图」）");
          return;
        }
        currentVideoFile = file;
        if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
        videoBlobUrl = URL.createObjectURL(file);
        previewVideo.src = videoBlobUrl;

        previewVideo.onloadedmetadata = function() {
          videoDuration = previewVideo.duration;
          videoWidth = previewVideo.videoWidth;
          videoHeight = previewVideo.videoHeight;

          trimStartInput.min = "0";
          trimStartInput.max = videoDuration.toString();
          trimStartInput.value = "0";

          const defaultEnd = Math.min(5, videoDuration);
          trimEndInput.min = "0";
          trimEndInput.max = videoDuration.toString();
          trimEndInput.value = defaultEnd.toString();

          updateTrimDisplay();

          dropzone.classList.add("hidden");
          workspaceVideo.classList.remove("hidden");
          workspaceImages.classList.add("hidden");
          resultBox.classList.add("hidden");
        };
      } else {
        // 多图模式
        const imgFiles = files.filter(f => f.type.startsWith("image/"));
        if (imgFiles.length === 0) {
          alert("请选择图片格式文件（JPG、PNG 等）");
          return;
        }
        
        let loaded = 0;
        imgFiles.forEach(f => {
          const reader = new FileReader();
          reader.onload = function(evt) {
            imageFiles.push(evt.target.result);
            loaded++;
            if (loaded === imgFiles.length) {
              renderImageList();
              dropzone.classList.add("hidden");
              workspaceImages.classList.remove("hidden");
              workspaceVideo.classList.add("hidden");
              resultBox.classList.add("hidden");
            }
          };
          reader.readAsDataURL(f);
        });
      }
    }

    function renderImageList() {
      imgListContainer.innerHTML = "";
      imageFiles.forEach((src, idx) => {
        const item = document.createElement("div");
        item.className = "relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-100 aspect-square flex items-center justify-center";
        item.innerHTML = `
          <img src="${src}" class="w-full h-full object-cover" />
          <span class="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">#${idx+1}</span>
          <button type="button" data-idx="${idx}" class="btn-del-img absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">×</button>
        `;
        imgListContainer.appendChild(item);
      });

      // 删除单张
      imgListContainer.querySelectorAll(".btn-del-img").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute("data-idx"));
          imageFiles.splice(idx, 1);
          if (imageFiles.length === 0) {
            resetAll();
          } else {
            renderImageList();
          }
        });
      });
    }

    function updateTrimDisplay() {
      let start = parseFloat(trimStartInput.value) || 0;
      let end = parseFloat(trimEndInput.value) || 0;
      if (start >= end) {
        start = Math.max(0, end - 0.2);
        trimStartInput.value = start.toFixed(1);
      }
      startValDisplay.textContent = start.toFixed(1) + "s";
      endValDisplay.textContent = end.toFixed(1) + "s";
      durationDisplay.textContent = (end - start).toFixed(1) + "s";
    }

    trimStartInput.addEventListener("input", () => {
      updateTrimDisplay();
      previewVideo.currentTime = parseFloat(trimStartInput.value);
    });

    trimEndInput.addEventListener("input", () => {
      updateTrimDisplay();
      previewVideo.currentTime = parseFloat(trimEndInput.value);
    });

    function resetAll() {
      workspaceVideo.classList.add("hidden");
      workspaceImages.classList.add("hidden");
      resultBox.classList.add("hidden");
      dropzone.classList.remove("hidden");
      fileInput.value = "";
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
      videoBlobUrl = null;
      currentVideoFile = null;
      imageFiles = [];
    }

    btnReset.addEventListener("click", resetAll);
    if (btnResetImgs) btnResetImgs.addEventListener("click", resetAll);

    // 核心转换触发
    btnGenerate.addEventListener("click", async () => {
      if (isGenerating) return;
      isGenerating = true;

      btnGenerate.disabled = true;
      btnGenerate.classList.add("opacity-50", "cursor-not-allowed");
      progressBox.classList.remove("hidden");
      progressBar.style.width = "10%";

      if (currentMode === "video") {
        if (!currentVideoFile) return;
        progressText.textContent = "正在精准解码视频帧...";

        const startTime = parseFloat(trimStartInput.value);
        const endTime = parseFloat(trimEndInput.value);
        const targetDuration = endTime - startTime;
        const fps = parseInt(fpsSelect.value) || 10;
        const resVal = resSelect.value;
        const speed = parseFloat(speedSelect.value) || 1.0;
        const isReverse = reverseCheck.checked;
        const isBoomerang = boomerangCheck.checked;

        let targetWidth = 360;
        if (resVal === "240") targetWidth = 240;
        else if (resVal === "480") targetWidth = 480;
        else if (resVal === "original") targetWidth = Math.min(640, videoWidth);

        const targetHeight = Math.round((targetWidth / videoWidth) * videoHeight);
        const totalFrames = Math.max(3, Math.round(targetDuration * fps));

        try {
          const frames = await captureFrames(videoBlobUrl, startTime, endTime, totalFrames, targetWidth, targetHeight, (p) => {
            const percent = Math.round(p * 50);
            progressBar.style.width = percent + "%";
            progressText.textContent = `提取视频关键帧: ${percent * 2}%`;
          });

          progressText.textContent = "正在处理动效与序列 (Boomerang / 倒放)...";
          progressBar.style.width = "60%";

          let finalFrames = frames;
          if (isReverse) {
            finalFrames = [...frames].reverse();
          } else if (isBoomerang) {
            const revCopy = [...frames].slice(1, -1).reverse();
            finalFrames = frames.concat(revCopy);
          }

          const frameIntervalSeconds = (1 / fps) / speed;
          encodeGif(finalFrames, targetWidth, targetHeight, frameIntervalSeconds);
        } catch (err) {
          alert("处理视频出错: " + err.message);
          finishGenerating();
        }

      } else {
        // 多图生成 GIF
        if (imageFiles.length < 2) {
          alert("至少需要上传 2 张图片才能制作动态图！");
          finishGenerating();
          return;
        }

        progressText.textContent = "正在加载并规范化图片尺寸...";
        progressBar.style.width = "30%";

        const delay = parseFloat(imgDelayInput ? imgDelayInput.value : 0.5) || 0.5;
        const resVal = resSelect.value;
        let targetWidth = 360;
        if (resVal === "240") targetWidth = 240;
        else if (resVal === "480") targetWidth = 480;

        try {
          const normalizedFrames = await normalizeImages(imageFiles, targetWidth);
          let finalFrames = normalizedFrames;
          if (reverseCheck.checked) {
            finalFrames = [...normalizedFrames].reverse();
          } else if (boomerangCheck.checked) {
            const revCopy = [...normalizedFrames].slice(1, -1).reverse();
            finalFrames = normalizedFrames.concat(revCopy);
          }

          encodeGif(finalFrames, targetWidth, targetWidth, delay);
        } catch (err) {
          alert("处理图片出错: " + err.message);
          finishGenerating();
        }
      }
    });

    function encodeGif(frames, w, h, interval) {
      progressText.textContent = "正在进行本地调色板色彩量化与 GIF 渲染...";
      progressBar.style.width = "75%";

      window.gifshot.createGIF({
        images: frames,
        gifWidth: w,
        gifHeight: h,
        interval: interval,
        numWorkers: 2,
        progressCallback: function(captureProgress) {
          const p = 75 + Math.round(captureProgress * 23);
          progressBar.style.width = p + "%";
          progressText.textContent = `生成 GIF 渲染包: ${p}%`;
        }
      }, function(obj) {
        finishGenerating();
        if (!obj.error) {
          const imageBase64 = obj.image;
          resultImg.src = imageBase64;

          const sizeInBytes = Math.round((imageBase64.length - 22) * 3 / 4);
          const sizeInKb = (sizeInBytes / 1024).toFixed(1);
          resultSize.textContent = sizeInKb > 1024 ? (sizeInKb / 1024).toFixed(2) + " MB" : sizeInKb + " KB";

          btnDownload.onclick = function() {
            const a = document.createElement("a");
            a.href = imageBase64;
            a.download = "custom-animated.gif";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          };

          resultBox.classList.remove("hidden");
          resultBox.scrollIntoView({ behavior: "smooth" });
        } else {
          alert("GIF 生成失败: " + obj.error);
        }
      });
    }

    function finishGenerating() {
      isGenerating = false;
      btnGenerate.disabled = false;
      btnGenerate.classList.remove("opacity-50", "cursor-not-allowed");
      progressBox.classList.add("hidden");
    }

    // 规范化图片尺寸为统一宽高画布
    function normalizeImages(imgs, targetW) {
      return Promise.all(imgs.map(src => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetW;
            const ctx = canvas.getContext("2d");
            // 白色底
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, targetW, targetW);

            // 保持比例居中绘制
            const scale = Math.min(targetW / img.width, targetW / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (targetW - w) / 2;
            const y = (targetW - h) / 2;
            ctx.drawImage(img, x, y, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.9));
          };
          img.src = src;
        });
      }));
    }

    // 离屏 Canvas 精准抓取视频逐帧
    function captureFrames(videoUrl, start, end, numFrames, w, h, onProgress) {
      return new Promise((resolve, reject) => {
        const offVideo = document.createElement("video");
        offVideo.src = videoUrl;
        offVideo.muted = true;
        offVideo.playsInline = true;
        offVideo.crossOrigin = "anonymous";

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");

        const frames = [];
        let currentIndex = 0;
        const duration = end - start;
        const step = duration / (numFrames - 1 || 1);

        offVideo.onloadeddata = function() {
          seekNextFrame();
        };

        function seekNextFrame() {
          if (currentIndex >= numFrames) {
            resolve(frames);
            return;
          }
          const targetTime = start + (currentIndex * step);
          offVideo.currentTime = Math.min(targetTime, end);
        }

        offVideo.onseeked = function() {
          ctx.drawImage(offVideo, 0, 0, w, h);
          frames.push(canvas.toDataURL("image/jpeg", 0.85));
          currentIndex++;
          if (onProgress) onProgress(currentIndex / numFrames);
          seekNextFrame();
        };

        offVideo.onerror = function() {
          reject(new Error("视频解码异常"));
        };
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }
})();
