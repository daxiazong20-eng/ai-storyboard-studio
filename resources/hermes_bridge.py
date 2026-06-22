#!/usr/bin/env python3
"""JSON bridge between AI Storyboard Studio and a local Hermes installation.

The bridge runs inside Hermes' own virtual environment. It asks Hermes to
resolve/refresh the xAI OAuth credential, then performs the documented media
requests. Tokens never cross stdout and are never visible to Electron's
renderer process.
"""

from __future__ import annotations

import base64
import importlib.metadata
import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List

IMAGE_MODELS = [
    {"id": "grok-imagine-image", "name": "Grok Imagine Image", "type": "image", "provider": "hermes-grok"},
    {"id": "grok-imagine-image-quality", "name": "Grok Imagine Image Quality", "type": "image", "provider": "hermes-grok"},
]
VIDEO_MODELS = [
    {"id": "grok-imagine-video", "name": "Grok Imagine Video", "type": "video", "provider": "hermes-grok"},
    {"id": "grok-imagine-video-1.5-preview", "name": "Grok Imagine Video 1.5 Preview", "type": "video", "provider": "hermes-grok"},
]
TEXT_MODELS = [
    {"id": "grok-build-0.1", "name": "Grok Build 0.1", "type": "text", "provider": "hermes-grok"},
    {"id": "grok-composer-2.5-fast", "name": "Grok Composer 2.5 Fast", "type": "text", "provider": "hermes-grok"},
    {"id": "grok-4.3", "name": "Grok 4.3", "type": "text", "provider": "hermes-grok"},
    {"id": "grok-4.20-0309-reasoning", "name": "Grok 4.20 0309 Reasoning", "type": "text", "provider": "hermes-grok"},
    {"id": "grok-4.20-0309-non-reasoning", "name": "Grok 4.20 0309 Non-Reasoning", "type": "text", "provider": "hermes-grok"},
    {"id": "grok-4.20-multi-agent-0309", "name": "Grok 4.20 Multi-Agent 0309", "type": "text", "provider": "hermes-grok"},
]


