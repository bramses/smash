"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TextInputItem = {
  id: string;
  kind: "text";
  text: string;
};

type ImageInputItem = {
  id: string;
  kind: "image";
  fileName: string;
  fileUrl: string;
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

type AudioInputItem = {
  id: string;
  kind: "audio";
  fileName: string;
  fileUrl: string;
  buffer: AudioBuffer;
  duration: number;
};

type InputItem = TextInputItem | ImageInputItem | AudioInputItem;

type AudioSlice = {
  sourceId: string;
  fileName: string;
  start: number;
  duration: number;
  offset: number;
  rate: number;
};

const CANVAS_SIZE = 900;

const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);

const randomInt = (min: number, max: number) =>
  Math.floor(randomBetween(min, max + 1));

const randomColor = () => {
  const hue = randomInt(0, 360);
  const sat = randomInt(55, 90);
  const light = randomInt(35, 70);
  return `hsl(${hue} ${sat}% ${light}%)`;
};

const pickRandomSubstring = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0];
  const maxWords = Math.min(4, words.length);
  const count = randomInt(1, maxWords);
  const start = randomInt(0, Math.max(0, words.length - count));
  return words.slice(start, start + count).join(" ");
};

const normalizeRange = (min: number, max: number) =>
  min <= max ? [min, max] : [max, min];

const formatSeconds = (value: number) => value.toFixed(2);
const truncateLabel = (value: string, max = 20) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

