import importlib.util
import json
from pathlib import Path


root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hermes_bridge", root / "resources" / "hermes_bridge.py")
bridge = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(bridge)

image = "data:image/png;base64,AA=="
video = "data:video/mp4;base64,AA=="

cases = {
    "text-to-image": bridge.build_image_request({"model": "grok-imagine-image-quality", "prompt": "p", "aspect_ratio": "3:4", "resolution": "2K", "n": 2}, False),
    "image-edit-one": bridge.build_image_request({"model": "grok-imagine-image", "prompt": "p", "input_paths": [image]}, True),
    "image-edit-many": bridge.build_image_request({"model": "grok-imagine-image-quality", "prompt": "p", "input_paths": [image, image, image]}, True),
    "text-to-video": bridge.build_video_request({"model": "grok-imagine-video", "prompt": "p", "duration": 15, "resolution": "1080p"}, "text-to-video"),
    "image-to-video": bridge.build_video_request({"model": "grok-imagine-video-1.5-preview", "prompt": "p", "duration": 12, "input_paths": [image]}, "image-to-video"),
    "reference-to-video": bridge.build_video_request({"model": "grok-imagine-video-1.5", "prompt": "p", "duration": 15, "input_paths": [image, image]}, "reference-to-video"),
    "video-extension": bridge.build_video_request({"model": "grok-imagine-video-1.5", "prompt": "p", "duration": 1, "source_video_path": video}, "video-extension"),
}

assert cases["text-to-image"][0] == "/images/generations"
assert cases["text-to-image"][1]["resolution"] == "2k"
assert set(cases["text-to-image"][1]) == {"model", "prompt", "aspect_ratio", "resolution"}
assert "image" in cases["image-edit-one"][1] and "images" not in cases["image-edit-one"][1]
assert cases["image-edit-one"][1]["model"] == "grok-imagine-image-quality"
assert cases["image-edit-one"][1]["image"]["type"] == "image_url"
assert set(cases["image-edit-one"][1]) == {"model", "prompt", "image"}
assert len(cases["image-edit-many"][1]["images"]) == 3
assert cases["text-to-video"][1]["resolution"] == "720p"
assert cases["image-to-video"][1]["model"] == "grok-imagine-video-1.5-preview"
assert cases["reference-to-video"][1]["model"] == "grok-imagine-video"
assert cases["reference-to-video"][1]["duration"] == 10
assert cases["video-extension"][0] == "/videos/extensions"
assert cases["video-extension"][1]["duration"] == 2
assert "aspect_ratio" not in cases["video-extension"][1]
assert "resolution" not in cases["video-extension"][1]

try:
    bridge.build_video_request({"model": "grok-imagine-video-1.5-preview", "prompt": "p", "input_paths": [image]}, "image-to-video")
except RuntimeError as error:
    assert "missing the required duration field" in str(error)
else:
    raise AssertionError("Video requests without duration must be rejected")

print(json.dumps(cases, ensure_ascii=False, indent=2))
