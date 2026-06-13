"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, ScanFace, X } from "lucide-react";
import type { Rider } from "@/types";
import { Button } from "@/components/ui/button";

type FaceApi = typeof import("face-api.js");

let faceApiPromise: Promise<FaceApi> | null = null;
let modelPromise: Promise<void> | null = null;

async function loadFaceDetector() {
  faceApiPromise ??= import("face-api.js");
  const faceapi = await faceApiPromise;
  modelPromise ??= faceapi.nets.tinyFaceDetector.loadFromUri("/models");
  await modelPromise;
  return faceapi;
}

function imageFromFile(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh"));
    };
    image.src = url;
  });
}

async function cropDetectedFace(source: HTMLImageElement | HTMLCanvasElement) {
  const faceapi = await loadFaceDetector();
  const detections = await faceapi.detectAllFaces(
    source,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }),
  );

  if (detections.length === 0) throw new Error("Không tìm thấy khuôn mặt trong ảnh");
  if (detections.length > 1) throw new Error("Ảnh có nhiều khuôn mặt, vui lòng chỉ chụp một rider");

  const { box } = detections[0];
  const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const size = Math.min(Math.max(box.width, box.height) * 1.75, sourceWidth, sourceHeight);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2 - box.height * 0.08;
  const sourceX = Math.max(0, Math.min(centerX - size / 2, sourceWidth - size));
  const sourceY = Math.max(0, Math.min(centerY - size / 2, sourceHeight - size));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  canvas.getContext("2d")?.drawImage(source, sourceX, sourceY, size, size, 0, 0, 512, 512);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Không thể xử lý ảnh"))), "image/jpeg", 0.9);
  });
}

export function RiderAvatarEditor({
  rider,
  onUpdated,
}: {
  rider: Rider;
  onUpdated: (rider: Rider) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  useEffect(() => stopCamera, []);

  async function uploadAvatar(blob: Blob) {
    const body = new FormData();
    body.set("avatar", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    const response = await fetch(`/api/riders/${rider.id}/avatar`, { method: "POST", body });
    const result = (await response.json().catch(() => null)) as { error?: string; rider?: Rider } | null;
    if (!response.ok || !result?.rider) throw new Error(result?.error ?? "Không thể cập nhật avatar");
    onUpdated(result.rider);
  }

  async function processImage(image: Blob) {
    setBusy(true);
    setError(null);
    try {
      const source = await imageFromFile(image);
      await uploadAvatar(await cropDetectedFace(source));
      stopCamera();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xử lý ảnh");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError("Không mở được camera. Hãy cấp quyền camera cho trình duyệt.");
    }
  }

  async function captureCamera() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setBusy(true);
    setError(null);
    try {
      await uploadAvatar(await cropDetectedFace(canvas));
      stopCamera();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể quét khuôn mặt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void processImage(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="h-9 px-3" disabled={busy} onClick={() => inputRef.current?.click()}>
          <ImagePlus size={15} />
          Chọn ảnh
        </Button>
        <Button type="button" variant="secondary" className="h-9 px-3" disabled={busy} onClick={openCamera}>
          <ScanFace size={15} />
          Quét camera
        </Button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {cameraOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">Quét khuôn mặt rider</h3>
                <p className="text-sm text-slate-500">Để một khuôn mặt ở giữa khung hình.</p>
              </div>
              <Button type="button" variant="ghost" className="size-9 p-0" onClick={stopCamera}>
                <X size={18} />
              </Button>
            </div>
            <div className="relative mt-4 overflow-hidden rounded-xl bg-slate-950">
              <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover [transform:scaleX(-1)]" />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-56 w-44 rounded-[45%] border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.35)]" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={stopCamera}>Hủy</Button>
              <Button type="button" disabled={busy} onClick={() => void captureCamera()}>
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Camera size={16} />}
                {busy ? "Đang quét..." : "Chụp và cập nhật"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