export default function Home() {
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [textDraft, setTextDraft] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [lastAudioSlices, setLastAudioSlices] = useState<AudioSlice[]>([]);
  const [lastSmashSeed, setLastSmashSeed] = useState<string | null>(null);
  const [imageLayers, setImageLayers] = useState(4);
  const [textLayers, setTextLayers] = useState(6);
  const [audioLayers, setAudioLayers] = useState(3);
  const [alphaMin, setAlphaMin] = useState(0.55);
  const [alphaMax, setAlphaMax] = useState(0.95);
  const [rotationRange, setRotationRange] = useState(0.6);
  const [imageCropMin, setImageCropMin] = useState(0.2);
  const [imageCropMax, setImageCropMax] = useState(0.8);
  const [textSizeMin, setTextSizeMin] = useState(24);
  const [textSizeMax, setTextSizeMax] = useState(82);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showInputsModal, setShowInputsModal] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [gridDivision, setGridDivision] = useState(8);
  const [phraseChance, setPhraseChance] = useState(0.25);
  const [stutterChance, setStutterChance] = useState(0.2);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const previewTimeoutRef = useRef<number | null>(null);
  const recordFrameRef = useRef<number | null>(null);

  const imageCount = useMemo(
    () => inputs.filter((item) => item.kind === "image").length,
    [inputs]
  );
  const textCount = useMemo(
    () => inputs.filter((item) => item.kind === "text").length,
    [inputs]
  );
  const audioCount = useMemo(
    () => inputs.filter((item) => item.kind === "audio").length,
    [inputs]
  );

  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  };

  const handleAddText = () => {
    const lines = textDraft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const nextItems: TextInputItem[] = lines.map((line) => ({
      id: crypto.randomUUID(),
      kind: "text",
      text: line,
    }));
    setInputs((prev) => [...prev, ...nextItems]);
    setTextDraft("");
  };

  const fetchRandomQuote = async () => {
    setIsFetchingQuote(true);
    setQuoteStatus(null);
    try {
      const response = await fetch("https://thequoteshub.com/api/");
      if (!response.ok) {
        throw new Error("Quote API request failed.");
      }
      const data = (await response.json()) as {
        text?: string;
        author?: string;
      };
      const quoteText = data.text?.trim() ?? "";
      const author = data.author?.trim() ?? "";

      if (!quoteText.length) {
        throw new Error("Quote API returned empty content.");
      }
      const combined = author ? `${quoteText} — ${author}` : quoteText;

      setInputs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "text",
          text: combined,
        } as TextInputItem,
      ]);
      setQuoteStatus("Quote added.");
    } catch (error) {
      console.error("Quote fetch error", error);
      setQuoteStatus("Could not fetch a quote.");
    } finally {
      setIsFetchingQuote(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const nextItems: InputItem[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(file);
        const fileUrl = URL.createObjectURL(file);
        nextItems.push({
          id: crypto.randomUUID(),
          kind: "image",
          fileName: file.name,
          fileUrl,
          bitmap,
          width: bitmap.width,
          height: bitmap.height,
        });
        continue;
      }
      if (file.type.startsWith("audio/")) {
        const buffer = await file.arrayBuffer();
        const context = ensureAudioContext();
        const decoded = await context.decodeAudioData(buffer);
        const fileUrl = URL.createObjectURL(file);
        nextItems.push({
          id: crypto.randomUUID(),
          kind: "audio",
          fileName: file.name,
          fileUrl,
          buffer: decoded,
          duration: decoded.duration,
        });
      }
    }
    if (nextItems.length) {
      setInputs((prev) => [...prev, ...nextItems]);
    }
  };

  const removeInput = (id: string) => {
    setInputs((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target && (target.kind === "image" || target.kind === "audio")) {
        URL.revokeObjectURL(target.fileUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const showInlineInputs = inputs.length <= 6;
  const inlineInputs = showInlineInputs ? inputs : [];

  const stopPreview = () => {
    previewSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (error) {
        console.warn("Preview stop error", error);
      }
    });
    previewSourcesRef.current = [];
    setIsPreviewing(false);
    if (previewTimeoutRef.current !== null) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
  };

  const clearInputs = () => {
    inputs.forEach((item) => {
      if (item.kind === "image" || item.kind === "audio") {
        URL.revokeObjectURL(item.fileUrl);
      }
    });
    setInputs([]);
    setLastAudioSlices([]);
    setLastSmashSeed(null);
    setExportStatus(null);
    stopPreview();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const smash = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    const smashSeed = crypto.randomUUID().slice(0, 8);
    setLastSmashSeed(smashSeed);
    setExportStatus(null);

    const background = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height
    );
    background.addColorStop(0, randomColor());
    background.addColorStop(1, randomColor());
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const textInputs = inputs.filter(
      (item): item is TextInputItem => item.kind === "text"
    );
    const imageInputs = inputs.filter(
      (item): item is ImageInputItem => item.kind === "image"
    );
    const audioInputs = inputs.filter(
      (item): item is AudioInputItem => item.kind === "audio"
    );

    const [alphaLow, alphaHigh] = normalizeRange(alphaMin, alphaMax);
    const [cropLow, cropHigh] = normalizeRange(imageCropMin, imageCropMax);
    const [textSizeLow, textSizeHigh] = normalizeRange(
      textSizeMin,
      textSizeMax
    );

    if (imageInputs.length) {
      for (let i = 0; i < imageLayers; i += 1) {
        const image = imageInputs[randomInt(0, imageInputs.length - 1)];
        const srcWidth = randomBetween(image.width * cropLow, image.width * cropHigh);
        const srcHeight = randomBetween(
          image.height * cropLow,
          image.height * cropHigh
        );
        const sx = randomBetween(0, Math.max(0, image.width - srcWidth));
        const sy = randomBetween(0, Math.max(0, image.height - srcHeight));
        const destWidth = randomBetween(
          canvas.width * 0.25,
          canvas.width * 0.75
        );
        const destHeight = randomBetween(
          canvas.height * 0.25,
          canvas.height * 0.75
        );
        const dx = randomBetween(0, canvas.width - destWidth);
        const dy = randomBetween(0, canvas.height - destHeight);

        ctx.save();
        ctx.globalAlpha = randomBetween(alphaLow, alphaHigh);
        ctx.drawImage(
          image.bitmap,
          sx,
          sy,
          srcWidth,
          srcHeight,
          dx,
          dy,
          destWidth,
          destHeight
        );
        ctx.restore();
      }
    }

    if (textInputs.length) {
      for (let i = 0; i < textLayers; i += 1) {
        const textInput = textInputs[randomInt(0, textInputs.length - 1)];
        const text = pickRandomSubstring(textInput.text);
        if (!text) continue;
        const fontSize = randomBetween(textSizeLow, textSizeHigh);
        ctx.save();
        ctx.font = `${fontSize}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = randomColor();
        ctx.globalAlpha = randomBetween(alphaLow, 1);
        const x = randomBetween(40, canvas.width - 80);
        const y = randomBetween(60, canvas.height - 60);
        const rotation = randomBetween(-rotationRange, rotationRange);
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }

    if (audioInputs.length) {
      const beat = 60 / Math.max(40, Math.min(200, bpm));
      const grid = beat * (4 / Math.max(4, Math.min(16, gridDivision)));
      const slices: AudioSlice[] = [];
      let timeline = 0;

      for (let i = 0; i < audioLayers; i += 1) {
        const audio = audioInputs[randomInt(0, audioInputs.length - 1)];
        const isPhrase = Math.random() < phraseChance;
        const rate = randomBetween(0.9, 1.08);

        if (isPhrase) {
          const duration = randomBetween(1.2, Math.min(3.5, audio.duration));
          const start = randomBetween(0, Math.max(0, audio.duration - duration));
          slices.push({
            sourceId: audio.id,
            fileName: audio.fileName,
            start,
            duration,
            offset: timeline,
            rate,
          });
          timeline += duration * 0.85;
          continue;
        }

        const chopDuration = Math.min(grid, audio.duration);
        const start = randomBetween(0, Math.max(0, audio.duration - chopDuration));
        const swing = randomBetween(-grid * 0.12, grid * 0.12);
        slices.push({
          sourceId: audio.id,
          fileName: audio.fileName,
          start,
          duration: chopDuration,
          offset: Math.max(0, timeline + swing),
          rate,
        });
        timeline += grid;

        if (Math.random() < stutterChance) {
          const repeats = randomInt(2, 4);
          const repeatGap = Math.max(0.06, grid * 0.5);
          for (let r = 0; r < repeats; r += 1) {
            slices.push({
              sourceId: audio.id,
              fileName: audio.fileName,
              start,
              duration: chopDuration,
              offset: timeline + r * repeatGap,
              rate: randomBetween(0.92, 1.1),
            });
          }
          timeline += repeats * repeatGap;
        }
      }

      setLastAudioSlices(slices);
    } else {
      setLastAudioSlices([]);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      smash();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputs, imageLayers, textLayers, audioLayers, alphaMin, alphaMax, rotationRange, imageCropMin, imageCropMax, textSizeMin, textSizeMax, bpm, gridDivision, phraseChance, stutterChance]);

  const buildAudioMix = (
    context: AudioContext,
    destination: AudioNode,
    slices: AudioSlice[]
  ) => {
    const audioInputs = inputs.filter(
      (item): item is AudioInputItem => item.kind === "audio"
    );
    const sources: AudioBufferSourceNode[] = [];
    const now = context.currentTime + 0.08;

    for (const slice of slices) {
      const audio = audioInputs.find((item) => item.id === slice.sourceId);
      if (!audio) continue;
      const source = context.createBufferSource();
      source.buffer = audio.buffer;
      source.playbackRate.value = slice.rate;

      const gain = context.createGain();
      const fadeIn = 0.02;
      const fadeOut = 0.04;
      const startAt = now + slice.offset;
      const endAt = startAt + slice.duration;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(1, startAt + fadeIn);
      gain.gain.setValueAtTime(1, Math.max(startAt + fadeIn, endAt - fadeOut));
      gain.gain.linearRampToValueAtTime(0, endAt);

      source.connect(gain);
      gain.connect(destination);
      source.start(startAt, slice.start, slice.duration);
      sources.push(source);
    }

    const totalDuration = slices.length
      ? Math.max(...slices.map((slice) => slice.offset + slice.duration))
      : 0;

    return { sources, totalDuration };
  };

  const playAudioPreview = async () => {
    if (!lastAudioSlices.length) return;
    stopPreview();
    const context = ensureAudioContext();
    await context.resume();

    const gain = context.createGain();
    gain.gain.value = 0.9;
    gain.connect(context.destination);

    const { sources, totalDuration } = buildAudioMix(
      context,
      gain,
      lastAudioSlices
    );
    previewSourcesRef.current = sources;
    setIsPreviewing(true);
    previewTimeoutRef.current = window.setTimeout(() => {
      stopPreview();
    }, Math.max(250, totalDuration * 1000 + 200));
  };

  const downloadImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsExporting(true);
    setExportStatus("Rendering image...");

    canvas.toBlob((blob) => {
      if (!blob) {
        setExportStatus("Image export failed.");
        setIsExporting(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `smash-${lastSmashSeed ?? "canvas"}.png`;
      link.click();
      URL.revokeObjectURL(url);
      setExportStatus("Image downloaded.");
      setIsExporting(false);
    }, "image/png");
  };

  const downloadVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!("MediaRecorder" in window)) {
      setExportStatus("MediaRecorder not supported in this browser.");
      return;
    }

    setIsExporting(true);
    setExportStatus("Rendering video...");

    const context = ensureAudioContext();
    await context.resume();

    const stream = canvas.captureStream(30);
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      setExportStatus("Video capture failed.");
      setIsExporting(false);
      return;
    }
    const destination = context.createMediaStreamDestination();
    const audioTracks = destination.stream.getAudioTracks();
    audioTracks.forEach((track) => stream.addTrack(track));

    const { sources, totalDuration } = buildAudioMix(
      context,
      destination,
      lastAudioSlices
    );

    const preferredTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mimeType = preferredTypes.find((type) =>
      MediaRecorder.isTypeSupported(type)
    );

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks: Blob[] = [];
    const ctx = canvas.getContext("2d");
    let requestTimer: number | null = null;

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    recorder.onstop = () => {
      if (recordFrameRef.current !== null) {
        cancelAnimationFrame(recordFrameRef.current);
        recordFrameRef.current = null;
      }
      if (requestTimer !== null) {
        window.clearInterval(requestTimer);
        requestTimer = null;
      }
      sources.forEach((source) => {
        try {
          source.stop();
        } catch (error) {
          console.warn("Audio source stop error", error);
        }
      });
      const blob = new Blob(chunks, { type: mimeType ?? "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `smash-${lastSmashSeed ?? "canvas"}.webm`;
      link.click();
      URL.revokeObjectURL(url);
      setExportStatus(
        blob.size > 1024 ? "Video downloaded." : "Video export failed."
      );
      setIsExporting(false);
    };

    recorder.onstart = () => {
      if (!ctx) return;
      const start = performance.now();
      const animate = (time: number) => {
        const t = (time - start) / 1000;
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = "rgba(0,0,0,0.02)";
        const x = Math.floor((t * 30) % canvas.width);
        ctx.fillRect(x, 0, 2, 2);
        ctx.restore();
        recordFrameRef.current = requestAnimationFrame(animate);
      };
      recordFrameRef.current = requestAnimationFrame(animate);
    };

    recorder.start(200);
    requestTimer = window.setInterval(() => {
      if (recorder.state === "recording") {
        recorder.requestData();
      }
    }, 500);

    const stopAfter = Math.max(1.5, totalDuration + 0.6);
    window.setTimeout(() => recorder.stop(), stopAfter * 1000);
  };

  const downloadSmash = async () => {
    if (lastAudioSlices.length) {
      await downloadVideo();
    } else {
      await downloadImage();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:gap-10 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Smash Lab
          </p>
          <h1 className="text-4xl font-semibold text-zinc-50">
            Smash inputs into a fresh canvas.
          </h1>
          <p className="max-w-2xl text-base text-zinc-300">
            Add text lines or drop in images and audio. Each smash generates a
            new randomized composite canvas.
          </p>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
            <a
              className="rounded-full border border-zinc-800 px-3 py-1 transition hover:border-zinc-500"
              href="https://github.com/bramses/smash"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className="rounded-full border border-zinc-800 px-3 py-1 transition hover:border-zinc-500"
              href="https://bramadams.dev"
              target="_blank"
              rel="noreferrer"
            >
              bramadams.dev
            </a>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-5 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-lg sm:p-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-zinc-300">
                Text inputs
              </label>
              <textarea
                className="min-h-[120px] w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
                placeholder="Add one idea per line."
                value={textDraft}
                onChange={(event) => setTextDraft(event.target.value)}
              />
              <button
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium transition hover:border-zinc-500"
                onClick={handleAddText}
                type="button"
              >
                Add text lines
              </button>
              <button
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={fetchRandomQuote}
                type="button"
                disabled={isFetchingQuote}
              >
                {isFetchingQuote ? "Fetching quote..." : "Add random quote"}
              </button>
              {quoteStatus ? (
                <p className="text-xs text-zinc-400">{quoteStatus}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-zinc-300">
                Image or audio files
              </label>
              <input
                className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 px-3 py-6 text-sm text-zinc-300 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-900"
                type="file"
                multiple
                accept="image/*,audio/*"
                onChange={(event) => handleFiles(event.target.files)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-xs text-zinc-300 sm:gap-4 sm:text-sm">
              <div className="rounded-2xl bg-zinc-950/70 p-3">
                <p className="text-lg font-semibold text-zinc-100">
                  {textCount}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Text
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-950/70 p-3">
                <p className="text-lg font-semibold text-zinc-100">
                  {imageCount}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Images
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-950/70 p-3">
                <p className="text-lg font-semibold text-zinc-100">
                  {audioCount}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Audio
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-200 sm:text-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
                  Current inputs
                </p>
                {inputs.length > 6 ? (
                  <button
                    className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:border-zinc-500"
                    type="button"
                    onClick={() => setShowInputsModal(true)}
                  >
                    View all
                  </button>
                ) : null}
              </div>
              {inputs.length ? (
                showInlineInputs ? (
                  <div className="flex max-h-44 flex-col gap-3 overflow-y-auto pr-1">
                    {inlineInputs.map((item) => {
                      const label =
                        item.kind === "text"
                          ? item.text
                          : `${item.fileName}`;
                      const shortLabel = truncateLabel(label, 20);
                      return (
                        <div
                          key={item.id}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 transition hover:border-zinc-600"
                          role="button"
                          tabIndex={0}
                          onClick={() => setShowInputsModal(true)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              setShowInputsModal(true);
                            }
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-1 overflow-hidden">
                              <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                                {item.kind}
                              </span>
                              {item.kind === "image" ? (
                                <div className="flex items-center gap-3">
                                  <img
                                    src={item.fileUrl}
                                    alt={item.fileName}
                                    className="h-10 w-10 rounded-lg object-cover"
                                  />
                                  <span
                                    className="text-xs text-zinc-200 sm:text-sm"
                                    title={label}
                                  >
                                    {shortLabel}
                                  </span>
                                </div>
                              ) : item.kind === "audio" ? (
                                <div className="flex flex-wrap items-center gap-3">
                                  <audio
                                    controls
                                    preload="metadata"
                                    src={item.fileUrl}
                                    className="h-8 w-40"
                                  />
                                  <span
                                    className="text-xs text-zinc-200 sm:text-sm"
                                    title={label}
                                  >
                                    {shortLabel}
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className="text-xs text-zinc-200 sm:text-sm"
                                  title={label}
                                >
                                  {shortLabel}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="shrink-0 rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-medium text-zinc-200 transition hover:border-zinc-500"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeInput(item.id);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 text-xs text-zinc-400">
                    <p>{inputs.length} inputs loaded.</p>
                    <p>
                      Open the modal to view or remove individual items.
                    </p>
                  </div>
                )
              ) : (
                <p className="text-xs text-zinc-500">
                  No inputs yet. Add text lines or upload media.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-200 sm:text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
                Smash controls
              </p>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Image layers</span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={imageLayers}
                  onChange={(event) => setImageLayers(Number(event.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Text layers</span>
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={textLayers}
                  onChange={(event) => setTextLayers(Number(event.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Audio layers</span>
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={audioLayers}
                  onChange={(event) => setAudioLayers(Number(event.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>BPM</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={60}
                    max={180}
                    value={bpm}
                    onChange={(event) => setBpm(Number(event.target.value))}
                  />
                  <span className="text-xs text-zinc-500">{bpm}</span>
                </div>
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Grid</span>
                <select
                  className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs"
                  value={gridDivision}
                  onChange={(event) =>
                    setGridDivision(Number(event.target.value))
                  }
                >
                  <option value={4}>1/4</option>
                  <option value={8}>1/8</option>
                  <option value={16}>1/16</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Phrase chance</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.05}
                    value={phraseChance}
                    onChange={(event) =>
                      setPhraseChance(Number(event.target.value))
                    }
                  />
                  <span className="text-xs text-zinc-500">
                    {Math.round(phraseChance * 100)}%
                  </span>
                </div>
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Stutter chance</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.05}
                    value={stutterChance}
                    onChange={(event) =>
                      setStutterChance(Number(event.target.value))
                    }
                  />
                  <span className="text-xs text-zinc-500">
                    {Math.round(stutterChance * 100)}%
                  </span>
                </div>
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Opacity range</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={alphaMin}
                    onChange={(event) => setAlphaMin(Number(event.target.value))}
                  />
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={alphaMax}
                    onChange={(event) => setAlphaMax(Number(event.target.value))}
                  />
                </div>
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Rotation range</span>
                <input
                  type="range"
                  min={0}
                  max={1.6}
                  step={0.05}
                  value={rotationRange}
                  onChange={(event) => setRotationRange(Number(event.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Image crop</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={imageCropMin}
                    onChange={(event) =>
                      setImageCropMin(Number(event.target.value))
                    }
                  />
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={imageCropMax}
                    onChange={(event) =>
                      setImageCropMax(Number(event.target.value))
                    }
                  />
                </div>
              </label>
              <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Text size</span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={12}
                    max={120}
                    step={2}
                    value={textSizeMin}
                    onChange={(event) =>
                      setTextSizeMin(Number(event.target.value))
                    }
                  />
                  <input
                    type="range"
                    min={12}
                    max={140}
                    step={2}
                    value={textSizeMax}
                    onChange={(event) =>
                      setTextSizeMax(Number(event.target.value))
                    }
                  />
                </div>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-white"
                type="button"
                onClick={smash}
              >
                Smash
              </button>
              <button
                className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-100 transition hover:border-zinc-500"
                type="button"
                onClick={clearInputs}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">
                Smash canvas
              </h2>
              {lastSmashSeed ? (
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs uppercase tracking-[0.3em] text-zinc-400">
                  {lastSmashSeed}
                </span>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <canvas
                ref={canvasRef}
                className="aspect-square h-auto w-full"
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
              />
            </div>

            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                className="w-full rounded-full bg-zinc-100 px-5 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                type="button"
                onClick={downloadSmash}
                disabled={!lastSmashSeed || isExporting}
              >
                {lastAudioSlices.length ? "Download video" : "Download image"}
              </button>
              <button
                className="w-full rounded-full border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                type="button"
                onClick={playAudioPreview}
                disabled={!lastAudioSlices.length}
              >
                Preview audio
              </button>
              <button
                className="w-full rounded-full border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                type="button"
                onClick={stopPreview}
                disabled={!isPreviewing}
              >
                Stop preview
              </button>
            </div>

            {exportStatus ? (
              <p className="text-xs text-zinc-400">{exportStatus}</p>
            ) : null}

            <div className="text-xs text-zinc-400">
              {lastAudioSlices.length ? (
                <div className="flex flex-col gap-2">
                  <p className="uppercase tracking-[0.2em]">
                    Latest audio slices
                  </p>
                  <ul className="flex flex-col gap-1">
                    {lastAudioSlices.map((slice, index) => (
                      <li key={`${slice.fileName}-${index}`}>
                        {slice.fileName} · {formatSeconds(slice.start)}s →{" "}
                        {formatSeconds(slice.start + slice.duration)}s @ +
                        {formatSeconds(slice.offset)}s · {slice.rate.toFixed(2)}x
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                "Add audio files to generate audio slices."
              )}
            </div>
          </div>
        </section>
      </main>

      {showInputsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-300">
                All inputs
              </h3>
              <button
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 transition hover:border-zinc-500"
                type="button"
                onClick={() => setShowInputsModal(false)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <div className="flex flex-col gap-3">
                {inputs.map((item) => {
                  const label =
                    item.kind === "text" ? item.text : `${item.fileName}`;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 overflow-hidden">
                          <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                            {item.kind}
                          </span>
                          {item.kind === "image" ? (
                            <div className="flex items-center gap-3">
                              <img
                                src={item.fileUrl}
                                alt={item.fileName}
                                className="h-12 w-12 rounded-lg object-cover"
                              />
                              <span
                                className="truncate text-xs text-zinc-200 sm:text-sm"
                                title={label}
                              >
                                {label}
                              </span>
                            </div>
                          ) : item.kind === "audio" ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <audio
                                controls
                                preload="metadata"
                                src={item.fileUrl}
                                className="h-8 w-48"
                              />
                              <span
                                className="truncate text-xs text-zinc-200 sm:text-sm"
                                title={label}
                              >
                                {label}
                              </span>
                            </div>
                          ) : (
                            <span
                              className="truncate text-xs text-zinc-200 sm:text-sm"
                              title={label}
                            >
                              {label}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-medium text-zinc-200 transition hover:border-zinc-500"
                        type="button"
                        onClick={() => removeInput(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