def emit(payload: Dict[str, Any], code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()
    raise SystemExit(code)


def credentials() -> Dict[str, str]:
    from tools.xai_http import resolve_xai_http_credentials

    creds = resolve_xai_http_credentials(force_refresh=False) or {}
    token = str(creds.get("api_key") or "").strip()
    if not token:
        return {"token": "", "provider": str(creds.get("provider") or ""), "base_url": str(creds.get("base_url") or "https://api.x.ai/v1").rstrip("/")}
    return {
        "token": token,
        "provider": str(creds.get("provider") or "xai-oauth"),
        "base_url": str(creds.get("base_url") or "https://api.x.ai/v1").rstrip("/"),
    }


def headers(creds: Dict[str, str]) -> Dict[str, str]:
    try:
        from tools.xai_http import hermes_xai_user_agent
        user_agent = hermes_xai_user_agent()
    except Exception:
        user_agent = "hermes-agent/ai-storyboard-studio"
    return {"Authorization": f"Bearer {creds['token']}", "Content-Type": "application/json", "User-Agent": user_agent}


def require_credentials() -> Dict[str, str]:
    creds = credentials()
    if not creds["token"]:
        raise RuntimeError("Hermes is installed, but Grok OAuth is not logged in. Run: hermes auth add xai-oauth")
    return creds


def data_uri(value: str, expected: str) -> str:
    text = str(value or "").strip()
    if text.startswith(("http://", "https://", "data:")):
        return text
    path = Path(text).expanduser()
    if not path.is_file():
        raise RuntimeError(f"Input file does not exist: {text}")
    mime = mimetypes.guess_type(path.name)[0] or ("video/mp4" if expected == "video" else "image/png")
    if expected == "image" and not mime.startswith("image/"):
        raise RuntimeError(f"Unsupported image input: {path.name}")
    if expected == "video" and path.suffix.lower() != ".mp4":
        raise RuntimeError("Video extension only supports MP4 files")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def checked(response: Any) -> Dict[str, Any]:
    try:
        body = response.json()
    except Exception:
        body = {"message": response.text[:1000]}
    if not response.ok:
        error = body.get("error") if isinstance(body, dict) else None
        if isinstance(error, dict):
            message = error.get("message") or json.dumps(error, ensure_ascii=False)
        else:
            message = error or (body.get("message") if isinstance(body, dict) else None) or response.text[:500]
        raise RuntimeError(f"xAI HTTP {response.status_code}: {message}")
    return body


def post(endpoint: str, payload: Dict[str, Any], timeout: int = 180) -> Dict[str, Any]:
    import requests

    creds = require_credentials()
    response = requests.post(
        f"{creds['base_url']}{endpoint}",
        headers={**headers(creds), "x-idempotency-key": str(uuid.uuid4())},
        json={key: value for key, value in payload.items() if value is not None},
        timeout=timeout,
    )
    return checked(response)


def model_catalog() -> List[Dict[str, str]]:
    models: List[Dict[str, str]] = []
    try:
        from plugins.image_gen.xai import XAIImageGenProvider
        for item in XAIImageGenProvider().list_models():
            models.append({"id": item["id"], "name": item.get("display", item["id"]), "type": "image", "provider": "hermes-grok"})
    except Exception:
        models.extend(IMAGE_MODELS)
    try:
        from plugins.video_gen.xai import XAIVideoGenProvider
        for item in XAIVideoGenProvider().list_models():
            model_id = str(item["id"])
            models.append({"id": model_id, "name": item.get("display", model_id), "type": "video", "provider": "hermes-grok"})
    except Exception:
        models.extend(VIDEO_MODELS)
    try:
        from hermes_cli.models import provider_model_ids
        text_ids = provider_model_ids("xai-oauth")
        models.extend({"id": model_id, "name": model_id, "type": "text", "provider": "hermes-grok"} for model_id in text_ids)
    except Exception:
        models.extend(TEXT_MODELS)
    unique: Dict[str, Dict[str, str]] = {item["id"]: item for item in models}
    return list(unique.values())


def action_status() -> Dict[str, Any]:
    creds = credentials()
    try:
        runtime_version = importlib.metadata.version("hermes-agent")
    except importlib.metadata.PackageNotFoundError:
        runtime_version = "unknown"
    return {
        "success": True,
        "status": "ready" if creds["token"] else "logged_out",
        "oauth_available": bool(creds["token"]),
        "auth_source": creds["provider"],
        "version": runtime_version,
        "models": model_catalog(),
    }


def image_result(body: Dict[str, Any]) -> Dict[str, Any]:
    urls: List[str] = []
    for item in body.get("data") or []:
        if item.get("url"):
            urls.append(item["url"])
        elif item.get("b64_json"):
            urls.append(f"data:{item.get('mime_type') or 'image/png'};base64,{item['b64_json']}")
    if not urls:
        raise RuntimeError("xAI completed the image request without an image")
    return {"success": True, "status": "success", "output_type": "image", "urls": urls, "url": urls[0]}


def build_image_request(payload: Dict[str, Any], edit: bool) -> tuple[str, Dict[str, Any]]:
    paths = [str(item) for item in payload.get("input_paths") or [] if item]
    if edit and not paths:
        raise RuntimeError("Image editing requires at least one input image")
    if edit and len(paths) > 3:
        raise RuntimeError("Image editing supports at most 3 input images")
    body: Dict[str, Any] = {
        "model": "grok-imagine-image-quality" if edit else payload.get("model") or "grok-imagine-image",
        "prompt": payload.get("prompt") or "",
    }
    if edit:
        refs = [{"url": data_uri(path, "image"), "type": "image_url"} for path in paths]
        if len(refs) == 1:
            body["image"] = refs[0]
        else:
            body["images"] = refs
    else:
        body["aspect_ratio"] = payload.get("aspect_ratio") or "1:1"
        body["resolution"] = str(payload.get("resolution") or "1k").lower()
    return "/images/edits" if edit else "/images/generations", body


def submit_image(payload: Dict[str, Any], edit: bool) -> Dict[str, Any]:
    endpoint, body = build_image_request(payload, edit)
    count = max(1, min(10, int(payload.get("n") or 1)))
    urls: List[str] = []
    for _ in range(count):
        result = image_result(post(endpoint, body))
        urls.extend(result.get("urls") or [])
    return {"success": True, "status": "success", "output_type": "image", "urls": urls, "url": urls[0]}


def build_video_request(payload: Dict[str, Any], mode: str) -> tuple[str, Dict[str, Any]]:
    paths = [str(item) for item in payload.get("input_paths") or [] if item]
    minimum_duration = 2 if mode == "video-extension" else 1
    maximum_duration = 10 if mode in {"reference-to-video", "video-extension"} else 15
    if payload.get("duration") is None:
        raise RuntimeError(f"{mode} request is missing the required duration field")
    duration = max(minimum_duration, min(maximum_duration, int(payload["duration"])))
    model = str(payload.get("model") or ("grok-imagine-video-1.5-preview" if mode == "image-to-video" else "grok-imagine-video"))
    if mode == "image-to-video" and model == "grok-imagine-video-1.5":
        model = "grok-imagine-video-1.5-preview"
    body: Dict[str, Any] = {"model": model, "prompt": payload.get("prompt") or "", "duration": duration}
    endpoint = "/videos/generations"
    if mode == "image-to-video":
        if not paths:
            raise RuntimeError("Image-to-video requires a first-frame image")
        body["image"] = {"url": data_uri(paths[0], "image")}
        body["aspect_ratio"] = payload.get("aspect_ratio") or "16:9"
        body["resolution"] = payload.get("resolution") if payload.get("resolution") in {"480p", "720p"} else "720p"
    elif mode == "reference-to-video":
        if not paths:
            raise RuntimeError("Reference-to-video requires at least one image")
        if len(paths) > 7:
            raise RuntimeError("Reference-to-video supports at most 7 images")
        body["reference_images"] = [{"url": data_uri(path, "image")} for path in paths]
        body["model"] = "grok-imagine-video" if "1.5" in str(model) else model
        body["aspect_ratio"] = payload.get("aspect_ratio") or "16:9"
        body["resolution"] = payload.get("resolution") if payload.get("resolution") in {"480p", "720p"} else "720p"
    elif mode == "video-extension":
        source = str(payload.get("source_video_path") or "")
        if not source:
            raise RuntimeError("Video extension requires a source video")
        endpoint = "/videos/extensions"
        body["video"] = {"url": data_uri(source, "video")}
        body["model"] = "grok-imagine-video"
    else:
        body["aspect_ratio"] = payload.get("aspect_ratio") or "16:9"
        body["resolution"] = payload.get("resolution") if payload.get("resolution") in {"480p", "720p"} else "720p"
    return endpoint, body


def submit_video(payload: Dict[str, Any], mode: str) -> Dict[str, Any]:
    endpoint, body = build_video_request(payload, mode)
    result = post(endpoint, body, timeout=180)
    task_id = result.get("request_id")
    if not task_id:
        raise RuntimeError("xAI did not return request_id")
    return {"success": True, "status": "queued", "output_type": "video", "task_id": task_id, "request_id": task_id}


def poll_video(task_id: str) -> Dict[str, Any]:
    creds = require_credentials()
    response = requests.get(f"{creds['base_url']}/videos/{task_id}", headers=headers(creds), timeout=45)
    body = checked(response)
    state = str(body.get("status") or "").lower()
    if state == "done":
        video = body.get("video") or {}
        url = video.get("url")
        if not url:
            raise RuntimeError("xAI completed the video request without a URL")
        return {
            "success": True,
            "status": "success",
            "output_type": "video",
            "task_id": task_id,
            "url": url,
            "actual_duration": video.get("duration"),
            "model": body.get("model"),
        }
    if state in {"failed", "error", "expired", "cancelled"}:
        error = body.get("error") or body.get("message") or f"Video task ended with status {state}"
        if isinstance(error, dict):
            error = error.get("message") or json.dumps(error, ensure_ascii=False)
        return {"success": False, "status": "failed", "task_id": task_id, "error": error}
    return {"success": True, "status": "running", "output_type": "video", "task_id": task_id, "progress": body.get("progress")}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        action = str(payload.get("action") or "")
        if action == "status":
            result = action_status()
        elif action == "models":
            result = {"success": True, "models": model_catalog()}
        elif action == "poll":
            result = poll_video(str(payload.get("task_id") or ""))
        elif action == "submit":
            mode = str(payload.get("mode") or "")
            if mode == "text-to-image":
                result = submit_image(payload, False)
            elif mode == "image-edit":
                result = submit_image(payload, True)
            elif mode in {"text-to-video", "image-to-video", "reference-to-video", "video-extension"}:
                result = submit_video(payload, mode)
            else:
                raise RuntimeError(f"Unsupported generation mode: {mode}")
        else:
            raise RuntimeError(f"Unsupported bridge action: {action}")
        emit(result)
    except SystemExit:
        raise
    except Exception as exc:
        emit({"success": False, "status": "failed", "error": str(exc), "error_type": "bridge_error"}, 2)


if __name__ == "__main__":
    main()
