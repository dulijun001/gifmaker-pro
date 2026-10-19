// ios-gifmaker.js — 1:1 像素级复刻 iOS 原生交互与高性能离线动图引擎
(function() {
  'use strict';

  // 状态管理
  const state = {
    sourceType: null, // 'video' | 'burst'
    videoFile: null,
    videoUrl: null,
    videoDuration: 0,
    burstImages: [],
    
    // Trim 范围 (秒)
    trimStart: 0,
    trimEnd: 2.2,
    
    // Settings 参数 (1:1 原版默认)
    fps: 10, // 移动端首选 10 FPS，平衡速度与画质
    resolution: 360, // 移动端默认 360p，保证流畅极速
    speed: 1.0,
    loop: true,
    
    // Advanced 参数
    reverse: false,
    boomerang: false,
    quality: 8,
    
    // 导出结果
    exportBlob: null,
    exportUrl: null,
    exportMetrics: null,
    
    // 本地持久化历史记录
    history: JSON.parse(localStorage.getItem('ios_gifmaker_history') || '[]')
  };

  // DOM 元素引用
  const views = {
    home: document.getElementById('view-home'),
    trim: document.getElementById('view-trim'),
    settings: document.getElementById('view-settings'),
    advanced: document.getElementById('view-advanced'),
    export: document.getElementById('view-export'),
    library: document.getElementById('view-library'),
    pro: document.getElementById('view-pro')
  };

  const navTabs = document.querySelectorAll('.tab-item');
  const fileVideo = document.getElementById('app-file-video');
  const fileImages = document.getElementById('app-file-images');

  // 播放器与时间轴
  const trimVideo = document.getElementById('trim-video-player');
  const previewVideoLoop = document.getElementById('preview-video-loop');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const labelCurTime = document.getElementById('label-current-time');
  const labelTotTime = document.getElementById('label-total-time');
  const labelTrimRange = document.getElementById('label-trim-range');
  const labelTrimDuration = document.getElementById('label-trim-duration');
  const timelineFrames = document.getElementById('timeline-frames');
  const trimHighlight = document.getElementById('trim-highlight');
  const handleLeft = document.getElementById('trim-handle-left');
  const handleRight = document.getElementById('trim-handle-right');

  // 设置界面控件
  const controlFps = document.getElementById('control-fps');
  const sliderSpeed = document.getElementById('slider-speed');
  const lblSpeedVal = document.getElementById('lbl-speed-val');
  const switchLoop = document.getElementById('switch-loop');
  const switchReverse = document.getElementById('switch-reverse');
  const switchBoomerang = document.getElementById('switch-boomerang');
  const sliderQuality = document.getElementById('slider-quality');
  const lblEstSizeHeader = document.getElementById('lbl-est-size-header');

  // 实时指标药丸
  const pillFps = document.getElementById('pill-fps');
  const pillRes = document.getElementById('pill-res');
  const pillSpeed = document.getElementById('pill-speed');
  const pillLoop = document.getElementById('pill-loop');
  const lblLiveFps = document.getElementById('lbl-live-fps');
  const lblLiveRes = document.getElementById('lbl-live-res');
  const lblLiveSpeed = document.getElementById('lbl-live-speed');

  // 导出与指标
  const exportImg = document.getElementById('export-result-img');
  const metricDuration = document.getElementById('metric-duration');
  const metricFps = document.getElementById('metric-fps');
  const metricRes = document.getElementById('metric-res');
  const metricSpeed = document.getElementById('metric-speed');
  const metricLoop = document.getElementById('metric-loop');
  const metricSize = document.getElementById('metric-size');

  // 加载弹窗
  const loadingModal = document.getElementById('loading-modal');
  const loadingBar = document.getElementById('loading-bar');
  const loadingTitle = document.getElementById('loading-title');
  const loadingDesc = document.getElementById('loading-desc');

  // 页面导航切换函数
  function navigateTo(viewName) {
    Object.keys(views).forEach(key => {
      if (views[key]) {
        views[key].classList.toggle('active', key === viewName);
      }
    });

    // 联动底部 Tab 状态
    navTabs.forEach(tab => {
      const tabTarget = tab.dataset.tab;
      if (['home', 'library', 'pro'].includes(viewName)) {
        tab.classList.toggle('active', tabTarget === viewName);
      } else if (['trim', 'settings', 'advanced', 'export'].includes(viewName)) {
        tab.classList.toggle('active', tabTarget === 'home');
      }
    });

    // 处理播放器状态
    if (viewName === 'trim' && trimVideo.src) {
      trimVideo.currentTime = state.trimStart;
      trimVideo.play().catch(() => {});
    } else {
      trimVideo.pause();
    }

    if (viewName === 'settings' && previewVideoLoop.src) {
      syncLivePreview();
    } else {
      previewVideoLoop.pause();
    }

    if (viewName === 'library') {
      renderLibrary();
    }
  }

  // 初始化时间显示
  function updateTimeHeader() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const el = document.getElementById('status-time');
    if (el) el.innerText = `${h}:${m}`;
  }
  setInterval(updateTimeHeader, 1000);
  updateTimeHeader();

  // 绑定底部 Tab 切换
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      navigateTo(target);
    });
  });

  // 首页点击：选择视频
  document.getElementById('card-pick-video').addEventListener('click', () => {
    fileVideo.click();
  });

  // 首页点击：实况照片 / 连拍
  document.getElementById('card-pick-live').addEventListener('click', () => {
    fileVideo.click();
  });

  // 首页点击：挑选连续多张连拍 (Photo Bursts)
  document.getElementById('card-pick-bursts').addEventListener('click', () => {
    fileImages.click();
  });

  // 剪贴板粘贴
  document.getElementById('btn-paste-clipboard').addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            loadBurstFromFiles([blob]);
            return;
          }
        }
      }
      alert('剪贴板中未检测到可用媒体，请直接从相册选取。');
    } catch (e) {
      alert('请直接点击上方卡片从相册选取文件。');
    }
  });

  // 监听视频选入
  fileVideo.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadVideoSource(file);
  });

  // 监听连拍相片选入
  fileImages.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) {
      alert('请至少选择 2 张连续照片以生成 GIF！');
      return;
    }
    loadBurstFromFiles(files);
  });

  // 加载视频源
  function loadVideoSource(file) {
    state.sourceType = 'video';
    state.videoFile = file;
    state.burstImages = [];
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file);

    trimVideo.src = state.videoUrl;
    previewVideoLoop.src = state.videoUrl;

    const onMeta = () => {
      state.videoDuration = trimVideo.duration || 3;
      // 默认截取前 2.2 秒（或总长）
      state.trimStart = 0;
      state.trimEnd = Math.min(2.2, state.videoDuration);
      
      updateTrimDisplay();
      generateTimelineThumbnails();
      navigateTo('trim');
    };

    if (trimVideo.readyState >= 1) {
      onMeta();
    } else {
      trimVideo.onloadedmetadata = onMeta;
    }
  }

  // 加载连拍图片源 (Bursts)
  function loadBurstFromFiles(files) {
    state.sourceType = 'burst';
    state.burstImages = files;
    state.videoFile = null;

    navigateTo('settings');
    updateEstimatedSize();
  }

  // 生成时间轴缩略图条 (生成 8 帧抽样)
  function generateTimelineThumbnails() {
    timelineFrames.innerHTML = '';
    const numFrames = 8;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 60;
    canvas.height = 54;

    const tempVideo = document.createElement('video');
    tempVideo.src = state.videoUrl;
    tempVideo.muted = true;
    tempVideo.playsInline = true;

    tempVideo.onloadeddata = async () => {
      const step = state.videoDuration / numFrames;
      for (let i = 0; i < numFrames; i++) {
        tempVideo.currentTime = i * step;
        await new Promise(r => {
          tempVideo.onseeked = r;
          setTimeout(r, 200); // 防卡顿超时保护
        });
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
        const img = document.createElement('img');
        img.className = 'timeline-thumb';
        img.src = canvas.toDataURL('image/jpeg', 0.6);
        timelineFrames.appendChild(img);
      }
    };
  }

  // 更新 Trim 时间轴 UI
  function updateTrimDisplay() {
    const dur = (state.trimEnd - state.trimStart).toFixed(1);
    labelCurTime.innerText = formatTime(trimVideo.currentTime || state.trimStart);
    labelTotTime.innerText = formatTime(state.videoDuration);
    labelTrimRange.innerText = `${formatTime(state.trimStart)} - ${formatTime(state.trimEnd)}`;
    labelTrimDuration.innerText = `${dur}s`;

    if (state.videoDuration > 0) {
      const leftPct = (state.trimStart / state.videoDuration) * 100;
      const rightPct = 100 - (state.trimEnd / state.videoDuration) * 100;
      trimHighlight.style.left = `${leftPct}%`;
      trimHighlight.style.right = `${rightPct}%`;
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  }

  // 播放器控制
  btnPlayPause.addEventListener('click', () => {
    if (trimVideo.paused) {
      trimVideo.play();
    } else {
      trimVideo.pause();
    }
  });

  trimVideo.addEventListener('play', () => {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  });

  trimVideo.addEventListener('pause', () => {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  });

  trimVideo.addEventListener('timeupdate', () => {
    labelCurTime.innerText = formatTime(trimVideo.currentTime);
    if (trimVideo.currentTime >= state.trimEnd) {
      trimVideo.currentTime = state.trimStart;
    }
  });

  // 触摸拖拽时间轴手柄
  setupHandleDrag(handleLeft, true);
  setupHandleDrag(handleRight, false);

  function setupHandleDrag(handle, isLeft) {
    let startX = 0;
    let initialLeft = 0;
    let initialRight = 0;

    const onStart = (e) => {
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      initialLeft = state.trimStart;
      initialRight = state.trimEnd;

      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);
    };

    const onMove = (e) => {
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const timelineWidth = timelineFrames.parentElement.clientWidth;
      const dt = (dx / timelineWidth) * state.videoDuration;

      if (isLeft) {
        let newStart = Math.max(0, Math.min(initialRight - 0.5, initialLeft + dt));
        state.trimStart = Math.round(newStart * 10) / 10;
        trimVideo.currentTime = state.trimStart;
      } else {
        let newEnd = Math.min(state.videoDuration, Math.max(initialLeft + 0.5, initialRight + dt));
        if (newEnd - state.trimStart > 10) newEnd = state.trimStart + 10;
        state.trimEnd = Math.round(newEnd * 10) / 10;
        trimVideo.currentTime = state.trimEnd;
      }
      updateTrimDisplay();
    };

    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
    };

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
  }

  // Step 1: Trim -> Next Step (进入 Settings)
  document.getElementById('btn-trim-next').addEventListener('click', () => {
    navigateTo('settings');
  });

  // Step 1 返回
  document.getElementById('btn-trim-back').addEventListener('click', () => {
    navigateTo('home');
  });

  // Settings: 实时循环播放同步
  function syncLivePreview() {
    if (state.sourceType === 'video' && previewVideoLoop.src) {
      previewVideoLoop.playbackRate = state.speed;
      previewVideoLoop.currentTime = state.trimStart;
      previewVideoLoop.play().catch(() => {});
      
      previewVideoLoop.ontimeupdate = () => {
        if (previewVideoLoop.currentTime >= state.trimEnd) {
          previewVideoLoop.currentTime = state.trimStart;
        }
      };
    }
  }

  // FPS 按钮组
  controlFps.querySelectorAll('.fps-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      controlFps.querySelectorAll('.fps-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.fps = parseInt(btn.dataset.fps);
      updateBadges();
      updateEstimatedSize();
    });
  });

  // 分辨率单选
  document.querySelectorAll('input[name="resolution"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.resolution = e.target.value === 'original' ? 'original' : parseInt(e.target.value);
      updateBadges();
      updateEstimatedSize();
    });
  });

  // 调速滑竿
  sliderSpeed.addEventListener('input', (e) => {
    state.speed = parseFloat(e.target.value);
    lblSpeedVal.innerText = `${state.speed.toFixed(1)}x`;
    if (previewVideoLoop) previewVideoLoop.playbackRate = state.speed;
    updateBadges();
  });

  // Loop 开关
  switchLoop.addEventListener('change', (e) => {
    state.loop = e.target.checked;
    updateBadges();
  });

  // 更新药丸指示条
  function updateBadges() {
    const resText = state.resolution === 'original' ? 'Orig' : `${state.resolution}p`;
    pillFps.innerText = `${state.fps} FPS`;
    pillRes.innerText = resText;
    pillSpeed.innerText = `${state.speed}x`;
    pillLoop.innerText = state.loop ? 'Loop' : 'Once';

    lblLiveFps.innerText = `${state.fps} FPS`;
    lblLiveRes.innerText = resText;
    lblLiveSpeed.innerText = `${state.speed}x`;
  }

  // 预估大小计算
  function updateEstimatedSize() {
    let dur = state.sourceType === 'video' ? (state.trimEnd - state.trimStart) : (state.burstImages.length * 0.5);
    dur = Math.max(0.5, dur) / state.speed;
    const totalFrames = dur * state.fps;
    
    let resFactor = 0.5;
    if (state.resolution === 240) resFactor = 0.25;
    if (state.resolution === 360) resFactor = 0.45;
    if (state.resolution === 480) resFactor = 0.75;
    if (state.resolution === 'original') resFactor = 1.3;

    const qualityFactor = state.quality / 8;
    const estKB = Math.round(totalFrames * 14 * resFactor * qualityFactor);
    lblEstSizeHeader.innerText = `~${estKB} KB ESTIMATED SIZE`;
    return estKB;
  }

  // 重置 Settings
  document.getElementById('btn-settings-reset').addEventListener('click', () => {
    state.fps = 10;
    state.resolution = 360;
    state.speed = 1.0;
    state.loop = true;
    state.reverse = false;
    state.boomerang = false;
    state.quality = 8;

    controlFps.querySelectorAll('.fps-btn').forEach(b => b.classList.toggle('active', b.dataset.fps === '10'));
    const r360 = document.querySelector('input[name="resolution"][value="360"]');
    if (r360) r360.checked = true;
    sliderSpeed.value = 1.0;
    lblSpeedVal.innerText = '1.0x';
    switchLoop.checked = true;
    switchReverse.checked = false;
    switchBoomerang.checked = false;
    sliderQuality.value = 8;

    updateBadges();
    updateEstimatedSize();
  });

  // Settings 关闭返回
  document.getElementById('btn-settings-back').addEventListener('click', () => {
    if (state.sourceType === 'video') {
      navigateTo('trim');
    } else {
      navigateTo('home');
    }
  });

  // 进入 Advanced Settings
  document.getElementById('entry-advanced').addEventListener('click', () => {
    navigateTo('advanced');
  });

  // Advanced: Reverse 开关
  switchReverse.addEventListener('change', (e) => {
    state.reverse = e.target.checked;
    if (state.reverse) {
      state.boomerang = false;
      switchBoomerang.checked = false;
    }
  });

  // Advanced: Boomerang 开关
  switchBoomerang.addEventListener('change', (e) => {
    state.boomerang = e.target.checked;
    if (state.boomerang) {
      state.reverse = false;
      switchReverse.checked = false;
    }
    updateEstimatedSize();
  });

  // Advanced: 质量滑块
  sliderQuality.addEventListener('input', (e) => {
    state.quality = parseInt(e.target.value);
    updateEstimatedSize();
  });

  // Advanced 保存返回
  document.getElementById('btn-advanced-back').addEventListener('click', () => navigateTo('settings'));
  document.getElementById('btn-advanced-save').addEventListener('click', () => navigateTo('settings'));
  document.getElementById('btn-advanced-save-nav').addEventListener('click', () => navigateTo('settings'));

  // 核心：点击 Generate GIF
  document.getElementById('btn-generate-gif').addEventListener('click', () => {
    startGifGeneration();
  });

  function startGifGeneration() {
    showLoading(true, 'Creating your GIF...', 'Preparing frames locally');

    if (state.sourceType === 'video') {
      renderFromVideo();
    } else {
      renderFromBursts();
    }
  }

  // 稳健的高性能视频解码抽取逻辑 (复用当前播放器并带有严格 seek 超时保护)
  async function renderFromVideo() {
    try {
      const start = state.trimStart;
      const end = state.trimEnd;
      const dur = Math.max(0.2, end - start);
      const fps = state.fps;
      const speed = state.speed;

      const totalFrames = Math.max(3, Math.min(60, Math.round(dur * fps)));

      let targetWidth = 320;
      if (state.resolution === 240) targetWidth = 240;
      else if (state.resolution === 480) targetWidth = 480;
      else if (state.resolution === 'original') targetWidth = 480;

      updateLoadingProgress(10, 'Initializing video frames...');

      // 提取帧序列
      const frames = await captureVideoFrames(trimVideo, start, end, totalFrames, targetWidth, (p) => {
        const pct = 10 + Math.round(p * 55); // 10% ~ 65%
        updateLoadingProgress(pct, `Extracting frames (${Math.round(p * 100)}%)`);
      });

      updateLoadingProgress(68, 'Processing motion sequence...');

      let finalSequence = frames;
      if (state.reverse) {
        finalSequence = [...frames].reverse();
      } else if (state.boomerang) {
        const reversed = [...frames].slice(1, -1).reverse();
        finalSequence = frames.concat(reversed);
      }

      const frameInterval = Math.max(0.04, (1 / fps) / speed);
      updateLoadingProgress(72, 'Encoding GIF...');
      encodeGifWithGifshot(finalSequence, targetWidth, finalSequence[0].height || targetWidth, frameInterval, dur);

    } catch (err) {
      showLoading(false);
      alert('生成失败: ' + err.message);
    }
  }

  // 稳健的逐帧抓取函数 (通过已有 DOM 视频对象快速播放取帧)
  function captureVideoFrames(activeVideo, start, end, numFrames, targetWidth, onProgress) {
    return new Promise(async (resolve, reject) => {
      try {
        const v = activeVideo;
        v.pause();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const frames = [];

        const origW = v.videoWidth || 640;
        const origH = v.videoHeight || 480;
        const aspect = origW / origH;
        const targetHeight = Math.round(targetWidth / aspect);
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const duration = Math.max(0.1, end - start);
        const step = duration / Math.max(1, numFrames - 1);

        for (let i = 0; i < numFrames; i++) {
          const targetTime = Math.min(start + (i * step), end);
          v.currentTime = targetTime;

          // 等待 seek 完毕（最多等待 120ms）
          await new Promise(r => {
            let done = false;
            const timer = setTimeout(() => {
              if (!done) { done = true; r(); }
            }, 120);
            v.onseeked = () => {
              if (!done) { done = true; clearTimeout(timer); r(); }
            };
          });

          ctx.drawImage(v, 0, 0, targetWidth, targetHeight);
          frames.push({
            dataUrl: canvas.toDataURL('image/jpeg', 0.75),
            height: targetHeight
          });

          if (onProgress) onProgress((i + 1) / numFrames);
        }

        resolve(frames);
      } catch (e) {
        reject(e);
      }
    });
  }

  // 从连拍图片序列渲染 (Bursts)
  async function renderFromBursts() {
    try {
      updateLoadingProgress(20, 'Loading burst photos...');
      const targetWidth = state.resolution === 240 ? 240 : (state.resolution === 360 ? 360 : 480);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const frameUrls = [];
      for (let i = 0; i < state.burstImages.length; i++) {
        const file = state.burstImages[i];
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise(r => img.onload = r);

        if (i === 0) {
          const aspect = img.width / img.height;
          canvas.width = targetWidth;
          canvas.height = Math.round(targetWidth / aspect);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        frameUrls.push({
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          height: canvas.height
        });

        const progress = 20 + Math.round((i / state.burstImages.length) * 45);
        updateLoadingProgress(progress, `Loaded photo ${i + 1}/${state.burstImages.length}`);
      }

      let sequence = frameUrls;
      if (state.reverse) sequence = [...frameUrls].reverse();
      if (state.boomerang) sequence = frameUrls.concat([...frameUrls].slice(1, -1).reverse());

      const delay = (0.35) / state.speed;
      updateLoadingProgress(70, 'Encoding GIF...');
      encodeGifWithGifshot(sequence, canvas.width, canvas.height, delay, (sequence.length * delay));

    } catch (e) {
      showLoading(false);
      alert('连拍处理失败: ' + e.message);
    }
  }

  // 统一编码 GIF (通过 gifshot)
  function encodeGifWithGifshot(frameObjects, width, height, frameInterval, approxDuration) {
    const rawImages = frameObjects.map(f => f.dataUrl || f);

    gifshot.createGIF({
      images: rawImages,
      gifWidth: width,
      gifHeight: height,
      interval: frameInterval,
      numWorkers: 2, // 使用 Worker 线程加速编码
      sampleInterval: 10,
      progressCallback: (pct) => {
        const p = 70 + Math.round(pct * 28);
        updateLoadingProgress(p, `Finalizing GIF (${Math.round(pct * 100)}%)`);
      }
    }, function(obj) {
      showLoading(false);
      if (!obj.error) {
        state.exportUrl = obj.image;
        fetch(obj.image)
          .then(res => res.blob())
          .then(blob => {
            state.exportBlob = blob;
            displayExportResult(blob, width, height, approxDuration);
          });
      } else {
        alert('GIF 编码出错: ' + obj.error);
      }
    });
  }

  // 展示生成结果与统计数据 (1:1 Metrics)
  function displayExportResult(blob, width, height, duration) {
    exportImg.src = state.exportUrl;
    
    const sizeKB = Math.round(blob.size / 1024);
    const sizeText = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

    metricDuration.innerText = `${duration.toFixed(1)}s`;
    metricFps.innerText = `${state.fps} fps`;
    metricRes.innerText = `${width}x${height}`;
    metricSpeed.innerText = `${state.speed}x`;
    metricLoop.innerText = state.loop ? 'Infinite' : 'Once';
    metricSize.innerText = sizeText;

    // 存入历史库
    const historyItem = {
      id: Date.now(),
      thumb: state.exportUrl,
      width: width,
      height: height,
      size: sizeText,
      date: new Date().toLocaleDateString()
    };
    state.history.unshift(historyItem);
    if (state.history.length > 20) state.history.pop();
    try {
      localStorage.setItem('ios_gifmaker_history', JSON.stringify(state.history));
    } catch (e) {}

    navigateTo('export');
  }

  // 进度弹窗操作
  function showLoading(show, title, desc) {
    if (show) {
      loadingModal.classList.remove('hidden');
      loadingTitle.innerText = title || 'Creating your GIF...';
      loadingDesc.innerText = desc || 'Rendering frames locally';
      loadingBar.style.width = '5%';
    } else {
      loadingModal.classList.add('hidden');
    }
  }

  function updateLoadingProgress(pct, desc) {
    loadingBar.style.width = `${pct}%`;
    if (desc) loadingDesc.innerText = desc;
  }

  // Export 页面：分享 GIF (原生 Web Share API)
  document.getElementById('btn-share-gif').addEventListener('click', async () => {
    if (!state.exportBlob) return;
    const file = new File([state.exportBlob], `gifmaker_${Date.now()}.gif`, { type: 'image/gif' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'My Custom GIF',
          text: 'Created with GIF Maker'
        });
      } catch (e) {}
    } else {
      downloadBlob(state.exportBlob, `gifmaker_${Date.now()}.gif`);
    }
  });

  // Export 页面：保存至相册 / 下载
  document.getElementById('btn-save-photos').addEventListener('click', () => {
    if (!state.exportBlob) return;
    downloadBlob(state.exportBlob, `gifmaker_${Date.now()}.gif`);
  });

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Export 页面：完成与再次制作
  document.getElementById('btn-export-done').addEventListener('click', () => navigateTo('home'));
  document.getElementById('btn-create-another').addEventListener('click', () => navigateTo('home'));

  // 历史库渲染 (My GIFs)
  function renderLibrary() {
    const grid = document.getElementById('lib-grid');
    const empty = document.getElementById('lib-empty-state');
    if (!grid) return;

    grid.innerHTML = '';
    if (state.history.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    state.history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'aspect-square rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm relative cursor-pointer active:scale-95 transition-transform';
      card.innerHTML = `
        <img src="${item.thumb}" class="w-full h-full object-cover">
        <span class="absolute bottom-1 right-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">${item.size}</span>
      `;
      card.addEventListener('click', () => {
        state.exportUrl = item.thumb;
        fetch(item.thumb).then(r => r.blob()).then(b => {
          state.exportBlob = b;
          displayExportResult(b, item.width, item.height, 2.0);
        });
      });
      grid.appendChild(card);
    });
  }

  // PRO 徽章
  document.getElementById('btn-pro-badge').addEventListener('click', () => navigateTo('pro'));

})();
