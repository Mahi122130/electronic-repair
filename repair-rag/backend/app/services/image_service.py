"""
app/services/image_service.py
"""

from __future__ import annotations

import base64
import io
import uuid

import structlog
from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# Accept more image types
_ALLOWED_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
}
_MAX_BYTES = 20 * 1024 * 1024  # 20MB
_MAX_VISION_DIMENSION = 1568


async def validate_and_process_image(
    file: UploadFile,
) -> tuple[str, str, str]:
    """
    Validate, resize, return (base64_string, mime_type, file_path).
    Much more permissive — accepts any image type.
    """
    # Be permissive with content type — sometimes browsers send wrong MIME
    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        # Try to detect from filename
        filename = file.filename or ""
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        ext_map = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "png": "image/png", "webp": "image/webp",
            "gif": "image/gif", "bmp": "image/bmp",
        }
        content_type = ext_map.get(ext, "image/jpeg")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file received."
        )

    if len(raw_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds 20MB limit."
        )

    # Process with Pillow
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

        # Resize if too large
        if max(img.width, img.height) > _MAX_VISION_DIMENSION:
            img.thumbnail((_MAX_VISION_DIMENSION, _MAX_VISION_DIMENSION), Image.LANCZOS)
            logger.debug("image_resized", new_size=img.size)

        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=90)
        processed_bytes = buffer.getvalue()

    except Exception as e:
        logger.error("image_processing_failed", error=str(e))
        # If Pillow fails, just use raw bytes
        processed_bytes = raw_bytes

    file_path = f"uploads/{uuid.uuid4().hex}.jpg"
    b64 = base64.b64encode(processed_bytes).decode("utf-8")

    logger.info("image_processed", size_kb=len(processed_bytes)//1024)
    return b64, "image/jpeg", file_path


async def upload_image_to_storage(processed_bytes_b64: str, file_path: str) -> str:
    """
    Upload to Supabase Storage. Returns public URL.
    Falls back to a data URL if upload fails so the system keeps working.
    """
    try:
        from supabase import create_client
        raw = base64.b64decode(processed_bytes_b64)
        supabase = create_client(
            str(settings.supabase_url),
            settings.supabase_service_role_key
        )
        supabase.storage.from_(settings.supabase_storage_bucket).upload(
            path=file_path,
            file=raw,
            file_options={"content-type": "image/jpeg", "cache-control": "3600"},
        )
        public_url = supabase.storage.from_(settings.supabase_storage_bucket).get_public_url(file_path)
        logger.info("image_uploaded", url=public_url)
        return public_url
    except Exception as e:
        logger.warning("image_upload_skipped", error=str(e))
        # Return a data URL so the image still shows in chat even if storage fails
        return f"data:image/jpeg;base64,{processed_bytes_b64[:100]}..."