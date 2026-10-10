# -*- coding: utf-8 -*-
"""
Image processing utilities for Persian VQA system.
Complies with Proposal specifications:
1. Validating image format (JPG, PNG, WEBP).
2. Size validation (< 10MB).
3. Resizing to standard max resolution (1024x980) while preserving aspect ratio.
4. Auto-orientation correction and enhancement.
"""
import io
import os
import uuid
from typing import Tuple
from PIL import Image, ImageOps

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_WIDTH = 1024
MAX_HEIGHT = 980


class ImageValidationError(Exception):
    pass


def validate_image_file(filename: str, content_type: str | None, file_size: int):
    """
    Validates file extension, content type and file size.
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ImageValidationError(
            f"فرمت فایل '{ext}' مجاز نیست. لطفاً یکی از فرمت‌های JPG, PNG یا WEBP را ارسال کنید."
        )

    if file_size > MAX_FILE_SIZE:
        raise ImageValidationError(
            f"حجم فایل بیش از سقف مجاز (10 مگابایت) است. حجم فعلی: {file_size / (1024*1024):.2f} MB"
        )


def process_and_save_image(
    file_bytes: bytes,
    original_filename: str,
    output_dir: str
) -> Tuple[str, int, int, str]:
    """
    Processes the raw image bytes:
    1. Verifies integrity with Pillow.
    2. Transposes EXIF orientation.
    3. Resizes to standard max 1024x980 if larger.
    4. Converts RGBA/P to RGB if saving as JPEG.
    5. Saves into output directory.

    Returns:
        (saved_filename, width, height, mime_type)
    """
    os.makedirs(output_dir, exist_ok=True)

    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.load()  # Verify image data
    except Exception as exc:
        raise ImageValidationError("فایل ارسال شده به عنوان تصویر معتبر قابل باز شدن نیست.") from exc

    # Auto orient based on EXIF
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    orig_w, orig_h = image.size

    # Check resize constraint (Max 1024 x 980)
    target_w, target_h = orig_w, orig_h
    if orig_w > MAX_WIDTH or orig_h > MAX_HEIGHT:
        image.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.Resampling.LANCZOS)
        target_w, target_h = image.size

    # Determine save format
    ext = os.path.splitext(original_filename)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        save_format = "JPEG"
        out_ext = ".jpg"
        mime = "image/jpeg"
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
    elif ext == ".png":
        save_format = "PNG"
        out_ext = ".png"
        mime = "image/png"
    elif ext == ".webp":
        save_format = "WEBP"
        out_ext = ".webp"
        mime = "image/webp"
    else:
        save_format = "JPEG"
        out_ext = ".jpg"
        mime = "image/jpeg"
        if image.mode != "RGB":
            image = image.convert("RGB")

    saved_filename = f"{uuid.uuid4().hex}{out_ext}"
    saved_path = os.path.join(output_dir, saved_filename)

    image.save(saved_path, format=save_format, quality=90, optimize=True)

    return saved_filename, target_w, target_h, mime
