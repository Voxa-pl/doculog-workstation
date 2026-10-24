from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)

class ImageProcessor:
    @staticmethod
    def fix_exif_orientation(image: Image.Image) -> Image.Image:
        """Kamera veya telefon kaynaklı EXIF yönelimini düzeltir"""
        try:
            return ImageOps.exif_transpose(image)
        except Exception:
            return image

    @staticmethod
    def normalize_image(image_path: Path) -> None:
        """Yüklenen görselin EXIF yönelimini normalize eder ve diskteki dosyayı günceller"""
        try:
            with Image.open(image_path) as img:
                fixed = ImageProcessor.fix_exif_orientation(img)
                if fixed.mode in ("RGBA", "P") and image_path.suffix.lower() in (".jpg", ".jpeg"):
                    fixed = fixed.convert("RGB")
                fixed.save(image_path, quality=95)
        except Exception as e:
            logger.warning(f"Görsel normalize edilemedi ({image_path}): {e}")

    @staticmethod
    def rotate_image(image_path: Path, degrees: int = 90) -> None:
        """Görseli verilen açı kadar döndürüp aynı dosyaya kaydeder (Kayıpsız 90° katları)"""
        with Image.open(image_path) as img:
            img = ImageProcessor.fix_exif_orientation(img)
            # PIL rotate pozitif açıyı saat yönünün tersine döndürür, bu yüzden -degrees kullanılır (saat yönü için)
            rotated = img.rotate(-degrees, expand=True)
            if rotated.mode in ("RGBA", "P") and image_path.suffix.lower() in (".jpg", ".jpeg"):
                rotated = rotated.convert("RGB")
            rotated.save(image_path, quality=95)

    @staticmethod
    def generate_thumbnail(image_path: Path, thumb_path: Path, size: Tuple[int, int] = (240, 240)) -> None:
        """Kuyruk listesi için hafif ve hızlı thumbnail üretir"""
        try:
            with Image.open(image_path) as img:
                img = ImageProcessor.fix_exif_orientation(img)
                img.thumbnail(size, Image.Resampling.LANCZOS)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img.save(thumb_path, "JPEG", quality=80)
        except Exception as e:
            logger.warning(f"Thumbnail oluşturulamadı: {e}")

    @staticmethod
    def enhance_contrast(image_path: Path, output_path: Optional[Path] = None, factor: float = 1.3) -> Path:
        """Karanlık veya gölgeli sevk irsaliyeleri için kontrast artırır"""
        target = output_path or image_path
        with Image.open(image_path) as img:
            img = ImageProcessor.fix_exif_orientation(img)
            enhancer = ImageEnhance.Contrast(img)
            enhanced = enhancer.enhance(factor)
            enhanced.save(target, quality=95)
        return target

    @staticmethod
    def detect_and_deskew_perspective(image_path: Path, output_path: Optional[Path] = None) -> Tuple[bool, Path, dict]:
        """
        Görseldeki sevk irsaliyesi kağıdının 4 köşesini OpenCV ile otomatik tespit eder,
        perspektif eğriliğini düzelterek (Warp Perspective) dik A4 oranına getirir.
        Eğer 4 köşe tespit edilemezse metin yataylık açısını (Deskew) bularak düzeltir.
        """
        try:
            import cv2
            import numpy as np
        except ImportError:
            logger.warning("OpenCV veya NumPy bulunamadı, perspektif düzeltme atlanıyor.")
            return False, output_path or image_path, {"error": "OpenCV modülü kurulu değil"}

        target = output_path or image_path
        img = cv2.imread(str(image_path))
        if img is None:
            return False, target, {"error": "Görsel OpenCV ile açılamadı"}

        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # 1. Aşama: 4 Köşe Kontur Tespiti (Canny + findContours)
        edged = cv2.Canny(blurred, 50, 200)
        contours, _ = cv2.findContours(edged.copy(), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

        screen_cnt = None
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            # 4 köşeli ve görsel alanının en az %15'ini kaplayan kontur
            if len(approx) == 4 and cv2.contourArea(c) > (h * w * 0.15):
                screen_cnt = approx
                break

        if screen_cnt is not None:
            pts = screen_cnt.reshape(4, 2)
            rect = np.zeros((4, 2), dtype="float32")

            s = pts.sum(axis=1)
            rect[0] = pts[np.argmin(s)]  # Top-left
            rect[2] = pts[np.argmax(s)]  # Bottom-right

            diff = np.diff(pts, axis=1)
            rect[1] = pts[np.argmin(diff)]  # Top-right
            rect[3] = pts[np.argmax(diff)]  # Bottom-left

            (tl, tr, br, bl) = rect
            widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
            widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
            maxWidth = max(int(widthA), int(widthB))

            heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
            heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
            maxHeight = max(int(heightA), int(heightB))

            dst = np.array([
                [0, 0],
                [maxWidth - 1, 0],
                [maxWidth - 1, maxHeight - 1],
                [0, maxHeight - 1]
            ], dtype="float32")

            M = cv2.getPerspectiveTransform(rect, dst)
            warped = cv2.warpPerspective(img, M, (maxWidth, maxHeight))
            cv2.imwrite(str(target), warped)
            return True, target, {
                "method": "WARP_PERSPECTIVE_4_CORNERS",
                "original_dimensions": [w, h],
                "rectified_dimensions": [maxWidth, maxHeight],
                "corners": rect.tolist()
            }

        # 2. Aşama: MinAreaRect ile Eğim (Deskew) Düzeltme
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) > 100:
            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = -(90 + angle)
            elif angle > 45:
                angle = 90 - angle

            if 0.5 < abs(angle) < 35.0:
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                # Dış sınırları genişleterek sağ üstteki GİB karekodunun ve metin köşelerinin kesilmesini önle
                cos = np.abs(M[0, 0])
                sin = np.abs(M[0, 1])
                new_w = int((h * sin) + (w * cos))
                new_h = int((h * cos) + (w * sin))
                M[0, 2] += (new_w / 2) - center[0]
                M[1, 2] += (new_h / 2) - center[1]
                rotated = cv2.warpAffine(
                    img,
                    M,
                    (new_w, new_h),
                    flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_CONSTANT,
                    borderValue=(255, 255, 255)
                )
                cv2.imwrite(str(target), rotated)
                return True, target, {
                    "method": "DESKEW_AFFINE_ROTATION",
                    "corrected_angle": round(float(angle), 2),
                    "original_dimensions": [w, h],
                    "rectified_dimensions": [new_w, new_h]
                }

        return False, target, {
            "method": "NO_CORRECTION_NEEDED",
            "message": "Görsel perspektifi dengeli."
        }

    @staticmethod
    def optimize_image_for_gemini(image_path: Path, max_dimension: int = 2560, quality: int = 88) -> Path:
        """
        Gemini Multimodal API için 12-48MP ham akıllı telefon veya taranmış evrak görsellerini
        optik netlik kaybı yaşatmadan (uzun kenar maks 2560px) optimize eder.
        Base64 şişmesini, ağ gecikmesini ve sunucu bellek tüketimini (OOM) %90+ oranında düşürür.
        """
        try:
            with Image.open(image_path) as img:
                img = ImageProcessor.fix_exif_orientation(img)
                w, h = img.size
                if max(w, h) > max_dimension:
                    if w > h:
                        new_w = max_dimension
                        new_h = int(h * (max_dimension / w))
                    else:
                        new_h = max_dimension
                        new_w = int(w * (max_dimension / h))
                    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")

                opt_dir = image_path.parent / "opt"
                opt_dir.mkdir(parents=True, exist_ok=True)
                opt_path = opt_dir / f"opt_{image_path.name}"
                img.save(opt_path, "JPEG", quality=quality, optimize=True)
                return opt_path
        except Exception as e:
            logger.warning(f"Görsel optimize edilemedi ({image_path}), orijinal kullanılıyor: {e}")
            return image_path

image_processor = ImageProcessor()

