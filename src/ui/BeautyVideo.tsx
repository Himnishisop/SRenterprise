import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { beautyOverlayFilter, beautyParams } from "../lib/filters";

type BaseProps = React.VideoHTMLAttributes<HTMLVideoElement>;

interface Props extends BaseProps {
  /** live camera stream (camera screen) */
  stream?: MediaStream | null;
  /** file/blob url (editor) */
  src?: string;
  intensity: number;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  onClick?: () => void;
}

/**
 * GPU-composited beauty look: a sharp base <video> + a blurred, brightened
 * duplicate blended over it with soft-light. This is purely visual — the editor
 * drives audio from a decoded buffer (see Editor), so both video layers are
 * muted and there's no audio path through these elements.
 */
export const BeautyVideo = forwardRef<HTMLVideoElement, Props>(function BeautyVideo(
  { stream, src, intensity, containerClassName, containerStyle, onClick, className, style, ...rest },
  ref
) {
  const baseRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => baseRef.current as HTMLVideoElement, []);

  // live stream -> both layers
  useEffect(() => {
    const b = baseRef.current;
    const o = overlayRef.current;
    if (stream) {
      if (b && b.srcObject !== stream) {
        b.srcObject = stream;
        b.play().catch(() => {});
      }
      if (o && o.srcObject !== stream) {
        o.srcObject = stream;
        o.play().catch(() => {});
      }
    } else {
      if (b) b.srcObject = null;
      if (o) o.srcObject = null;
    }
  }, [stream]);

  // file source -> keep overlay layer visually synced to base
  useEffect(() => {
    if (!src) return;
    const b = baseRef.current;
    const o = overlayRef.current;
    if (!b || !o) return;

    const play = () => o.play().catch(() => {});
    const pause = () => {
      o.pause();
      o.currentTime = b.currentTime;
    };
    // Only re-align on an explicit seek (user scrub). During playback both layers
    // free-run so we never trigger expensive mid-playback video seeks.
    const sync = () => {
      o.currentTime = b.currentTime;
    };

    b.addEventListener("play", play);
    b.addEventListener("pause", pause);
    b.addEventListener("seeked", sync);
    return () => {
      b.removeEventListener("play", play);
      b.removeEventListener("pause", pause);
      b.removeEventListener("seeked", sync);
    };
  }, [src]);

  const p = beautyParams(intensity);
  const showOverlay = p.i >= 0.02;
  const objectFit = (style?.objectFit as React.CSSProperties["objectFit"]) ?? "cover";

  return (
    <div
      className={containerClassName}
      style={{ position: "relative", overflow: "hidden", ...containerStyle }}
      onClick={onClick}
    >
      <video
        ref={baseRef}
        src={src}
        muted
        className={className}
        style={{ display: "block", width: "100%", height: "100%", objectFit, ...style }}
        {...rest}
      />
      <video
        ref={overlayRef}
        src={src}
        muted
        playsInline
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit,
          pointerEvents: "none",
          filter: beautyOverlayFilter(intensity),
          opacity: showOverlay ? p.softAlpha : 0,
          mixBlendMode: "soft-light",
          transition: "opacity 120ms linear",
        }}
      />
    </div>
  );
});
